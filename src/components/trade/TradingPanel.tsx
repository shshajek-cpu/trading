import { useMemo, useState } from 'react'
import { usePaper, usePaperLive } from '../../lib/paper/context'
import type {
  FillReason,
  OrderEnd,
  PaperOrder,
  PaperPosition,
  TriggerBy,
} from '../../lib/paper/types'
import { displaySymbol, type SymbolInfo } from '../../lib/symbols'
import {
  ACTION_LABEL,
  fmtPct,
  fmtPrice,
  fmtQty,
  fmtSigned,
  fmtUsdt,
  pnlClass,
  SIDE_LABEL,
  TRIGGER_BY_LABEL,
  TYPE_LABEL,
} from './format'
import { Icon } from '../Icon'
import { Popover } from '../ui/Popover'
import { Dialog } from '../ui/Dialog'
import { ResetDialog, FeesDialog } from './AccountDialog'
import { tip } from '../../lib/tooltip'
import './trade.css'

type PanelTab = 'positions' | 'orders' | 'orderHistory' | 'fills' | 'funding' | 'account'

const REASON_LABEL: Record<FillReason, string> = {
  order: '지정가',
  market: '시장가',
  tp: '익절',
  sl: '손절',
  liquidation: '강제 청산',
}

const END_LABEL: Record<OrderEnd, string> = { filled: '체결', canceled: '취소', rejected: '거절' }

/** MM-DD HH:mm:ss (로컬 시각). */
function fmtTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 미체결 주문의 종류 문구(조건부는 방향 화살표·기준가 포함). */
function orderKind(o: PaperOrder): string {
  if (o.type === 'trigger') {
    const arrow = o.triggerDir === 'up' ? '▲' : '▼'
    return `조건부 ${arrow} ${TRIGGER_BY_LABEL[o.triggerBy ?? 'last']}`
  }
  return TYPE_LABEL.limit
}

interface TradingPanelProps {
  symbols: SymbolInfo[]
  activeSymbol: string
  onSelectSymbol: (symbol: string) => void
  variant: 'desktop' | 'mobile'
  collapsed?: boolean
  onCollapsedChange?: (v: boolean) => void
}

export function TradingPanel({
  symbols,
  activeSymbol,
  onSelectSymbol,
  variant,
  collapsed,
  onCollapsedChange,
}: TradingPanelProps) {
  const paper = usePaper()
  const account = paper.account
  const positionViews = usePaperLive((l) => l.positions)
  const summary = usePaperLive((l) => l.summary)

  const [tab, setTab] = useState<PanelTab>('positions')
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const isCollapsed = variant === 'desktop' && (collapsed ?? internalCollapsed)
  const setCollapsed = (v: boolean) => (onCollapsedChange ? onCollapsedChange(v) : setInternalCollapsed(v))

  // 겹쳐 뜨는 것들.
  const [tpSlTarget, setTpSlTarget] = useState<PaperPosition | null>(null)
  const [marginTarget, setMarginTarget] = useState<PaperPosition | null>(null)
  const [closeAnchor, setCloseAnchor] = useState<{ el: HTMLElement; pos: PaperPosition } | null>(null)
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [feesOpen, setFeesOpen] = useState(false)
  const [editOrder, setEditOrder] = useState<{ id: string; value: string } | null>(null)

  const tickOf = (sym: string) => paper.rules(sym)?.tickSize || symbols.find((s) => s.symbol === sym)?.tickSize || 0.01
  const stepOf = (sym: string) => paper.rules(sym)?.stepSize || symbols.find((s) => s.symbol === sym)?.stepSize || 0.001

  // 계좌 파생 값.
  const acct = useMemo(() => {
    const feeSum = account.fills.reduce((a, f) => a + f.fee, 0)
    const fundSum = account.funding.reduce((a, f) => a + f.amount, 0)
    const closed = account.fills.filter((f) => f.action === 'close')
    const wins = closed.filter((f) => f.pnl > 0).length
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : null
    const pnl = summary.equity - account.startBalance
    const pnlPct = account.startBalance > 0 ? (pnl / account.startBalance) * 100 : 0
    return { feeSum, fundSum, winRate, closedCount: closed.length, pnl, pnlPct }
  }, [account.fills, account.funding, account.startBalance, summary.equity])

  async function report(action: () => Promise<string | null>) {
    const err = await action()
    if (err) paper.report(err)
  }

  async function closeAll() {
    let firstErr: string | null = null
    for (const p of account.positions) {
      const err = await paper.close(p.symbol, p.side)
      if (err && !firstErr) firstErr = err
    }
    if (firstErr) paper.report(firstErr)
  }

  async function commitAmend(order: PaperOrder, value: string) {
    setEditOrder(null)
    const price = Number(value.replace(/[^0-9.]/g, ''))
    if (!(price > 0) || price === order.price) return
    await report(() => paper.amend(order.id, { price }))
  }

  const isMobile = variant === 'mobile'

  const TABS: { id: PanelTab; label: string; count?: number }[] = [
    { id: 'positions', label: '포지션', count: account.positions.length },
    { id: 'orders', label: '미체결', count: account.orders.length },
    { id: 'orderHistory', label: '주문 내역' },
    { id: 'fills', label: '체결 내역' },
    { id: 'funding', label: '펀딩' },
    { id: 'account', label: '계좌' },
  ]

  // ── 포지션 ────────────────────────────────────────────────
  const renderPositions = () => {
    if (account.positions.length === 0) return <p className="tp-empty">포지션이 없습니다.</p>
    const rows = account.positions.map((p) => {
      const view = positionViews[p.id]
      const tick = tickOf(p.symbol)
      const step = stepOf(p.symbol)
      const mark = view?.mark ?? p.entry
      const upl = view?.upl ?? 0
      const roe = view?.roe ?? 0
      const margin = view?.margin ?? p.isoMargin
      const liq = view?.liqPrice
      const isIso = p.marginMode === 'isolated'
      return { p, tick, step, mark, upl, roe, margin, liq, isIso }
    })

    if (isMobile) {
      return (
        <div className="tp-cards">
          {rows.map(({ p, tick, step, mark, upl, roe, margin, liq, isIso }) => (
            <div key={p.id} className={`tp-card${p.symbol === activeSymbol ? ' tp-active' : ''}`}>
              <div className="tp-card-head">
                <button type="button" className="tp-sym-link" onClick={() => onSelectSymbol(p.symbol)}>
                  {displaySymbol(p.symbol, symbols)}
                </button>
                <span className={`op-badge ${p.side === 'long' ? 'up' : 'down'}`}>{SIDE_LABEL[p.side]}</span>
                <span className="tp-lev">{p.leverage}x {isIso ? '격리' : '교차'}</span>
              </div>
              <div className="tp-card-grid">
                <div>
                  <span>수량</span>
                  <b>{fmtQty(p.qty, step)}</b>
                </div>
                <div>
                  <span>진입가</span>
                  <b>{fmtPrice(p.entry, tick)}</b>
                </div>
                <div>
                  <span>마크</span>
                  <b>{fmtPrice(mark, tick)}</b>
                </div>
                <div>
                  <span>청산가</span>
                  <b>{liq != null ? fmtPrice(liq, tick) : '-'}</b>
                </div>
                <div>
                  <span>증거금</span>
                  <b>{fmtUsdt(margin)}</b>
                </div>
                <div>
                  <span>미실현 손익</span>
                  <b className={pnlClass(upl)}>
                    {fmtSigned(upl)} ({fmtPct(roe)})
                  </b>
                </div>
              </div>
              <div className="tp-card-tpsl">
                <span>익절 {p.tp ? fmtPrice(p.tp.price, tick) : '-'}</span>
                <span>손절 {p.sl ? fmtPrice(p.sl.price, tick) : '-'}</span>
                <button type="button" className="tp-mini-btn" onClick={() => setTpSlTarget(p)}>
                  TP/SL
                </button>
              </div>
              <div className="tp-card-actions">
                {isIso && (
                  <button type="button" className="tv-btn" onClick={() => setMarginTarget(p)}>
                    증거금
                  </button>
                )}
                <button type="button" className="tv-btn" onClick={() => report(() => paper.close(p.symbol, p.side))}>
                  시장가 종료
                </button>
              </div>
            </div>
          ))}
        </div>
      )
    }

    return (
      <table className="tp-table">
        <thead>
          <tr>
            <th className="tp-l">종목</th>
            <th>수량</th>
            <th>진입가</th>
            <th>마크 가격</th>
            <th>청산가</th>
            <th>증거금</th>
            <th>미실현 손익</th>
            <th>익절/손절</th>
            <th>종료</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, tick, step, mark, upl, roe, margin, liq, isIso }) => (
            <tr key={p.id} className={p.symbol === activeSymbol ? 'tp-active' : undefined}>
              <td className="tp-l">
                <button type="button" className="tp-sym-link" onClick={() => onSelectSymbol(p.symbol)}>
                  {displaySymbol(p.symbol, symbols)}
                </button>
                <span className={`op-badge ${p.side === 'long' ? 'up' : 'down'}`}>{SIDE_LABEL[p.side]}</span>
                <span className="tp-lev">
                  {p.leverage}x {isIso ? '격리' : '교차'}
                </span>
              </td>
              <td>{fmtQty(p.qty, step)}</td>
              <td>{fmtPrice(p.entry, tick)}</td>
              <td>{fmtPrice(mark, tick)}</td>
              <td>{liq != null ? fmtPrice(liq, tick) : '-'}</td>
              <td>
                {fmtUsdt(margin)}
                {isIso && (
                  <button type="button" className="tp-icon" {...tip('증거금 조정', '격리 증거금 추가·감소')} onClick={() => setMarginTarget(p)}>
                    <Icon name="settings" size={13} />
                  </button>
                )}
              </td>
              <td className={pnlClass(upl)}>
                {fmtSigned(upl)}
                <em className="tp-roe">{fmtPct(roe)}</em>
              </td>
              <td className="tp-tpsl">
                {p.tp || p.sl ? (
                  <>
                    {p.tp && (
                      <span className="tp-tag">
                        익 {fmtPrice(p.tp.price, tick)}
                        <button type="button" className="tp-x" aria-label="익절 제거" onClick={() => report(() => paper.setTpSl(p.symbol, p.side, null, undefined))}>
                          ✕
                        </button>
                      </span>
                    )}
                    {p.sl && (
                      <span className="tp-tag">
                        손 {fmtPrice(p.sl.price, tick)}
                        <button type="button" className="tp-x" aria-label="손절 제거" onClick={() => report(() => paper.setTpSl(p.symbol, p.side, undefined, null))}>
                          ✕
                        </button>
                      </span>
                    )}
                    <button type="button" className="tp-mini-btn" onClick={() => setTpSlTarget(p)}>
                      수정
                    </button>
                  </>
                ) : (
                  <button type="button" className="tp-mini-btn" onClick={() => setTpSlTarget(p)}>
                    추가
                  </button>
                )}
              </td>
              <td className="tp-close-cell">
                <button type="button" className="tp-mini-btn" onClick={() => report(() => paper.close(p.symbol, p.side))}>
                  시장가
                </button>
                <button type="button" className="tp-mini-btn" onClick={(e) => setCloseAnchor({ el: e.currentTarget, pos: p })}>
                  지정가
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ── 미체결 ────────────────────────────────────────────────
  const renderOrders = () => {
    if (account.orders.length === 0) return <p className="tp-empty">미체결 주문이 없습니다.</p>
    const rows = account.orders
    const priceCell = (o: PaperOrder) => {
      const tick = tickOf(o.symbol)
      const shown = o.type === 'trigger' ? o.triggerPrice : o.price
      if (editOrder?.id === o.id) {
        return (
          <input
            className="op-input tp-edit"
            autoFocus
            value={editOrder.value}
            onChange={(e) => setEditOrder({ id: o.id, value: e.target.value })}
            onBlur={() => commitAmend(o, editOrder.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAmend(o, editOrder.value)
              if (e.key === 'Escape') setEditOrder(null)
            }}
          />
        )
      }
      return (
        <button
          type="button"
          className="tp-price-edit"
          onClick={() => setEditOrder({ id: o.id, value: String(shown ?? '') })}
          {...tip('가격 수정', '눌러서 지정가·발동가를 바꿉니다')}
        >
          {shown != null ? fmtPrice(shown, tick) : '시장가'}
        </button>
      )
    }

    if (isMobile) {
      return (
        <div className="tp-cards">
          {rows.map((o) => {
            const step = stepOf(o.symbol)
            return (
              <div key={o.id} className={`tp-card${o.symbol === activeSymbol ? ' tp-active' : ''}`}>
                <div className="tp-card-head">
                  <span className="tp-card-sym">{displaySymbol(o.symbol, symbols)}</span>
                  <span className={`op-badge ${o.side === 'long' ? 'up' : 'down'}`}>
                    {SIDE_LABEL[o.side]} {ACTION_LABEL[o.action]}
                  </span>
                  <button type="button" className="tp-x" aria-label="주문 취소" onClick={() => report(() => paper.cancel(o.id))}>
                    ✕
                  </button>
                </div>
                <div className="tp-card-grid">
                  <div>
                    <span>종류</span>
                    <b>{orderKind(o)}</b>
                  </div>
                  <div>
                    <span>가격</span>
                    <b>{priceCell(o)}</b>
                  </div>
                  <div>
                    <span>수량</span>
                    <b>{fmtQty(o.qty, step)}</b>
                  </div>
                  <div>
                    <span>증거금</span>
                    <b>{o.frozen > 0 ? fmtUsdt(o.frozen) : '-'}</b>
                  </div>
                  <div>
                    <span>시간</span>
                    <b>{fmtTime(o.createdAt)}</b>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <table className="tp-table">
        <thead>
          <tr>
            <th className="tp-l">종목</th>
            <th>방향/동작</th>
            <th>종류</th>
            <th>가격/발동가</th>
            <th>수량</th>
            <th>증거금</th>
            <th>시간</th>
            <th>취소</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className={o.symbol === activeSymbol ? 'tp-active' : undefined}>
              <td className="tp-l">{displaySymbol(o.symbol, symbols)}</td>
              <td>
                <span className={o.side === 'long' ? 'up' : 'down'}>
                  {SIDE_LABEL[o.side]} {ACTION_LABEL[o.action]}
                </span>
              </td>
              <td>{orderKind(o)}</td>
              <td>{priceCell(o)}</td>
              <td>{fmtQty(o.qty, stepOf(o.symbol))}</td>
              <td>{o.frozen > 0 ? fmtUsdt(o.frozen) : '-'}</td>
              <td className="tp-time">{fmtTime(o.createdAt)}</td>
              <td>
                <button type="button" className="tp-x" aria-label="주문 취소" onClick={() => report(() => paper.cancel(o.id))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ── 주문 내역 ─────────────────────────────────────────────
  const renderOrderHistory = () => {
    const rows = [...account.orderHistory].reverse()
    if (rows.length === 0) return <p className="tp-empty">주문 내역이 없습니다.</p>
    if (isMobile) {
      return (
        <div className="tp-cards">
          {rows.map((o) => (
            <div key={`${o.id}-${o.endedAt}`} className="tp-card tp-card-line">
              <div className="tp-card-head">
                <span className="tp-card-sym">{displaySymbol(o.symbol, symbols)}</span>
                <span className={o.side === 'long' ? 'up' : 'down'}>
                  {SIDE_LABEL[o.side]} {ACTION_LABEL[o.action]}
                </span>
                <span className={`tp-status tp-status-${o.status}`}>{END_LABEL[o.status]}</span>
              </div>
              <div className="tp-card-line-sub">
                <span>{fmtTime(o.endedAt)}</span>
                <span>{TYPE_LABEL[o.type]}</span>
                <span>{o.avgPrice != null ? fmtPrice(o.avgPrice, tickOf(o.symbol)) : o.price != null ? fmtPrice(o.price, tickOf(o.symbol)) : '-'}</span>
                <span>{fmtQty(o.qty, stepOf(o.symbol))}</span>
              </div>
              {o.note && <div className="tp-note">{o.note}</div>}
            </div>
          ))}
        </div>
      )
    }
    return (
      <table className="tp-table">
        <thead>
          <tr>
            <th className="tp-l">시간</th>
            <th>종목</th>
            <th>방향/동작</th>
            <th>종류</th>
            <th>가격</th>
            <th>수량</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={`${o.id}-${o.endedAt}`}>
              <td className="tp-l tp-time">{fmtTime(o.endedAt)}</td>
              <td>{displaySymbol(o.symbol, symbols)}</td>
              <td>
                <span className={o.side === 'long' ? 'up' : 'down'}>
                  {SIDE_LABEL[o.side]} {ACTION_LABEL[o.action]}
                </span>
              </td>
              <td>{TYPE_LABEL[o.type]}</td>
              <td>{o.avgPrice != null ? fmtPrice(o.avgPrice, tickOf(o.symbol)) : o.price != null ? fmtPrice(o.price, tickOf(o.symbol)) : '-'}</td>
              <td>{fmtQty(o.qty, stepOf(o.symbol))}</td>
              <td>
                <span className={`tp-status tp-status-${o.status}`}>{END_LABEL[o.status]}</span>
                {o.note && <em className="tp-note-inline">{o.note}</em>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ── 체결 내역 ─────────────────────────────────────────────
  const renderFills = () => {
    const rows = [...account.fills].reverse()
    if (rows.length === 0) return <p className="tp-empty">체결 내역이 없습니다.</p>
    if (isMobile) {
      return (
        <div className="tp-cards">
          {rows.map((f) => (
            <div key={f.id} className="tp-card tp-card-line">
              <div className="tp-card-head">
                <span className="tp-card-sym">{displaySymbol(f.symbol, symbols)}</span>
                <span className={f.side === 'long' ? 'up' : 'down'}>
                  {SIDE_LABEL[f.side]} {ACTION_LABEL[f.action]}
                </span>
                <span className="tp-status">{REASON_LABEL[f.reason]}</span>
              </div>
              <div className="tp-card-line-sub">
                <span>{fmtTime(f.at)}</span>
                <span>{fmtPrice(f.price, tickOf(f.symbol))}</span>
                <span>{fmtQty(f.qty, stepOf(f.symbol))}</span>
                {f.action === 'close' && <span className={pnlClass(f.pnl)}>{fmtSigned(f.pnl)}</span>}
              </div>
            </div>
          ))}
        </div>
      )
    }
    return (
      <table className="tp-table">
        <thead>
          <tr>
            <th className="tp-l">시간</th>
            <th>종목</th>
            <th>방향/동작</th>
            <th>가격</th>
            <th>수량</th>
            <th>수수료</th>
            <th>실현 손익</th>
            <th>구분</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id}>
              <td className="tp-l tp-time">{fmtTime(f.at)}</td>
              <td>{displaySymbol(f.symbol, symbols)}</td>
              <td>
                <span className={f.side === 'long' ? 'up' : 'down'}>
                  {SIDE_LABEL[f.side]} {ACTION_LABEL[f.action]}
                </span>
              </td>
              <td>{fmtPrice(f.price, tickOf(f.symbol))}</td>
              <td>{fmtQty(f.qty, stepOf(f.symbol))}</td>
              <td>{fmtUsdt(f.fee)}</td>
              <td className={f.action === 'close' ? pnlClass(f.pnl) : ''}>{f.action === 'close' ? fmtSigned(f.pnl) : '-'}</td>
              <td>{REASON_LABEL[f.reason]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ── 펀딩 ──────────────────────────────────────────────────
  const renderFunding = () => {
    const rows = [...account.funding].reverse()
    if (rows.length === 0) return <p className="tp-empty">펀딩 기록이 없습니다.</p>
    if (isMobile) {
      return (
        <div className="tp-cards">
          {rows.map((f) => (
            <div key={f.id} className="tp-card tp-card-line">
              <div className="tp-card-head">
                <span className="tp-card-sym">{displaySymbol(f.symbol, symbols)}</span>
                <span className={f.side === 'long' ? 'up' : 'down'}>{SIDE_LABEL[f.side]}</span>
                <span className={pnlClass(f.amount)}>{fmtSigned(f.amount)}</span>
              </div>
              <div className="tp-card-line-sub">
                <span>{fmtTime(f.at)}</span>
                <span>{fmtQty(f.qty, stepOf(f.symbol))}</span>
                <span>{(f.rate * 100).toFixed(4)}%</span>
              </div>
            </div>
          ))}
        </div>
      )
    }
    return (
      <table className="tp-table">
        <thead>
          <tr>
            <th className="tp-l">시간</th>
            <th>종목</th>
            <th>방향</th>
            <th>수량</th>
            <th>비율</th>
            <th>금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id}>
              <td className="tp-l tp-time">{fmtTime(f.at)}</td>
              <td>{displaySymbol(f.symbol, symbols)}</td>
              <td>
                <span className={f.side === 'long' ? 'up' : 'down'}>{SIDE_LABEL[f.side]}</span>
              </td>
              <td>{fmtQty(f.qty, stepOf(f.symbol))}</td>
              <td>{(f.rate * 100).toFixed(4)}%</td>
              <td className={pnlClass(f.amount)}>{fmtSigned(f.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ── 계좌 ──────────────────────────────────────────────────
  const renderAccount = () => (
    <div className="tp-account">
      <div className="tp-acc-grid">
        <div>
          <span>총자산</span>
          <b>{fmtUsdt(summary.equity)}</b>
        </div>
        <div>
          <span>지갑 잔고</span>
          <b>{fmtUsdt(summary.balance)}</b>
        </div>
        <div>
          <span>미실현 손익</span>
          <b className={pnlClass(summary.upl)}>{fmtSigned(summary.upl)}</b>
        </div>
        <div>
          <span>가용</span>
          <b>{fmtUsdt(summary.available)}</b>
        </div>
        <div>
          <span>사용 증거금</span>
          <b>{fmtUsdt(summary.usedMargin)}</b>
        </div>
        <div>
          <span>주문 묶음</span>
          <b>{fmtUsdt(summary.frozen)}</b>
        </div>
        <div>
          <span>증거금률</span>
          <b>{summary.marginRatio == null ? '—' : `${summary.marginRatio.toFixed(1)}%`}</b>
        </div>
        <div>
          <span>시작 잔고</span>
          <b>{fmtUsdt(account.startBalance)}</b>
        </div>
        <div>
          <span>누적 손익</span>
          <b className={pnlClass(acct.pnl)}>
            {fmtSigned(acct.pnl)} ({fmtPct(acct.pnlPct)})
          </b>
        </div>
        <div>
          <span>누적 수수료</span>
          <b>{fmtUsdt(acct.feeSum)}</b>
        </div>
        <div>
          <span>누적 펀딩</span>
          <b className={pnlClass(acct.fundSum)}>{fmtSigned(acct.fundSum)}</b>
        </div>
        <div>
          <span>승률</span>
          <b>{acct.winRate == null ? '—' : `${acct.winRate.toFixed(1)}% (${acct.closedCount}건)`}</b>
        </div>
      </div>
      <div className="tp-acc-actions">
        <button type="button" className="tv-btn" onClick={() => setFeesOpen(true)}>
          수수료 설정
        </button>
        <button type="button" className="tv-btn" onClick={() => setResetOpen(true)}>
          계좌 초기화
        </button>
      </div>
    </div>
  )

  const body = (() => {
    switch (tab) {
      case 'positions':
        return renderPositions()
      case 'orders':
        return renderOrders()
      case 'orderHistory':
        return renderOrderHistory()
      case 'fills':
        return renderFills()
      case 'funding':
        return renderFunding()
      case 'account':
        return renderAccount()
    }
  })()

  return (
    <section className={`tp tp-${variant}${isCollapsed ? ' tp-collapsed' : ''}`}>
      <header className="tp-head">
        <div className="tp-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tp-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.count != null && t.count > 0 && <em className="tp-count"> ({t.count})</em>}
            </button>
          ))}
        </div>
        <div className="tp-head-right">
          {tab === 'positions' && account.positions.length > 0 && (
            <button
              type="button"
              className="tp-mini-btn"
              onClick={() => setConfirm({ text: '모든 포지션을 시장가로 종료할까요?', run: closeAll })}
            >
              전체 시장가 종료
            </button>
          )}
          {tab === 'orders' && account.orders.length > 0 && (
            <button
              type="button"
              className="tp-mini-btn"
              onClick={() => setConfirm({ text: '모든 미체결 주문을 취소할까요?', run: () => report(() => paper.cancelAll()) })}
            >
              전체 취소
            </button>
          )}
          {!isMobile && (
            <button
              type="button"
              className="tv-icon-btn tp-collapse"
              {...tip('거래 패널 접기/펴기')}
              onClick={() => setCollapsed(!isCollapsed)}
            >
              <Icon name="chevron" size={16} className={isCollapsed ? 'tp-chev-up' : ''} />
            </button>
          )}
        </div>
      </header>

      {!isCollapsed && <div className="tp-body">{body}</div>}

      {/* 종료 지정가 팝오버 */}
      {closeAnchor && (
        <CloseLimitPopover
          anchor={closeAnchor.el}
          pos={closeAnchor.pos}
          tick={tickOf(closeAnchor.pos.symbol)}
          step={stepOf(closeAnchor.pos.symbol)}
          onClose={() => setCloseAnchor(null)}
        />
      )}

      {tpSlTarget && (
        <TpSlDialog
          pos={tpSlTarget}
          tick={tickOf(tpSlTarget.symbol)}
          symbols={symbols}
          onClose={() => setTpSlTarget(null)}
        />
      )}

      {marginTarget && (
        <AdjustMarginDialog pos={marginTarget} symbols={symbols} onClose={() => setMarginTarget(null)} />
      )}

      <ResetDialog open={resetOpen} onClose={() => setResetOpen(false)} />
      <FeesDialog open={feesOpen} onClose={() => setFeesOpen(false)} />

      {confirm && (
        <Dialog
          open
          onClose={() => setConfirm(null)}
          title="확인"
          width={360}
          footer={
            <>
              <button type="button" className="tv-btn" onClick={() => setConfirm(null)}>
                취소
              </button>
              <button
                type="button"
                className="tv-btn primary"
                onClick={() => {
                  confirm.run()
                  setConfirm(null)
                }}
              >
                실행
              </button>
            </>
          }
        >
          <p className="acc-dialog">{confirm.text}</p>
        </Dialog>
      )}
    </section>
  )
}

/* ── 종료 지정가 팝오버 ─────────────────────────────────────── */
interface CloseLimitPopoverProps {
  anchor: HTMLElement
  pos: PaperPosition
  tick: number
  step: number
  onClose: () => void
}

function CloseLimitPopover({ anchor, pos, tick, step, onClose }: CloseLimitPopoverProps) {
  const paper = usePaper()
  const [price, setPrice] = useState(String(pos.entry))
  const [qty, setQty] = useState(String(pos.qty))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) return
    const p = Number(price.replace(/[^0-9.]/g, ''))
    const q = Number(qty.replace(/[^0-9.]/g, ''))
    if (!(p > 0)) {
      setError('가격을 입력하세요.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await paper.place({
      symbol: pos.symbol,
      side: pos.side,
      action: 'close',
      type: 'limit',
      qty: q > 0 ? q : 0,
      price: p,
    })
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <Popover anchor={anchor} open onClose={onClose} placement="bottom-end">
      <div className="tp-close-pop">
        <label className="op-field">
          <span className="op-field-label">지정가</span>
          <input className="op-input" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setError(null) }} placeholder={fmtPrice(pos.entry, tick)} />
        </label>
        <label className="op-field">
          <span className="op-field-label">수량</span>
          <input className="op-input" inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value); setError(null) }} placeholder={fmtQty(pos.qty, step)} />
        </label>
        {error && <p className="op-error">{error}</p>}
        <button type="button" className="tv-btn primary tp-pop-submit" disabled={busy} onClick={submit}>
          {SIDE_LABEL[pos.side]} 지정가 종료
        </button>
      </div>
    </Popover>
  )
}

/* ── 익절/손절 대화상자 ─────────────────────────────────────── */
interface TpSlDialogProps {
  pos: PaperPosition
  tick: number
  symbols: SymbolInfo[]
  onClose: () => void
}

function TpSlDialog({ pos, tick, symbols, onClose }: TpSlDialogProps) {
  const paper = usePaper()
  const [tp, setTp] = useState(pos.tp ? String(pos.tp.price) : '')
  const [sl, setSl] = useState(pos.sl ? String(pos.sl.price) : '')
  const [by, setBy] = useState<TriggerBy>(pos.tp?.by ?? pos.sl?.by ?? 'last')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    const tpv = Number(tp.replace(/[^0-9.]/g, ''))
    const slv = Number(sl.replace(/[^0-9.]/g, ''))
    setBusy(true)
    setError(null)
    const err = await paper.setTpSl(
      pos.symbol,
      pos.side,
      tpv > 0 ? { price: tpv, by } : null,
      slv > 0 ? { price: slv, by } : null,
    )
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${displaySymbol(pos.symbol, symbols)} ${SIDE_LABEL[pos.side]} 익절/손절`}
      width={380}
      footer={
        <>
          <button type="button" className="tv-btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="tv-btn primary" disabled={busy} onClick={save}>
            저장
          </button>
        </>
      }
    >
      <div className="acc-dialog">
        <label className="op-field">
          <span className="op-field-label">익절가 (TP)</span>
          <input className="op-input" inputMode="decimal" value={tp} onChange={(e) => { setTp(e.target.value); setError(null) }} placeholder={fmtPrice(pos.entry, tick)} />
        </label>
        <label className="op-field">
          <span className="op-field-label">손절가 (SL)</span>
          <input className="op-input" inputMode="decimal" value={sl} onChange={(e) => { setSl(e.target.value); setError(null) }} placeholder={fmtPrice(pos.entry, tick)} />
        </label>
        <label className="op-field">
          <span className="op-field-label">기준 가격</span>
          <select className="op-select" value={by} onChange={(e) => setBy(e.target.value as TriggerBy)}>
            {(['last', 'mark'] as const).map((b) => (
              <option key={b} value={b}>
                {TRIGGER_BY_LABEL[b]}
              </option>
            ))}
          </select>
        </label>
        <p className="lev-note">빈칸으로 두고 저장하면 해당 값이 제거됩니다.</p>
        {error && <p className="op-error">{error}</p>}
      </div>
    </Dialog>
  )
}

/* ── 격리 증거금 조정 대화상자 ──────────────────────────────── */
interface AdjustMarginDialogProps {
  pos: PaperPosition
  symbols: SymbolInfo[]
  onClose: () => void
}

function AdjustMarginDialog({ pos, symbols, onClose }: AdjustMarginDialogProps) {
  const paper = usePaper()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function apply(sign: 1 | -1) {
    if (busy) return
    const a = Number(amount.replace(/[^0-9.]/g, ''))
    if (!(a > 0)) {
      setError('금액을 입력하세요.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await paper.adjustMargin(pos.symbol, pos.side, sign * a)
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${displaySymbol(pos.symbol, symbols)} ${SIDE_LABEL[pos.side]} 증거금`}
      width={360}
      footer={
        <>
          <button type="button" className="tv-btn" disabled={busy} onClick={() => apply(-1)}>
            감소
          </button>
          <button type="button" className="tv-btn primary" disabled={busy} onClick={() => apply(1)}>
            추가
          </button>
        </>
      }
    >
      <div className="acc-dialog">
        <div className="op-info-row">
          <span>현재 격리 증거금</span>
          <b>{fmtUsdt(pos.isoMargin)} USDT</b>
        </div>
        <label className="op-field">
          <span className="op-field-label">금액 (USDT)</span>
          <input className="op-input" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null) }} placeholder="0" />
        </label>
        {error && <p className="op-error">{error}</p>}
      </div>
    </Dialog>
  )
}

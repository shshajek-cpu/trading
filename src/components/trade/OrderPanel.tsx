import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePaper, usePaperLive } from '../../lib/paper/context'
import type { OrderRequest, OrderType, PaperPosition, PosSide, TriggerBy } from '../../lib/paper/types'
import { DEFAULT_SETTINGS } from '../../lib/paper/types'
import { displaySymbol, type SymbolInfo } from '../../lib/symbols'
import {
  ACTION_LABEL,
  floorTo,
  fmtMarginRatio,
  fmtPrice,
  fmtQty,
  fmtSigned,
  fmtUsdt,
  pnlClass,
  roundTo,
  SIDE_LABEL,
  TRIGGER_BY_LABEL,
  TYPE_LABEL,
} from './format'
import { Popover } from '../ui/Popover'
import { LeverageDialog } from './LeverageDialog'
import './trade.css'

/** 차트 우클릭 등에서 넘어오는 주문 초안. nonce 가 바뀔 때마다 새로 반영하고, 다른 종목 초안은 무시한다. */
export interface OrderDraft {
  symbol: string
  price?: number
  type?: OrderType
  nonce: number
}

interface OrderPanelProps {
  symbol: string
  symbols: SymbolInfo[]
  /** true = 폰 시트(전체 폭·44px·16px 입력). */
  compact?: boolean
  draft?: OrderDraft | null
  /** 초안을 채운 직후 부른다 — App 이 초안을 지워, 주문창이 다시 마운트될 때 또 채우지 않게 한다. */
  onDraftApplied?: () => void
}

type Tab = 'open' | 'close'
/** 조건부 발동 후 넣을 주문 종류. */
type ExecType = 'market' | 'limit'
type QtyUnit = 'coin' | 'usdt'

/** 콤마·공백을 지운 숫자. 비어 있거나 잘못되면 NaN. */
function num(s: string): number {
  const n = parseFloat(s.replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}

/** '25%' 같은 비율 입력. 비율이 아니면 null. */
function pctOf(s: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(s)
  return m ? Number(m[1]) : null
}

/** 남은 시간을 mm:ss(한 시간 넘으면 hh:mm:ss)로. */
function fmtCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const SLIDER_MARKS = [0, 25, 50, 75, 100]

export function OrderPanel({ symbol, symbols, compact = false, draft, onDraftApplied }: OrderPanelProps) {
  const paper = usePaper()
  const quote = usePaperLive((l) => l.quotes[symbol])
  const summary = usePaperLive((l) => l.summary)

  const rules = paper.rules(symbol)
  const info = symbols.find((s) => s.symbol === symbol)
  const tick = rules?.tickSize || info?.tickSize || 0.01
  const step = rules?.stepSize || info?.stepSize || 0.001
  const minQty = rules?.minQty ?? info?.minQty ?? 0

  const settings = paper.account.settings[symbol] ?? DEFAULT_SETTINGS

  // 이 종목 시세를 구독한다(주문창이 보고 있는 동안). watch 는 늘 같은 함수라 종목이 바뀔 때만 다시 건다.
  const watch = paper.watch
  useEffect(() => watch(symbol), [watch, symbol])

  // 초당 한 번 다시 그려 펀딩 카운트다운을 갱신한다.
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const [tab, setTab] = useState<Tab>('open')
  const [type, setType] = useState<OrderType>('limit')
  const [execType, setExecType] = useState<ExecType>('market')
  const [priceStr, setPriceStr] = useState('')
  const [triggerStr, setTriggerStr] = useState('')
  const [execPriceStr, setExecPriceStr] = useState('')
  const [triggerBy, setTriggerBy] = useState<TriggerBy>('last')
  const [qtyStr, setQtyStr] = useState('')
  const [qtyUnit, setQtyUnit] = useState<QtyUnit>('coin')
  const [tpSlOn, setTpSlOn] = useState(false)
  const [tpStr, setTpStr] = useState('')
  const [slStr, setSlStr] = useState('')
  const [tpSlBy, setTpSlBy] = useState<TriggerBy>('last')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [marginAnchor, setMarginAnchor] = useState<HTMLElement | null>(null)
  const [marginErr, setMarginErr] = useState<string | null>(null)
  const [levOpen, setLevOpen] = useState(false)

  // 종목이 바뀌면 입력을 비우고 지정가를 최근가로 다시 채우도록 표시한다. 익절/손절 값도 비운다(토글은 그대로).
  const prefillRef = useRef(true)
  useEffect(() => {
    prefillRef.current = true
    setPriceStr('')
    setTriggerStr('')
    setExecPriceStr('')
    setQtyStr('')
    setTpStr('')
    setSlStr('')
    setError(null)
  }, [symbol])

  // 최근가가 들어오면 비어 있는 지정가 칸을 한 번 채운다.
  useEffect(() => {
    if (prefillRef.current && quote?.last) {
      setPriceStr(fmtPrice(roundTo(quote.last, tick), tick))
      prefillRef.current = false
    }
  }, [quote?.last, tick])

  // 차트에서 넘어온 초안: 진입 탭으로, 종류·가격을 채운다. 다른 종목 초안은 무시하고, 채운 뒤엔 App 이 지운다.
  const draftNonce = draft?.nonce
  useEffect(() => {
    if (draftNonce == null || !draft || draft.symbol !== symbol) return
    setTab('open')
    setType(draft.type ?? 'limit')
    // 종료 탭의 비율('25%')은 진입 수량이 아니다.
    setQtyStr((s) => (pctOf(s) != null ? '' : s))
    if (draft.price != null) {
      setPriceStr(fmtPrice(roundTo(draft.price, tick), tick))
      prefillRef.current = false
    }
    setError(null)
    onDraftApplied?.()
    // nonce 가 바뀔 때만 한 번 반영한다 — 종목·틱·콜백이 바뀌었다고 같은 초안을 다시 채우지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftNonce])

  const last = quote?.last ?? 0

  // 계산에 쓸 주문 가격(단위 환산·예상치).
  const orderPrice = useMemo(() => {
    let p = NaN
    if (type === 'limit') p = num(priceStr)
    else if (type === 'market') p = last
    else p = execType === 'limit' ? num(execPriceStr) : num(triggerStr)
    return Number.isFinite(p) && p > 0 ? p : last
  }, [type, priceStr, execType, execPriceStr, triggerStr, last])

  // 입력된 수량(코인). USDT 단위면 주문 가격으로 환산. 비율('25%')은 수량이 아니다(종료 탭에서 방향별로 계산).
  const coinQty = useMemo(() => {
    if (pctOf(qtyStr) != null) return NaN
    const raw = num(qtyStr)
    if (!Number.isFinite(raw) || raw <= 0) return NaN
    if (qtyUnit === 'coin') return floorTo(raw, step)
    return orderPrice > 0 ? floorTo(raw / orderPrice, step) : NaN
  }, [qtyStr, qtyUnit, orderPrice, step])

  const posLong = paper.account.positions.find((p) => p.symbol === symbol && p.side === 'long')
  const posShort = paper.account.positions.find((p) => p.symbol === symbol && p.side === 'short')
  const longQty = posLong?.qty ?? 0
  const shortQty = posShort?.qty ?? 0

  const maxLong = paper.maxOpenQty(symbol, 'long', orderPrice)
  const maxShort = paper.maxOpenQty(symbol, 'short', orderPrice)
  // 종료 탭의 슬라이더·% 버튼은 비율('25%')만 적어 두고, 누른 쪽(롱/숏) 보유 수량에 곱해 보낸다.
  const closePct = tab === 'close' ? pctOf(qtyStr) : null

  const clearErr = useCallback(() => setError(null), [])

  // 슬라이더/마크 — 진입: 롱 최대 대비 수량(고른 단위 그대로, USDT 면 주문 금액). 종료: 비율.
  const applyPct = useCallback(
    (pct: number) => {
      clearErr()
      if (tab === 'close') {
        setQtyStr(`${pct}%`)
        return
      }
      if (!(maxLong > 0)) return
      const q = floorTo((maxLong * pct) / 100, step)
      if (!(q > 0)) setQtyStr('')
      else setQtyStr(qtyUnit === 'usdt' ? (q * orderPrice).toFixed(2) : String(q))
    },
    [tab, maxLong, step, qtyUnit, orderPrice, clearErr],
  )

  // 직접 넣은 종료 수량은 한쪽만 들고 있을 때만 슬라이더 위치로 보여 준다(양쪽이면 기준이 없다).
  const sliderBase = tab === 'open' ? maxLong : longQty > 0 && shortQty > 0 ? 0 : longQty || shortQty
  const sliderVal =
    closePct != null
      ? Math.min(100, closePct)
      : sliderBase > 0 && Number.isFinite(coinQty)
        ? Math.min(100, (coinQty / sliderBase) * 100)
        : 0

  /** 이 포지션을 얼마나 닫을지 — 비율이면 보유량 × 비율, 직접 넣었으면 min(입력, 보유), 비었으면 전량. */
  function closeQtyOf(p: PaperPosition): number {
    if (closePct != null) return closePct >= 100 ? p.qty : floorTo((p.qty * closePct) / 100, step)
    return Number.isFinite(coinQty) && coinQty > 0 ? Math.min(coinQty, p.qty) : p.qty
  }

  // 예상치 — 진입은 롱/숏 각각(청산가가 다르다).
  function buildReq(side: PosSide, action: Tab): OrderRequest | null {
    const q = coinQty
    const req: OrderRequest = { symbol, side, action, type, qty: Number.isFinite(q) ? q : 0 }
    if (type === 'limit') {
      const p = num(priceStr)
      if (!(p > 0)) return null
      req.price = p
    } else if (type === 'trigger') {
      const tp = num(triggerStr)
      if (!(tp > 0)) return null
      req.triggerPrice = tp
      req.triggerBy = triggerBy
      if (execType === 'limit') {
        const ep = num(execPriceStr)
        if (!(ep > 0)) return null
        req.price = ep
      }
    }
    if (action === 'open' && tpSlOn) {
      const tpv = num(tpStr)
      const slv = num(slStr)
      if (tpv > 0) req.tp = tpv
      if (slv > 0) req.sl = slv
      req.tpSlBy = tpSlBy
    }
    return req
  }

  const canEstimate = Number.isFinite(coinQty) && coinQty > 0 && orderPrice > 0
  const estLong = useMemo(
    () => {
      const req = canEstimate ? buildReq('long', 'open') : null
      return req ? paper.estimate(req) : null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEstimate, coinQty, orderPrice, symbol, type, priceStr, triggerStr, execPriceStr, execType, settings.leverage, settings.marginMode],
  )
  const estShort = useMemo(
    () => {
      const req = canEstimate ? buildReq('short', 'open') : null
      return req ? paper.estimate(req) : null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEstimate, coinQty, orderPrice, symbol, type, priceStr, triggerStr, execPriceStr, execType, settings.leverage, settings.marginMode],
  )

  async function submit(side: PosSide) {
    if (busy) return
    if (tab === 'open' && !(Number.isFinite(coinQty) && coinQty > 0)) {
      setError('수량을 입력하세요.')
      return
    }
    if (tab === 'open' && minQty > 0 && coinQty < minQty) {
      setError(`최소 주문 수량은 ${fmtQty(minQty, step)} 입니다.`)
      return
    }
    const req = buildReq(side, tab)
    if (!req) {
      setError('가격을 입력하세요.')
      return
    }
    if (tab === 'close') {
      const pos = side === 'long' ? posLong : posShort
      if (closePct != null) {
        // 비율은 누른 쪽 보유 수량 기준. 100% 는 전량(0)으로 보내 끝수가 남지 않게 한다.
        const q = pos ? closeQtyOf(pos) : 0
        if (!(q > 0)) {
          setError(closePct > 0 ? `종료 수량이 최소 단위(${fmtQty(step, step)})보다 작습니다.` : '수량을 입력하세요.')
          return
        }
        req.qty = closePct >= 100 ? 0 : q
      } else if (!(Number.isFinite(coinQty) && coinQty > 0)) {
        // 수량이 비면 전량(0).
        req.qty = 0
      }
    }
    setBusy(true)
    setError(null)
    const err = await paper.place(req)
    setBusy(false)
    if (err) setError(err)
    else {
      // 다음 주문에 앞 주문의 수량·익절/손절이 붙지 않게 비운다(켜 둔 토글은 그대로).
      setQtyStr('')
      setTpStr('')
      setSlStr('')
    }
  }

  async function switchMargin(mode: 'cross' | 'isolated') {
    setMarginErr(null)
    const err = await paper.setSymbolSettings(symbol, { marginMode: mode })
    if (err) setMarginErr(err)
    else setMarginAnchor(null)
  }

  const funding = quote?.fundingRate
  const nextFunding = quote?.nextFundingTime
  const fundingClass = funding == null ? '' : funding > 0 ? 'down' : funding < 0 ? 'up' : ''

  // 동기화 안내 문구. 되짚는 중이면 로컬·서버 모드 모두 먼저 알린다.
  const syncLine = paper.catchingUp
    ? '꺼 둔 동안의 시세를 반영하는 중…'
    : paper.sync.mode === 'local'
      ? '이 기기에만 저장됩니다. 동기화 코드를 정하면 PC·폰이 같은 계좌를 씁니다.'
      : paper.sync.message

  const notional = Number.isFinite(coinQty) ? coinQty * orderPrice : 0

  return (
    <section className={`op${compact ? ' op-compact' : ''}`}>
      {/* 종목·시세 헤더 */}
      <header className="op-head">
        <div className="op-head-sym">{displaySymbol(symbol, symbols)}</div>
        <div className="op-head-prices">
          <span className="op-last">{last > 0 ? fmtPrice(last, tick) : '—'}</span>
          <span className="op-mark">
            마크 {quote?.mark ? fmtPrice(quote.mark, tick) : '—'}
          </span>
        </div>
        <div className="op-funding">
          <span className={fundingClass}>
            펀딩 {funding == null ? '—' : `${funding > 0 ? '+' : funding < 0 ? '−' : ''}${(Math.abs(funding) * 100).toFixed(4)}%`}
          </span>
          {nextFunding != null && <span className="op-funding-cd">{fmtCountdown(nextFunding - nowTick)}</span>}
        </div>
      </header>

      {/* 마진 모드 · 레버리지 */}
      <div className="op-row op-modes">
        <button
          type="button"
          className="op-mode-btn"
          onClick={(e) => {
            setMarginErr(null)
            setMarginAnchor((a) => (a ? null : e.currentTarget))
          }}
        >
          {settings.marginMode === 'cross' ? '교차' : '격리'}
        </button>
        <button type="button" className="op-mode-btn" onClick={() => setLevOpen(true)}>
          {settings.leverage}x
        </button>
      </div>

      <Popover anchor={marginAnchor} open={!!marginAnchor} onClose={() => setMarginAnchor(null)} placement="bottom-start">
        <div className="op-margin-menu">
          {(['cross', 'isolated'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`op-margin-opt${settings.marginMode === m ? ' active' : ''}`}
              onClick={() => switchMargin(m)}
            >
              {m === 'cross' ? '교차' : '격리'}
            </button>
          ))}
          {marginErr && <p className="op-error">{marginErr}</p>}
        </div>
      </Popover>

      {levOpen && (
        <LeverageDialog
          open={levOpen}
          onClose={() => setLevOpen(false)}
          symbol={symbol}
          symbols={symbols}
          leverage={settings.leverage}
          rules={rules}
        />
      )}

      {/* 진입 / 종료 탭 */}
      <div className="op-tabs">
        {(['open', 'close'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`op-tab${tab === t ? ' active' : ''}`}
            onClick={() => {
              setTab(t)
              clearErr()
              setQtyStr('')
            }}
          >
            {ACTION_LABEL[t]}
          </button>
        ))}
      </div>

      {/* 주문 종류 */}
      <div className="op-seg">
        {(['limit', 'market', 'trigger'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`op-seg-btn${type === t ? ' active' : ''}`}
            onClick={() => {
              setType(t)
              clearErr()
            }}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {/* 가격 입력 */}
      {type === 'limit' && (
        <label className="op-field">
          <span className="op-field-label">가격 (USDT)</span>
          <div className="op-input-wrap">
            <input
              className="op-input"
              inputMode="decimal"
              value={priceStr}
              placeholder={last ? fmtPrice(last, tick) : '0'}
              onChange={(e) => {
                setPriceStr(e.target.value)
                clearErr()
              }}
            />
            <button type="button" className="op-inline-btn" onClick={() => last && setPriceStr(fmtPrice(roundTo(last, tick), tick))}>
              최근가
            </button>
          </div>
        </label>
      )}

      {type === 'trigger' && (
        <>
          <label className="op-field">
            <span className="op-field-label">발동가 (USDT)</span>
            <input
              className="op-input"
              inputMode="decimal"
              value={triggerStr}
              placeholder={last ? fmtPrice(last, tick) : '0'}
              onChange={(e) => {
                setTriggerStr(e.target.value)
                clearErr()
              }}
            />
          </label>
          <label className="op-field">
            <span className="op-field-label">발동 기준</span>
            <select
              className="op-select"
              value={triggerBy}
              onChange={(e) => setTriggerBy(e.target.value as TriggerBy)}
            >
              {(['last', 'mark'] as const).map((b) => (
                <option key={b} value={b}>
                  {TRIGGER_BY_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
          <div className="op-seg op-seg-sub">
            {(['market', 'limit'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`op-seg-btn${execType === t ? ' active' : ''}`}
                onClick={() => {
                  setExecType(t)
                  clearErr()
                }}
              >
                {t === 'market' ? '발동 후 시장가' : '발동 후 지정가'}
              </button>
            ))}
          </div>
          {execType === 'limit' && (
            <label className="op-field">
              <span className="op-field-label">지정가 (USDT)</span>
              <input
                className="op-input"
                inputMode="decimal"
                value={execPriceStr}
                placeholder={last ? fmtPrice(last, tick) : '0'}
                onChange={(e) => {
                  setExecPriceStr(e.target.value)
                  clearErr()
                }}
              />
            </label>
          )}
        </>
      )}

      {/* 수량 */}
      <label className="op-field">
        <span className="op-field-label">
          수량
          <span className="op-unit-toggle">
            {(['coin', 'usdt'] as const).map((u) => (
              <button
                key={u}
                type="button"
                className={`op-unit${qtyUnit === u ? ' active' : ''}`}
                onClick={() => {
                  if (u === qtyUnit) return
                  // 단위 전환 시 값을 환산해 유지한다.
                  const raw = pctOf(qtyStr) != null ? NaN : num(qtyStr)
                  if (Number.isFinite(raw) && orderPrice > 0) {
                    if (u === 'usdt') setQtyStr((floorTo(raw, step) * orderPrice).toFixed(2))
                    else setQtyStr(String(floorTo(raw / orderPrice, step)))
                  }
                  setQtyUnit(u)
                }}
              >
                {u === 'coin' ? (info?.baseAsset ?? '코인') : 'USDT'}
              </button>
            ))}
          </span>
        </span>
        <input
          className="op-input"
          inputMode="decimal"
          value={qtyStr}
          placeholder={tab === 'close' ? '전량' : '0'}
          onChange={(e) => {
            setQtyStr(e.target.value)
            clearErr()
          }}
        />
      </label>

      {/* 슬라이더 */}
      <div className="op-slider">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(sliderVal)}
          onChange={(e) => applyPct(Number(e.target.value))}
          aria-label="수량 비율"
        />
        <div className="op-marks">
          {SLIDER_MARKS.map((m) => (
            <button key={m} type="button" className="op-mark-btn" onClick={() => applyPct(m)}>
              {m}%
            </button>
          ))}
        </div>
      </div>

      {/* 최대 / 보유 안내 */}
      {tab === 'open' ? (
        <div className="op-maxrow">
          <span>
            최대 롱 <b>{fmtQty(maxLong, step)}</b>
          </span>
          <span>
            최대 숏 <b>{fmtQty(maxShort, step)}</b>
          </span>
        </div>
      ) : (
        <div className="op-maxrow">
          <span>
            롱 보유 <b>{fmtQty(posLong?.qty ?? 0, step)}</b>
          </span>
          <span>
            숏 보유 <b>{fmtQty(posShort?.qty ?? 0, step)}</b>
          </span>
        </div>
      )}

      {/* 익절/손절 (진입 전용) */}
      {tab === 'open' && (
        <div className="op-tpsl">
          <label className="op-check">
            <input type="checkbox" className="tv-switch" checked={tpSlOn} onChange={(e) => setTpSlOn(e.target.checked)} />
            <span>익절 / 손절</span>
          </label>
          {tpSlOn && (
            <div className="op-tpsl-body">
              <label className="op-field">
                <span className="op-field-label">익절가 (TP)</span>
                <input
                  className="op-input"
                  inputMode="decimal"
                  value={tpStr}
                  placeholder="0"
                  onChange={(e) => {
                    setTpStr(e.target.value)
                    clearErr()
                  }}
                />
              </label>
              <label className="op-field">
                <span className="op-field-label">손절가 (SL)</span>
                <input
                  className="op-input"
                  inputMode="decimal"
                  value={slStr}
                  placeholder="0"
                  onChange={(e) => {
                    setSlStr(e.target.value)
                    clearErr()
                  }}
                />
              </label>
              <label className="op-field">
                <span className="op-field-label">기준 가격</span>
                <select className="op-select" value={tpSlBy} onChange={(e) => setTpSlBy(e.target.value as TriggerBy)}>
                  {(['last', 'mark'] as const).map((b) => (
                    <option key={b} value={b}>
                      {TRIGGER_BY_LABEL[b]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      {/* 예상 정보 */}
      {tab === 'open' ? (
        <div className="op-info">
          <div className="op-info-row">
            <span>가용</span>
            <b>{fmtUsdt(summary.available)} USDT</b>
          </div>
          <div className="op-info-row">
            <span>주문 금액</span>
            <b>{fmtUsdt(notional)} USDT</b>
          </div>
          <div className="op-info-row">
            <span>필요 증거금</span>
            <b>{estLong ? `${fmtUsdt(estLong.margin)} USDT` : '—'}</b>
          </div>
          <div className="op-info-row">
            <span>예상 수수료</span>
            <b>{estLong ? `${fmtUsdt(estLong.fee)} USDT` : '—'}</b>
          </div>
          <div className="op-info-row">
            <span>예상 청산가</span>
            <b>
              <span className="up">롱 {estLong?.liqPrice != null ? fmtPrice(estLong.liqPrice, tick) : '—'}</span>
              {' / '}
              <span className="down">숏 {estShort?.liqPrice != null ? fmtPrice(estShort.liqPrice, tick) : '—'}</span>
            </b>
          </div>
        </div>
      ) : (
        <div className="op-info">
          {[posLong, posShort].filter((p): p is NonNullable<typeof p> => !!p && p.qty > 0).map((p) => {
            // 입력한 만큼(비율·수량, 비면 전량)만 닫는다고 보고 테이커 수수료를 뺀다.
            const q = closeQtyOf(p)
            const px = orderPrice
            const gross = p.side === 'long' ? (px - p.entry) * q : (p.entry - px) * q
            const net = gross - q * px * paper.account.fees.taker
            return (
              <div key={p.id} className="op-info-close">
                <div className="op-info-row">
                  <span>
                    <span className={p.side === 'long' ? 'op-badge up' : 'op-badge down'}>{SIDE_LABEL[p.side]}</span> 보유 수량
                  </span>
                  <b>{fmtQty(p.qty, step)}</b>
                </div>
                <div className="op-info-row">
                  <span>종료 수량{closePct != null ? ` (${Math.min(100, closePct)}%)` : ''}</span>
                  <b>{fmtQty(q, step)}</b>
                </div>
                <div className="op-info-row">
                  <span>평균 진입가</span>
                  <b>{fmtPrice(p.entry, tick)}</b>
                </div>
                <div className="op-info-row">
                  <span>예상 실현 손익(수수료 차감)</span>
                  <b className={pnlClass(net)}>{fmtSigned(net)} USDT</b>
                </div>
              </div>
            )
          })}
          {!posLong && !posShort && <p className="op-empty">이 종목에 보유 포지션이 없습니다.</p>}
        </div>
      )}

      {/* 진입/종료 버튼 */}
      <div className="op-actions">
        <button
          type="button"
          className="op-submit up"
          disabled={busy || (tab === 'close' && !(posLong && posLong.qty > 0))}
          onClick={() => submit('long')}
        >
          {tab === 'open' ? '롱 진입' : '롱 종료'}
        </button>
        <button
          type="button"
          className="op-submit down"
          disabled={busy || (tab === 'close' && !(posShort && posShort.qty > 0))}
          onClick={() => submit('short')}
        >
          {tab === 'open' ? '숏 진입' : '숏 종료'}
        </button>
      </div>
      {error && <p className="op-error op-error-lg">{error}</p>}

      {/* 계좌 요약 · 동기화 */}
      <footer className="op-foot">
        <div className="op-foot-grid">
          <div>
            <span>총자산</span>
            <b>{fmtUsdt(summary.equity)}</b>
          </div>
          <div>
            <span>가용</span>
            <b>{fmtUsdt(summary.available)}</b>
          </div>
          <div>
            <span>미실현 손익</span>
            <b className={pnlClass(summary.upl)}>{fmtSigned(summary.upl)}</b>
          </div>
          <div>
            <span>증거금률</span>
            <b>{fmtMarginRatio(summary.marginRatio)}</b>
          </div>
        </div>
        <p className="op-sync">{syncLine}</p>
      </footer>
    </section>
  )
}

import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import {
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesPrimitive,
  type SeriesType,
  type Time,
} from 'lightweight-charts'
import { PaperContext, usePaperLive } from '../../lib/paper/context'
import type { PaperApi, PaperPosition, PaperOrder, PositionView, PaperQuote } from '../../lib/paper/types'
import { Icon } from '../../components/Icon'
import { ACTION_LABEL, SIDE_LABEL, fmtPct, fmtPrice, fmtQty, fmtSigned, pnlClass, roundTo } from '../../components/trade/format'
import './tradeOverlay.css'

/** 캔버스 가격선 색 — tokens 의 시장색과 같은 값(선은 문자열 색이 필요하다). */
const LONG = '#089981'
const SHORT = '#f23645'
const WARN = '#f7a600'

export interface TradeOverlayProps {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  symbol: string
  /** 그리기 오버레이가 켜졌을 때만 버튼·드래그를 쓴다. 꺼져 있으면 선·라벨만 보인다. */
  interactive: boolean
}

/** PaperContext 가 없으면(모의거래 미설정) 아무것도 그리지 않는다. */
export function TradeOverlay(props: TradeOverlayProps) {
  const api = useContext(PaperContext)
  if (!api) return null
  return <TradeOverlayInner {...props} api={api} />
}

/** 시리즈에 붙어 매 프레임 라벨 위치만 다시 계산하게 하는 얇은 프리미티브. */
class TradePrimitive implements ISeriesPrimitive<Time> {
  private cb: () => void
  constructor(cb: () => void) {
    this.cb = cb
  }
  updateAllViews(): void {
    this.cb()
  }
}

interface LineSpec {
  key: string
  price: number
  color: string
  style: LineStyle
  axisLabel: boolean
}

interface LabelSpec {
  key: string
  price: number
  color: string
  draggable: boolean
  node: ReactNode
  /** 드롭 시 호출 — 오류 문구(실패) 또는 null(성공). */
  onDrop?: (price: number) => Promise<string | null>
}

const SIDE_CLASS: Record<'long' | 'short', string> = { long: 'up', short: 'down' }

function TradeOverlayInner({ chart, series, symbol, interactive, api }: TradeOverlayProps & { api: PaperApi }) {
  const account = api.account
  const positions = usePaperLive((l) => l.positions)
  const quotes = usePaperLive((l) => l.quotes)

  const layerRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<Map<string, IPriceLine>>(new Map())
  const pricesRef = useRef<Map<string, number>>(new Map())
  const dropRef = useRef<Map<string, (price: number) => Promise<string | null>>>(new Map())
  const dragRef = useRef<{ key: string; pointerId: number; price: number; orig: number } | null>(null)
  const repositionRef = useRef<() => void>(() => {})

  // 두 번 눌러 종료(첫 클릭 → '종료?', 3초 뒤 원복).
  const [confirmKey, setConfirmKey] = useConfirm()

  const rules = api.rules(symbol)
  const tick = rules?.tickSize ?? 0
  const step = rules?.stepSize ?? 0.001

  // ── 이 심볼의 선·라벨 목록을 만든다. ──
  const lineSpecs: LineSpec[] = []
  const labelSpecs: LabelSpec[] = []

  const mine = account.positions.filter((p) => p.symbol === symbol)
  for (const p of mine) {
    const view: PositionView | undefined = positions[p.id]
    const quote: PaperQuote | undefined = quotes[symbol]
    const mark = view?.mark ?? quote?.mark ?? p.entry
    const upl = view?.upl ?? 0
    const roe = view?.roe ?? 0
    const liq = view?.liqPrice ?? null
    const dir = p.side === 'long' ? 1 : -1
    const color = p.side === 'long' ? LONG : SHORT

    // 진입선(실선).
    lineSpecs.push({ key: `pos:${p.id}`, price: p.entry, color, style: LineStyle.Solid, axisLabel: true })
    labelSpecs.push({
      key: `pos:${p.id}`,
      price: p.entry,
      color,
      draggable: false,
      node: (
        <>
          <span className="tv-tl-text">
            <span className={`tv-tl-side ${SIDE_CLASS[p.side]}`}>{SIDE_LABEL[p.side]}</span> {p.leverage}x · {fmtQty(p.qty, step)} ·{' '}
            <span className={pnlClass(upl)}>
              {fmtSigned(upl)} ({fmtPct(roe)})
            </span>
          </span>
          {interactive && !p.tp && (
            <button type="button" className="tv-tl-btn" onClick={() => addTpSl(p, 'tp', mark)}>
              익절
            </button>
          )}
          {interactive && !p.sl && (
            <button type="button" className="tv-tl-btn" onClick={() => addTpSl(p, 'sl', mark)}>
              손절
            </button>
          )}
          {interactive && (
            <button
              type="button"
              className={`tv-tl-btn${confirmKey === `pos:${p.id}` ? ' confirm' : ''}`}
              aria-label="포지션 종료"
              onClick={() => closePosition(p)}
            >
              {confirmKey === `pos:${p.id}` ? '종료?' : <Icon name="close" size={12} />}
            </button>
          )}
        </>
      ),
    })

    // 익절선(점선 초록).
    if (p.tp) {
      const expected = (p.tp.price - p.entry) * p.qty * dir
      lineSpecs.push({ key: `tp:${p.id}`, price: p.tp.price, color: LONG, style: LineStyle.Dashed, axisLabel: true })
      labelSpecs.push({
        key: `tp:${p.id}`,
        price: p.tp.price,
        color: LONG,
        draggable: interactive,
        onDrop: (price) => api.setTpSl(symbol, p.side, { price, by: p.tp?.by ?? 'mark' }, undefined),
        node: (
          <>
            <span className="tv-tl-text">
              익절 {fmtPrice(p.tp.price, tick)} · <span className={pnlClass(expected)}>{fmtSigned(expected)}</span>
            </span>
            {interactive && (
              <button
                type="button"
                className="tv-tl-x"
                aria-label="익절 제거"
                onClick={() => report(api.setTpSl(symbol, p.side, null, undefined))}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </>
        ),
      })
    }

    // 손절선(점선 빨강).
    if (p.sl) {
      const expected = (p.sl.price - p.entry) * p.qty * dir
      lineSpecs.push({ key: `sl:${p.id}`, price: p.sl.price, color: SHORT, style: LineStyle.Dashed, axisLabel: true })
      labelSpecs.push({
        key: `sl:${p.id}`,
        price: p.sl.price,
        color: SHORT,
        draggable: interactive,
        onDrop: (price) => api.setTpSl(symbol, p.side, undefined, { price, by: p.sl?.by ?? 'mark' }),
        node: (
          <>
            <span className="tv-tl-text">
              손절 {fmtPrice(p.sl.price, tick)} · <span className={pnlClass(expected)}>{fmtSigned(expected)}</span>
            </span>
            {interactive && (
              <button
                type="button"
                className="tv-tl-x"
                aria-label="손절 제거"
                onClick={() => report(api.setTpSl(symbol, p.side, undefined, null))}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </>
        ),
      })
    }

    // 강제 청산가(점점선, 경고색) — 끌 수 없다.
    if (liq != null && Number.isFinite(liq)) {
      lineSpecs.push({ key: `liq:${p.id}`, price: liq, color: WARN, style: LineStyle.Dotted, axisLabel: true })
      labelSpecs.push({
        key: `liq:${p.id}`,
        price: liq,
        color: WARN,
        draggable: false,
        node: <span className="tv-tl-text">청산 {fmtPrice(liq, tick)}</span>,
      })
    }
  }

  // 미체결 주문(점선, 방향색).
  const myOrders = account.orders.filter((o) => o.symbol === symbol)
  for (const o of myOrders) {
    const linePrice = o.type === 'limit' ? o.price : o.triggerPrice
    if (linePrice == null || !Number.isFinite(linePrice)) continue
    const color = o.side === 'long' ? LONG : SHORT
    lineSpecs.push({ key: `ord:${o.id}`, price: linePrice, color, style: LineStyle.Dotted, axisLabel: true })
    labelSpecs.push({
      key: `ord:${o.id}`,
      price: linePrice,
      color,
      draggable: interactive,
      onDrop: (price) => api.amend(o.id, o.type === 'limit' ? { price } : { triggerPrice: price }),
      node: (
        <>
          <span className="tv-tl-text">
            {orderText(o, tick)} · <span className={`tv-tl-side ${SIDE_CLASS[o.side]}`}>{SIDE_LABEL[o.side]}</span> {ACTION_LABEL[o.action]} · {fmtQty(o.qty, step)}
          </span>
          {interactive && (
            <button type="button" className="tv-tl-x" aria-label="주문 취소" onClick={() => report(api.cancel(o.id))}>
              <Icon name="close" size={12} />
            </button>
          )}
        </>
      ),
    })
  }

  // 드롭 콜백·가격 사전을 최신으로 채운다(라벨 렌더와 같은 목록).
  dropRef.current = new Map()
  pricesRef.current = new Map()
  for (const s of labelSpecs) {
    pricesRef.current.set(s.key, s.price)
    if (s.onDrop) dropRef.current.set(s.key, s.onDrop)
  }

  function report(p: Promise<string | null>): void {
    void p.then((err) => {
      if (err) api.report(err)
    })
  }

  function addTpSl(p: PaperPosition, which: 'tp' | 'sl', mark: number): void {
    const dir = p.side === 'long' ? 1 : -1
    // 익절은 이익 방향, 손절은 손실 방향으로 칸 높이의 15%만큼 떨어진 자리에 둔다 — 화면 안에 떠야 끌어서 맞출 수 있다
    // (1분봉에서 ±1% 는 화면 밖이다). 좌표를 못 구하면 ±1%.
    const up = which === 'tp' ? dir === 1 : dir === -1
    const y = series.priceToCoordinate(mark)
    const offset = chart.paneSize().height * 0.15
    const screen = y === null ? null : series.coordinateToPrice(up ? y - offset : y + offset)
    const raw = screen ?? mark * (1 + (up ? 0.01 : -0.01))
    const price = tick ? roundTo(raw, tick) : raw
    if (which === 'tp') report(api.setTpSl(symbol, p.side, { price, by: 'mark' }, undefined))
    else report(api.setTpSl(symbol, p.side, undefined, { price, by: 'mark' }))
  }

  function closePosition(p: PaperPosition): void {
    const key = `pos:${p.id}`
    if (confirmKey === key) {
      setConfirmKey(null)
      report(api.close(symbol, p.side))
    } else {
      setConfirmKey(key)
    }
  }

  // ── 라벨 위치 재계산(매 프레임/렌더). React 재렌더 없이 transform 만 바꾼다. ──
  const reposition = () => {
    const layer = layerRef.current
    if (!layer) return
    const h = chart.paneSize().height
    const drag = dragRef.current
    const nodes = layer.querySelectorAll<HTMLElement>('.tv-tradelabel')
    nodes.forEach((el) => {
      const key = el.dataset.key
      if (!key) return
      const price = drag && drag.key === key ? drag.price : pricesRef.current.get(key)
      if (price == null) {
        el.style.display = 'none'
        return
      }
      const y = series.priceToCoordinate(price)
      if (y === null || y < 0 || y > h) {
        el.style.display = 'none'
        return
      }
      el.style.display = ''
      el.style.transform = `translateY(${Math.round(y)}px) translateY(-50%)`
    })
  }
  repositionRef.current = reposition

  // ── 프리미티브 부착/재부착 — 시리즈가 바뀌면 새로 붙인다. ──
  useEffect(() => {
    const prim = new TradePrimitive(() => repositionRef.current())
    series.attachPrimitive(prim)
    return () => {
      series.detachPrimitive(prim)
    }
  }, [series])

  // ── 선 재조정 — 목록에 맞춰 가격선을 만들고/고치고/지운다. ──
  const sig = lineSpecs.map((s) => `${s.key}=${s.price}:${s.color}:${s.style}`).join('|')
  useLayoutEffect(() => {
    const store = linesRef.current
    const wantedKeys = new Set(lineSpecs.map((s) => s.key))
    // 사라진 선 제거.
    for (const [key, line] of store) {
      if (!wantedKeys.has(key)) {
        try {
          series.removePriceLine(line)
        } catch {
          /* 시리즈가 먼저 사라졌으면 선도 함께 사라졌다 */
        }
        store.delete(key)
      }
    }
    // 만들거나 갱신.
    for (const s of lineSpecs) {
      // 끄는 중인 선은 끈 자리에 둔다 — 시세 갱신(청산가 등)으로 다시 맞출 때 원래 가격으로 튀지 않게.
      const drag = dragRef.current
      const opts = {
        price: drag && drag.key === s.key ? drag.price : s.price,
        color: s.color,
        lineWidth: 1 as const,
        lineStyle: s.style,
        axisLabelVisible: s.axisLabel,
      }
      const existing = store.get(s.key)
      if (existing) existing.applyOptions(opts)
      else store.set(s.key, series.createPriceLine(opts))
    }
    reposition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, series])

  // 언마운트/시리즈 교체 시 남은 선을 모두 지운다.
  useEffect(() => {
    const store = linesRef.current
    return () => {
      for (const [, line] of store) {
        try {
          series.removePriceLine(line)
        } catch {
          /* 이미 사라짐 */
        }
      }
      store.clear()
    }
  }, [series])

  // 라벨 DOM 이 새로 그려질 때마다(계좌·시세 변화) 위치를 맞춘다.
  useLayoutEffect(() => {
    reposition()
  })

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, s: LabelSpec) => {
    if (!interactive || !s.draggable) return
    if ((e.target as HTMLElement).closest('button')) return
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    el.classList.add('dragging')
    dragRef.current = { key: s.key, pointerId: e.pointerId, price: s.price, orig: s.price }
  }

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    e.preventDefault()
    e.stopPropagation()
    const rect = chart.chartElement().getBoundingClientRect()
    const raw = series.coordinateToPrice(e.clientY - rect.top)
    if (raw === null) return
    d.price = tick ? roundTo(raw, tick) : raw
    linesRef.current.get(d.key)?.applyOptions({ price: d.price })
    reposition()
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    dragRef.current = null
    const el = e.currentTarget
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    el.classList.remove('dragging')
    const onDrop = dropRef.current.get(d.key)
    const key = d.key
    const orig = d.orig
    if (!onDrop) return
    void onDrop(d.price).then((err) => {
      if (err) {
        // 실패하면 원래 자리로 되돌린다.
        linesRef.current.get(key)?.applyOptions({ price: orig })
        pricesRef.current.set(key, orig)
        reposition()
        api.report(err)
      }
    })
  }

  return (
    <div className="tv-tradeoverlay" ref={layerRef}>
      {labelSpecs.map((s) => (
        <div
          key={s.key}
          data-key={s.key}
          className={`tv-tradelabel${s.draggable ? ' draggable' : ''}`}
          style={{ ['--line' as string]: s.color, display: 'none' }}
          onPointerDown={(e) => startDrag(e, s)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {s.node}
        </div>
      ))}
    </div>
  )
}

/** 3초 뒤 저절로 풀리는 확인 상태. */
function useConfirm(): [string | null, (key: string | null) => void] {
  const [key, setKey] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const set = (k: string | null) => {
    if (timer.current) clearTimeout(timer.current)
    setKey(k)
    if (k) timer.current = setTimeout(() => setKey(null), 3000)
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return [key, set]
}

function orderText(o: PaperOrder, tick: number): string {
  if (o.type === 'limit') return '지정가'
  const arrow = o.triggerDir === 'down' ? '▼' : '▲'
  const trig = o.triggerPrice != null ? fmtPrice(o.triggerPrice, tick) : ''
  const after = o.price != null ? `지정가 ${fmtPrice(o.price, tick)}` : '시장가'
  return `조건부 ${arrow} ${trig} → ${after}`
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chart, type PaneInfo, type CompareInfo } from './Chart'
import { CoinIcon } from './CoinIcon'
import { useBinanceKlines } from '../hooks/useBinanceKlines'
import { useBinanceWebSocket } from '../hooks/useBinanceWebSocket'
import { useTicker24h } from '../hooks/useTicker24h'
import type { Candle, Interval } from '../lib/binance'
import { rateLimitedUntil } from '../lib/binance'
import type { ChartSettings } from '../lib/chartSettings'
import type { ChartType, ScaleMode } from '../lib/chartTypes'
import { INTERVAL_INFO } from '../lib/intervals'
import type { IndicatorInstance } from '../lib/indicatorConfig'
import { indicatorTitle } from '../lib/indicatorConfig'
import type { PriceAlert } from '../hooks/usePriceAlerts'
import type { Drawing, DrawingTool, MagnetMode, NewDrawing } from '../lib/drawings'
import type { Pin } from '../lib/pins'
import { computeFeatures, MIN_HISTORY, type FeatureSet } from '../lib/features'
import { CHART_PALETTES } from '../lib/theme'
import { computeIndicator, displayParts, indicatorLegend, type ComputedIndicator } from '../chart/compute'
import { formatPrice, barCloseTime } from '../chart/format'
import { getChart } from '../lib/chartRegistry'
import type { ChartMenuRequest } from '../lib/chartMenu'
import { tip } from '../lib/tooltip'
import './chart.css'
import './indicators.css'

/** 웹소켓 틱이 이보다 오래 없으면 REST 재조회로 차트를 따라잡는다. */
const STALE_MS = 15000

/** 리플레이 속도(봉당 ms). */
const REPLAY_SPEEDS: { label: string; ms: number }[] = [
  { label: '0.1초', ms: 100 },
  { label: '0.3초', ms: 300 },
  { label: '1초', ms: 1000 },
  { label: '3초', ms: 3000 },
]

export interface ChartCellProps {
  cellIndex: number | null
  symbol: string
  description: string
  interval: Interval
  /** 심볼 가격 소수 자릿수(셸이 priceDecimals(symbol, infos)로 준다). */
  pricePrecision: number
  chartType: ChartType
  scaleMode: ScaleMode
  autoScale: boolean
  onAutoScaleChange: (v: boolean) => void
  invertScale: boolean
  /** "시간 기준 세로 커서 고정" 시각(없으면 null). */
  lockedTime: number | null
  compare: string[]
  onCompareChange: (next: string[]) => void
  indicators: IndicatorInstance[]
  onIndicatorsChange: (next: IndicatorInstance[]) => void
  settings: ChartSettings
  alerts: PriceAlert[]
  drawings: Drawing[]
  drawingTool: DrawingTool
  magnet: MagnetMode
  stayInDrawingMode: boolean
  drawingsLocked: boolean
  drawingsHidden: boolean
  onCreateDrawing: (d: NewDrawing) => string
  onUpdateDrawing: (id: string, patch: Partial<Omit<Drawing, 'id'>>, opts?: { history?: boolean }) => void
  onRemoveDrawing: (id: string) => void
  onToolDone: () => void
  pinMode: boolean
  pins: Pin[]
  onAddPin: (input: { time: number; price: number; features: FeatureSet }) => void
  onPinFail: (reason: string) => void
  onLiveFeatures?: (f: FeatureSet | null) => void
  replay: boolean
  onReplayExit: () => void
  active: boolean
  highlightActive: boolean
  onActivate: () => void
  onPrice: (symbol: string, price: number) => void
  gridStyle?: React.CSSProperties
  /** 우클릭 메뉴 요청. PiP 창처럼 메뉴가 없는 곳은 넘기지 않는다. */
  onContextMenu?: (req: ChartMenuRequest) => void
  /** 범례의 🔔 — 그 지표로 알림 만들기. */
  onIndicatorAlert?: (instanceId: string) => void
  /** 범례의 ⚙(또는 지표 이름 두 번 누르기) — 그 지표의 설정 창을 연다. */
  onEditIndicator?: (instanceId: string) => void
  /** 폰: 시간축 오른쪽 모서리의 ⚙ — 가격 축 시트를 연다. */
  onScaleMenu?: () => void
}

/** 범례 조작용 소형 아이콘(직접 그린 SVG). */
function Ctl({ name }: { name: 'eye' | 'eyeOff' | 'gear' | 'caret' | 'close' | 'bell' }) {
  const p: Record<typeof name, string> = {
    eye: 'M8 3.5C4.5 3.5 2 8 2 8s2.5 4.5 6 4.5S14 8 14 8 11.5 3.5 8 3.5Zm0 7A2.5 2.5 0 1 1 8 5.5a2.5 2.5 0 0 1 0 5Z',
    eyeOff: 'M2 2l12 12M6 6.2A2.5 2.5 0 0 0 9.8 9.8M8 3.5c3.5 0 6 4.5 6 4.5a12 12 0 0 1-1.8 2.3M4 4.6A12 12 0 0 0 2 8s2.5 4.5 6 4.5',
    gear: 'M8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5Zm5.4 2.5-1.3-.4a4 4 0 0 0-.4-1l.7-1.2-1-1-1.2.7a4 4 0 0 0-1-.4L8.9 2.6H7.1L6.8 3.9a4 4 0 0 0-1 .4L4.6 3.6l-1 1 .7 1.2a4 4 0 0 0-.4 1l-1.3.4v1.6l1.3.4a4 4 0 0 0 .4 1l-.7 1.2 1 1 1.2-.7a4 4 0 0 0 1 .4l.3 1.3h1.8l.3-1.3a4 4 0 0 0 1-.4l1.2.7 1-1-.7-1.2a4 4 0 0 0 .4-1l1.3-.4Z',
    caret: 'M4 6l4 4 4-4',
    close: 'M3 3l10 10M13 3 3 13',
    bell: 'M8 2.5a3.5 3.5 0 0 0-3.5 3.5v2.6L3 11h10l-1.5-2.4V6A3.5 3.5 0 0 0 8 2.5ZM6.6 12.8a1.5 1.5 0 0 0 2.8 0',
  }
  const stroke = name === 'caret' || name === 'close' || name === 'eyeOff' || name === 'bell'
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
      <path
        d={p[name]}
        fill={stroke ? 'none' : 'currentColor'}
        fillRule="evenodd"
        stroke={stroke ? 'currentColor' : 'none'}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChartCell({
  cellIndex,
  symbol,
  description,
  interval,
  pricePrecision,
  chartType,
  scaleMode,
  autoScale,
  onAutoScaleChange,
  invertScale,
  lockedTime,
  compare,
  onCompareChange,
  indicators,
  onIndicatorsChange,
  settings,
  alerts,
  drawings,
  drawingTool,
  magnet,
  stayInDrawingMode,
  drawingsLocked,
  drawingsHidden,
  onCreateDrawing,
  onUpdateDrawing,
  onRemoveDrawing,
  onToolDone,
  pinMode,
  pins,
  onAddPin,
  onPinFail,
  onLiveFeatures,
  replay,
  onReplayExit,
  active,
  highlightActive,
  onActivate,
  onPrice,
  gridStyle,
  onContextMenu,
  onIndicatorAlert,
  onEditIndicator,
  onScaleMenu,
}: ChartCellProps) {
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  // 손가락으로 지표 줄을 눌러 조작 버튼을 편 지표(마우스는 올리기만 해도 보인다).
  const [ctlOpenFor, setCtlOpenFor] = useState<string | null>(null)
  const [panes, setPanes] = useState<{ list: PaneInfo[]; axisWidth: number }>({ list: [], axisWidth: 64 })
  const [compareInfo, setCompareInfo] = useState<CompareInfo[]>([])
  const [narrow, setNarrow] = useState(false)
  const chartWrapRef = useRef<HTMLDivElement>(null)

  // 리플레이 상태.
  const [replayStart, setReplayStart] = useState<number | null>(null)
  const [replayPos, setReplayPos] = useState(0)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState(1000)
  const [speedOpen, setSpeedOpen] = useState(false)
  const replayBaseRef = useRef<Candle[]>([])

  const ticker = useTicker24h(symbol)
  const { candles, loading, error, reload, loadOlder, loadingOlder, exhausted } = useBinanceKlines(symbol, interval)

  const lastTickRef = useRef(0)
  const onPriceRef = useRef(onPrice)
  onPriceRef.current = onPrice
  const lastRestCandleRef = useRef<Candle | null>(null)
  lastRestCandleRef.current = candles[candles.length - 1] ?? null

  // 봉(약 250ms)·체결(거래마다) 이벤트는 초당 수십 번 온다. 매번 다시 그리지 않고
  // 가장 최신 값만 모아 한 프레임에 한 번 반영한다. 알림 검사는 250ms에 한 번이면 충분하다.
  const pendingRef = useRef<Candle | null>(null)
  const liveRef = useRef<Candle | null>(null)
  const frameRef = useRef(0)
  const priceSentAtRef = useRef(0)
  const flushLive = useCallback(() => {
    frameRef.current = 0
    const next = pendingRef.current
    if (!next) return
    pendingRef.current = null
    liveRef.current = next
    setLiveCandle(next)
    const now = Date.now()
    if (now - priceSentAtRef.current >= 250) {
      priceSentAtRef.current = now
      onPriceRef.current(symbol, next.close)
    }
  }, [symbol])
  const scheduleFlush = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(flushLive)
  }, [flushLive])

  const handleCandle = useCallback(
    (candle: Candle) => {
      lastTickRef.current = Date.now()
      pendingRef.current = candle
      scheduleFlush()
    },
    [scheduleFlush],
  )

  // 체결로 현재 봉의 종가·고가·저가·거래량을 바로 움직인다. 봉 이벤트가 오면 그 값으로 바로잡힌다.
  const handleTrade = useCallback(
    (price: number, qty: number, timeMs: number) => {
      lastTickRef.current = Date.now()
      const base = pendingRef.current ?? liveRef.current ?? lastRestCandleRef.current
      if (!base) return
      const t = Math.floor(timeMs / 1000)
      // 봉의 마감(월봉은 28~31일 가변)을 넘긴 체결은 현재 봉에 섞지 않는다.
      if (t < base.time || t >= barCloseTime(base.time, interval)) return
      pendingRef.current = {
        ...base,
        close: price,
        high: Math.max(base.high, price),
        low: Math.min(base.low, price),
        volume: base.volume + qty,
      }
      scheduleFlush()
    },
    [interval, scheduleFlush],
  )

  // 종목·주기가 바뀌거나 칸이 사라지면 쌓아 둔 실시간 값을 버린다.
  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
      pendingRef.current = null
      liveRef.current = null
    },
    [symbol, interval],
  )

  const status = useBinanceWebSocket(symbol, interval, {
    onCandle: handleCandle,
    onTrade: handleTrade,
    onReconnect: () => void reload(),
  })

  useEffect(() => {
    if (ticker) onPriceRef.current(ticker.symbol, ticker.lastPrice)
  }, [ticker])

  useEffect(() => {
    const timer = window.setInterval(() => {
      // 레이트리밋(429/418) 쿨다운 중엔 REST 를 건드리지 않는다 — getJson 이 즉시 던져 봤자 낭비다.
      if (rateLimitedUntil() > Date.now()) return
      if (Date.now() - lastTickRef.current > STALE_MS && !loading) void reload()
    }, STALE_MS)
    return () => window.clearInterval(timer)
  }, [reload, loading])

  // 좁은 칸(범례 컨테이너 < 520px, 예: 폰)에서는 OHLC 를 한 줄로 접는다.
  useEffect(() => {
    const el = chartWrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setNarrow(e.contentRect.width < 520)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 심볼/주기 변경 시 이전 실시간 봉 폐기.
  const seriesKey = `${symbol}-${interval}`
  const seriesKeyRef = useRef(seriesKey)
  if (seriesKeyRef.current !== seriesKey) {
    seriesKeyRef.current = seriesKey
    if (liveCandle !== null) setLiveCandle(null)
  }

  const mergedCandles = useMemo(() => {
    if (candles.length === 0 || !liveCandle) return candles
    const last = candles[candles.length - 1]
    if (liveCandle.time < last.time) return candles
    if (liveCandle.time === last.time) return [...candles.slice(0, -1), liveCandle]
    return [...candles, liveCandle]
  }, [candles, liveCandle])

  const replayPicking = replay && replayStart === null

  // 리플레이 진입/이탈 처리. 이탈하면 TradingView처럼 실시간 끝으로 돌아간다.
  const wasReplayRef = useRef(false)
  useEffect(() => {
    if (replay) {
      replayBaseRef.current = mergedCandles
      setReplayStart(null)
      setReplayPos(0)
      setReplayPlaying(false)
    } else {
      setReplayStart(null)
      setReplayPlaying(false)
      if (wasReplayRef.current && cellIndex !== null) {
        // 전체 캔들이 다시 그려진 뒤에 옮겨야 한다.
        window.setTimeout(() => getChart(cellIndex)?.scrollToRealtime(), 50)
      }
    }
    wasReplayRef.current = replay
    // 진입 시점의 캔들만 스냅샷한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay])

  // 재생: 일정 간격으로 한 봉씩 전진.
  useEffect(() => {
    if (!replay || replayStart === null || !replayPlaying) return
    const total = replayBaseRef.current.length
    const timer = window.setInterval(() => {
      setReplayPos((pos) => {
        if (pos >= total - 1) {
          setReplayPlaying(false)
          return pos
        }
        return pos + 1
      })
    }, replaySpeed)
    return () => window.clearInterval(timer)
  }, [replay, replayStart, replayPlaying, replaySpeed])

  // 차트에 넘길 캔들 — 리플레이 중엔 잘라서, 아니면 실시간 병합본.
  const chartCandles = useMemo(() => {
    if (!replay) return mergedCandles
    const base = replayBaseRef.current
    if (replayStart === null) return base
    return base.slice(0, Math.max(1, replayPos + 1))
  }, [replay, replayStart, replayPos, mergedCandles])

  const palette = CHART_PALETTES[settings.theme]

  // 지표 계산: 봉 수·첫 봉이 바뀌면(새 봉·과거 불러오기·리플레이) 바로, 진행 중인 봉은 1초에 한 번
  // 다시 계산한다(요건: ≤1/s). 거래량 급증처럼 봉이 끝나기 전에 보여야 하는 지표가 실시간으로 따라간다.
  const [indicatorCandles, setIndicatorCandles] = useState(chartCandles)
  if (chartCandles.length !== indicatorCandles.length || chartCandles[0]?.time !== indicatorCandles[0]?.time) {
    setIndicatorCandles(chartCandles)
  }
  const liveCandlesRef = useRef(chartCandles)
  liveCandlesRef.current = chartCandles
  useEffect(() => {
    const timer = window.setInterval(() => setIndicatorCandles(liveCandlesRef.current), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const computed = useMemo<ComputedIndicator[]>(
    () =>
      indicators
        .filter((i) => i.visible)
        .map((i) => computeIndicator(i, indicatorCandles, palette)),
    [indicatorCandles, indicators, palette],
  )
  // 차트·범례는 부분 단위로 다룬다 — 세트 지표는 이평선(가격 칸)·거래량 급증·RSI(각자 칸)로 펴진다.
  const parts = useMemo(() => computed.flatMap(displayParts), [computed])
  const partById = useMemo(() => {
    const map: Record<string, ComputedIndicator> = {}
    for (const c of parts) map[c.instanceId] = c
    return map
  }, [parts])

  // 범례에 쓸 봉 — 크로스헤어를 올렸으면 그 봉, 아니면 마지막.
  const legendCandle = useMemo(() => {
    if (hoverTime !== null) {
      const found = chartCandles.find((c) => c.time === hoverTime)
      if (found) return found
    }
    return chartCandles[chartCandles.length - 1] ?? null
  }, [hoverTime, chartCandles])
  const legendUp = legendCandle ? legendCandle.close >= legendCandle.open : true
  const legendChange = legendCandle ? legendCandle.close - legendCandle.open : 0
  const legendChangePct =
    legendCandle && legendCandle.open > 0 ? (legendChange / legendCandle.open) * 100 : 0

  // 핀 클릭/리플레이 클릭 라우팅.
  const handleChartClick = useCallback(
    (time: number, price: number) => {
      if (replayPicking) {
        const base = replayBaseRef.current
        const idx = base.findIndex((c) => c.time === time)
        if (idx >= 0) {
          setReplayStart(time)
          setReplayPos(idx)
        }
        return
      }
      if (pinMode) {
        const idx = mergedCandles.findIndex((c) => c.time === time)
        if (idx < 0) return onPinFail('캔들을 찾지 못했습니다.')
        if (idx < MIN_HISTORY)
          return onPinFail(
            `지표를 계산하려면 앞쪽 캔들이 ${MIN_HISTORY}개 이상 필요합니다. 왼쪽으로 밀어 과거를 더 불러오세요.`,
          )
        const features = computeFeatures(mergedCandles, idx)
        if (!features) return onPinFail('이 지점은 지표를 계산할 수 없습니다.')
        onAddPin({ time, price, features })
      }
    },
    [replayPicking, pinMode, mergedCandles, onAddPin, onPinFail],
  )

  // 맨 끝 봉 기준 실시간 지표(핀 자동 판정용).
  useEffect(() => {
    if (!onLiveFeatures) return
    if (mergedCandles.length <= MIN_HISTORY) {
      onLiveFeatures(null)
      return
    }
    onLiveFeatures(computeFeatures(mergedCandles, mergedCandles.length - 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedCandles.length, symbol, interval, onLiveFeatures])

  const symbolAlerts = useMemo(() => alerts.filter((a) => a.symbol === symbol && a.active), [alerts, symbol])
  const symbolDrawings = useMemo(() => drawings.filter((d) => d.symbol === symbol), [drawings, symbol])

  const base = symbol.replace(/USDT$|USDC$|BUSD$/, '')
  const overlayEnabled = active && !pinMode && !replayPicking

  const toggleVisible = useCallback(
    (id: string) => onIndicatorsChange(indicators.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i))),
    [indicators, onIndicatorsChange],
  )
  const removeIndicator = useCallback(
    (id: string) => onIndicatorsChange(indicators.filter((i) => i.id !== id)),
    [indicators, onIndicatorsChange],
  )
  // 미니창(PiP)은 보기 전용이다 — 설정·알림 창이 본 창에 뜨므로 범례 조작 버튼을 두지 않는다.
  const legendControls = cellIndex !== null

  // 가격 칸 범례 줄: 가격 칸에 그리는 부분마다 한 줄. 숨겼거나 아직 계산 전인 지표도 한 줄(“숨김”).
  type LegendRow = { inst: IndicatorInstance; part: ComputedIndicator | null }
  const mainRows = indicators.flatMap((inst): LegendRow[] => {
    const own = parts.filter((c) => (c.parentId ?? c.instanceId) === inst.id)
    if (own.length === 0) return [{ inst, part: null }]
    return own.filter((c) => c.overlay || c.isVolume).map((part) => ({ inst, part }))
  })
  const rowKeys = new Set([...indicators.map((i) => i.id), ...parts.map((c) => c.instanceId)])
  const ctlOpen = ctlOpenFor !== null && rowKeys.has(ctlOpenFor) ? ctlOpenFor : null

  const fmtPrice = (v: number) => formatPrice(v, pricePrecision)

  /** 범례 한 줄. 조작 버튼(숨기기·설정·알림·삭제)은 원래 지표 전체에 건다 — 세트의 어느 줄에서 눌러도 같다. */
  const renderIndicatorRow = (inst: IndicatorInstance, comp: ComputedIndicator | null) => {
    const rowKey = comp?.instanceId ?? inst.id
    const entries = comp && inst.visible ? indicatorLegend(comp, hoverTime, fmtPrice) : []
    const open = ctlOpen === rowKey
    return (
      // 줄을 누르면(터치) 조작 버튼을 펴고 접는다. 버튼 누름은 버튼이 처리한다.
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <div
        className={`tv-ind-row${open ? ' open' : ''}`}
        key={rowKey}
        onClick={(e) => {
          if (!legendControls || (e.target as Element).closest('button')) return
          setCtlOpenFor(open ? null : rowKey)
        }}
      >
        <span
          className="tv-ind-title"
          onDoubleClick={legendControls && onEditIndicator ? () => onEditIndicator(inst.id) : undefined}
        >
          {comp?.title ?? indicatorTitle(inst)}
        </span>
        {inst.visible ? (
          entries.map((e, i) => (
            <span key={i} className="tv-ind-val" style={{ color: e.color }}>
              {e.label ? <em>{e.label}</em> : null}
              {e.text}
            </span>
          ))
        ) : (
          <span className="tv-ind-hidden">숨김</span>
        )}
        {legendControls && (
          <span className="tv-ind-ctl">
            <button
              type="button"
              {...tip(inst.visible ? '숨기기' : '표시', '지표를 지우지 않고 차트에서 잠시 감춥니다.')}
              aria-label={inst.visible ? '숨기기' : '표시'}
              onClick={() => toggleVisible(inst.id)}
            >
              <Ctl name={inst.visible ? 'eye' : 'eyeOff'} />
            </button>
            {onEditIndicator && (
              <button
                type="button"
                {...tip('설정', '기간·기준값·색 같은 이 지표의 설정을 바꿉니다. 이름을 두 번 눌러도 열립니다.')}
                aria-label="설정"
                onClick={() => onEditIndicator(inst.id)}
              >
                <Ctl name="gear" />
              </button>
            )}
            {onIndicatorAlert && (
              <button
                type="button"
                {...tip('알림 추가', '이 지표 값이 정한 조건에 닿으면 알려 줍니다.')}
                aria-label="이 지표에 알림 추가"
                onClick={() => onIndicatorAlert(inst.id)}
              >
                <Ctl name="bell" />
              </button>
            )}
            <button type="button" {...tip('삭제', '이 지표를 차트에서 뺍니다.')} aria-label="삭제" onClick={() => removeIndicator(inst.id)}>
              <Ctl name="close" />
            </button>
          </span>
        )}
      </div>
    )
  }

  return (
    // 칸 어디를 눌러도 활성 칸이 되게 하는 래퍼.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <section
      className={`chart-cell${active ? ' active' : ''}${highlightActive ? ' highlight' : ''}`}
      style={gridStyle}
      onMouseDownCapture={onActivate}
    >
      <div className="cell-chart" ref={chartWrapRef}>
        <Chart
          key={seriesKey}
          symbol={symbol}
          interval={interval}
          candles={chartCandles}
          pricePrecision={pricePrecision}
          chartType={chartType}
          scaleMode={scaleMode}
          autoScale={autoScale}
          onAutoScaleChange={onAutoScaleChange}
          invertScale={invertScale}
          lockedTime={lockedTime}
          compare={compare}
          indicators={parts}
          settings={settings}
          alerts={symbolAlerts}
          drawings={symbolDrawings}
          pins={pins}
          cellIndex={cellIndex}
          drawingTool={drawingTool}
          magnet={magnet}
          stayInDrawingMode={stayInDrawingMode}
          drawingsLocked={drawingsLocked}
          drawingsHidden={drawingsHidden}
          overlayEnabled={overlayEnabled}
          onCreateDrawing={onCreateDrawing}
          onUpdateDrawing={onUpdateDrawing}
          onRemoveDrawing={onRemoveDrawing}
          onToolDone={onToolDone}
          onReachStart={() => void loadOlder()}
          exhausted={exhausted}
          onHoverTime={setHoverTime}
          onPanes={(list, axisWidth) => setPanes({ list, axisWidth })}
          replayPick={replayPicking}
          captureClicks={pinMode || replayPicking}
          onChartClick={handleChartClick}
          onCompareInfo={setCompareInfo}
          onContextMenu={onContextMenu}
        />

        {/* 트레이딩뷰식 범례(왼쪽 위). */}
        {/* 오실레이터 패널이 많아 메인 패널이 낮아지면 범례가 아래 패널을 덮지 않게 메인 패널 높이에서 자른다. */}
        <div className="tv-legend" style={panes.list[0] ? { maxHeight: Math.max(40, panes.list[0].top - 6), overflow: 'hidden' } : undefined}>
          {settings.showStatusLine && (
            <>
              <div className="tv-legend-head">
                <CoinIcon base={base} size={18} />
                <span className="tv-legend-title">{description}</span>
                <span className="tv-legend-meta">
                  · {INTERVAL_INFO[interval].short} · Binance
                </span>
                <span className={`tv-dot ${status === 'open' ? 'ok' : status === 'connecting' ? 'warn' : 'bad'}`} />
              </div>
              {settings.showLegendOhlc && legendCandle && !narrow && (
                <div className="tv-legend-ohlc" style={{ color: legendUp ? settings.upColor : settings.downColor }}>
                  {([
                    ['시', legendCandle.open],
                    ['고', legendCandle.high],
                    ['저', legendCandle.low],
                    ['종', legendCandle.close],
                  ] as const).map(([label, value]) => (
                    <span key={label}>
                      <em>{label}</em>
                      {fmtPrice(value)}
                    </span>
                  ))}
                  <span className="tv-legend-chg">
                    {legendUp ? '+' : ''}
                    {fmtPrice(legendChange)} ({legendUp ? '+' : ''}
                    {legendChangePct.toFixed(2)}%)
                  </span>
                </div>
              )}
              {settings.showLegendOhlc && legendCandle && narrow && (
                <div className="tv-legend-ohlc compact" style={{ color: legendUp ? settings.upColor : settings.downColor }}>
                  <span>
                    <em>C</em>
                    {fmtPrice(legendCandle.close)}
                  </span>
                  <span className="tv-legend-chg">
                    {legendUp ? '+' : ''}
                    {fmtPrice(legendChange)} ({legendUp ? '+' : ''}
                    {legendChangePct.toFixed(2)}%)
                  </span>
                </div>
              )}
            </>
          )}

          {settings.showIndicatorLegend && (mainRows.length > 0 || compare.length > 0) && (
            <div className="tv-legend-inds">
              <button
                type="button"
                className="tv-legend-collapse"
                {...tip(collapsed ? '지표 펼치기' : '지표 접기', '가격 칸의 지표 이름 줄을 접거나 폅니다.')}
                aria-expanded={!collapsed}
                onClick={() => setCollapsed((v) => !v)}
              >
                <span className={collapsed ? 'flip' : undefined}>
                  <Ctl name="caret" />
                </span>
              </button>
              {!collapsed && (
                <div className="tv-legend-inds-list">
                  {mainRows.map(({ inst, part }) => renderIndicatorRow(inst, part))}
                  {compare.map((sym) => {
                    const info = compareInfo.find((c) => c.symbol === sym)
                    return (
                      <div className="tv-ind-row compare" key={sym}>
                        <span className="tv-ind-title" style={info ? { color: info.color } : undefined}>
                          {sym.replace(/USDT$/, '')}
                        </span>
                        {info && (
                          <span className="tv-ind-val" style={{ color: info.color }}>
                            {info.changePct >= 0 ? '+' : ''}
                            {info.changePct.toFixed(2)}%
                          </span>
                        )}
                        <button
                          type="button"
                          {...tip('비교 제거', '겹쳐 보던 이 종목을 뺍니다.')}
                          aria-label="비교 제거"
                          onClick={() => onCompareChange(compare.filter((s) => s !== sym))}
                        >
                          <Ctl name="close" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 오실레이터 패널 범례 — 잰 패널 상단 위치에 놓는다. */}
        {settings.showIndicatorLegend &&
          panes.list.map((pane) => {
            const part = partById[pane.instanceId]
            const inst = part && indicators.find((i) => i.id === (part.parentId ?? part.instanceId))
            if (!part || !inst) return null
            return (
              <div className="tv-osc-legend" key={pane.instanceId} style={{ top: `${pane.top + 4}px` }}>
                {renderIndicatorRow(inst, part)}
              </div>
            )
          })}

        {onScaleMenu && (
          <button
            type="button"
            className="cell-scale-btn"
            style={{ width: panes.axisWidth }}
            aria-label="가격 축 설정"
            onClick={onScaleMenu}
          >
            <Ctl name="gear" />
          </button>
        )}

        {loadingOlder && (
          <div className="loading-older">
            <span className="spinner" />
            과거 불러오는 중
          </div>
        )}

        {loading && chartCandles.length === 0 && (
          <div className="overlay">
            <span className="spinner lg" />
            불러오는 중
          </div>
        )}
        {error && chartCandles.length === 0 && (
          <div className="overlay error">
            <p>
              {error.message === 'Failed to fetch'
                ? '연결이 끊겼습니다. 네트워크를 확인해 주세요.'
                : `데이터를 불러오지 못했습니다: ${error.message}`}
            </p>
            <button type="button" className="cta" onClick={() => void reload()}>
              다시 시도
            </button>
          </div>
        )}

        {/* 리플레이 안내 + 컨트롤러. */}
        {replayPicking && <div className="replay-hint">리플레이 시작점을 선택하세요</div>}
        {replay && replayStart !== null && (
          <div className="replay-controller">
            <button
              type="button"
              {...tip(replayPlaying ? '일시정지' : '재생', '고른 시점부터 봉을 정한 속도로 하나씩 보여 줍니다.')}
              onClick={() => setReplayPlaying((v) => !v)}
            >
              {replayPlaying ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              {...tip('한 봉 앞으로', '다음 봉 하나만 보여 줍니다.')}
              onClick={() => setReplayPos((p) => Math.min(replayBaseRef.current.length - 1, p + 1))}
            >
              ⏭
            </button>
            <div className="replay-speed">
              <button type="button" {...tip('재생 속도', '봉이 하나씩 나오는 간격')} onClick={() => setSpeedOpen((v) => !v)}>
                {REPLAY_SPEEDS.find((s) => s.ms === replaySpeed)?.label ?? '1초'}
              </button>
              {speedOpen && (
                <div className="replay-speed-menu">
                  {REPLAY_SPEEDS.map((s) => (
                    <button
                      key={s.ms}
                      type="button"
                      className={s.ms === replaySpeed ? 'active' : undefined}
                      onClick={() => {
                        setReplaySpeed(s.ms)
                        setSpeedOpen(false)
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="replay-live" {...tip('실시간으로', '리플레이를 끝내고 지금 시세로 돌아갑니다.')} onClick={onReplayExit}>
              실시간으로
            </button>
            <button type="button" {...tip('리플레이 종료')} aria-label="리플레이 종료" onClick={onReplayExit}>
              <Ctl name="close" />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

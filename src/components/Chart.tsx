import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  createTextWatermark,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type ITextWatermarkPluginApi,
  type LogicalRange,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { fetchKlines, type Candle, type Interval } from '../lib/binance'
import { INTERVAL_SECONDS } from '../lib/intervals'
import type { PriceAlert } from '../hooks/usePriceAlerts'
import type { Drawing, DrawingTool, MagnetMode, NewDrawing } from '../lib/drawings'
import type { Pin } from '../lib/pins'
import { SIDE_COLORS } from '../lib/pins'
import { CHART_PALETTES, CHART_FONT, INDICATOR_PALETTE } from '../lib/theme'
import type { ChartSettings } from '../lib/chartSettings'
import type { ChartType, ScaleMode } from '../lib/chartTypes'
import { registerChart, type ChartHandle } from '../lib/chartRegistry'
import type { ChartMenuRequest } from '../lib/chartMenu'
import { loadPaneSizes, savePaneSizes } from '../lib/layoutConfig'
import { DrawingOverlay } from '../chart/drawing/DrawingOverlay'
import { Coords } from '../chart/drawing/coords'
import {
  baselineBaseValue,
  createMainSeries,
  mainSeriesData,
  mainSeriesPoint,
  type MainSeries,
  type MainSeriesColors,
} from '../chart/series'
import { makeTickFormatter, makeTimeFormatter, formatCountdown, formatPrice, priceFormatter, barCloseTime } from '../chart/format'
import { BandFillPrimitive } from '../chart/bandFill'
import { ColumnHighlightPrimitive } from '../chart/columnHighlight'
import type { ComputedIndicator } from '../chart/compute'
import { tip } from '../lib/tooltip'

/** 오실레이터 패널의 상단 y 좌표 — ChartCell 이 그 자리에 범례 줄을 놓는다. */
export interface PaneInfo {
  instanceId: string
  top: number
}
export interface CompareInfo {
  symbol: string
  changePct: number
  color: string
}


export interface ChartProps {
  symbol: string
  interval: Interval
  candles: Candle[]
  /** 심볼 가격 소수 자릿수(틱 사이즈). 가격 포맷·축·범례에 쓴다. */
  pricePrecision: number
  chartType: ChartType
  scaleMode: ScaleMode
  autoScale: boolean
  onAutoScaleChange: (v: boolean) => void
  /** 가격 눈금 반전(Alt+I). */
  invertScale: boolean
  /** "시간 기준 세로 커서 고정" — 그 시각에 세로선을 고정해 둔다. */
  lockedTime: number | null
  compare: string[]
  indicators: ComputedIndicator[]
  settings: ChartSettings
  alerts: PriceAlert[]
  drawings: Drawing[]
  pins: Pin[]
  cellIndex: number | null
  /** 그리기 오버레이 배선. */
  drawingTool: DrawingTool
  magnet: MagnetMode
  stayInDrawingMode: boolean
  drawingsLocked: boolean
  drawingsHidden: boolean
  overlayEnabled: boolean
  onCreateDrawing: (d: NewDrawing) => string
  onUpdateDrawing: (id: string, patch: Partial<Omit<Drawing, 'id'>>, opts?: { history?: boolean }) => void
  onRemoveDrawing: (id: string) => void
  onToolDone: () => void
  /** 왼쪽 끝에서 과거 더 불러오기. */
  onReachStart?: () => void
  /** 거래소에 더 이상 과거가 없음 — 도달 못 하는 목표 구간을 무한정 좇지 않게 한다. */
  exhausted?: boolean
  /** 크로스헤어가 가리키는 봉 시각(없으면 null). */
  onHoverTime?: (time: number | null) => void
  /** 오실레이터 패널 위치 + 가격축 너비. */
  onPanes?: (panes: PaneInfo[], axisWidth: number) => void
  /** 리플레이 시작점 미리보기 세로선. */
  replayPick?: boolean
  onReplayPreview?: (time: number | null) => void
  /** 핀/리플레이 클릭 캡처. */
  captureClicks?: boolean
  onChartClick?: (time: number, price: number) => void
  /** 비교 심볼의 최근 변동률 + 선 색을 범례에 쓰라고 올려 준다. */
  onCompareInfo?: (info: CompareInfo[]) => void
  /** 우클릭 메뉴 요청(차트 영역·그림·가격축·시간축). */
  onContextMenu?: (req: ChartMenuRequest) => void
}

const asTime = (t: number) => t as UTCTimestamp

const SCALE_MODE_MAP: Record<ScaleMode, PriceScaleMode> = {
  normal: PriceScaleMode.Normal,
  log: PriceScaleMode.Logarithmic,
  percent: PriceScaleMode.Percentage,
  indexed: PriceScaleMode.IndexedTo100,
}

export function Chart({
  symbol,
  interval,
  candles,
  pricePrecision,
  chartType,
  scaleMode,
  autoScale,
  onAutoScaleChange,
  invertScale,
  lockedTime,
  compare,
  indicators,
  settings,
  alerts,
  drawings,
  pins,
  cellIndex,
  drawingTool,
  magnet,
  stayInDrawingMode,
  drawingsLocked,
  drawingsHidden,
  overlayEnabled,
  onCreateDrawing,
  onUpdateDrawing,
  onRemoveDrawing,
  onToolDone,
  onReachStart,
  exhausted,
  onHoverTime,
  onPanes,
  replayPick,
  onReplayPreview,
  captureClicks,
  onChartClick,
  onCompareInfo,
  onContextMenu,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [mainSeries, setMainSeries] = useState<MainSeries | null>(null)

  const palette = useMemo(() => CHART_PALETTES[settings.theme], [settings.theme])
  const colors: MainSeriesColors = useMemo(
    () => ({ up: settings.upColor, down: settings.downColor, palette }),
    [settings.upColor, settings.downColor, palette],
  )

  // ── 자주 바뀌는 콜백은 ref 로 잡아 이펙트 재실행을 막는다. ──
  const cbRef = useRef({ onReachStart, onHoverTime, onPanes, onAutoScaleChange, onReplayPreview, onChartClick, onCompareInfo })
  cbRef.current = { onReachStart, onHoverTime, onPanes, onAutoScaleChange, onReplayPreview, onChartClick, onCompareInfo }

  const candlesRef = useRef<Candle[]>([])
  candlesRef.current = candles
  const exhaustedRef = useRef(exhausted)
  exhaustedRef.current = exhausted
  const fittedRef = useRef(false)
  const firstTimeRef = useRef<number | null>(null)
  const prevDataRef = useRef<Candle[]>([])
  const lastSeriesRef = useRef<MainSeries | null>(null)

  const indicatorSeriesRef = useRef(new Map<string, ISeriesApi<'Line'> | ISeriesApi<'Histogram'>>())
  const indicatorLevelsRef = useRef(new Map<string, IPriceLine[]>())
  const bandPrimsRef = useRef(new Map<string, BandFillPrimitive>())
  const highlightPrimsRef = useRef(new Map<string, ColumnHighlightPrimitive>())
  const compositionRef = useRef<string>('')
  const compareSeriesRef = useRef(new Map<string, ISeriesApi<'Line'>>())
  const alertLinesRef = useRef(new Map<string, IPriceLine>())
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null)
  const countdownRef = useRef<HTMLDivElement>(null)
  const replayLineRef = useRef<HTMLDivElement>(null)

  const effectiveScale: ScaleMode = compare.length > 0 ? 'percent' : scaleMode

  // ── 1) 차트 인스턴스: 마운트 시 한 번만. ─────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = createChartWithDefaults(container)
    chartRef.current = chart
    const indicatorSeries = indicatorSeriesRef.current
    const indicatorLevels = indicatorLevelsRef.current
    const compareSeries = compareSeriesRef.current
    const alertLines = alertLinesRef.current
    return () => {
      // 같은 언마운트 안에서 다른 이펙트 정리(시리즈 제거, 그리기 프리미티브 분리)가 이 차트를
      // 아직 건드린다. 먼저 remove() 하면 그 호출들이 폐기된 차트에 다시 그리기를 예약해
      // "Object is disposed" 예외가 난다. 모든 정리가 끝난 뒤에 폐기한다.
      queueMicrotask(() => chart.remove())
      chartRef.current = null
      setMainSeries(null)
      indicatorSeries.clear()
      indicatorLevels.clear()
      compareSeries.clear()
      alertLines.clear()
      markersRef.current = null
      watermarkRef.current = null
      fittedRef.current = false
      firstTimeRef.current = null
      prevDataRef.current = []
      lastSeriesRef.current = null
    }
  }, [])

  // ── 2) 메인 시리즈: 차트 종류/색이 바뀌면 통째로 갈아끼운다. ──────────
  const createKey = `${chartType}|${settings.theme}|${settings.upColor}|${settings.downColor}`
  // 어떤 차트 종류로 만든 시리즈인지 기억한다. 종류를 바꾼 직후 한 번은 옛 시리즈가 남아 있는데,
  // 그때 새 종류의 데이터 모양(예: 히스토그램에 OHLC)을 넣으면 lightweight-charts 가 예외를 던진다.
  const seriesTypeRef = useRef(new WeakMap<MainSeries, ChartType>())
  // 시리즈를 갈아끼우면 시간축 보이는 구간이 데이터 밖으로 밀려 빈 차트가 된다.
  // 옛 시리즈를 지우기 직전 구간을 적어 두고, 새 시리즈에 데이터를 넣은 뒤 되돌린다(TradingView와 같은 동작).
  const swapRangeRef = useRef<LogicalRange | null>(null)
  // 기간 버튼(1일·3개월…)이 요청한 시간 구간. 과거 봉이 모자라면 더 불러오며 맞춘다.
  const pendingRangeRef = useRef<{ from: number; to: number; attempts: number } | null>(null)
  const applyPendingRange = useCallback(() => {
    const pending = pendingRangeRef.current
    const chart = chartRef.current
    const first = candlesRef.current[0]
    if (!pending || !chart || !first) return
    const from = Math.max(pending.from, first.time)
    // 날짜로 이동한 시각이 아직 안 불러온 과거면 끝이 시작보다 앞설 수 있다 — 그때는 가장 오래된 구간을 보여 준다.
    const to = pending.to > from ? pending.to : (candlesRef.current[Math.min(candlesRef.current.length - 1, 100)]?.time ?? from + 1)
    chart.timeScale().setVisibleRange({ from: from as Time, to: to as Time })
    // 목표에 닿았거나, 시도를 다 썼거나, 거래소에 더 이상 과거가 없으면(도달 불가) 목표를 버린다.
    // 버리지 않으면 이후 setData(차트 종류 변경·갭 재조회)마다 화면이 가장 오래된 봉으로 튄다.
    if (first.time <= pending.from || pending.attempts >= 8 || exhaustedRef.current) {
      pendingRangeRef.current = null
      return
    }
    pending.attempts++
    cbRef.current.onReachStart?.()
  }, [])
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const series = createMainSeries(chart, chartType, colors)
    seriesTypeRef.current.set(series, chartType)
    // 이 시리즈에 붙던 알림선·핀 마커는 옛 시리즈와 함께 사라졌으니 참조를 비운다.
    alertLinesRef.current.clear()
    markersRef.current = null
    setMainSeries(series)
    return () => {
      try {
        swapRangeRef.current = chart.timeScale().getVisibleLogicalRange()
        chart.removeSeries(series)
      } catch {
        /* 차트가 먼저 사라졌으면 무시 */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createKey])

  // ── 3) 메인 데이터: 첫 로드/과거 붙임은 setData, 실시간 틱은 update(). ─
  useEffect(() => {
    const series = mainSeries
    if (!series || candles.length === 0) return
    if (seriesTypeRef.current.get(series) !== chartType) return
    const prev = prevDataRef.current
    const seriesChanged = lastSeriesRef.current !== series
    lastSeriesRef.current = series

    const full = () => {
      series.setData(mainSeriesData(chartType, candles, colors) as never)
      if (chartType === 'baseline') {
        series.applyOptions({ baseValue: { type: 'price', price: baselineBaseValue(candles) } } as never)
      }
    }

    // 실시간 틱(마지막 봉 갱신/새 봉)인지 — 이때는 사용자가 보던 구간을 건드리지 않는다.
    let tick = false
    if (seriesChanged) {
      full()
      const saved = swapRangeRef.current
      swapRangeRef.current = null
      // lightweight-charts 는 시리즈를 갈아끼운 직후 새 시리즈의 봉을 시간축에 반영하지 못해
      // 보이는 구간이 null(빈 차트)로 남는 경우가 있다. 다음 틱이 와야 풀린다.
      // 두 프레임 뒤 같은 데이터를 한 번 더 넣어 시간축을 다시 계산시키고, 이전 구간을 되돌린다.
      const chart = chartRef.current
      if (chart) {
        const data = mainSeriesData(chartType, candles, colors)
        const count = candles.length
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (chartRef.current !== chart || lastSeriesRef.current !== series) return
            const ts = chart.timeScale()
            if (!ts.getVisibleLogicalRange()) series.setData(data as never)
            if (saved) ts.setVisibleLogicalRange(saved)
            const now = ts.getVisibleLogicalRange()
            if (!now || now.to < 0 || now.from > count) {
              ts.setVisibleLogicalRange({ from: Math.max(0, count - 150), to: count + 1 })
            }
          }),
        )
      }
    } else if (chartType === 'heikinAshi') {
      // HA 는 직전 봉에 의존하므로 통째로 다시 그린다(이 종류만 예외).
      full()
      tick = candles.length === prev.length || candles.length === prev.length + 1
    } else if (
      prev.length > 0 &&
      candles.length === prev.length &&
      candles[candles.length - 1].time === prev[prev.length - 1].time
    ) {
      series.update(mainSeriesPoint(chartType, candles[candles.length - 1], colors) as never)
      tick = true
    } else if (
      prev.length > 0 &&
      candles.length === prev.length + 1 &&
      candles[candles.length - 2].time === prev[prev.length - 1].time
    ) {
      // 막 끝난 봉의 마지막 값(마감 틱)이 아직 안 들어갔을 수 있다 — 그 봉을 먼저 고치고 새 봉을 붙인다.
      series.update(mainSeriesPoint(chartType, candles[candles.length - 2], colors) as never)
      series.update(mainSeriesPoint(chartType, candles[candles.length - 1], colors) as never)
      tick = true
    } else {
      // 과거가 앞에 붙었으면 보이는 구간을 밀어 화면이 튀지 않게 한다.
      const prependedCount = candles.findIndex((c) => c.time === firstTimeRef.current)
      const prepended = firstTimeRef.current !== null && prependedCount > 0 ? prependedCount : 0
      const keepRange = prepended ? chartRef.current?.timeScale().getVisibleLogicalRange() : null
      full()
      if (keepRange) {
        chartRef.current?.timeScale().setVisibleLogicalRange({
          from: keepRange.from + prepended,
          to: keepRange.to + prepended,
        })
      }
    }

    firstTimeRef.current = candles[0]?.time ?? null
    prevDataRef.current = candles
    if (!fittedRef.current) {
      // TradingView처럼 기본 봉 간격으로 최근 봉을 오른쪽 여백과 함께 보여 준다(1000봉을 한 화면에 욱여넣지 않는다).
      chartRef.current?.timeScale().scrollToRealTime()
      fittedRef.current = true
    }
    if (!tick) applyPendingRange()
  }, [candles, mainSeries, chartType, colors, applyPendingRange])

  // ── 4) 스케일 모드 + 자동 스케일. ────────────────────────────────────
  // 새로 만든 차트·새 메인 시리즈에는 아직 가격 구간이 없다. 이때 수동 스케일(auto 꺼짐)을 그대로
  // 넘기면 캔들이 화면 밖에 남아 빈 차트가 된다(차트를 위아래로 끌면 auto 가 꺼지고, 그 상태가
  // 저장돼 주기·종목·차트 종류를 바꾸거나 새로고침할 때마다 빈 화면이 됐다).
  // TradingView 처럼 새 시리즈는 항상 auto 로 시작하고, 꺼져 있었다면 부모 상태도 켠다.
  const scaleSeriesRef = useRef<MainSeries | null>(null)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !mainSeries) return
    const fresh = scaleSeriesRef.current !== mainSeries
    scaleSeriesRef.current = mainSeries
    chart.priceScale('right').applyOptions({
      mode: SCALE_MODE_MAP[effectiveScale],
      autoScale: fresh || autoScale,
      invertScale,
    })
    if (fresh && !autoScale) cbRef.current.onAutoScaleChange?.(true)
  }, [effectiveScale, autoScale, invertScale, mainSeries])

  // ── 4b) 가격 포맷: 천단위 구분 + 심볼 정밀도(축·라벨·카운트다운 공통). ─
  useEffect(() => {
    const series = mainSeries
    if (!series) return
    series.applyOptions({
      priceFormat: {
        type: 'custom',
        formatter: priceFormatter(pricePrecision),
        minMove: Math.pow(10, -pricePrecision),
      },
    } as never)
  }, [mainSeries, pricePrecision])

  // ── 5) 캔버스 설정(그리드/크로스헤어색/워터마크/시간대/마지막가격라벨). ─
  useEffect(() => {
    const chart = chartRef.current
    const series = mainSeries
    if (!chart) return
    const gridV = settings.grid === 'both' || settings.grid === 'vertical'
    const gridH = settings.grid === 'both' || settings.grid === 'horizontal'
    chart.applyOptions({
      layout: {
        textColor: palette.text,
        background: { color: 'transparent' },
        panes: { separatorColor: palette.border, separatorHoverColor: `${palette.accent}66` },
      },
      grid: {
        vertLines: { color: palette.grid, visible: gridV },
        horzLines: { color: palette.grid, visible: gridH },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: {
        borderColor: palette.border,
        tickMarkFormatter: makeTickFormatter(settings.timezone),
      },
      localization: { timeFormatter: makeTimeFormatter(settings.timezone, INTERVAL_SECONDS[interval] < 86400) },
    })
    series?.applyOptions({ lastValueVisible: settings.showLastPriceLabel })

    // 워터마크(심볼).
    if (settings.showWatermark) {
      const pane = chart.panes()[0]
      if (pane) {
        if (!watermarkRef.current) {
          watermarkRef.current = createTextWatermark(pane, {
            horzAlign: 'center',
            vertAlign: 'center',
            lines: [{ text: symbol, color: `${palette.textDim}33`, fontSize: 44, fontFamily: CHART_FONT }],
          })
        } else {
          watermarkRef.current.applyOptions({
            lines: [{ text: symbol, color: `${palette.textDim}33`, fontSize: 44, fontFamily: CHART_FONT }],
          })
        }
      }
    } else if (watermarkRef.current) {
      watermarkRef.current.detach()
      watermarkRef.current = null
    }
  }, [settings.grid, settings.showWatermark, settings.showLastPriceLabel, settings.timezone, palette, symbol, interval, mainSeries])

  // ── 6) 지표 시리즈: 구성이 바뀌면 다시 쌓고, 아니면 데이터만 갱신. ────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !mainSeries) return
    const store = indicatorSeriesRef.current
    const levels = indicatorLevelsRef.current

    const oscillators = indicators.filter((c) => !c.overlay && !c.isVolume)
    const composition = indicators
      .map((c) => `${c.instanceId}:${c.overlay ? 'o' : c.isVolume ? 'v' : 'p'}`)
      .join(',')

    // 오실레이터 순서가 바뀌면 패널 번호가 밀리므로 전부 다시 쌓는다.
    if (composition !== compositionRef.current) {
      for (const s of store.values()) chart.removeSeries(s)
      store.clear()
      // 시리즈를 지우면 그 위 price line·프리미티브도 함께 사라지므로 맵만 비운다.
      levels.clear()
      bandPrimsRef.current.clear()
      highlightPrimsRef.current.clear()
      compositionRef.current = composition
    }

    const paneOf = (c: ComputedIndicator): number => {
      if (c.overlay || c.isVolume) return 0
      return 1 + oscillators.findIndex((o) => o.instanceId === c.instanceId)
    }

    for (const comp of indicators) {
      const pane = paneOf(comp)
      let firstSeries: ISeriesApi<'Line'> | ISeriesApi<'Histogram'> | null = null
      for (const line of comp.lines) {
        // 범례·알림 전용 값은 그리지 않는다.
        if (line.hidden) continue
        const key = `${comp.instanceId}:${line.key}`
        let series = store.get(key)
        if (!series) {
          if (line.type === 'histogram') {
            series = chart.addSeries(
              HistogramSeries,
              {
                priceLineVisible: false,
                lastValueVisible: false,
                priceScaleId: line.priceScaleId,
                priceFormat:
                  line.priceScaleId === 'volume' || line.legendFormat === 'volume' ? { type: 'volume' } : undefined,
              },
              pane,
            )
            if (line.priceScaleId === 'volume') {
              chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
            }
          } else {
            series = chart.addSeries(
              LineSeries,
              {
                color: line.color,
                lineWidth: line.lineWidth ?? 1,
                lineStyle: line.lineStyle ?? LineStyle.Solid,
                priceLineVisible: false,
                lastValueVisible: false,
                pointMarkersVisible: line.pointMarkers ?? false,
                lineVisible: line.lineVisible ?? true,
              },
              pane,
            )
          }
          store.set(key, series)
        } else if (line.type === 'line') {
          series.applyOptions({ color: line.color, lineWidth: line.lineWidth ?? 1 } as never)
        }
        if (!firstSeries) firstSeries = series

        if (line.type === 'histogram') {
          series.setData(
            line.points.map((p, i) => ({
              time: asTime(p.time),
              value: p.value,
              color: line.colors ? line.colors[i] : line.color,
            })) as never,
          )
        } else {
          series.setData(line.points.map((p) => ({ time: asTime(p.time), value: p.value })) as never)
        }
      }

      // 기준선(과매수/과매도 등) — 매번 지웠다 다시 그린다.
      const prevLevels = levels.get(comp.instanceId)
      if (prevLevels && firstSeries) for (const l of prevLevels) firstSeries.removePriceLine(l)
      if (firstSeries && comp.levels.length > 0) {
        levels.set(
          comp.instanceId,
          comp.levels.map((lv) =>
            firstSeries.createPriceLine({
              price: lv.price,
              color: lv.color,
              lineWidth: 1,
              lineStyle: lv.lineStyle ?? LineStyle.Dashed,
              axisLabelVisible: false,
            }),
          ),
        )
      }

      // 밴드 채우기(예: RSI 70/30) — 첫 시리즈에 프리미티브로 붙인다.
      const bands = bandPrimsRef.current
      const existingBand = bands.get(comp.instanceId)
      if (comp.band && firstSeries) {
        if (existingBand) existingBand.setSpec(comp.band)
        else {
          const prim = new BandFillPrimitive(comp.band)
          firstSeries.attachPrimitive(prim)
          bands.set(comp.instanceId, prim)
        }
      } else if (existingBand && firstSeries) {
        firstSeries.detachPrimitive(existingBand)
        bands.delete(comp.instanceId)
      }

      // 봉 단위 배경 강조(예: 거래량 급증) — 첫 시리즈 패널 뒤에 그린다.
      const highlights = highlightPrimsRef.current
      const existingHighlight = highlights.get(comp.instanceId)
      if (comp.highlights && firstSeries) {
        if (existingHighlight) existingHighlight.setColumns(comp.highlights)
        else {
          const prim = new ColumnHighlightPrimitive(comp.highlights)
          firstSeries.attachPrimitive(prim)
          highlights.set(comp.instanceId, prim)
        }
      } else if (existingHighlight && firstSeries) {
        firstSeries.detachPrimitive(existingHighlight)
        highlights.delete(comp.instanceId)
      }
    }

    // 사라진 지표 시리즈 제거.
    const wanted = new Set<string>()
    for (const comp of indicators) {
      for (const line of comp.lines) if (!line.hidden) wanted.add(`${comp.instanceId}:${line.key}`)
    }
    for (const [key, series] of store) {
      if (!wanted.has(key)) {
        chart.removeSeries(series)
        store.delete(key)
      }
    }
  }, [indicators, mainSeries])

  // ── 7) 비교 심볼: 메인 패널의 라인 시리즈. 15초마다 새로 받는다. ──────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !mainSeries) return
    const store = compareSeriesRef.current
    let cancelled = false
    const controllers = new Map<string, AbortController>()

    const wanted = new Set(compare)
    for (const [sym, series] of store) {
      if (!wanted.has(sym)) {
        chart.removeSeries(series)
        store.delete(sym)
      }
    }

    const load = async () => {
      const info: CompareInfo[] = []
      for (let i = 0; i < compare.length; i++) {
        const sym = compare[i]
        const color = INDICATOR_PALETTE[(i + 1) % INDICATOR_PALETTE.length]
        controllers.get(sym)?.abort()
        const controller = new AbortController()
        controllers.set(sym, controller)
        try {
          // 메인 차트 초기 구간(1000봉)과 같은 길이를 받아야 퍼센트 기준점이 겹친다.
          const data = await fetchKlines(sym, interval, 1000, controller.signal)
          if (cancelled) return
          let series = store.get(sym)
          if (!series) {
            series = chart.addSeries(LineSeries, {
              color,
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: true,
            })
            store.set(sym, series)
          }
          series.setData(data.map((c) => ({ time: asTime(c.time), value: c.close })))
          const first = data[0]?.close ?? 0
          const last = data[data.length - 1]?.close ?? 0
          info.push({ symbol: sym, changePct: first > 0 ? ((last - first) / first) * 100 : 0, color })
        } catch {
          /* 실패는 다음 주기에 회복 */
        }
      }
      if (!cancelled) cbRef.current.onCompareInfo?.(info)
    }

    void load()
    const timer = window.setInterval(() => void load(), 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      for (const c of controllers.values()) c.abort()
    }
  }, [compare, interval, mainSeries])

  // ── 8) 가격 알림 — 점선 + 벨 제목. alerts 는 심볼로 걸러져 온다. ───────
  useEffect(() => {
    const series = mainSeries
    if (!series) return
    const store = alertLinesRef.current
    const wanted = new Map(alerts.map((a) => [a.id, a]))
    for (const [id, line] of store) {
      if (!wanted.has(id)) {
        series.removePriceLine(line)
        store.delete(id)
      }
    }
    for (const alert of alerts) {
      const options = {
        price: alert.price,
        color: alert.condition === 'above' ? palette.up : palette.down,
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `🔔 ${alert.condition === 'above' ? '▲' : '▼'}`,
      }
      const existing = store.get(alert.id)
      if (existing) existing.applyOptions(options)
      else store.set(alert.id, series.createPriceLine(options))
    }
  }, [alerts, mainSeries, palette])

  // ── 8b) 현재가 선 — TradingView 처럼 마지막 가격에 얇은 점선을 가로로 긋고 틱마다 따라가게 한다. ─
  // 시리즈 기본 가격선 대신 직접 그린다: 하이킨 아시에서도 실제 종가에 맞춰야 하고,
  // 축 라벨은 카운트다운 배지가 따로 그리므로 선만 필요하다.
  const priceLineRef = useRef<IPriceLine | null>(null)
  useEffect(() => {
    const series = mainSeries
    if (!series || !settings.showPriceLine) return
    const line = series.createPriceLine({
      price: 0,
      color: 'transparent',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      lineVisible: false,
      axisLabelVisible: false,
    })
    priceLineRef.current = line
    return () => {
      priceLineRef.current = null
      try {
        series.removePriceLine(line)
      } catch {
        /* 차트 종류를 바꿔 시리즈가 먼저 사라졌으면 선도 함께 사라졌다 */
      }
    }
  }, [mainSeries, settings.showPriceLine])
  useEffect(() => {
    const line = priceLineRef.current
    const last = candles[candles.length - 1]
    if (!line || !last) return
    line.applyOptions({
      price: last.close,
      color: last.close >= last.open ? settings.upColor : settings.downColor,
      lineVisible: true,
    })
  }, [candles, mainSeries, settings.showPriceLine, settings.upColor, settings.downColor])

  // ── 9) 핀 마커. ──────────────────────────────────────────────────────
  useEffect(() => {
    const series = mainSeries
    if (!series) return
    if (!markersRef.current) markersRef.current = createSeriesMarkers(series, [])
    markersRef.current.setMarkers(
      [...pins]
        .sort((a, b) => a.time - b.time)
        .map((pin) => ({
          time: pin.time as Time,
          position: pin.side === 'short' ? ('aboveBar' as const) : ('belowBar' as const),
          color: SIDE_COLORS[pin.side],
          shape:
            pin.side === 'short'
              ? ('arrowDown' as const)
              : pin.side === 'long'
                ? ('arrowUp' as const)
                : ('circle' as const),
        })),
    )
  }, [pins, mainSeries])

  // ── 10) 크로스헤어 hover → 시각 보고 + 리플레이 미리보기 세로선. ───────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const handler = (param: MouseEventParams) => {
      const time = param.time === undefined ? null : Number(param.time)
      cbRef.current.onHoverTime?.(time)
      const el = replayLineRef.current
      if (el) {
        if (replayPick && param.point) {
          el.style.display = 'block'
          el.style.left = `${param.point.x}px`
          cbRef.current.onReplayPreview?.(time)
        } else {
          el.style.display = 'none'
        }
      }
    }
    chart.subscribeCrosshairMove(handler)
    return () => chart.unsubscribeCrosshairMove(handler)
  }, [replayPick])

  // ── 11) 핀/리플레이 클릭 캡처(시각 + 가격). ──────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    const series = mainSeries
    if (!chart || !series || !captureClicks) return
    const handler = (param: MouseEventParams) => {
      if (param.time === undefined || !param.point) return
      const price = series.coordinateToPrice(param.point.y)
      if (price === null) return
      cbRef.current.onChartClick?.(Number(param.time), price)
    }
    chart.subscribeClick(handler)
    return () => chart.unsubscribeClick(handler)
  }, [captureClicks, mainSeries])

  // ── 12) 왼쪽 끝 → 과거 더 불러오기. ──────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const timeScale = chart.timeScale()
    const onRange = (range: { from: number; to: number } | null) => {
      if (range && range.from < 20) cbRef.current.onReachStart?.()
    }
    timeScale.subscribeVisibleLogicalRangeChange(onRange)
    return () => timeScale.unsubscribeVisibleLogicalRangeChange(onRange)
  }, [])

  // ── 13) 현재가 + 마감 카운트다운 배지. ───────────────────────────────
  useEffect(() => {
    const tick = () => {
      const el = countdownRef.current
      const chart = chartRef.current
      const series = mainSeries
      const last = candlesRef.current[candlesRef.current.length - 1]
      if (!el || !chart || !series || !last) return
      if (!settings.showLastPriceLabel && !settings.showCountdown) {
        el.style.display = 'none'
        return
      }
      // 마감 시각은 barCloseTime 이 준다(월봉은 UTC 다음 달 1일). 마감이 지났는데 새 봉이
      // 아직 안 온 짧은 구간엔 다음 주기까지 감아 표시한다.
      const span = INTERVAL_SECONDS[interval]
      let remain = barCloseTime(last.time, interval) - Math.floor(Date.now() / 1000)
      if (remain < 0) remain = ((remain % span) + span) % span
      const y = series.priceToCoordinate(last.close)
      if (y === null) {
        el.style.display = 'none'
        return
      }
      el.style.display = 'block'
      el.style.top = `${Math.round(y) - 10}px`
      el.style.width = `${chart.priceScale('right').width()}px`
      el.style.background = last.close >= last.open ? settings.upColor : settings.downColor
      el.textContent = ''
      if (settings.showLastPriceLabel) {
        const priceRow = document.createElement('div')
        priceRow.textContent = series.priceFormatter().format(last.close)
        el.append(priceRow)
      }
      if (settings.showCountdown) {
        const cdRow = document.createElement('div')
        cdRow.className = 'cd'
        cdRow.textContent = formatCountdown(remain)
        el.append(cdRow)
      }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [interval, mainSeries, settings.showCountdown, settings.showLastPriceLabel, settings.upColor, settings.downColor])

  // ── 14) 오실레이터 패널 위치 + 자동스케일 상태 보고, 패널 크기 저장. ──
  // oscKey 는 오실레이터 패널 구성(종류·개수)의 정체성이다. 이 값이 바뀔 때만 패널이 새로 쌓이므로
  // 저장된 크기 복원도 이때만 한다. indicators(매초 재계산)에 매달면 복원 타이머가 초당 한 번씩
  // 되살아나 사용자가 끌어 놓은 패널 크기를 30ms 뒤 원래대로 되돌린다 — 그래서 여기서 제외한다.
  const oscKey = indicators.filter((c) => !c.overlay && !c.isVolume).map((c) => c.kind).join('+') || 'main'
  // report 가 참조하지만 매초 바뀌어 이펙트를 재구독시키면 안 되는 값은 ref 로 잡는다.
  const indicatorsRef = useRef(indicators)
  indicatorsRef.current = indicators
  const autoScaleRef = useRef(autoScale)
  autoScaleRef.current = autoScale

  // 14a) 패널 구성이 바뀔 때만 저장된 크기를 되돌린다. panes 는 타이머 안에서 지연 조회한다.
  useEffect(() => {
    if (!chartRef.current) return
    const restore = window.setTimeout(() => {
      const c = chartRef.current
      if (!c) return
      const panes = c.panes()
      const saved = loadPaneSizes(oscKey)
      if (saved && saved.length === panes.length) panes.forEach((p, i) => p.setStretchFactor(saved[i]))
    }, 30)
    return () => window.clearTimeout(restore)
  }, [oscKey])

  // 14b) 패널 위치·축 너비 보고 + 자동스케일 상태 + 리사이즈 종료 시 크기 저장.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    // PERF-1: 직전 보고와 같으면 다시 올리지 않는다(부모의 setPanes 리렌더가 초당 두 번 도는 것을 막는다).
    let prev: { list: PaneInfo[]; axisWidth: number } | null = null
    const same = (out: PaneInfo[], axisWidth: number): boolean => {
      if (!prev || prev.axisWidth !== axisWidth || prev.list.length !== out.length) return false
      for (let i = 0; i < out.length; i++) {
        if (prev.list[i].instanceId !== out[i].instanceId || prev.list[i].top !== out[i].top) return false
      }
      return true
    }

    const report = () => {
      const c = chartRef.current
      if (!c) return
      const panes = c.panes()
      const axisWidth = c.priceScale('right').width()
      const oscillators = indicatorsRef.current.filter((x) => !x.overlay && !x.isVolume)
      const SEPARATOR = 1
      let top = panes[0]?.getHeight() ?? 0
      top += SEPARATOR
      const out: PaneInfo[] = []
      for (let i = 1; i < panes.length; i++) {
        const osc = oscillators[i - 1]
        if (osc) out.push({ instanceId: osc.instanceId, top })
        top += panes[i].getHeight() + SEPARATOR
      }
      if (!same(out, axisWidth)) {
        prev = { list: out, axisWidth }
        cbRef.current.onPanes?.(out, axisWidth)
      }

      // 사용자가 가격축을 끌어 자동스케일이 꺼졌으면 부모에 알린다.
      const auto = c.priceScale('right').options().autoScale
      if (!auto && autoScaleRef.current) cbRef.current.onAutoScaleChange?.(false)
    }
    const first = window.setTimeout(report, 80)
    const timer = window.setInterval(report, 500)

    // 리사이즈 종료 저장: 차트 안에서 시작(pointerdown)한 드래그가 끝나면(문서의 pointerup) 저장한다.
    // 컨테이너 밖에서 손을 떼도 잡히도록 pointerup 은 문서에 건다. 미니창(PiP)에서는 그 창의 문서다.
    const container = containerRef.current
    const doc = container?.ownerDocument ?? document
    let downInside = false
    const onDown = () => {
      downInside = true
    }
    const onUp = () => {
      if (!downInside) return
      downInside = false
      const c = chartRef.current
      if (!c) return
      const sizes = c.panes().map((p) => p.getStretchFactor())
      if (sizes.length > 1) savePaneSizes(oscKey, sizes)
    }
    container?.addEventListener('pointerdown', onDown)
    doc.addEventListener('pointerup', onUp)

    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      container?.removeEventListener('pointerdown', onDown)
      doc.removeEventListener('pointerup', onUp)
    }
  }, [oscKey])

  // ── 15) chartRegistry 등록. ──────────────────────────────────────────
  useEffect(() => {
    if (cellIndex === null) return
    const handle: ChartHandle = {
      takeSnapshot: () => {
        const chart = chartRef.current
        const shot = chart ? chart.takeScreenshot() : document.createElement('canvas')
        const header = 34
        const out = document.createElement('canvas')
        out.width = shot.width
        out.height = shot.height + header
        const ctx = out.getContext('2d')
        if (ctx) {
          ctx.fillStyle = palette.background
          ctx.fillRect(0, 0, out.width, header)
          ctx.fillStyle = palette.text
          ctx.font = `600 14px ${CHART_FONT}`
          ctx.textBaseline = 'middle'
          const last = candlesRef.current[candlesRef.current.length - 1]
          const ohlc = last
            ? `  O ${formatPrice(last.open)}  H ${formatPrice(last.high)}  L ${formatPrice(last.low)}  C ${formatPrice(last.close)}`
            : ''
          ctx.fillText(`${symbol} · ${interval}${ohlc}`, 10, header / 2)
          ctx.drawImage(shot, 0, header)
        }
        return out
      },
      setVisibleRange: (from, to) => {
        pendingRangeRef.current = { from, to, attempts: 0 }
        applyPendingRange()
      },
      resetView: () => {
        chartRef.current?.priceScale('right').applyOptions({ autoScale: true })
        cbRef.current.onAutoScaleChange?.(true)
        const n = candlesRef.current.length
        if (n > 0) chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 1 })
      },
      scrollToRealtime: () => chartRef.current?.timeScale().scrollToRealTime(),
      resetTimeScale: () => {
        const n = candlesRef.current.length
        if (n > 0) chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 1 })
      },
      scrollBars: (direction, far) => {
        const ts = chartRef.current?.timeScale()
        const range = ts?.getVisibleLogicalRange()
        if (!ts || !range) return
        const step = far ? Math.max(1, Math.round((range.to - range.from) / 4)) : 1
        ts.setVisibleLogicalRange({ from: range.from + direction * step, to: range.to + direction * step })
      },
      zoom: (direction) => {
        const ts = chartRef.current?.timeScale()
        const range = ts?.getVisibleLogicalRange()
        if (!ts || !range) return
        const width = range.to - range.from
        const next = Math.max(5, direction > 0 ? width * 0.8 : width / 0.8)
        ts.setVisibleLogicalRange({ from: range.to - next, to: range.to })
      },
      goToTime: (time) => {
        const range = chartRef.current?.timeScale().getVisibleLogicalRange()
        const bars = range ? Math.max(20, range.to - range.from) : 150
        const half = (bars / 2) * INTERVAL_SECONDS[interval]
        pendingRangeRef.current = { from: time - half, to: time + half, attempts: 0 }
        applyPendingRange()
      },
    }
    registerChart(cellIndex, handle)
    return () => registerChart(cellIndex, null)
  }, [cellIndex, symbol, interval, palette, applyPendingRange])

  // ── 16) 시간 기준 세로 커서 고정 — 스크롤·확대·크기 변화에 맞춰 세로선과 시각 라벨을 옮긴다. ─
  const lockLineRef = useRef<HTMLDivElement>(null)
  const lockLabelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const chart = chartRef.current
    const series = mainSeries
    const line = lockLineRef.current
    const label = lockLabelRef.current
    if (!chart || !series || !line || !label) return
    const hide = () => {
      line.style.display = 'none'
      label.style.display = 'none'
    }
    if (lockedTime === null) {
      hide()
      return
    }
    const format = makeTimeFormatter(settings.timezone, INTERVAL_SECONDS[interval] < 86400)
    const ts = chart.timeScale()
    const place = () => {
      const x = new Coords(chart, series, candlesRef.current, interval).timeToX(lockedTime)
      if (x === null || x < 0 || x > ts.width()) return hide()
      const bottom = chart.chartElement().clientHeight - ts.height()
      line.style.display = 'block'
      line.style.left = `${Math.round(x)}px`
      line.style.height = `${bottom}px`
      label.style.display = 'block'
      label.style.left = `${Math.round(x)}px`
      label.style.top = `${bottom}px`
      label.textContent = format(lockedTime as Time)
    }
    place()
    ts.subscribeVisibleLogicalRangeChange(place)
    ts.subscribeSizeChange(place)
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(place)
      ts.unsubscribeSizeChange(place)
    }
  }, [lockedTime, mainSeries, interval, settings.timezone, candles.length])

  // ── 17) 과거로 밀어 두면 TradingView 처럼 "최근 봉으로" 버튼(») 을 띄운다. ──────
  const [realtimeBtn, setRealtimeBtn] = useState<{ right: number; bottom: number } | null>(null)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const ts = chart.timeScale()
    const check = () => {
      const away = ts.scrollPosition() < -3
      setRealtimeBtn((prev) => {
        if (!away) return null
        if (prev) return prev
        return { right: chart.priceScale('right').width() + 10, bottom: ts.height() + 10 }
      })
    }
    ts.subscribeVisibleLogicalRangeChange(check)
    return () => ts.unsubscribeVisibleLogicalRangeChange(check)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {chartRef.current && mainSeries && (
        <DrawingOverlay
          chart={chartRef.current}
          series={mainSeries}
          candles={candles}
          interval={interval}
          symbol={symbol}
          drawings={drawings}
          tool={drawingTool}
          magnet={magnet}
          stayInDrawingMode={stayInDrawingMode}
          locked={drawingsLocked}
          hidden={drawingsHidden}
          enabled={overlayEnabled}
          palette={palette}
          onCreate={onCreateDrawing}
          onUpdate={onUpdateDrawing}
          onRemove={onRemoveDrawing}
          onToolDone={onToolDone}
          onContextMenu={onContextMenu}
        />
      )}
      <div ref={replayLineRef} className="replay-preview-line" style={{ display: 'none' }} />
      <div ref={lockLineRef} className="cursor-lock-line" style={{ display: 'none' }} />
      <div ref={lockLabelRef} className="cursor-lock-label" style={{ display: 'none' }} />
      <div ref={countdownRef} className="candle-countdown" style={{ display: 'none' }} />
      {realtimeBtn && (
        <button
          type="button"
          className="scroll-realtime-btn"
          style={realtimeBtn}
          {...tip('최근 봉으로', '과거로 옮겨 본 차트를 가장 최근 봉으로 되돌립니다.', undefined, 'left')}
          aria-label="최근 봉으로"
          onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
        >
          <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
            <path d="M3 3l5 5-5 5M8 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  )
}

/** 차트 기본 옵션 — 오버레이가 크로스헤어/스크롤을 소유하므로 여기선 켜두기만 한다. */
function createChartWithDefaults(container: HTMLElement): IChartApi {
  return createChart(container, {
    layout: {
      background: { color: 'transparent' },
      textColor: '#dbdbdb',
      fontFamily: CHART_FONT,
      // 차트 위 TradingView 로고는 끈다. Lightweight Charts 라이선스(Apache-2.0 + NOTICE)가 요구하는
      // tradingview.com 링크는 메뉴 맨 아래 표기(데스크톱 ≡ 서랍·폰 메뉴 탭)로 대신한다.
      attributionLogo: false,
    },
    // 좁은 폰 화면에서도 기간 버튼(1개월=30분봉 1440개 등)이 전 구간을 담을 수 있게 봉 간격 하한을 낮춘다.
    timeScale: { timeVisible: true, secondsVisible: false, minBarSpacing: 0.1 },
    crosshair: { mode: CrosshairMode.Normal },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    kineticScroll: { mouse: false, touch: true },
    autoSize: true,
  })
}

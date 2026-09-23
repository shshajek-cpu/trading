/**
 * 메인 시리즈(가격) 생성과 데이터 매핑. 차트 종류를 바꾸면 시리즈를 통째로
 * 갈아끼우므로, Chart 는 이 헬퍼로 만들고/데이터를 채운다.
 */
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '../lib/binance'
import type { ChartPalette } from '../lib/theme'
import type { ChartType } from '../lib/chartTypes'
import { HlcAreaSeries, VolumeCandleSeries } from './customSeries'

export type MainSeries = ISeriesApi<SeriesType, Time>

export interface MainSeriesColors {
  up: string
  down: string
  palette: ChartPalette
}

const asTime = (t: number) => t as UTCTimestamp

/** OHLC 를 쓰는 차트 종류(캔들·바 계열). 나머지는 종가 기반. */
const OHLC_TYPES: Partial<Record<ChartType, true>> = {
  bars: true,
  candles: true,
  hollowCandles: true,
  volumeCandles: true,
  highLow: true,
  heikinAshi: true,
}

export function isOhlcType(type: ChartType): boolean {
  return OHLC_TYPES[type] === true
}

/** 하이킨 아시 변환. 몸통이 부드러워져 추세가 잘 보인다. */
export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = []
  let prevOpen = candles.length > 0 ? candles[0].open : 0
  let prevClose = candles.length > 0 ? candles[0].close : 0
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const close = (c.open + c.high + c.low + c.close) / 4
    const open = i === 0 ? (c.open + c.close) / 2 : (prevOpen + prevClose) / 2
    const high = Math.max(c.high, open, close)
    const low = Math.min(c.low, open, close)
    out.push({ time: c.time, open, high, low, close, volume: c.volume })
    prevOpen = open
    prevClose = close
  }
  return out
}

/** 차트 종류에 맞는 메인 시리즈를 만든다. */
export function createMainSeries(chart: IChartApi, type: ChartType, colors: MainSeriesColors): MainSeries {
  const { up, down, palette } = colors
  const common = { priceLineVisible: false, lastValueVisible: false } as const

  switch (type) {
    case 'bars':
      return chart.addSeries(BarSeries, { ...common, upColor: up, downColor: down, thinBars: false })
    case 'highLow':
      return chart.addSeries(BarSeries, { ...common, upColor: up, downColor: down, openVisible: false, thinBars: true })
    case 'candles':
    case 'hollowCandles':
    case 'heikinAshi':
      return chart.addSeries(CandlestickSeries, {
        ...common,
        upColor: up,
        downColor: down,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
      })
    case 'volumeCandles':
      return chart.addCustomSeries(new VolumeCandleSeries(), { ...common, upColor: up, downColor: down })
    case 'line':
      return chart.addSeries(LineSeries, { ...common, color: palette.accent, lineWidth: 2 })
    case 'lineMarkers':
      return chart.addSeries(LineSeries, { ...common, color: palette.accent, lineWidth: 2, pointMarkersVisible: true })
    case 'stepLine':
      return chart.addSeries(LineSeries, { ...common, color: palette.accent, lineWidth: 2, lineType: LineType.WithSteps })
    case 'area':
      return chart.addSeries(AreaSeries, {
        ...common,
        lineColor: palette.accent,
        topColor: `${palette.accent}55`,
        bottomColor: `${palette.accent}05`,
        lineWidth: 2,
      })
    case 'hlcArea':
      return chart.addCustomSeries(new HlcAreaSeries(), {
        ...common,
        highLowFill: `${palette.accent}22`,
        closeLineColor: palette.accent,
        closeLineWidth: 2,
      })
    case 'baseline':
      return chart.addSeries(BaselineSeries, {
        ...common,
        topLineColor: up,
        topFillColor1: `${up}44`,
        topFillColor2: `${up}05`,
        bottomLineColor: down,
        bottomFillColor1: `${down}05`,
        bottomFillColor2: `${down}44`,
      })
    case 'columns':
      return chart.addSeries(HistogramSeries, { ...common })
  }
}

/** setData 에 넣을 배열을 차트 종류에 맞게 만든다. */
export function mainSeriesData(type: ChartType, candles: Candle[], colors: MainSeriesColors): unknown[] {
  const { up, down } = colors
  switch (type) {
    case 'bars':
    case 'candles':
    case 'highLow':
      return candles.map((c) => ({ time: asTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close }))
    case 'heikinAshi':
      return heikinAshi(candles).map((c) => ({
        time: asTime(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    case 'hollowCandles':
      return candles.map((c) => {
        const bull = c.close >= c.open
        return {
          time: asTime(c.time),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          // 상승봉은 몸통을 비우고(투명), 하락봉은 채운다.
          color: bull ? 'rgba(0,0,0,0)' : down,
          borderColor: bull ? up : down,
          wickColor: bull ? up : down,
        }
      })
    case 'volumeCandles':
      return candles.map((c) => ({
        time: asTime(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))
    case 'hlcArea':
      return candles.map((c) => ({ time: asTime(c.time), high: c.high, low: c.low, close: c.close }))
    case 'columns':
      return candles.map((c) => ({
        time: asTime(c.time),
        value: c.close,
        color: c.close >= c.open ? `${up}b0` : `${down}b0`,
      }))
    default:
      // line, lineMarkers, stepLine, area, baseline
      return candles.map((c) => ({ time: asTime(c.time), value: c.close }))
  }
}

/** 하이킨 아시 한 봉. 직전 HA 봉의 시가·종가가 필요하다. */
export function heikinAshiCandle(raw: Candle, prevOpen: number, prevClose: number): Candle {
  const close = (raw.open + raw.high + raw.low + raw.close) / 4
  const open = (prevOpen + prevClose) / 2
  const high = Math.max(raw.high, open, close)
  const low = Math.min(raw.low, open, close)
  return { time: raw.time, open, high, low, close, volume: raw.volume }
}

/** 실시간 틱: 마지막 봉만 series.update() 로 바꿀 때 쓸 한 개 데이터(HA 제외). */
export function mainSeriesPoint(type: ChartType, candle: Candle, colors: MainSeriesColors): unknown {
  const arr = mainSeriesData(type, [candle], colors)
  return arr[arr.length - 1]
}

/** 베이스라인 기준값 — 데이터가 없으면 0. 첫 종가를 기준으로 둔다. */
export function baselineBaseValue(candles: Candle[]): number {
  return candles.length > 0 ? candles[0].close : 0
}

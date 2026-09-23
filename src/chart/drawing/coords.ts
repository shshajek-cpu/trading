import type { IChartApi, ISeriesApi, SeriesType, Logical, Time } from 'lightweight-charts'
import type { Candle, Interval } from '../../lib/binance'
import { INTERVAL_SECONDS } from '../../lib/intervals'

/**
 * 시각↔x, 가격↔y 변환을 한곳에 모은다. 로드된 캔들 밖의 시각(미래/과거)도
 * INTERVAL_SECONDS 로 외삽해 좌표를 만들 수 있다 — 추세선·레이 연장 등에 필요.
 */
export class Coords {
  private readonly chart: IChartApi
  private readonly series: ISeriesApi<SeriesType>
  private readonly candles: Candle[]
  private readonly step: number

  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    candles: Candle[],
    interval: Interval,
  ) {
    this.chart = chart
    this.series = series
    this.candles = candles
    this.step = INTERVAL_SECONDS[interval]
  }

  priceToY(price: number): number | null {
    const c = this.series.priceToCoordinate(price)
    return c === null ? null : c
  }

  yToPrice(y: number): number | null {
    const p = this.series.coordinateToPrice(y)
    return p === null ? null : p
  }

  /** 시리즈 가격 포맷터로 가격을 문자열로. */
  format(price: number): string {
    return this.series.priceFormatter().format(price)
  }

  /** 두 시각 사이의 대략적인 캔들 개수. */
  barCount(t0: number, t1: number): number {
    const a = this.timeToLogical(t0)
    const b = this.timeToLogical(t1)
    if (a === null || b === null) return 0
    return Math.round(b - a)
  }

  /** 시각(초) → 분수 논리 인덱스. 캔들 밖은 간격으로 외삽한다. */
  timeToLogical(time: number): number | null {
    const bars = this.candles
    const n = bars.length
    if (n === 0) return null
    const first = bars[0].time
    const last = bars[n - 1].time
    if (time <= first) return (time - first) / this.step
    if (time >= last) return n - 1 + (time - last) / this.step

    // in-range: 이진 탐색으로 감싸는 두 캔들을 찾는다.
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (bars[mid].time <= time) lo = mid
      else hi = mid
    }
    const span = bars[hi].time - bars[lo].time
    const frac = span > 0 ? (time - bars[lo].time) / span : 0
    return lo + frac
  }

  /** 분수 논리 인덱스 → 시각(초). */
  logicalToTime(logical: number): number {
    const bars = this.candles
    const n = bars.length
    if (n === 0) return 0
    if (logical <= 0) return bars[0].time + logical * this.step
    if (logical >= n - 1) return bars[n - 1].time + (logical - (n - 1)) * this.step
    const i = Math.floor(logical)
    const frac = logical - i
    return bars[i].time + frac * (bars[i + 1].time - bars[i].time)
  }

  timeToX(time: number): number | null {
    const logical = this.timeToLogical(time)
    if (logical === null) return null
    const x = this.chart.timeScale().logicalToCoordinate(logical as Logical)
    return x === null ? null : x
  }

  xToTime(x: number): number | null {
    const logical = this.chart.timeScale().coordinateToLogical(x)
    if (logical === null) return null
    return this.logicalToTime(logical)
  }

  /** x 를 캔들 시각에 스냅한다(강한 자석). 커서 아래 캔들의 시각을 준다. */
  snapTimeToBar(x: number): number | null {
    const logical = this.chart.timeScale().coordinateToLogical(x)
    if (logical === null) return null
    const rounded = Math.round(logical)
    return this.logicalToTime(rounded)
  }

  timeScaleWidth(): number {
    return this.chart.timeScale().width()
  }

  /** 메인(가격) 칸의 크기(px). */
  paneSize(): { width: number; height: number } {
    return this.chart.paneSize()
  }

  /** 시각을 lightweight-charts Time 값으로. 축 라벨 배치용. */
  static asTime(time: number): Time {
    return time as Time
  }
}

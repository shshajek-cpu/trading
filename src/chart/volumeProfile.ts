/**
 * 볼륨 프로파일 — 가격대별 거래량 막대. 보이는 구간(VPVR)과 고정 구간 그리기 도구가 함께 쓴다.
 * 계산(computeVolumeProfile)·그리기(drawVolumeProfile)는 두 곳이 같이 쓰고, 보이는 구간 지표의 차트 연결은
 * 아래 VisibleRangeProfilePrimitive 가 맡는다.
 */
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { MediaCoordinatesRenderingScope } from 'fancy-canvas'
import type { Candle } from '../lib/market/types'
import type { VisibleProfileSpec, VolumeProfileStyle } from './compute'

export interface VolumeProfileRow {
  low: number
  high: number
  up: number
  down: number
}

export interface VolumeProfile {
  rows: VolumeProfileRow[] // 가격 오름차순
  poc: number // 거래량이 가장 많은 행 번호
  vaLow: number // 가치 영역 아래 끝 행 번호(포함)
  vaHigh: number // 가치 영역 위 끝 행 번호(포함)
  maxVolume: number
  totalVolume: number
}

export interface VolumeProfileOptions {
  rows: number
  valueAreaPct: number
}

/**
 * time 이 [fromTime, toTime](유닉스 초, 양끝 포함)인 캔들로 프로파일을 만든다. 거래량이 없으면 null.
 * 각 봉의 거래량은 [low, high] 에 고르게 퍼뜨리고, close >= open 이면 상승(up) 거래량으로 센다.
 */
export function computeVolumeProfile(
  candles: Candle[],
  fromTime: number,
  toTime: number,
  opts: VolumeProfileOptions,
): VolumeProfile | null {
  // 시각 오름차순이므로 구간 시작을 이분 탐색으로 찾는다.
  let lo = 0
  let hi = candles.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid].time < fromTime) lo = mid + 1
    else hi = mid
  }
  const start = lo

  let min = Infinity
  let max = -Infinity
  let total = 0
  let end = start
  for (; end < candles.length && candles[end].time <= toTime; end++) {
    const c = candles[end]
    if (!(c.volume > 0)) continue
    if (c.low < min) min = c.low
    if (c.high > max) max = c.high
    total += c.volume
  }
  if (!(total > 0) || !Number.isFinite(min) || !Number.isFinite(max)) return null

  const n = Math.max(1, Math.floor(opts.rows))
  // 모든 봉이 한 가격이면 폭이 0 이라 행을 나눌 수 없다 — 아주 좁은 폭을 준다.
  if (max <= min) {
    const pad = Math.max(Math.abs(min) * 1e-6, 1e-8)
    min -= pad
    max += pad
  }
  const step = (max - min) / n
  const up = new Float64Array(n)
  const down = new Float64Array(n)
  const rowOf = (price: number) => Math.min(n - 1, Math.max(0, Math.floor((price - min) / step)))

  for (let k = start; k < end; k++) {
    const c = candles[k]
    if (!(c.volume > 0)) continue
    const bucket = c.close >= c.open ? up : down
    const range = c.high - c.low
    const i0 = rowOf(c.low)
    const i1 = rowOf(c.high)
    if (range <= 0 || i0 === i1) {
      bucket[i0] += c.volume
      continue
    }
    const perPrice = c.volume / range
    for (let i = i0; i <= i1; i++) {
      const rowLow = min + i * step
      const overlap = Math.min(c.high, rowLow + step) - Math.max(c.low, rowLow)
      if (overlap > 0) bucket[i] += overlap * perPrice
    }
  }

  const rows: VolumeProfileRow[] = new Array(n)
  let poc = 0
  let maxVolume = 0
  for (let i = 0; i < n; i++) {
    rows[i] = { low: min + i * step, high: i === n - 1 ? max : min + (i + 1) * step, up: up[i], down: down[i] }
    const v = up[i] + down[i]
    if (v > maxVolume) {
      maxVolume = v
      poc = i
    }
  }

  // 가치 영역: POC 에서 시작해 위·아래 중 거래량이 더 많은 이웃 행을 하나씩 붙여 목표 비율에 닿을 때까지 넓힌다.
  const target = (total * Math.min(100, Math.max(0, opts.valueAreaPct))) / 100
  const vol = (i: number) => up[i] + down[i]
  let vaLow = poc
  let vaHigh = poc
  let acc = vol(poc)
  while (acc < target && (vaLow > 0 || vaHigh < n - 1)) {
    const below = vaLow > 0 ? vol(vaLow - 1) : -1
    const above = vaHigh < n - 1 ? vol(vaHigh + 1) : -1
    if (above >= below) acc += vol(++vaHigh)
    else acc += vol(--vaLow)
  }

  return { rows, poc, vaLow, vaHigh, maxVolume, totalVolume: total }
}

/** POC 행의 가운데 가격. */
export function pocPrice(profile: VolumeProfile): number {
  const r = profile.rows[profile.poc]
  return (r.low + r.high) / 2
}

/**
 * 호출한 쪽이 배율을 맞춰 둔 캔버스에 미디어(CSS px) 좌표로 그린다.
 * 막대는 `x` 에서 `direction` 쪽으로 자라고, 가장 긴 막대가 `width` px. 상승 거래량을 `x` 쪽에, 하락 거래량을 그 바깥에 잇는다.
 * POC 선은 막대 영역([x, x ± width]) 폭으로 긋는다.
 */
export function drawVolumeProfile(
  ctx: CanvasRenderingContext2D,
  profile: VolumeProfile,
  geo: { priceToY: (price: number) => number | null; x: number; width: number; direction: 'left' | 'right' },
  style: VolumeProfileStyle,
): void {
  if (!(profile.maxVolume > 0) || !(geo.width > 0)) return
  const sign = geo.direction === 'right' ? 1 : -1
  const scale = geo.width / profile.maxVolume
  const alpha0 = ctx.globalAlpha

  for (let i = 0; i < profile.rows.length; i++) {
    const row = profile.rows[i]
    const yHigh = geo.priceToY(row.high)
    const yLow = geo.priceToY(row.low)
    if (yHigh === null || yLow === null) continue
    // 행 경계를 정수 px 에 맞춰 이웃 행과 겹치거나 번지지 않게 한다. 행이 넉넉하면 위에 1px 틈을 둬 막대가 구분되게 한다.
    const top = Math.round(Math.min(yHigh, yLow))
    const bottom = Math.round(Math.max(yHigh, yLow))
    const gap = bottom - top > 3 ? 1 : 0
    const barTop = top + gap
    const barH = Math.max(1, bottom - barTop)
    const inValueArea = !style.showValueArea || (i >= profile.vaLow && i <= profile.vaHigh)
    ctx.globalAlpha = alpha0 * (inValueArea ? style.valueAreaAlpha : style.outsideAlpha)

    const upLen = row.up * scale
    const downLen = row.down * scale
    if (upLen > 0) {
      ctx.fillStyle = style.upColor
      ctx.fillRect(sign > 0 ? geo.x : geo.x - upLen, barTop, upLen, barH)
    }
    if (downLen > 0) {
      ctx.fillStyle = style.downColor
      ctx.fillRect(sign > 0 ? geo.x + upLen : geo.x - upLen - downLen, barTop, downLen, barH)
    }
  }
  ctx.globalAlpha = alpha0

  if (style.showPoc) {
    const y = geo.priceToY(pocPrice(profile))
    if (y !== null) {
      // 1px 높이 사각형 — 정수 배율 화면에서 번지지 않는다.
      ctx.fillStyle = style.pocColor
      ctx.fillRect(sign > 0 ? geo.x : geo.x - geo.width, Math.round(y), geo.width, 1)
    }
  }
}

type ProfileGeometry = Parameters<typeof drawVolumeProfile>[2]

interface VisibleProfileEntry {
  id: string
  spec: VisibleProfileSpec
  /** 막대용 스타일 — POC 는 칸 전체 폭으로 따로 그리므로 막대 쪽에서는 끈다. */
  barStyle: VolumeProfileStyle
  profile: VolumeProfile | null
  /** 마지막 계산의 입력(봉 판·보이는 구간·행 수·가치 영역). 같으면 다시 계산하지 않는다. */
  key: string
  /** 범례에 마지막으로 알린 POC. undefined 면 아직 알리지 않았다. */
  reportedPoc: number | null | undefined
  /** 마지막으로 그린 자리(두 번 눌러 설정 열기 판정용). */
  geo: ProfileGeometry | null
}

/**
 * 보이는 구간 볼륨 프로파일(VPVR). 메인 시리즈에 하나 붙여 두고 지표 인스턴스마다 설정을 넘긴다.
 * 차트가 다시 그릴 때(스크롤·확대·틱 — 한 프레임에 한 번) 보이는 구간이나 봉이 바뀌었을 때만 다시 계산한다.
 * 막대는 캔들 뒤에, POC 선은 캔들 위에 칸 전체 폭으로 긋는다. React 상태는 건드리지 않고 POC 만 콜백으로 알린다.
 */
export class VisibleRangeProfilePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null
  private candles: Candle[] = []
  private candlesVersion = 0
  private entries: VisibleProfileEntry[] = []
  private readonly onPoc: (id: string, price: number | null) => void
  private readonly views: readonly IPrimitivePaneView[]
  private readonly priceToY = (price: number): number | null => this.series?.priceToCoordinate(price) ?? null

  /** onPoc: 지표별 POC 가격(없으면 null)이 바뀔 때마다 — 차트를 그리는 중에 불린다. */
  constructor(onPoc: (id: string, price: number | null) => void) {
    this.onPoc = onPoc
    const renderer: IPrimitivePaneRenderer = {
      drawBackground: (target) => target.useMediaCoordinateSpace((scope) => this.drawBars(scope)),
      draw: (target) => target.useMediaCoordinateSpace((scope) => this.drawPocLines(scope)),
    }
    this.views = [{ zOrder: () => 'normal', renderer: () => renderer }]
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart as IChartApi
    this.series = param.series
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.chart = null
    this.series = null
    this.requestUpdate = null
  }

  /** 차트가 보여 주는 봉(리플레이면 그 시점까지). 시각 오름차순. */
  setCandles(candles: Candle[]): void {
    if (candles === this.candles) return
    this.candles = candles
    this.candlesVersion++
    if (this.entries.length > 0) this.requestUpdate?.()
  }

  /** 그릴 프로파일 목록(숨긴 지표는 빼고 넘긴다). 같은 id 는 계산 결과를 이어 쓴다. */
  setProfiles(list: { id: string; spec: VisibleProfileSpec }[]): void {
    // 프로파일이 없던 차트는 매번(지표는 1초마다 다시 계산된다) 다시 그리게 하지 않는다.
    if (list.length === 0 && this.entries.length === 0) return
    const prev = new Map(this.entries.map((e) => [e.id, e]))
    this.entries = list.map(({ id, spec }) => {
      const barStyle = { ...spec.style, showPoc: false }
      const old = prev.get(id)
      return old
        ? { ...old, spec, barStyle }
        : { id, spec, barStyle, profile: null, key: '', reportedPoc: undefined, geo: null }
    })
    this.requestUpdate?.()
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.entries.length > 0 ? this.views : []
  }

  /** 미디어 px 한 점이 어느 프로파일 막대 위인지 — 그 지표 id, 없으면 null. 나중에 그린(위에 있는) 것부터 본다. */
  profileAt(x: number, y: number): string | null {
    for (let k = this.entries.length - 1; k >= 0; k--) {
      const { profile, geo, id } = this.entries[k]
      if (!profile || !geo || !(profile.maxVolume > 0)) continue
      const row = profile.rows.find((r) => {
        const a = this.priceToY(r.low)
        const b = this.priceToY(r.high)
        return a !== null && b !== null && y >= Math.min(a, b) && y <= Math.max(a, b)
      })
      if (!row) continue
      const len = ((row.up + row.down) / profile.maxVolume) * geo.width
      const dx = geo.direction === 'right' ? x - geo.x : geo.x - x
      // 아주 짧은 막대도 누를 수 있게 몇 px 여유를 준다.
      if (dx >= 0 && dx <= Math.max(len, 6)) return id
    }
    return null
  }

  /** 보이는 구간·봉·행 설정이 바뀐 프로파일만 다시 계산하고, POC 가 바뀌었으면 알린다. */
  private refresh(): void {
    const range = this.chart?.timeScale().getVisibleRange() ?? null
    const from = range ? (range.from as number) : 0
    const to = range ? (range.to as number) : 0
    for (const e of this.entries) {
      const key = `${this.candlesVersion}|${from}|${to}|${e.spec.rows}|${e.spec.valueAreaPct}`
      if (key === e.key) continue
      e.key = key
      e.profile = range
        ? computeVolumeProfile(this.candles, from, to, { rows: e.spec.rows, valueAreaPct: e.spec.valueAreaPct })
        : null
      const poc = e.profile ? pocPrice(e.profile) : null
      if (poc !== e.reportedPoc) {
        e.reportedPoc = poc
        this.onPoc(e.id, poc)
      }
    }
  }

  private drawBars({ context, mediaSize }: MediaCoordinatesRenderingScope): void {
    if (!this.series) return
    this.refresh()
    for (const e of this.entries) {
      if (!e.profile) continue
      // 오른쪽에 두면 칸 오른쪽 끝에서 왼쪽으로, 왼쪽에 두면 왼쪽 끝에서 오른쪽으로 자란다.
      const geo = (e.geo ??= { priceToY: this.priceToY, x: 0, width: 0, direction: 'left' })
      const right = e.spec.placement === 'right'
      geo.x = right ? mediaSize.width : 0
      geo.direction = right ? 'left' : 'right'
      geo.width = (mediaSize.width * e.spec.widthPct) / 100
      drawVolumeProfile(context, e.profile, geo, e.barStyle)
    }
  }

  private drawPocLines({ context, mediaSize }: MediaCoordinatesRenderingScope): void {
    for (const e of this.entries) {
      if (!e.profile || !e.spec.style.showPoc) continue
      const y = this.priceToY(pocPrice(e.profile))
      if (y === null) continue
      context.fillStyle = e.spec.style.pocColor
      context.fillRect(0, Math.round(y), mediaSize.width, 1)
    }
  }
}

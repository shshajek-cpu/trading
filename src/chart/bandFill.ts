/**
 * 오실레이터 패널에서 두 값(예: RSI 70/30) 사이를 옅게 채우는 시리즈 프리미티브.
 * 선이 밴드 밖으로 나간 구간은 선~기준선 사이를 그라데이션으로 채우고, 나간 선 토막을 강조색으로 굵게 다시 그린다
 * (트레이딩뷰 RSI 의 과매수·과매도 채우기). lightweight-charts 에는 수평 밴드 채우기가 없어 직접 그린다.
 * 밴드 두 값은 자동 눈금에 넣는다 — 트레이딩뷰처럼 기준선이 늘 보여야 밖으로 나간 정도를 읽을 수 있다.
 */
import type {
  AutoscaleInfo,
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D } from 'fancy-canvas'
import type { LinePoint } from '../lib/indicators'
import { withAlpha } from '../lib/theme'
import type { BandSpec } from './compute'

/** 밴드 밖으로 나간 선 토막을 다시 그리는 굵기(미디어 px). 원래 선(1px)을 덮어 색이 바뀐 것이 또렷이 보이게. */
const BEYOND_LINE_WIDTH = 2

type Xy = { x: number; y: number }

/** 시각 오름차순 배열에서 time 이상인 첫 자리. */
function lowerBound(points: LinePoint<number>[], time: number): number {
  let lo = 0
  let hi = points.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].time < time) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** 화면에 보이는 구간(양끝 한 점씩 더)의 선 좌표(미디어 px). */
function visibleLine(chart: IChartApi, series: ISeriesApi<SeriesType, Time>, points: LinePoint<number>[]): Xy[] {
  const ts = chart.timeScale()
  const range = ts.getVisibleRange()
  if (!range || points.length === 0) return []
  const from = Math.max(0, lowerBound(points, range.from as number) - 1)
  const to = Math.min(points.length - 1, lowerBound(points, range.to as number) + 1)
  const out: Xy[] = []
  for (let i = from; i <= to; i++) {
    const x = ts.timeToCoordinate(points[i].time as Time)
    const y = series.priceToCoordinate(points[i].value)
    if (x !== null && y !== null) out.push({ x, y })
  }
  return out
}

/**
 * 기준선(levelY) 바깥 반평면(extremeY 쪽)으로 자른다. 선이 기준선을 넘는 자리에서 채우기·색이 정확히 시작·끝난다.
 * 호출측이 save/restore 로 감싼다.
 */
function clipBeyond(ctx: CanvasRenderingContext2D, levelY: number, extremeY: number, width: number): void {
  const far = 1e5
  ctx.beginPath()
  if (extremeY < levelY) ctx.rect(0, levelY - far, width, far)
  else ctx.rect(0, levelY, width, far)
  ctx.clip()
}

/** 한 번 그릴 때 쓰는 좌표(비트맵 px): 기준선·극단값 y 와 선. */
interface Frame {
  topY: number
  bottomY: number
  maxY: number | null
  minY: number | null
  line: Xy[]
}

function frameOf(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  spec: BandSpec,
  scope: BitmapCoordinatesRenderingScope,
): Frame | null {
  const topY = series.priceToCoordinate(spec.top)
  const bottomY = series.priceToCoordinate(spec.bottom)
  if (topY === null || bottomY === null) return null
  const vr = scope.verticalPixelRatio
  const hr = scope.horizontalPixelRatio
  const out = spec.outside
  const maxY = out ? series.priceToCoordinate(out.max) : null
  const minY = out ? series.priceToCoordinate(out.min) : null
  return {
    topY: topY * vr,
    bottomY: bottomY * vr,
    maxY: maxY === null ? null : maxY * vr,
    minY: minY === null ? null : minY * vr,
    line: out ? visibleLine(chart, series, out.points).map((p) => ({ x: p.x * hr, y: p.y * vr })) : [],
  }
}

/** 배경: 밴드 채우기 + 밴드 밖 선~기준선 그라데이션. */
class BandFillRenderer implements IPrimitivePaneRenderer {
  private readonly chart: IChartApi
  private readonly series: ISeriesApi<SeriesType, Time>
  private readonly spec: BandSpec

  constructor(chart: IChartApi, series: ISeriesApi<SeriesType, Time>, spec: BandSpec) {
    this.chart = chart
    this.series = series
    this.spec = spec
  }

  draw(): void {
    /* 배경에만 그린다 — 선은 그 위에 그려진다. */
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      const f = frameOf(this.chart, this.series, this.spec, scope)
      if (!f) return
      const ctx = scope.context
      const width = scope.bitmapSize.width
      ctx.fillStyle = this.spec.color
      ctx.fillRect(0, Math.min(f.topY, f.bottomY), width, Math.abs(f.bottomY - f.topY))
      const out = this.spec.outside
      if (!out || f.line.length < 2) return
      if (f.maxY !== null) this.fillBeyond(ctx, f.line, f.topY, f.maxY, out.above, width)
      if (f.minY !== null) this.fillBeyond(ctx, f.line, f.bottomY, f.minY, out.below, width)
    })
  }

  /** 선과 기준선 사이 중 기준선 바깥만 칠한다. 조금만 넘어도 보이게 기준선 근처부터 뚜렷하게, 극단값으로 갈수록 진하게. */
  private fillBeyond(ctx: CanvasRenderingContext2D, line: Xy[], levelY: number, extremeY: number, color: string, width: number): void {
    ctx.save()
    clipBeyond(ctx, levelY, extremeY, width)
    const grad = ctx.createLinearGradient(0, levelY, 0, extremeY)
    grad.addColorStop(0, withAlpha(color, 0.6))
    grad.addColorStop(1, withAlpha(color, 1))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(line[0].x, levelY)
    for (const p of line) ctx.lineTo(p.x, p.y)
    ctx.lineTo(line[line.length - 1].x, levelY)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

/** 선 위: 밴드 밖으로 나간 선 토막만 강조색으로 굵게. 기준선에서 잘라 색이 바뀌는 자리가 넘는 자리와 같다. */
class BeyondLineRenderer implements IPrimitivePaneRenderer {
  private readonly chart: IChartApi
  private readonly series: ISeriesApi<SeriesType, Time>
  private readonly spec: BandSpec

  constructor(chart: IChartApi, series: ISeriesApi<SeriesType, Time>, spec: BandSpec) {
    this.chart = chart
    this.series = series
    this.spec = spec
  }

  draw(target: CanvasRenderingTarget2D): void {
    const out = this.spec.outside
    if (!out) return
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      const f = frameOf(this.chart, this.series, this.spec, scope)
      if (!f || f.line.length < 2) return
      const ctx = scope.context
      const width = scope.bitmapSize.width
      ctx.lineWidth = BEYOND_LINE_WIDTH * scope.verticalPixelRatio
      ctx.lineJoin = 'round'
      const strokeBeyond = (levelY: number, extremeY: number, color: string) => {
        ctx.save()
        clipBeyond(ctx, levelY, extremeY, width)
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(f.line[0].x, f.line[0].y)
        for (const p of f.line) ctx.lineTo(p.x, p.y)
        ctx.stroke()
        ctx.restore()
      }
      // 극단값 y 를 못 구해도(눈금 밖) 방향만 알면 된다 — 위쪽 강조는 기준선 위, 아래쪽은 아래.
      strokeBeyond(f.topY, f.maxY ?? f.topY - 1, out.above)
      strokeBeyond(f.bottomY, f.minY ?? f.bottomY + 1, out.below)
    })
  }
}

class BandView implements IPrimitivePaneView {
  private readonly chart: IChartApi
  private readonly series: ISeriesApi<SeriesType, Time>
  private readonly layer: 'bottom' | 'normal'
  private spec: BandSpec

  constructor(chart: IChartApi, series: ISeriesApi<SeriesType, Time>, spec: BandSpec, layer: 'bottom' | 'normal') {
    this.chart = chart
    this.series = series
    this.spec = spec
    this.layer = layer
  }

  update(spec: BandSpec): void {
    this.spec = spec
  }

  zOrder(): 'bottom' | 'normal' {
    return this.layer
  }

  renderer(): IPrimitivePaneRenderer {
    return this.layer === 'bottom'
      ? new BandFillRenderer(this.chart, this.series, this.spec)
      : new BeyondLineRenderer(this.chart, this.series, this.spec)
  }
}

export class BandFillPrimitive implements ISeriesPrimitive<Time> {
  private views: BandView[] = []
  private spec: BandSpec
  private requestUpdate: (() => void) | null = null

  constructor(spec: BandSpec) {
    this.spec = spec
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    const chart = param.chart as IChartApi
    this.views = [new BandView(chart, param.series, this.spec, 'bottom'), new BandView(chart, param.series, this.spec, 'normal')]
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.views = []
    this.requestUpdate = null
  }

  /** 밴드 값·강조 구간이 바뀌면 갱신. */
  setSpec(spec: BandSpec): void {
    this.spec = spec
    for (const view of this.views) view.update(spec)
    this.requestUpdate?.()
  }

  /** 자동 눈금에 밴드 두 값을 넣는다 — 값이 밴드 안에만 있어도 기준선이 칸 밖으로 밀려나지 않게. */
  autoscaleInfo(): AutoscaleInfo {
    return {
      priceRange: { minValue: Math.min(this.spec.top, this.spec.bottom), maxValue: Math.max(this.spec.top, this.spec.bottom) },
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }
}

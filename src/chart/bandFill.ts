/**
 * 오실레이터 패널에서 두 값(예: RSI 70/30) 사이를 옅게 채우는 시리즈 프리미티브.
 * 선이 밴드 밖으로 나간 구간은 선~기준선 사이를 그라데이션으로 강조할 수 있다(트레이딩뷰 RSI 의 과매수·과매도 채우기).
 * lightweight-charts 에는 수평 밴드 채우기가 없어 직접 그린다.
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
import type { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D } from 'fancy-canvas'
import type { LinePoint } from '../lib/indicators'
import { withAlpha } from '../lib/theme'

export interface BandSpec {
  top: number
  bottom: number
  color: string
  /**
   * 선이 top 위·bottom 아래로 나간 부분을 칠한다. `max`·`min` 은 그라데이션이 가장 진해지는 값(RSI 100·0).
   * `points` 는 이 프리미티브가 붙은 시리즈의 값과 같아야 한다.
   */
  outside?: { points: LinePoint<number>[]; above: string; below: string; max: number; min: number }
}

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

class BandRenderer implements IPrimitivePaneRenderer {
  private chart: IChartApi
  private series: ISeriesApi<SeriesType, Time>
  private spec: BandSpec

  constructor(chart: IChartApi, series: ISeriesApi<SeriesType, Time>, spec: BandSpec) {
    this.chart = chart
    this.series = series
    this.spec = spec
  }

  draw(): void {
    /* 배경에만 그린다 — 선은 그 위에 그려진다. */
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    const topY = this.series.priceToCoordinate(this.spec.top)
    const bottomY = this.series.priceToCoordinate(this.spec.bottom)
    if (topY === null || bottomY === null) return
    const line = this.spec.outside ? this.visibleLine() : []
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      const ctx = scope.context
      const vr = scope.verticalPixelRatio
      const hr = scope.horizontalPixelRatio
      const y1 = topY * vr
      const y2 = bottomY * vr
      ctx.fillStyle = this.spec.color
      ctx.fillRect(0, Math.min(y1, y2), scope.bitmapSize.width, Math.abs(y2 - y1))

      const out = this.spec.outside
      if (!out || line.length < 2) return
      const px = line.map((p) => ({ x: p.x * hr, y: p.y * vr }))
      const maxY = this.series.priceToCoordinate(out.max)
      const minY = this.series.priceToCoordinate(out.min)
      if (maxY !== null) this.fillBeyond(ctx, px, y1, maxY * vr, out.above, scope.bitmapSize.width)
      if (minY !== null) this.fillBeyond(ctx, px, y2, minY * vr, out.below, scope.bitmapSize.width)
    })
  }

  /**
   * 선과 기준선(levelY) 사이 중 기준선 바깥(extremeY 쪽)만 칠한다. 선~기준선 다각형을 그린 뒤 바깥 반평면으로 잘라서,
   * 선이 기준선을 넘나드는 자리도 교차점까지 정확히 채워진다. 조금만 넘어도 보이게 기준선 근처부터 뚜렷하게, extremeY 로 갈수록 진하게.
   */
  private fillBeyond(ctx: CanvasRenderingContext2D, line: Xy[], levelY: number, extremeY: number, color: string, width: number): void {
    const far = 1e5
    ctx.save()
    ctx.beginPath()
    // 기준선 바깥 반평면만 남긴다(위쪽 강조면 기준선 위, 아래쪽이면 기준선 아래).
    if (extremeY < levelY) ctx.rect(0, levelY - far, width, far)
    else ctx.rect(0, levelY, width, far)
    ctx.clip()
    const grad = ctx.createLinearGradient(0, levelY, 0, extremeY)
    grad.addColorStop(0, withAlpha(color, 0.4))
    grad.addColorStop(1, withAlpha(color, 0.95))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(line[0].x, levelY)
    for (const p of line) ctx.lineTo(p.x, p.y)
    ctx.lineTo(line[line.length - 1].x, levelY)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  /** 화면에 보이는 구간(양끝 한 점씩 더)의 선 좌표(미디어 px). */
  private visibleLine(): Xy[] {
    const points = this.spec.outside?.points ?? []
    const ts = this.chart.timeScale()
    const range = ts.getVisibleRange()
    if (!range || points.length === 0) return []
    const from = Math.max(0, lowerBound(points, range.from as number) - 1)
    const to = Math.min(points.length - 1, lowerBound(points, range.to as number) + 1)
    const out: Xy[] = []
    for (let i = from; i <= to; i++) {
      const x = ts.timeToCoordinate(points[i].time as Time)
      const y = this.series.priceToCoordinate(points[i].value)
      if (x !== null && y !== null) out.push({ x, y })
    }
    return out
  }
}

class BandView implements IPrimitivePaneView {
  private chart: IChartApi
  private series: ISeriesApi<SeriesType, Time>
  private spec: BandSpec

  constructor(chart: IChartApi, series: ISeriesApi<SeriesType, Time>, spec: BandSpec) {
    this.chart = chart
    this.series = series
    this.spec = spec
  }

  update(spec: BandSpec): void {
    this.spec = spec
  }

  zOrder(): 'bottom' {
    return 'bottom'
  }

  renderer(): IPrimitivePaneRenderer {
    return new BandRenderer(this.chart, this.series, this.spec)
  }
}

export class BandFillPrimitive implements ISeriesPrimitive<Time> {
  private view: BandView | null = null
  private spec: BandSpec
  private requestUpdate: (() => void) | null = null

  constructor(spec: BandSpec) {
    this.spec = spec
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.view = new BandView(param.chart as IChartApi, param.series, this.spec)
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.view = null
    this.requestUpdate = null
  }

  /** 밴드 값·강조 구간이 바뀌면 갱신. */
  setSpec(spec: BandSpec): void {
    this.spec = spec
    this.view?.update(spec)
    this.requestUpdate?.()
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.view ? [this.view] : []
  }
}

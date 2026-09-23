/**
 * 오실레이터 패널에서 두 값(예: RSI 70/30) 사이를 옅게 채우는 시리즈 프리미티브.
 * lightweight-charts 에는 수평 밴드 채우기가 없어 직접 그린다.
 */
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D } from 'fancy-canvas'

export interface BandSpec {
  top: number
  bottom: number
  color: string
}

class BandRenderer implements IPrimitivePaneRenderer {
  private series: ISeriesApi<SeriesType, Time>
  private spec: BandSpec

  constructor(series: ISeriesApi<SeriesType, Time>, spec: BandSpec) {
    this.series = series
    this.spec = spec
  }

  draw(): void {
    /* 배경에만 그린다. */
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    const topY = this.series.priceToCoordinate(this.spec.top)
    const bottomY = this.series.priceToCoordinate(this.spec.bottom)
    if (topY === null || bottomY === null) return
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      const ctx = scope.context
      const y1 = topY * scope.verticalPixelRatio
      const y2 = bottomY * scope.verticalPixelRatio
      ctx.fillStyle = this.spec.color
      ctx.fillRect(0, Math.min(y1, y2), scope.bitmapSize.width, Math.abs(y2 - y1))
    })
  }
}

class BandView implements IPrimitivePaneView {
  private series: ISeriesApi<SeriesType, Time>
  private spec: BandSpec

  constructor(series: ISeriesApi<SeriesType, Time>, spec: BandSpec) {
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
    return new BandRenderer(this.series, this.spec)
  }
}

export class BandFillPrimitive implements ISeriesPrimitive<Time> {
  private view: BandView | null = null
  private spec: BandSpec

  constructor(spec: BandSpec) {
    this.spec = spec
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.view = new BandView(param.series, this.spec)
  }

  detached(): void {
    this.view = null
  }

  /** 밴드 값이 바뀌면 갱신. */
  setSpec(spec: BandSpec): void {
    this.spec = spec
    this.view?.update(spec)
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.view ? [this.view] : []
  }
}

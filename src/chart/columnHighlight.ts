/**
 * 패널 배경을 봉 단위 세로 띠로 옅게 칠하는 시리즈 프리미티브(TradingView 의 bgcolor).
 * 예: 거래량 급증 봉 뒤를 방향색으로 칠해 멀리서도 급증 구간이 보이게 한다.
 */
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'
import type { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D } from 'fancy-canvas'

export interface ColumnHighlight {
  time: number
  color: string
}

class ColumnRenderer implements IPrimitivePaneRenderer {
  private readonly chart: IChartApi
  private readonly columns: ColumnHighlight[]

  constructor(chart: IChartApi, columns: ColumnHighlight[]) {
    this.chart = chart
    this.columns = columns
  }

  draw(): void {
    /* 배경에만 그린다. */
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this.columns.length === 0) return
    const timeScale = this.chart.timeScale()
    const spacing = timeScale.options().barSpacing
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      const ctx = scope.context
      const ratio = scope.horizontalPixelRatio
      const width = Math.max(1, Math.round(spacing * ratio))
      for (const column of this.columns) {
        const x = timeScale.timeToCoordinate(column.time as Time)
        if (x === null) continue
        const left = Math.round(x * ratio - width / 2)
        if (left + width < 0 || left > scope.bitmapSize.width) continue
        ctx.fillStyle = column.color
        ctx.fillRect(left, 0, width, scope.bitmapSize.height)
      }
    })
  }
}

class ColumnView implements IPrimitivePaneView {
  private readonly chart: IChartApi
  columns: ColumnHighlight[]

  constructor(chart: IChartApi, columns: ColumnHighlight[]) {
    this.chart = chart
    this.columns = columns
  }

  zOrder(): 'bottom' {
    return 'bottom'
  }

  renderer(): IPrimitivePaneRenderer {
    return new ColumnRenderer(this.chart, this.columns)
  }
}

export class ColumnHighlightPrimitive implements ISeriesPrimitive<Time> {
  private view: ColumnView | null = null
  private columns: ColumnHighlight[]
  private requestUpdate: (() => void) | null = null

  constructor(columns: ColumnHighlight[]) {
    this.columns = columns
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.view = new ColumnView(param.chart, this.columns)
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.view = null
    this.requestUpdate = null
  }

  setColumns(columns: ColumnHighlight[]): void {
    this.columns = columns
    if (this.view) this.view.columns = columns
    this.requestUpdate?.()
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.view ? [this.view] : []
  }
}

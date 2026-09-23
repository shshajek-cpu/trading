import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { Candle, Interval } from '../../lib/binance'
import type { ChartPalette } from '../../lib/theme'
import type { Drawing } from '../../lib/drawings'
import { Coords } from './coords'
import { renderDrawing, type RenderScope } from './render'

export interface DrawingState {
  drawings: Drawing[]
  preview: Drawing | null
  selectedId: string | null
  candles: Candle[]
  interval: Interval
  palette: ChartPalette
  /** 전역 숨기기. */
  allHidden: boolean
}

const EMPTY: DrawingState = {
  drawings: [],
  preview: null,
  selectedId: null,
  candles: [],
  interval: '1h',
  palette: {} as ChartPalette,
  allHidden: false,
}

class AxisView implements ISeriesPrimitiveAxisView {
  private readonly _coord: number
  private readonly _text: string
  private readonly _color: string
  constructor(coord: number, text: string, color: string) {
    this._coord = coord
    this._text = text
    this._color = color
  }
  coordinate(): number {
    return this._coord
  }
  text(): string {
    return this._text
  }
  textColor(): string {
    return '#ffffff'
  }
  backColor(): string {
    return this._color
  }
}

/**
 * 시리즈에 붙는 lightweight-charts v5 프리미티브. 모든 그림을 pane 캔버스에 그리고,
 * 수평/수직선과 선택된 그림 앵커의 축 라벨을 낸다. 좌표계는 미디어 공간.
 */
export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType> | null = null
  private requestUpdate: (() => void) | null = null
  private state: DrawingState = EMPTY

  private priceViews: AxisView[] = []
  private timeViews: AxisView[] = []

  private readonly paneView: IPrimitivePaneView = {
    renderer: (): IPrimitivePaneRenderer => ({
      draw: (target: CanvasRenderingTarget2D) => this.draw(target),
    }),
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

  setState(state: DrawingState): void {
    this.state = state
    this.requestUpdate?.()
  }

  private makeCoords(): Coords | null {
    if (!this.chart || !this.series) return null
    return new Coords(this.chart, this.series, this.state.candles, this.state.interval)
  }

  private visibleDrawings(): Drawing[] {
    if (this.state.allHidden) return []
    return this.state.drawings.filter((d) => !d.hidden)
  }

  updateAllViews(): void {
    this.priceViews = []
    this.timeViews = []
    const coords = this.makeCoords()
    if (!coords || !this.series) return

    const push = (list: Drawing[]) => {
      for (const d of list) {
        const selected = d.id === this.state.selectedId
        // 수평 계열은 항상 가격 라벨, 수직 계열은 시각 라벨.
        if (d.kind === 'horizontal' || d.kind === 'horizontalRay' || d.kind === 'crossLine') {
          const y = coords.priceToY(d.points[0].price)
          if (y !== null) this.priceViews.push(new AxisView(y, coords.format(d.points[0].price), d.style.color))
        }
        if (d.kind === 'vertical' || d.kind === 'crossLine') {
          const x = coords.timeToX(d.points[0].time)
          if (x !== null) this.timeViews.push(new AxisView(x, timeLabel(d.points[0].time), d.style.color))
        }
        // 선택된 그림은 모든 앵커의 축 라벨을 낸다.
        if (selected) {
          for (const p of d.points) {
            const y = coords.priceToY(p.price)
            if (y !== null) this.priceViews.push(new AxisView(y, coords.format(p.price), d.style.color))
            const x = coords.timeToX(p.time)
            if (x !== null) this.timeViews.push(new AxisView(x, timeLabel(p.time), d.style.color))
          }
        }
      }
    }
    push(this.visibleDrawings())
    if (this.state.preview) push([this.state.preview])
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView]
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.priceViews
  }

  timeAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.timeViews
  }

  private draw(target: CanvasRenderingTarget2D): void {
    const coords = this.makeCoords()
    if (!coords) return
    target.useMediaCoordinateSpace((scope) => {
      const rc: RenderScope = {
        ctx: scope.context,
        width: scope.mediaSize.width,
        height: scope.mediaSize.height,
        coords,
        palette: this.state.palette,
      }
      for (const d of this.visibleDrawings()) {
        renderDrawing(rc, d, d.id === this.state.selectedId)
      }
      if (this.state.preview) renderDrawing(rc, this.state.preview, false)
    })
  }
}

function timeLabel(time: number): string {
  const dt = new Date(time * 1000)
  const mm = `${dt.getUTCMonth() + 1}`.padStart(2, '0')
  const dd = `${dt.getUTCDate()}`.padStart(2, '0')
  const hh = `${dt.getUTCHours()}`.padStart(2, '0')
  const mi = `${dt.getUTCMinutes()}`.padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

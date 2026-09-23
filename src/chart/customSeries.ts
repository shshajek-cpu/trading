/**
 * lightweight-charts 에 없는 두 캔들 종류를 커스텀 시리즈로 그린다.
 *
 * - 볼륨 캔들: 몸통 폭이 그 봉의 (상대) 거래량에 비례한다.
 * - HLC 에어리어: 고가~저가 띠를 채우고 종가 선을 얹는다.
 */
import type {
  CustomData,
  CustomSeriesOptions,
  CustomSeriesPricePlotValues,
  CustomSeriesWhitespaceData,
  ICustomSeriesPaneRenderer,
  ICustomSeriesPaneView,
  PaneRendererCustomData,
  PriceToCoordinateConverter,
  Time,
} from 'lightweight-charts'
import { customSeriesDefaultOptions } from 'lightweight-charts'
import type { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D } from 'fancy-canvas'

/* ── 볼륨 캔들 ─────────────────────────────────────────────────────────── */

export interface VolumeCandleData extends CustomData<Time> {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface VolumeCandleOptions extends CustomSeriesOptions {
  upColor: string
  downColor: string
}

const volumeCandleDefaults: VolumeCandleOptions = {
  ...customSeriesDefaultOptions,
  upColor: '#089981',
  downColor: '#f23645',
}

class VolumeCandleRenderer implements ICustomSeriesPaneRenderer {
  private data: PaneRendererCustomData<Time, VolumeCandleData> | null = null
  private options: VolumeCandleOptions | null = null

  update(data: PaneRendererCustomData<Time, VolumeCandleData>, options: VolumeCandleOptions): void {
    this.data = data
    this.options = options
  }

  draw(target: CanvasRenderingTarget2D, priceToCoordinate: PriceToCoordinateConverter): void {
    target.useBitmapCoordinateSpace((scope) => this.drawImpl(scope, priceToCoordinate))
  }

  private drawImpl(scope: BitmapCoordinatesRenderingScope, priceToCoordinate: PriceToCoordinateConverter): void {
    const data = this.data
    const options = this.options
    if (!data || !options || data.visibleRange === null) return
    const ctx = scope.context
    const hpr = scope.horizontalPixelRatio
    const vpr = scope.verticalPixelRatio
    const { from, to } = data.visibleRange

    let maxVol = 0
    for (let i = from; i < to; i++) {
      const v = data.bars[i].originalData.volume
      if (v > maxVol) maxVol = v
    }
    const fullWidth = data.barSpacing * hpr * 0.8

    for (let i = from; i < to; i++) {
      const bar = data.bars[i].originalData
      const x = data.bars[i].x * hpr
      const openY = (priceToCoordinate(bar.open) ?? 0) * vpr
      const closeY = (priceToCoordinate(bar.close) ?? 0) * vpr
      const highY = (priceToCoordinate(bar.high) ?? 0) * vpr
      const lowY = (priceToCoordinate(bar.low) ?? 0) * vpr
      const up = bar.close >= bar.open
      const color = up ? options.upColor : options.downColor
      const rel = maxVol > 0 ? bar.volume / maxVol : 0
      const bodyW = Math.max(1, fullWidth * Math.max(0.06, rel))

      ctx.fillStyle = color
      // 심지: 항상 얇게.
      const wickW = Math.max(1, hpr)
      ctx.fillRect(Math.round(x - wickW / 2), Math.round(highY), wickW, Math.max(1, Math.round(lowY - highY)))
      // 몸통.
      const top = Math.min(openY, closeY)
      const h = Math.max(1, Math.abs(closeY - openY))
      ctx.fillRect(Math.round(x - bodyW / 2), Math.round(top), Math.round(bodyW), Math.round(h))
    }
  }
}

export class VolumeCandleSeries
  implements ICustomSeriesPaneView<Time, VolumeCandleData, VolumeCandleOptions>
{
  private readonly rendererInstance = new VolumeCandleRenderer()

  priceValueBuilder(d: VolumeCandleData): CustomSeriesPricePlotValues {
    return [d.high, d.low, d.close]
  }

  isWhitespace(d: VolumeCandleData | CustomSeriesWhitespaceData<Time>): d is CustomSeriesWhitespaceData<Time> {
    return (d as Partial<VolumeCandleData>).close === undefined
  }

  renderer(): VolumeCandleRenderer {
    return this.rendererInstance
  }

  update(data: PaneRendererCustomData<Time, VolumeCandleData>, options: VolumeCandleOptions): void {
    this.rendererInstance.update(data, options)
  }

  defaultOptions(): VolumeCandleOptions {
    return volumeCandleDefaults
  }
}

/* ── HLC 에어리어 ──────────────────────────────────────────────────────── */

export interface HlcAreaData extends CustomData<Time> {
  high: number
  low: number
  close: number
}

export interface HlcAreaOptions extends CustomSeriesOptions {
  highLowFill: string
  closeLineColor: string
  closeLineWidth: number
}

const hlcAreaDefaults: HlcAreaOptions = {
  ...customSeriesDefaultOptions,
  highLowFill: 'rgba(41, 98, 255, 0.15)',
  closeLineColor: '#2962ff',
  closeLineWidth: 2,
}

class HlcAreaRenderer implements ICustomSeriesPaneRenderer {
  private data: PaneRendererCustomData<Time, HlcAreaData> | null = null
  private options: HlcAreaOptions | null = null

  update(data: PaneRendererCustomData<Time, HlcAreaData>, options: HlcAreaOptions): void {
    this.data = data
    this.options = options
  }

  draw(target: CanvasRenderingTarget2D, priceToCoordinate: PriceToCoordinateConverter): void {
    target.useBitmapCoordinateSpace((scope) => this.drawImpl(scope, priceToCoordinate))
  }

  private drawImpl(scope: BitmapCoordinatesRenderingScope, priceToCoordinate: PriceToCoordinateConverter): void {
    const data = this.data
    const options = this.options
    if (!data || !options || data.visibleRange === null) return
    const ctx = scope.context
    const hpr = scope.horizontalPixelRatio
    const vpr = scope.verticalPixelRatio
    const { from, to } = data.visibleRange
    if (to - from < 1) return

    // 고가~저가 띠를 폴리곤으로 채운다: 왼→오 고가, 오→왼 저가.
    ctx.beginPath()
    for (let i = from; i < to; i++) {
      const x = data.bars[i].x * hpr
      const y = (priceToCoordinate(data.bars[i].originalData.high) ?? 0) * vpr
      if (i === from) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    for (let i = to - 1; i >= from; i--) {
      const x = data.bars[i].x * hpr
      const y = (priceToCoordinate(data.bars[i].originalData.low) ?? 0) * vpr
      ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = options.highLowFill
    ctx.fill()

    // 종가 선.
    ctx.beginPath()
    for (let i = from; i < to; i++) {
      const x = data.bars[i].x * hpr
      const y = (priceToCoordinate(data.bars[i].originalData.close) ?? 0) * vpr
      if (i === from) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.lineWidth = options.closeLineWidth * vpr
    ctx.strokeStyle = options.closeLineColor
    ctx.stroke()
  }
}

export class HlcAreaSeries implements ICustomSeriesPaneView<Time, HlcAreaData, HlcAreaOptions> {
  private readonly rendererInstance = new HlcAreaRenderer()

  priceValueBuilder(d: HlcAreaData): CustomSeriesPricePlotValues {
    return [d.high, d.low, d.close]
  }

  isWhitespace(d: HlcAreaData | CustomSeriesWhitespaceData<Time>): d is CustomSeriesWhitespaceData<Time> {
    return (d as Partial<HlcAreaData>).close === undefined
  }

  renderer(): HlcAreaRenderer {
    return this.rendererInstance
  }

  update(data: PaneRendererCustomData<Time, HlcAreaData>, options: HlcAreaOptions): void {
    this.rendererInstance.update(data, options)
  }

  defaultOptions(): HlcAreaOptions {
    return hlcAreaDefaults
  }
}

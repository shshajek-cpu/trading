import type { ChartType } from './chartTypes'
import type { IconName } from '../components/Icon'

/** ChartType → own glyph. Used by the chart-type menu and the toolbar button. */
export const CHART_TYPE_ICON: Record<ChartType, IconName> = {
  bars: 'typeBars',
  candles: 'typeCandles',
  hollowCandles: 'typeHollow',
  volumeCandles: 'typeVolumeCandles',
  line: 'typeLine',
  lineMarkers: 'typeLineMarkers',
  stepLine: 'typeStepLine',
  area: 'typeArea',
  hlcArea: 'typeHlcArea',
  baseline: 'typeBaseline',
  columns: 'typeColumns',
  highLow: 'typeHighLow',
  heikinAshi: 'typeHeikinAshi',
}

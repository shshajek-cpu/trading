/** Main-series styles offered by the chart type menu (TradingView order and grouping). */
export type ChartType =
  | 'bars'
  | 'candles'
  | 'hollowCandles'
  | 'volumeCandles'
  | 'line'
  | 'lineMarkers'
  | 'stepLine'
  | 'area'
  | 'hlcArea'
  | 'baseline'
  | 'columns'
  | 'highLow'
  | 'heikinAshi'

export interface ChartTypeInfo {
  id: ChartType
  label: string
  /** Menu section; a divider is drawn between groups. */
  group: number
}

export const CHART_TYPES: ChartTypeInfo[] = [
  { id: 'bars', label: '바', group: 0 },
  { id: 'candles', label: '캔들', group: 0 },
  { id: 'hollowCandles', label: '할로우 캔들', group: 0 },
  { id: 'volumeCandles', label: '볼륨 캔들', group: 0 },
  { id: 'line', label: '라인', group: 1 },
  { id: 'lineMarkers', label: '마커 라인', group: 1 },
  { id: 'stepLine', label: '스텝 라인', group: 1 },
  { id: 'area', label: '에어리어', group: 2 },
  { id: 'hlcArea', label: 'HLC 에어리어', group: 2 },
  { id: 'baseline', label: '베이스라인', group: 2 },
  { id: 'columns', label: '컬럼', group: 3 },
  { id: 'highLow', label: '하이-로우', group: 3 },
  { id: 'heikinAshi', label: '하이킨 아시', group: 4 },
]

export function isChartType(value: unknown): value is ChartType {
  return typeof value === 'string' && CHART_TYPES.some((t) => t.id === value)
}

/** Price scale mode of the main pane (TradingView bottom-right toggles + scale menu). */
export type ScaleMode = 'normal' | 'log' | 'percent' | 'indexed'

export const SCALE_MODES: { id: ScaleMode; label: string }[] = [
  { id: 'normal', label: '일반' },
  { id: 'log', label: '로그' },
  { id: 'percent', label: '퍼센트' },
  { id: 'indexed', label: '100 기준' },
]

export function isScaleMode(value: unknown): value is ScaleMode {
  return value === 'normal' || value === 'log' || value === 'percent' || value === 'indexed'
}

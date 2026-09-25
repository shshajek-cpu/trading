import type { ChartType } from './chartTypes'
import type { LayoutMode } from './layoutConfig'
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

/** 레이아웃 모양 아이콘 — 데스크톱 레이아웃 메뉴·툴바 버튼과 폰 레이아웃 시트. */
export const LAYOUT_ICON: Record<LayoutMode, IconName> = { 1: 'layout1', 2: 'layout2', 4: 'layout4' }

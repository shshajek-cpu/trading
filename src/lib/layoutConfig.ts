import type { Interval } from './binance'
import { isChartType, isScaleMode, type ChartType, type ScaleMode } from './chartTypes'
import { isInterval } from './intervals'
import { notifySettingsChanged } from './syncBus'

export type LayoutMode = 1 | 2 | 4

/** One chart cell. Slice C owns this shape; B/D consume it through ChartCell props. */
export interface CellConfig {
  symbol: string
  interval: Interval
  chartType: ChartType
  scaleMode: ScaleMode
  autoScale: boolean
  /** 가격 눈금 반전(Alt+I) — 위아래를 뒤집어 본다. */
  invertScale: boolean
  /** Extra symbols overlaid for comparison (심볼 비교). */
  compare: string[]
}

export interface LayoutState {
  layout: LayoutMode
  active: number
  cells: CellConfig[]
  /** 칸 나누는 비율 0~1. 2분할은 col 만, 4분할은 col·row 둘 다 쓴다. */
  splitCol: number
  splitRow: number
  /** 차트 종류를 바꾸면 모든 칸에 같이 적용한다. */
  syncChartType: boolean
  /** 심볼을 바꾸면 모든 칸에 같이 적용한다(한 종목을 여러 주기로 볼 때). */
  syncSymbol: boolean
  /** 한 칸의 십자선 시각을 다른 칸에도 세로선으로 보여 준다. */
  syncCrosshair: boolean
}

/** 레이아웃 메뉴 "모든 칸에 같이 적용" 항목. */
export type LayoutSyncKey = 'chartType' | 'symbol' | 'crosshair'
export type LayoutSync = Record<LayoutSyncKey, boolean>

export function layoutSync(state: LayoutState): LayoutSync {
  return { chartType: state.syncChartType, symbol: state.syncSymbol, crosshair: state.syncCrosshair }
}

/** 레이아웃 고르기 — 데스크톱 레이아웃 메뉴와 폰 레이아웃 시트가 같은 목록을 쓴다. */
export const LAYOUT_MODES: { mode: LayoutMode; label: string }[] = [
  { mode: 1, label: '단일 차트' },
  { mode: 2, label: '2분할' },
  { mode: 4, label: '4분할' },
]

/** "모든 칸에 같이 적용" 항목. */
export const LAYOUT_SYNC_ITEMS: { key: LayoutSyncKey; label: string }[] = [
  { key: 'symbol', label: '심볼' },
  { key: 'chartType', label: '차트 종류' },
  { key: 'crosshair', label: '십자선' },
]

const STORAGE_KEY = 'trading.layout.v1'

function cell(symbol: string, interval: Interval): CellConfig {
  return { symbol, interval, chartType: 'candles', scaleMode: 'normal', autoScale: true, invertScale: false, compare: [] }
}

export const DEFAULT_LAYOUT: LayoutState = {
  layout: 1,
  active: 0,
  cells: [
    cell('BTCUSDT', '1m'),
    cell('ETHUSDT', '1m'),
    cell('SOLUSDT', '1m'),
    cell('XRPUSDT', '1m'),
  ],
  splitCol: 0.5,
  splitRow: 0.5,
  syncChartType: true,
  syncSymbol: false,
  syncCrosshair: false,
}

/** 다중 시간대 프리셋. 한 종목을 여러 주기로 동시에 본다. */
export const MTF_PRESETS: { id: string; label: string; intervals: Interval[] }[] = [
  { id: 'scalp', label: '단타 1m·5m·15m·1h', intervals: ['1m', '5m', '15m', '1h'] },
  { id: 'swing', label: '스윙 15m·1h·4h·1d', intervals: ['15m', '1h', '4h', '1d'] },
  { id: 'wide', label: '넓게 5m·1h·4h·1d', intervals: ['5m', '1h', '4h', '1d'] },
]

/** 칸이 너무 짜불어져 쓸모없어지지 않게 범위를 제한한다. */
export function clampSplit(value: number): number {
  return Math.min(0.8, Math.max(0.2, value))
}

/**
 * Tolerant cell parse: fills every missing/foreign field with a safe default so a
 * v1 blob (only symbol + interval) or a partial sync payload never breaks the chart.
 */
function toCell(value: unknown, fallback: CellConfig): CellConfig | null {
  if (typeof value !== 'object' || value === null) return null
  const c = value as Record<string, unknown>
  if (typeof c.symbol !== 'string') return null
  const compare = Array.isArray(c.compare) ? c.compare.filter((s): s is string => typeof s === 'string') : []
  return {
    symbol: c.symbol,
    interval: isInterval(c.interval) ? c.interval : fallback.interval,
    chartType: isChartType(c.chartType) ? c.chartType : 'candles',
    // 비교 중인 칸은 차트가 늘 % 눈금으로 그린다 — 옛 저장값(일반 눈금)을 맞춰 두어야 눈금 버튼이 실제와 같다.
    scaleMode: compare.length > 0 ? 'percent' : isScaleMode(c.scaleMode) ? c.scaleMode : 'normal',
    autoScale: typeof c.autoScale === 'boolean' ? c.autoScale : true,
    invertScale: c.invertScale === true,
    compare,
  }
}

export function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw) as Partial<LayoutState>
    const layout = parsed.layout === 2 || parsed.layout === 4 ? parsed.layout : 1
    const stored = Array.isArray(parsed.cells) ? parsed.cells : []
    // 부족하거나 깨진 칸은 기본값으로 채워 항상 4칸을 유지한다.
    const cells = DEFAULT_LAYOUT.cells.map((def, i) => toCell(stored[i], def) ?? def)
    const active =
      typeof parsed.active === 'number' && parsed.active >= 0 && parsed.active < layout
        ? parsed.active
        : 0
    const split = (v: unknown) => (typeof v === 'number' ? clampSplit(v) : 0.5)
    return {
      layout,
      active,
      cells,
      splitCol: split(parsed.splitCol),
      splitRow: split(parsed.splitRow),
      syncChartType: typeof parsed.syncChartType === 'boolean' ? parsed.syncChartType : true,
      syncSymbol: parsed.syncSymbol === true,
      syncCrosshair: parsed.syncCrosshair === true,
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function saveLayout(state: LayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 */
  }
}

/**
 * 차트 패널(메인/RSI/MACD) 높이 비율.
 * 패널 구성이 바뀌면 저장된 값이 엉뚱한 곳에 붙으므로 구성별로 따로 둔다.
 */
const PANE_KEY = 'trading.panes.v1'

export function loadPaneSizes(config: string): number[] | null {
  try {
    const raw = localStorage.getItem(PANE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, unknown>
    const value = all[config]
    if (!Array.isArray(value)) return null
    const nums = value.filter((v): v is number => typeof v === 'number' && v > 0)
    return nums.length > 0 ? nums : null
  } catch {
    return null
  }
}

export function savePaneSizes(config: string, sizes: number[]): void {
  try {
    const raw = localStorage.getItem(PANE_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    all[config] = sizes
    localStorage.setItem(PANE_KEY, JSON.stringify(all))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 */
  }
}

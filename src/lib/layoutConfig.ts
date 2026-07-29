import type { Interval } from './binance'

export type LayoutMode = 1 | 2 | 4

export interface CellConfig {
  symbol: string
  interval: Interval
}

export interface LayoutState {
  layout: LayoutMode
  active: number
  cells: CellConfig[]
}

const STORAGE_KEY = 'trading.layout.v1'

export const DEFAULT_LAYOUT: LayoutState = {
  layout: 1,
  active: 0,
  cells: [
    { symbol: 'BTCUSDT', interval: '1m' },
    { symbol: 'ETHUSDT', interval: '1m' },
    { symbol: 'SOLUSDT', interval: '1m' },
    { symbol: 'XRPUSDT', interval: '1m' },
  ],
}

function isCell(value: unknown): value is CellConfig {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return typeof c.symbol === 'string' && typeof c.interval === 'string'
}

export function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw) as Partial<LayoutState>
    const layout = parsed.layout === 2 || parsed.layout === 4 ? parsed.layout : 1
    const cells = Array.isArray(parsed.cells) ? parsed.cells.filter(isCell) : []
    // 부족한 칸은 기본값으로 채워 항상 4칸을 유지한다.
    const filled = DEFAULT_LAYOUT.cells.map((def, i) => cells[i] ?? def)
    const active =
      typeof parsed.active === 'number' && parsed.active >= 0 && parsed.active < layout
        ? parsed.active
        : 0
    return { layout, active, cells: filled }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function saveLayout(state: LayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
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
  } catch {
    /* 저장 실패는 무시 */
  }
}

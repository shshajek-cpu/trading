import type { Interval } from './market/types'
import { isChartType, isScaleMode, type ChartType, type ScaleMode } from './chartTypes'
import { isInterval } from './intervals'
import { notifySettingsChanged } from './syncBus'

/**
 * 분할 격자. dir='rows' 면 위에서 아래로 쌓인 가로 줄마다 칸 수(왼쪽→오른쪽),
 * dir='cols' 면 왼쪽에서 오른쪽으로 놓인 세로 줄마다 칸 수(위→아래). 칸 번호는 줄 순서대로 매긴다
 * (왼쪽 크게 + 2칸 = cols [1, 2] → 0 번이 큰 칸).
 */
export type GridDir = 'rows' | 'cols'

export interface GridShape {
  dir: GridDir
  /** 줄마다 칸 수(1~4). 줄은 1~4개, 칸은 모두 합쳐 9개까지. */
  lines: number[]
}

/** 격자 모양 + 크기 비율(합이 1). */
export interface LayoutGrid extends GridShape {
  /** 줄 크기(dir='rows' 면 높이). */
  lineSizes: number[]
  /** 줄마다 칸 크기(dir='rows' 면 너비). */
  cellSizes: number[][]
}

export const MAX_LINES = 4
export const MAX_PER_LINE = 4
export const MAX_CELLS = 9
/** 끌어서 줄일 수 있는 가장 작은 비율. 화면 크기에 따른 최소 px 은 ChartGrid 가 더 조인다. */
export const MIN_SIZE = 0.05

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
  grid: LayoutGrid
  active: number
  /** 늘 MAX_CELLS 칸 — 앞에서부터 격자 칸 수만큼 보인다. 격자를 줄였다 늘려도 숨은 칸 설정이 남고, 동기화 합치기가 칸 번호로 맞는다. */
  cells: CellConfig[]
  /** 차트 종류를 바꾸면 모든 칸에 같이 적용한다. */
  syncChartType: boolean
  /** 심볼을 바꾸면 모든 칸에 같이 적용한다(한 종목을 여러 주기로 볼 때). */
  syncSymbol: boolean
}

/** 레이아웃 메뉴 "모든 칸에 같이 적용" 항목. */
export type LayoutSyncKey = 'chartType' | 'symbol'
export type LayoutSync = Record<LayoutSyncKey, boolean>

export function layoutSync(state: LayoutState): LayoutSync {
  return { chartType: state.syncChartType, symbol: state.syncSymbol }
}

/* ── 격자 ─────────────────────────────────────────────────────────── */

export function cellCount(shape: GridShape): number {
  return shape.lines.reduce((a, n) => a + n, 0)
}

export function isValidShape(shape: GridShape): boolean {
  const { lines } = shape
  return (
    (shape.dir === 'rows' || shape.dir === 'cols') &&
    lines.length >= 1 &&
    lines.length <= MAX_LINES &&
    lines.every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_PER_LINE) &&
    cellCount(shape) <= MAX_CELLS
  )
}

/** 같은 모양의 한 가지 표기 — 세로 줄 하나(cols [3])는 가로 줄 셋(rows [1,1,1])과, 칸 하나짜리 세로 줄들은 가로 줄 하나와 같다. */
export function canonicalShape(shape: GridShape): GridShape {
  if (shape.dir === 'cols') {
    if (shape.lines.length === 1) return { dir: 'rows', lines: Array.from({ length: shape.lines[0] }, () => 1) }
    if (shape.lines.every((n) => n === 1)) return { dir: 'rows', lines: [shape.lines.length] }
  }
  return { dir: shape.dir, lines: [...shape.lines] }
}

/** 모양 비교용 문자열("rows:2,2"). */
export function shapeKey(shape: GridShape): string {
  const s = canonicalShape(shape)
  return `${s.dir}:${s.lines.join(',')}`
}

function parseShape(value: unknown): GridShape | null {
  if (typeof value !== 'string') return null
  const m = /^(rows|cols):(\d(?:,\d)*)$/.exec(value)
  if (!m) return null
  const shape: GridShape = { dir: m[1] as GridDir, lines: m[2].split(',').map(Number) }
  return isValidShape(shape) ? shape : null
}

function equal(n: number): number[] {
  return Array.from({ length: n }, () => 1 / n)
}

/** 크기 비율 검사: 개수가 맞고 양수면 합 1 로 맞추고(너무 작은 칸은 MIN_SIZE 로), 아니면 균등. */
function toSizes(value: unknown, n: number): number[] {
  if (!Array.isArray(value) || value.length !== n) return equal(n)
  if (!value.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) return equal(n)
  const nums = value as number[]
  const sum = nums.reduce((a, x) => a + x, 0)
  const clamped = nums.map((x) => Math.max(MIN_SIZE, x / sum))
  const total = clamped.reduce((a, x) => a + x, 0)
  return clamped.map((x) => x / total)
}

/** 모양만 바꿀 때: 모든 칸을 같은 크기로. */
export function equalGrid(shape: GridShape): LayoutGrid {
  const s = canonicalShape(shape)
  return { dir: s.dir, lines: s.lines, lineSizes: equal(s.lines.length), cellSizes: s.lines.map(equal) }
}

export const SINGLE_SHAPE: GridShape = { dir: 'rows', lines: [1] }

/**
 * 경계 하나를 옮긴다 — 맞닿은 두 크기의 합은 그대로. pos = 경계의 새 위치(0~1, 줄 전체 기준),
 * min = 한 칸의 최소 비율.
 */
function shiftSizes(sizes: number[], index: number, pos: number, min: number): number[] {
  const start = sizes.slice(0, index).reduce((a, x) => a + x, 0)
  const pair = sizes[index] + sizes[index + 1]
  const lo = Math.min(min, pair / 2)
  const first = Math.min(pair - lo, Math.max(lo, pos - start))
  return sizes.map((x, i) => (i === index ? first : i === index + 1 ? pair - first : x))
}

/** 경계 양옆 두 크기를 똑같이(경계 더블클릭). */
function equalizePair(sizes: number[], index: number): number[] {
  const half = (sizes[index] + sizes[index + 1]) / 2
  return sizes.map((x, i) => (i === index || i === index + 1 ? half : x))
}

/** 칸 하나의 자리(0~1 비율). */
export interface CellRect {
  x: number
  y: number
  w: number
  h: number
}

/** 끌 수 있는 경계. kind='line' 은 줄 사이(줄 크기), 'cell' 은 line 번째 줄 안의 칸 사이. */
export interface GridBoundary {
  kind: 'line' | 'cell'
  line: number
  /** 경계 앞(왼쪽·위) 줄 또는 칸 번호. */
  index: number
  /** true = 세로 막대(좌우로 끈다). */
  vertical: boolean
  /** 막대 위치(0~1)와 막대가 걸친 범위(0~1). */
  pos: number
  from: number
  to: number
}

/**
 * 칸 자리와 경계. transposed 면 줄 방향을 뒤집어 그린다(폰 세로 화면에서 칸이 너무 좁을 때) — 칸 번호·비율은 그대로다.
 */
export function gridGeometry(grid: LayoutGrid, transposed = false): { rects: CellRect[]; bounds: GridBoundary[] } {
  const stacked = (grid.dir === 'rows') !== transposed
  const rects: CellRect[] = []
  const bounds: GridBoundary[] = []
  let a0 = 0
  grid.lines.forEach((n, line) => {
    const as = grid.lineSizes[line]
    let b0 = 0
    for (let j = 0; j < n; j++) {
      const bs = grid.cellSizes[line][j]
      rects.push(stacked ? { x: b0, y: a0, w: bs, h: as } : { x: a0, y: b0, w: as, h: bs })
      b0 += bs
      if (j < n - 1) bounds.push({ kind: 'cell', line, index: j, vertical: stacked, pos: b0, from: a0, to: a0 + as })
    }
    a0 += as
    if (line < grid.lines.length - 1) bounds.push({ kind: 'line', line, index: line, vertical: !stacked, pos: a0, from: 0, to: 1 })
  })
  return { rects, bounds }
}

/** 경계 하나를 pos 로 옮긴 격자. */
export function moveBoundary(grid: LayoutGrid, b: GridBoundary, pos: number, min: number): LayoutGrid {
  if (b.kind === 'line') return { ...grid, lineSizes: shiftSizes(grid.lineSizes, b.index, pos, min) }
  return { ...grid, cellSizes: grid.cellSizes.map((s, i) => (i === b.line ? shiftSizes(s, b.index, pos, min) : s)) }
}

/** 경계 양옆을 같은 크기로 맞춘 격자. */
export function equalizeBoundary(grid: LayoutGrid, b: GridBoundary): LayoutGrid {
  if (b.kind === 'line') return { ...grid, lineSizes: equalizePair(grid.lineSizes, b.index) }
  return { ...grid, cellSizes: grid.cellSizes.map((s, i) => (i === b.line ? equalizePair(s, b.index) : s)) }
}

/**
 * 저장형: 모양은 한 덩어리 문자열이라 동기화 합치기가 두 기기의 모양을 섞지 못한다(방향과 줄별 칸 수가 따로 합쳐지면
 * 어느 기기도 고르지 않은 격자가 된다). 크기는 모양과 개수가 맞을 때만 쓰고, 아니면 균등.
 */
interface StoredGrid {
  shape: string
  lineSizes: number[]
  cellSizes: number[][]
}

function gridToStored(grid: LayoutGrid): StoredGrid {
  return { shape: `${grid.dir}:${grid.lines.join(',')}`, lineSizes: grid.lineSizes, cellSizes: grid.cellSizes }
}

function gridFromStored(value: Record<string, unknown>): LayoutGrid | null {
  const shape = parseShape(value.shape)
  if (!shape) return null
  const cellSizes = Array.isArray(value.cellSizes) ? (value.cellSizes as unknown[]) : []
  return {
    ...shape,
    lineSizes: toSizes(value.lineSizes, shape.lines.length),
    cellSizes: shape.lines.map((n, i) => toSizes(cellSizes[i], n)),
  }
}

/* ── 프리셋 ───────────────────────────────────────────────────────── */

export interface LayoutPreset {
  id: string
  label: string
  shape: GridShape
}

/** 레이아웃 고르기 — 데스크톱 레이아웃 메뉴·폰 레이아웃 시트·빠른 검색이 같은 목록을 쓴다(칸 수 순서). */
export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: '1', label: '단일 차트', shape: { dir: 'rows', lines: [1] } },
  { id: '2h', label: '좌우 2칸', shape: { dir: 'rows', lines: [2] } },
  { id: '2v', label: '위아래 2칸', shape: { dir: 'rows', lines: [1, 1] } },
  { id: '3h', label: '좌우 3칸', shape: { dir: 'rows', lines: [3] } },
  { id: '3v', label: '위아래 3칸', shape: { dir: 'rows', lines: [1, 1, 1] } },
  { id: '3l', label: '왼쪽 크게 + 2칸', shape: { dir: 'cols', lines: [1, 2] } },
  { id: '3t', label: '위 크게 + 2칸', shape: { dir: 'rows', lines: [1, 2] } },
  { id: '4', label: '2×2', shape: { dir: 'rows', lines: [2, 2] } },
  { id: '4h', label: '좌우 4칸', shape: { dir: 'rows', lines: [4] } },
  { id: '4l', label: '왼쪽 크게 + 3칸', shape: { dir: 'cols', lines: [1, 3] } },
  { id: '6h', label: '3×2', shape: { dir: 'rows', lines: [3, 3] } },
  { id: '6v', label: '2×3', shape: { dir: 'rows', lines: [2, 2, 2] } },
  { id: '8', label: '4×2', shape: { dir: 'rows', lines: [4, 4] } },
  { id: '9', label: '3×3', shape: { dir: 'rows', lines: [3, 3, 3] } },
]

/** 칸 수별 묶음(메뉴의 한 줄). */
export const PRESET_GROUPS: { count: number; presets: LayoutPreset[] }[] = [
  ...new Set(LAYOUT_PRESETS.map((p) => cellCount(p.shape))),
].map((count) => ({ count, presets: LAYOUT_PRESETS.filter((p) => cellCount(p.shape) === count) }))

export function presetOf(shape: GridShape): LayoutPreset | undefined {
  const key = shapeKey(shape)
  return LAYOUT_PRESETS.find((p) => shapeKey(p.shape) === key)
}

/** 버튼·타일에 보일 이름. 프리셋이 아니면 칸 수. */
export function layoutLabel(shape: GridShape): string {
  return presetOf(shape)?.label ?? `사용자 지정 ${cellCount(shape)}칸`
}

/** 칸이 n 개 이상인 가장 작은 프리셋(MTF 프리셋이 칸을 늘릴 때). */
export function shapeForCount(n: number): GridShape {
  return (LAYOUT_PRESETS.find((p) => cellCount(p.shape) >= n) ?? LAYOUT_PRESETS[LAYOUT_PRESETS.length - 1]).shape
}

/** 격자를 바꾼다. 활성 칸이 사라지면 남은 마지막 칸. */
export function withGrid(state: LayoutState, grid: LayoutGrid): LayoutState {
  return { ...state, grid, active: Math.min(state.active, cellCount(grid) - 1) }
}

/** 레이아웃 메뉴·폰 레이아웃 시트가 쓰는 조작 묶음. */
export interface LayoutControls {
  grid: LayoutGrid
  /** 프리셋·직접 만들기 — 모든 칸을 같은 크기로. */
  onShapeChange: (shape: GridShape) => void
  onEqualize: () => void
  sync: LayoutSync
  onSyncChange: (key: LayoutSyncKey, on: boolean) => void
  saved: SavedLayout[]
  onSave: (name: string) => void
  onApplySaved: (id: string) => void
  onRenameSaved: (id: string, name: string) => void
  onDeleteSaved: (id: string) => void
}

/** "모든 칸에 같이 적용" 항목. */
export const LAYOUT_SYNC_ITEMS: { key: LayoutSyncKey; label: string }[] = [
  { key: 'symbol', label: '심볼' },
  { key: 'chartType', label: '차트 종류' },
]

const STORAGE_KEY = 'trading.layout.v1'

function cell(symbol: string, interval: Interval): CellConfig {
  return { symbol, interval, chartType: 'candles', scaleMode: 'normal', autoScale: true, invertScale: false, compare: [] }
}

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT', 'LINKUSDT', 'AVAXUSDT']

export const DEFAULT_LAYOUT: LayoutState = {
  grid: equalGrid(SINGLE_SHAPE),
  active: 0,
  cells: DEFAULT_SYMBOLS.map((s) => cell(s, '1m')),
  syncChartType: true,
  syncSymbol: false,
}

/** 다중 시간대 프리셋. 한 종목을 여러 주기로 동시에 본다. */
export const MTF_PRESETS: { id: string; label: string; intervals: Interval[] }[] = [
  { id: 'scalp', label: '단타 1m·5m·15m·1h', intervals: ['1m', '5m', '15m', '1h'] },
  { id: 'swing', label: '스윙 15m·1h·4h·1d', intervals: ['15m', '1h', '4h', '1d'] },
  { id: 'wide', label: '넓게 5m·1h·4h·1d', intervals: ['5m', '1h', '4h', '1d'] },
]

/** 옛 저장값(layout 1|2|4 + splitCol/splitRow 0.2~0.8) → 격자. 4분할은 두 줄이 같은 세로 경계를 썼다. */
function legacyGrid(p: Record<string, unknown>): LayoutGrid {
  const split = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(0.8, Math.max(0.2, v)) : 0.5)
  const col = split(p.splitCol)
  const row = split(p.splitRow)
  if (p.layout === 2) return { dir: 'rows', lines: [2], lineSizes: [1], cellSizes: [[col, 1 - col]] }
  if (p.layout === 4) {
    return { dir: 'rows', lines: [2, 2], lineSizes: [row, 1 - row], cellSizes: [[col, 1 - col], [col, 1 - col]] }
  }
  return equalGrid(SINGLE_SHAPE)
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

/** 저장된 칸 목록 → 늘 MAX_CELLS 칸. 부족하거나 깨진 칸은 기본값. */
function toCells(value: unknown): CellConfig[] {
  const stored = Array.isArray(value) ? value : []
  return DEFAULT_LAYOUT.cells.map((def, i) => toCell(stored[i], def) ?? def)
}

export function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_LAYOUT
    const p = parsed as Record<string, unknown>
    const grid = gridFromStored(p) ?? legacyGrid(p)
    const n = cellCount(grid)
    const active = typeof p.active === 'number' && Number.isInteger(p.active) && p.active >= 0 && p.active < n ? p.active : 0
    return {
      grid,
      active,
      cells: toCells(p.cells),
      syncChartType: typeof p.syncChartType === 'boolean' ? p.syncChartType : true,
      syncSymbol: p.syncSymbol === true,
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function saveLayout(state: LayoutState): void {
  try {
    const { grid, ...rest } = state
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...gridToStored(grid), ...rest }))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 */
  }
}

/* ── 내 레이아웃(이름 붙여 저장한 격자 + 칸 설정, 동기화) ─────────────── */

export const SAVED_LAYOUTS_KEY = 'trading.savedLayouts.v1'

export interface SavedLayout {
  id: string
  name: string
  grid: LayoutGrid
  /** 격자 칸 수만큼. */
  cells: CellConfig[]
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `lay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}

export function loadSavedLayouts(): SavedLayout[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_LAYOUTS_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    const out: SavedLayout[] = []
    for (const v of parsed) {
      if (typeof v !== 'object' || v === null) continue
      const o = v as Record<string, unknown>
      const grid = gridFromStored(o)
      if (typeof o.id !== 'string' || !grid) continue
      const cells = toCells(o.cells).slice(0, cellCount(grid))
      out.push({ id: o.id, name: typeof o.name === 'string' && o.name.trim() ? o.name : '이름 없음', grid, cells })
    }
    return out
  } catch {
    return []
  }
}

export function saveSavedLayouts(list: SavedLayout[]): void {
  try {
    const stored = list.map(({ grid, ...rest }) => ({ ...rest, ...gridToStored(grid) }))
    localStorage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify(stored))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** 지금 격자와 보이는 칸 설정을 이름 붙여 담는다. */
export function captureLayout(state: LayoutState, name: string): SavedLayout {
  return { id: newId(), name, grid: state.grid, cells: state.cells.slice(0, cellCount(state.grid)) }
}

/** 저장한 레이아웃 적용: 격자와 앞 칸들을 바꾸고, 뒤의 숨은 칸은 그대로 둔다. */
export function applySavedLayout(state: LayoutState, saved: SavedLayout): LayoutState {
  return { ...state, grid: saved.grid, active: 0, cells: state.cells.map((c, i) => saved.cells[i] ?? c) }
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

/**
 * Imperative handles for mounted charts, keyed by layout cell index.
 * The shell (toolbar, bottom bar, shortcuts) drives charts through these without
 * threading refs through React props. Chart.tsx registers on mount and clears on unmount.
 */
export interface ChartHandle {
  /** PNG-ready canvas of the whole chart (panes, scales, drawings) with a symbol/OHLC header. */
  takeSnapshot(): HTMLCanvasElement
  /** Show bars whose open time is within [from, to] (unix seconds). */
  setVisibleRange(from: number, to: number): void
  /** TradingView "Reset chart view" (Alt+R): auto-scale on, fit recent bars. */
  resetView(): void
  /** Jump to the newest bar keeping the current zoom. */
  scrollToRealtime(): void
  /** 시간축만 초기화: 최근 봉을 기본 간격으로. */
  resetTimeScale(): void
  /** ←/→: 한 봉씩, far(Ctrl)면 화면의 1/4씩 과거(-1)·최근(+1)으로 옮긴다. */
  scrollBars(direction: -1 | 1, far: boolean): void
  /** Ctrl+↑/↓: 오른쪽 끝을 고정하고 확대(+1)·축소(-1). */
  zoom(direction: -1 | 1): void
  /** 날짜로 이동(Alt+G): 그 시각을 화면 가운데에 둔다. 모자란 과거는 더 불러온다. */
  goToTime(time: number): void
}

const handles: (ChartHandle | null)[] = []

export function registerChart(cellIndex: number, handle: ChartHandle | null): void {
  handles[cellIndex] = handle
}

export function getChart(cellIndex: number): ChartHandle | null {
  return handles[cellIndex] ?? null
}

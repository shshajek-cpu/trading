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
}

const handles: (ChartHandle | null)[] = []

export function registerChart(cellIndex: number, handle: ChartHandle | null): void {
  handles[cellIndex] = handle
}

export function getChart(cellIndex: number): ChartHandle | null {
  return handles[cellIndex] ?? null
}

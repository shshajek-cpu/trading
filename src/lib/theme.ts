/** Colors that must be passed to canvas code (lightweight-charts cannot read CSS variables). */

export type ThemeName = 'dark' | 'light'

export interface ChartPalette {
  background: string
  text: string
  textDim: string
  grid: string
  border: string
  crosshair: string
  crosshairLabel: string
  up: string
  down: string
  accent: string
}

export const CHART_PALETTES: Record<ThemeName, ChartPalette> = {
  dark: {
    background: '#0f0f0f',
    text: '#dbdbdb',
    textDim: '#8c8c8c',
    grid: 'rgba(242, 242, 242, 0.06)',
    border: '#2e2e2e',
    crosshair: '#9b9b9b',
    crosshairLabel: '#3d3d3d',
    up: '#089981',
    down: '#f23645',
    accent: '#2962ff',
  },
  light: {
    background: '#ffffff',
    text: '#0f0f0f',
    textDim: '#6a6a6a',
    grid: 'rgba(46, 46, 46, 0.06)',
    border: '#ebebeb',
    crosshair: '#9b9b9b',
    crosshairLabel: '#131722',
    up: '#089981',
    down: '#f23645',
    accent: '#2962ff',
  },
}

/** Theme-independent market colors for UI code that is not canvas-bound. */
export const COLORS = {
  up: '#089981',
  down: '#f23645',
  accent: '#2962ff',
} as const

/** TradingView's default study colors, used in order when a new line is added. */
export const INDICATOR_PALETTE = [
  '#2962ff',
  '#ff6d00',
  '#7e57c2',
  '#089981',
  '#f23645',
  '#fbc02d',
  '#00bcd4',
  '#e91e63',
] as const

/** Drawing-tool color swatches (TradingView default drawing color is #2962ff). */
export const DRAWING_PALETTE = [
  '#2962ff',
  '#f23645',
  '#089981',
  '#ff9800',
  '#9c27b0',
  '#00bcd4',
  '#fbc02d',
  '#ffffff',
  '#787b86',
  '#000000',
] as const

/** #rrggbb + 알파(0~1) → rgba() 문자열. #rrggbb 가 아니면 그대로 돌려준다. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Canvas font; keep in sync with --tv-font in styles/tokens.css. */
export const CHART_FONT =
  "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"

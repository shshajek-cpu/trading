/** UI 는 블랙&화이트 글래스, 시세 색상(캔들·등락)만 초록/빨강. */
export const COLORS = {
  /** 상승 — 초록 */
  up: '#26a69a',
  /** 하락 — 빨강 */
  down: '#ef5350',
  background: '#0a0a0a',
  panel: 'rgba(255, 255, 255, 0.04)',
  border: 'rgba(255, 255, 255, 0.1)',
  text: '#e8e8e8',
  textDim: '#8a8a8a',
  grid: '#161616',
  accent: '#ffffff',
} as const

/** MA 라인을 새로 추가할 때 순서대로 집어주는 그레이스케일 팔레트. */
export const MA_PALETTE = [
  '#ffffff',
  '#b4b4b4',
  '#787878',
  '#d8d8d8',
  '#969696',
  '#5a5a5a',
] as const

/**
 * 차트 캔버스에 쓸 글꼴.
 * 차트는 CSS 로 글꼴을 못 바꾸므로(캔버스에 직접 그린다) 값을 문자열로 넘겨야 한다.
 * index.css 의 --font-sans 와 같은 순서를 유지한다.
 */
export const CHART_FONT =
  "'SUIT Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', Roboto, sans-serif"

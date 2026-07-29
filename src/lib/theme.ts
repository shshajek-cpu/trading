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

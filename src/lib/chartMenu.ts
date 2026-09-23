/** 차트에서 우클릭한 자리 — 어디를 눌렀는지에 따라 TradingView 처럼 다른 메뉴를 띄운다. */
export type ChartMenuTarget =
  /** 빈 차트 영역. 오실레이터 패널이면 price 가 null 이다. */
  | { kind: 'chart'; time: number | null; price: number | null }
  | { kind: 'drawing'; drawingId: string }
  | { kind: 'priceScale' }
  | { kind: 'timeScale' }

export interface ChartMenuRequest {
  /** 화면(client) 좌표. */
  x: number
  y: number
  target: ChartMenuTarget
}

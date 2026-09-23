import type { Interval } from '../../lib/binance'
import type { Drawing, NewDrawing } from '../../lib/drawings'
import { cloneOffset } from './builders'

/** Ctrl+C 로 복사한 그림. 앱 안에서만 쓰므로 시스템 클립보드 대신 메모리에 둔다. */
let copied: NewDrawing | null = null

export function copyDrawing(d: Drawing): void {
  copied = { symbol: d.symbol, kind: d.kind, points: d.points, style: { ...d.style } }
}

export function hasCopiedDrawing(): boolean {
  return copied !== null
}

/**
 * 붙여 넣을 그림을 만든다. 같은 심볼이면 원본과 겹치지 않게 몇 봉 옆으로 옮기고,
 * 다음 붙여넣기는 방금 붙인 자리에서 다시 옮겨 계단처럼 쌓이게 한다.
 * 다른 심볼이면 같은 시각·가격에 그대로 붙인다(TradingView 와 같은 동작).
 */
export function pasteDrawing(symbol: string, interval: Interval): NewDrawing | null {
  if (!copied) return null
  const points = copied.symbol === symbol ? cloneOffset(copied.points, interval) : copied.points
  copied = { ...copied, symbol, points }
  return { symbol, kind: copied.kind, points, style: { ...copied.style } }
}

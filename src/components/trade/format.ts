import type { OrderAction, OrderType, PosSide, TriggerBy } from '../../lib/paper/types'

/** 소수 자릿수 — 0.001 → 3, 1 → 0. */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2
  const [mant, exp] = step.toExponential().split('e')
  return Math.max(0, (mant.split('.')[1] ?? '').length - parseInt(exp, 10))
}

const usdtFmt = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 12,345.67 */
export function fmtUsdt(v: number): string {
  return usdtFmt.format(Number.isFinite(v) ? v : 0)
}

/** +12.34 / −5.00 — 손익처럼 부호를 늘 붙인다. */
export function fmtSigned(v: number): string {
  const n = Number.isFinite(v) ? v : 0
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${usdtFmt.format(Math.abs(n))}`
}

export function fmtPct(v: number, digits = 2): string {
  const n = Number.isFinite(v) ? v : 0
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`
}

const ratioFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** 증거금률 — 안전할수록 수만 % 까지 커지니 천 단위 쉼표를 넣는다. 교차 포지션이 없으면 —. */
export function fmtMarginRatio(v: number | null): string {
  return v == null || !Number.isFinite(v) ? '—' : `${ratioFmt.format(v)}%`
}

/** 틱 크기에 맞춘 가격 문자열(천 단위 쉼표). */
export function fmtPrice(v: number, tick: number): string {
  const d = stepDecimals(tick)
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/** 수량 단위(stepSize)에 맞춘 수량 문자열. */
export function fmtQty(v: number, step: number): string {
  const d = stepDecimals(step)
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/** 값을 단위의 배수로 내림(수량) — 부동소수 오차를 자릿수로 잘라 낸다. */
export function floorTo(v: number, step: number): number {
  if (!(step > 0)) return v
  const d = stepDecimals(step)
  return Number((Math.floor(v / step + 1e-9) * step).toFixed(d))
}

/** 값을 단위의 배수로 반올림(가격). */
export function roundTo(v: number, step: number): number {
  if (!(step > 0)) return v
  const d = stepDecimals(step)
  return Number((Math.round(v / step) * step).toFixed(d))
}

export const SIDE_LABEL: Record<PosSide, string> = { long: '롱', short: '숏' }
export const ACTION_LABEL: Record<OrderAction, string> = { open: '진입', close: '종료' }
export const TYPE_LABEL: Record<OrderType, string> = { market: '시장가', limit: '지정가', trigger: '조건부' }
export const TRIGGER_BY_LABEL: Record<TriggerBy, string> = { last: '최근 체결가', mark: '마크 가격' }

/** 손익 색 클래스 — CSS 의 .up/.down. */
export function pnlClass(v: number): string {
  return v > 0 ? 'up' : v < 0 ? 'down' : ''
}

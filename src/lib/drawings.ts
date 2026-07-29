import { notifySettingsChanged } from './syncBus'

export type DrawingKind = 'horizontal'

export interface Drawing {
  id: string
  symbol: string
  kind: DrawingKind
  price: number
  color: string
  /** 이 선에 닿으면 알림을 띄울지. */
  alert: boolean
  /** 알림이 이미 발동했는지(1회성). */
  fired: boolean
  /** 마지막 판정 시 가격이 선 위였는지 — 교차를 감지하려고 들고 있는다. */
  above: boolean | null
  createdAt: number
}

const STORAGE_KEY = 'trading.drawings.v1'

function isDrawing(value: unknown): value is Drawing {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Record<string, unknown>
  return (
    typeof d.id === 'string' &&
    typeof d.symbol === 'string' &&
    d.kind === 'horizontal' &&
    typeof d.price === 'number' &&
    Number.isFinite(d.price) &&
    typeof d.color === 'string' &&
    typeof d.alert === 'boolean' &&
    typeof d.fired === 'boolean'
  )
}

export function loadDrawings(): Drawing[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isDrawing) : []
  } catch {
    return []
  }
}

export function saveDrawings(drawings: Drawing[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drawings))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 */
  }
}

export const DRAW_COLORS = ['#ffffff', '#26a69a', '#ef5350', '#ffb74d', '#64b5f6'] as const

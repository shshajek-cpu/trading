import type { FeatureSet } from './features'
import { notifySettingsChanged } from './syncBus'

export type PinSide = 'long' | 'short' | 'skip'

export interface Pin {
  id: string
  symbol: string
  interval: string
  /** 캔들 시각(초) */
  time: number
  price: number
  side: PinSide
  note?: string
  features: FeatureSet
  /** 찍은 시각 — 정렬용 */
  created: number
}

export const SIDE_LABELS: Record<PinSide, string> = {
  long: '롱',
  short: '숏',
  skip: '관망',
}

export const SIDE_COLORS: Record<PinSide, string> = {
  long: '#26a69a',
  short: '#ef5350',
  skip: '#8a8a8a',
}

export const PINS_STORAGE_KEY = 'trading.pins.v1'

function isPin(v: unknown): v is Pin {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.symbol === 'string' &&
    typeof p.time === 'number' &&
    typeof p.price === 'number' &&
    (p.side === 'long' || p.side === 'short' || p.side === 'skip') &&
    typeof p.features === 'object' &&
    p.features !== null
  )
}

export function loadPins(): Pin[] {
  try {
    const raw = localStorage.getItem(PINS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPin) : []
  } catch {
    return []
  }
}

export function savePins(pins: Pin[]): void {
  try {
    localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(pins))
    notifySettingsChanged()
  } catch {
    /* 용량 초과는 무시 — 다음 저장에서 회복된다 */
  }
}

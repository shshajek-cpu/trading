import { MA_PALETTE } from './theme'

export type MaType = 'sma' | 'ema'

export interface MaConfig {
  id: string
  type: MaType
  period: number
  color: string
  visible: boolean
}

export interface RsiConfig {
  enabled: boolean
  period: number
}

export interface MacdConfig {
  enabled: boolean
  fast: number
  slow: number
  signal: number
}

export interface IndicatorSettings {
  mas: MaConfig[]
  rsi: RsiConfig
  macd: MacdConfig
}

export const DEFAULT_INDICATORS: IndicatorSettings = {
  mas: [
    { id: 'ma-7', type: 'sma', period: 7, color: MA_PALETTE[0], visible: true },
    { id: 'ma-25', type: 'sma', period: 25, color: MA_PALETTE[1], visible: true },
    { id: 'ma-99', type: 'sma', period: 99, color: MA_PALETTE[2], visible: true },
  ],
  rsi: { enabled: true, period: 14 },
  macd: { enabled: true, fast: 12, slow: 26, signal: 9 },
}

export function nextMaColor(existing: MaConfig[]): string {
  const used = new Set(existing.map((m) => m.color))
  return MA_PALETTE.find((c) => !used.has(c)) ?? MA_PALETTE[existing.length % MA_PALETTE.length]
}

const STORAGE_KEY = 'trading.indicators.v1'

function isMaConfig(value: unknown): value is MaConfig {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    (m.type === 'sma' || m.type === 'ema') &&
    typeof m.period === 'number' &&
    typeof m.color === 'string' &&
    typeof m.visible === 'boolean'
  )
}

export function loadIndicators(): IndicatorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_INDICATORS
    const parsed = JSON.parse(raw) as Partial<IndicatorSettings>
    const mas = Array.isArray(parsed.mas) ? parsed.mas.filter(isMaConfig) : DEFAULT_INDICATORS.mas
    const rsi =
      parsed.rsi && typeof parsed.rsi.enabled === 'boolean' && typeof parsed.rsi.period === 'number'
        ? parsed.rsi
        : DEFAULT_INDICATORS.rsi
    const macd =
      parsed.macd &&
      typeof parsed.macd.enabled === 'boolean' &&
      typeof parsed.macd.fast === 'number' &&
      typeof parsed.macd.slow === 'number' &&
      typeof parsed.macd.signal === 'number' &&
      parsed.macd.fast < parsed.macd.slow
        ? parsed.macd
        : DEFAULT_INDICATORS.macd
    return { mas, rsi, macd }
  } catch {
    return DEFAULT_INDICATORS
  }
}

export function saveIndicators(settings: IndicatorSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* 저장 실패는 무시 */
  }
}

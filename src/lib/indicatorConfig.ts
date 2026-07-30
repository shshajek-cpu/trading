import { MA_PALETTE } from './theme'
import { notifySettingsChanged } from './syncBus'

export type MaType = 'sma' | 'ema' | 'vwma'

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

/** 거래량이 평균의 몇 배일 때 형광으로 표시할지. */
export interface VolumeSurgeConfig {
  enabled: boolean
  /** 평균을 낼 구간 길이 */
  window: number
  /** 1~3단계 배율 문턱 */
  low: number
  mid: number
  high: number
}

export interface IndicatorSettings {
  mas: MaConfig[]
  rsi: RsiConfig
  macd: MacdConfig
  volumeSurge: VolumeSurgeConfig
}

export const DEFAULT_INDICATORS: IndicatorSettings = {
  mas: [
    { id: 'ma-50', type: 'sma', period: 50, color: '#ffd93d', visible: true },
    { id: 'ma-100', type: 'sma', period: 100, color: '#26a69a', visible: true },
    { id: 'ma-200', type: 'sma', period: 200, color: '#ef5350', visible: true },
    { id: 'ma-400', type: 'sma', period: 400, color: '#4fc3f7', visible: true },
    { id: 'vwma-100', type: 'vwma', period: 100, color: '#ffffff', visible: true },
  ],
  rsi: { enabled: true, period: 14 },
  macd: { enabled: true, fast: 12, slow: 26, signal: 9 },
  volumeSurge: { enabled: true, window: 20, low: 2, mid: 3, high: 5 },
}

export function nextMaColor(existing: MaConfig[]): string {
  const used = new Set(existing.map((m) => m.color))
  return MA_PALETTE.find((c) => !used.has(c)) ?? MA_PALETTE[existing.length % MA_PALETTE.length]
}

const STORAGE_KEY = 'trading.indicators.v2'

function isMaConfig(value: unknown): value is MaConfig {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    (m.type === 'sma' || m.type === 'ema' || m.type === 'vwma') &&
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
    const vs = parsed.volumeSurge
    const volumeSurge =
      vs &&
      typeof vs.enabled === 'boolean' &&
      typeof vs.window === 'number' &&
      typeof vs.low === 'number' &&
      typeof vs.mid === 'number' &&
      typeof vs.high === 'number' &&
      vs.low < vs.mid &&
      vs.mid < vs.high
        ? vs
        : DEFAULT_INDICATORS.volumeSurge
    return { mas, rsi, macd, volumeSurge }
  } catch {
    return DEFAULT_INDICATORS
  }
}

export function saveIndicators(settings: IndicatorSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 */
  }
}

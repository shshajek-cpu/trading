import type { Interval } from './binance'

export const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '6h': 21600,
  '8h': 28800,
  '12h': 43200,
  '1d': 86400,
  '3d': 259200,
  '1w': 604800,
  '1M': 2592000,
}

export type IntervalGroup = 'minutes' | 'hours' | 'days'

export interface IntervalInfo {
  id: Interval
  /** Toolbar label, TradingView style: 1m, 4h, D, W, M. */
  short: string
  /** Menu label. */
  label: string
  group: IntervalGroup
}

/** Every interval Binance USDT-M futures serves, keyed by id. */
export const INTERVAL_INFO: Record<Interval, IntervalInfo> = {
  '1m': { id: '1m', short: '1m', label: '1분', group: 'minutes' },
  '3m': { id: '3m', short: '3m', label: '3분', group: 'minutes' },
  '5m': { id: '5m', short: '5m', label: '5분', group: 'minutes' },
  '15m': { id: '15m', short: '15m', label: '15분', group: 'minutes' },
  '30m': { id: '30m', short: '30m', label: '30분', group: 'minutes' },
  '1h': { id: '1h', short: '1h', label: '1시간', group: 'hours' },
  '2h': { id: '2h', short: '2h', label: '2시간', group: 'hours' },
  '4h': { id: '4h', short: '4h', label: '4시간', group: 'hours' },
  '6h': { id: '6h', short: '6h', label: '6시간', group: 'hours' },
  '8h': { id: '8h', short: '8h', label: '8시간', group: 'hours' },
  '12h': { id: '12h', short: '12h', label: '12시간', group: 'hours' },
  '1d': { id: '1d', short: 'D', label: '1일', group: 'days' },
  '3d': { id: '3d', short: '3D', label: '3일', group: 'days' },
  '1w': { id: '1w', short: 'W', label: '1주', group: 'days' },
  '1M': { id: '1M', short: 'M', label: '1개월', group: 'days' },
}

/** Menu order. */
export const INTERVALS: IntervalInfo[] = Object.values(INTERVAL_INFO)

export const INTERVAL_GROUPS: { id: IntervalGroup; label: string }[] = [
  { id: 'minutes', label: '분' },
  { id: 'hours', label: '시간' },
  { id: 'days', label: '일' },
]

export const DEFAULT_FAVORITE_INTERVALS: Interval[] = ['1m', '15m', '1h', '4h', '1d']

export function isInterval(value: unknown): value is Interval {
  return typeof value === 'string' && Object.hasOwn(INTERVAL_INFO, value)
}

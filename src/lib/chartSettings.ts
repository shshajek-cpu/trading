import { notifySettingsChanged } from './syncBus'
import type { ThemeName } from './theme'

/** Chart settings dialog state (TradingView ⚙ → Symbol / Status line / Scales / Canvas). */
export interface ChartSettings {
  theme: ThemeName
  /** Candle / bar colors. Wicks and borders follow the body color. */
  upColor: string
  downColor: string
  /** Status line (legend) */
  showLegendOhlc: boolean
  showIndicatorLegend: boolean
  /** Scales */
  showCountdown: boolean
  showLastPriceLabel: boolean
  /** Canvas */
  grid: 'both' | 'vertical' | 'horizontal' | 'none'
  crosshair: 'normal' | 'magnet'
  showWatermark: boolean
  /** 'UTC', 'local' (browser zone) or an IANA zone such as 'Asia/Seoul'. */
  timezone: string
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  theme: 'dark',
  upColor: '#089981',
  downColor: '#f23645',
  showLegendOhlc: true,
  showIndicatorLegend: true,
  showCountdown: true,
  showLastPriceLabel: true,
  grid: 'both',
  crosshair: 'normal',
  showWatermark: false,
  timezone: 'Asia/Seoul',
}

/** Zones offered by the bottom-bar timezone menu and the settings dialog. */
export const TIMEZONES: { id: string; label: string }[] = [
  { id: 'UTC', label: 'UTC' },
  { id: 'local', label: '브라우저 시간대' },
  { id: 'Asia/Seoul', label: '(UTC+9) 서울' },
  { id: 'Asia/Tokyo', label: '(UTC+9) 도쿄' },
  { id: 'Asia/Shanghai', label: '(UTC+8) 상하이' },
  { id: 'Asia/Singapore', label: '(UTC+8) 싱가포르' },
  { id: 'Europe/London', label: '(UTC+0/+1) 런던' },
  { id: 'Europe/Berlin', label: '(UTC+1/+2) 베를린' },
  { id: 'America/New_York', label: '(UTC-5/-4) 뉴욕' },
  { id: 'America/Chicago', label: '(UTC-6/-5) 시카고' },
  { id: 'America/Los_Angeles', label: '(UTC-8/-7) 로스앤젤레스' },
]

const STORAGE_KEY = 'trading.chartSettings.v1'

export function loadChartSettings(): ChartSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CHART_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Record<keyof ChartSettings, unknown>>
    const next: ChartSettings = { ...DEFAULT_CHART_SETTINGS }
    for (const key of Object.keys(DEFAULT_CHART_SETTINGS) as (keyof ChartSettings)[]) {
      const value = parsed[key]
      // Keep only values whose type matches the default — a stale or foreign blob must not break the chart.
      if (typeof value === typeof DEFAULT_CHART_SETTINGS[key]) {
        ;(next as unknown as Record<string, unknown>)[key] = value
      }
    }
    if (next.theme !== 'dark' && next.theme !== 'light') next.theme = DEFAULT_CHART_SETTINGS.theme
    if (!['both', 'vertical', 'horizontal', 'none'].includes(next.grid)) next.grid = 'both'
    if (next.crosshair !== 'normal' && next.crosshair !== 'magnet') next.crosshair = 'normal'
    return next
  } catch {
    return DEFAULT_CHART_SETTINGS
  }
}

export function saveChartSettings(settings: ChartSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    notifySettingsChanged()
  } catch {
    /* quota errors keep the in-memory value */
  }
}

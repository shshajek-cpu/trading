import { notifySettingsChanged } from './syncBus'
import { isValidTimeZone } from './timezone'
import type { ThemeName } from './theme'

/** Chart settings dialog state (TradingView ⚙ → Symbol / Status line / Scales / Canvas). */
export interface ChartSettings {
  theme: ThemeName
  /** Candle / bar colors. Wicks and borders follow the body color. */
  upColor: string
  downColor: string
  /** Status line (legend): 왼쪽 위 심볼 이름 줄 + 시고저종 줄. 끄면 둘 다 숨긴다. */
  showStatusLine: boolean
  showLegendOhlc: boolean
  showIndicatorLegend: boolean
  /** Scales */
  showCountdown: boolean
  showLastPriceLabel: boolean
  /** 현재가에 가로로 긋는 얇은 점선(TradingView "가격선"). */
  showPriceLine: boolean
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
  showStatusLine: true,
  showLegendOhlc: true,
  showIndicatorLegend: true,
  showCountdown: true,
  showLastPriceLabel: true,
  showPriceLine: true,
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
    // 모르는 시간대 이름은 Intl 이 RangeError 를 던져 앱 전체가 멈춘다.
    if (!isValidTimeZone(next.timezone)) next.timezone = DEFAULT_CHART_SETTINGS.timezone
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

/** 범례(심볼 이름·시고저종 줄 또는 지표 이름 줄)가 하나라도 보이는지 — 상단 바 범례 버튼의 눌림 상태. */
export function legendShown(s: ChartSettings): boolean {
  return s.showStatusLine || s.showIndicatorLegend
}

/** 범례 버튼: 하나라도 보이면 모두 숨기고, 모두 숨었으면 모두 보인다. 세부는 설정 → 상태 줄에서 따로 켠다. */
export function toggleLegend(s: ChartSettings): ChartSettings {
  const show = !legendShown(s)
  return { ...s, showStatusLine: show, showIndicatorLegend: show }
}

import { createIndicator, migrateV2, toIndicatorInstance, type IndicatorInstance } from './indicatorConfig'
import { notifySettingsChanged } from './syncBus'

/*
 * 지표 설정·템플릿의 localStorage 저장/불러오기.
 * 지표 모델(indicatorConfig)은 브라우저 밖(푸시 워커)에서도 쓰므로 저장소를 만지는 코드는 여기 둔다.
 */

const STORAGE_KEY = 'trading.indicators.v3'
const LEGACY_KEY = 'trading.indicators.v2'
const TEMPLATE_KEY = 'trading.indicatorTemplates.v1'

export function loadIndicators(): IndicatorInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.map(toIndicatorInstance).filter((i): i is IndicatorInstance => i !== null)
      }
    }
    // v3 가 없으면 v2 를 옮겨 온다.
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const migrated = migrateV2(legacy)
      if (migrated) {
        saveIndicators(migrated)
        return migrated
      }
    }
    // 신규 사용자: TradingView 기본값 = 거래량 하나.
    return [createIndicator('volume', [])]
  } catch {
    return [createIndicator('volume', [])]
  }
}

export function saveIndicators(list: IndicatorInstance[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 — 다음 저장에서 회복 */
  }
}

/* ── 템플릿 ───────────────────────────────────────────────────────────── */

export interface IndicatorTemplate {
  id: string
  name: string
  indicators: Omit<IndicatorInstance, 'id'>[]
}

function isTemplate(v: unknown): v is IndicatorTemplate {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  return typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.indicators)
}

export function loadTemplates(): IndicatorTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isTemplate) : []
  } catch {
    return []
  }
}

export function saveTemplates(t: IndicatorTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 */
  }
}

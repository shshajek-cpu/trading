import { createLiveStore } from './liveStore'
import { notifySettingsChanged } from './syncBus'

/** 알림 설정 — 모든 기기가 함께 쓴다(동기화 키). */
export interface AlertSettings {
  /** 새로 그린 수평선(과 알림을 걸 수 있는 선·도형)에 알림을 켠 채로 둔다. */
  autoLineAlert: boolean
  /** 앱 안에서 알림이 울릴 때 소리를 낸다. */
  sound: boolean
}

export const ALERT_SETTINGS_KEY = 'trading.alertSettings.v1'

export const DEFAULT_ALERT_SETTINGS: AlertSettings = { autoLineAlert: true, sound: false }

function load(): AlertSettings {
  try {
    const raw = localStorage.getItem(ALERT_SETTINGS_KEY)
    const v: unknown = raw ? JSON.parse(raw) : null
    if (typeof v !== 'object' || v === null) return DEFAULT_ALERT_SETTINGS
    const o = v as Record<string, unknown>
    return {
      autoLineAlert: typeof o.autoLineAlert === 'boolean' ? o.autoLineAlert : DEFAULT_ALERT_SETTINGS.autoLineAlert,
      sound: typeof o.sound === 'boolean' ? o.sound : DEFAULT_ALERT_SETTINGS.sound,
    }
  } catch {
    return DEFAULT_ALERT_SETTINGS
  }
}

/** 지금 알림 설정. 쓰는 컴포넌트는 useLiveStore(alertSettings) 로 구독한다. */
export const alertSettings = createLiveStore<AlertSettings>(load())

// 다른 탭이나 동기화(useSync 가 storage 이벤트를 쏜다)가 바꾼 값을 받는다.
window.addEventListener('storage', (e) => {
  if (e.key === ALERT_SETTINGS_KEY) alertSettings.set(load())
})

export function setAlertSettings(patch: Partial<AlertSettings>): void {
  const next = { ...alertSettings.get(), ...patch }
  try {
    localStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(next))
    notifySettingsChanged()
  } catch {
    /* 저장 실패(용량 초과 등)는 무시 — 메모리 값은 바뀐다 */
  }
  alertSettings.set(next)
}

import { createLiveStore } from './liveStore'
import { notifySettingsChanged } from './syncBus'

/** 알림 기록 한 줄. 앱이 울린 것(app)과, 앱이 나중에 알게 된 서버(푸시) 발송(server). */
export interface AlertLogEntry {
  id: string
  /** 울린 시각(ms). */
  at: number
  symbol: string
  message: string
  source: 'app' | 'server'
  /** 울린 알림·그림 id. 앱과 서버가 같은 발동을 두 번 적지 않게 맞춰 본다. */
  alertId?: string
}

/** 서버가 보낸 푸시 하나(/api/push 가 돌려주는 w:<code>.fires). 감시기(worker)와 모양이 같아야 한다. */
export interface ServerFire {
  id: string
  at: number
  symbol: string
  text: string
}

export const ALERT_LOG_KEY = 'trading.alertLog.v1'
export const ALERT_LOG_MAX = 100

/** 앱과 서버가 같은 발동을 각자 울렸다고 보는 시각 차. 서버는 1분마다 보므로 넉넉히 잡는다. */
const SAME_FIRE_MS = 3 * 60_000

function isEntry(v: unknown): v is AlertLogEntry {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    typeof e.at === 'number' &&
    typeof e.symbol === 'string' &&
    typeof e.message === 'string' &&
    (e.source === 'app' || e.source === 'server') &&
    (e.alertId === undefined || typeof e.alertId === 'string')
  )
}

function load(): AlertLogEntry[] {
  try {
    const raw = localStorage.getItem(ALERT_LOG_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    // 두 기기의 기록을 id 별로 합치면 한도를 넘을 수 있다 — 최신순으로 자른다.
    return Array.isArray(parsed) ? parsed.filter(isEntry).sort((a, b) => b.at - a.at).slice(0, ALERT_LOG_MAX) : []
  } catch {
    return []
  }
}

/** 알림 기록(최신순, 최대 ALERT_LOG_MAX). 쓰는 컴포넌트는 useLiveStore(alertLog) 로 구독한다. */
export const alertLog = createLiveStore<AlertLogEntry[]>(load())

// 다른 탭이나 동기화가 합친 기록을 받는다.
window.addEventListener('storage', (e) => {
  if (e.key === ALERT_LOG_KEY) alertLog.set(load())
})

function save(next: AlertLogEntry[]): void {
  try {
    localStorage.setItem(ALERT_LOG_KEY, JSON.stringify(next))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 — 메모리 기록은 남는다 */
  }
  alertLog.set(next)
}

/** 기록을 더한다. 같은 id 는 한 번만, 최신순으로 ALERT_LOG_MAX 개까지 남긴다. */
export function logAlerts(entries: readonly AlertLogEntry[]): void {
  const prev = alertLog.get()
  const have = new Set(prev.map((e) => e.id))
  const fresh = entries.filter((e) => !have.has(e.id))
  if (fresh.length === 0) return
  save([...fresh, ...prev].sort((a, b) => b.at - a.at).slice(0, ALERT_LOG_MAX))
}

/** 앱이 울린 알림 하나를 적는다. */
export function logAppAlert(alertId: string, symbol: string, message: string): void {
  const at = Date.now()
  logAlerts([{ id: `app-${alertId}-${at}`, at, symbol, message, source: 'app', alertId }])
}

/**
 * 서버가 보낸 푸시를 적는다. 이미 적은 것, 그리고 앱이 같은 알림을 같은 무렵(SAME_FIRE_MS)에 울려 적어 둔 것은 건너뛴다 —
 * 앱이 열려 있으면 앱과 서버가 함께 울린다(OS 는 태그로 하나로 합친다).
 */
export function logServerFires(fires: readonly ServerFire[]): void {
  const prev = alertLog.get()
  logAlerts(
    fires
      .filter((f) => !prev.some((e) => e.source === 'app' && e.alertId === f.id && Math.abs(e.at - f.at) < SAME_FIRE_MS))
      .map((f) => ({ id: `srv-${f.id}-${f.at}`, at: f.at, symbol: f.symbol, message: f.text, source: 'server', alertId: f.id })),
  )
}

export function clearAlertLog(): void {
  if (alertLog.get().length > 0) save([])
}

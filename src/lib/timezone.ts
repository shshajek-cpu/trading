/**
 * 차트 시간대(settings.timezone) 계산. 'local' 은 브라우저 시간대, 그 밖에는 IANA 이름("Asia/Seoul", "UTC").
 */

/** Intl 의 timeZone 옵션 값. 'local' 은 브라우저 기본(undefined). */
export function intlZone(tz: string): string | undefined {
  return tz === 'local' ? undefined : tz
}

/** 브라우저가 아는 시간대 이름인지. 저장본이 깨졌거나 다른 빌드에서 왔으면 Intl 이 RangeError 로 앱을 멈춘다. */
export function isValidTimeZone(tz: string): boolean {
  if (tz === 'local') return true
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** 시간대 tz 에서 epochMs 순간의 UTC 대비 차이(ms). */
export function zoneOffsetMs(epochMs: number, tz: string): number {
  if (tz === 'local') return -new Date(epochMs).getTimezoneOffset() * 60_000
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(epochMs))
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - epochMs
}

/** "2026-09-23" + "14:30" (tz 벽시계) → unix 초. 서머타임 경계는 한 번 더 맞춘다. */
export function zonedToEpoch(date: string, time: string, tz: string): number | null {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '00:00').split(':').map(Number)
  if (!y || !m || !d) return null
  const wall = Date.UTC(y, m - 1, d, hh || 0, mm || 0)
  const first = zoneOffsetMs(wall, tz)
  const second = zoneOffsetMs(wall - first, tz)
  return Math.floor((wall - second) / 1000)
}

/** 지금을 tz 벽시계의 날짜·시각 문자열로. */
export function nowIn(tz: string): { date: string; time: string } {
  const shifted = new Date(Date.now() + zoneOffsetMs(Date.now(), tz))
  const iso = shifted.toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) }
}

import { COOLDOWN_MAX, DEFAULT_HYSTERESIS, HYSTERESIS_MAX, type AlertTiming, type RepeatMode } from './alertRules'

/** 알림 창의 반복·만료 입력(문자열 그대로 — 저장할 때 timingFromDraft 로 검사한다). */
export interface TimingDraft {
  repeat: RepeatMode
  hysteresis: string
  cooldown: string
  expires: boolean
  /** datetime-local 값(기기 시간대, 'YYYY-MM-DDTHH:mm'). */
  expiresAt: string
}

/** 만료를 켤 때 처음 채우는 기간. */
const DEFAULT_EXPIRY_MS = 30 * 24 * 3600_000

function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function timingDraftOf(t: AlertTiming | undefined): TimingDraft {
  return {
    repeat: t?.repeat ?? 'once',
    hysteresis: String(t?.hysteresis ?? DEFAULT_HYSTERESIS),
    cooldown: t?.cooldown ? String(t.cooldown) : '',
    expires: t?.expiresAt !== undefined,
    expiresAt: toLocalInput(t?.expiresAt ?? Date.now() + DEFAULT_EXPIRY_MS),
  }
}

/** 입력을 저장할 설정으로. 틀렸으면 알릴 문구. repeat=false 면 반복 칸은 보지 않는다(지표 알림·수직선). */
export function timingFromDraft(d: TimingDraft, repeat: boolean): AlertTiming | string {
  const out: AlertTiming = {}
  if (repeat && d.repeat === 'every') {
    const h = Number(d.hysteresis)
    if (d.hysteresis.trim() === '' || !Number.isFinite(h) || h < 0 || h > HYSTERESIS_MAX) {
      return `다시 걸리는 거리는 0~${HYSTERESIS_MAX}% 사이로 넣으세요.`
    }
    const c = d.cooldown.trim() === '' ? 0 : Number(d.cooldown)
    if (!Number.isFinite(c) || c < 0 || c > COOLDOWN_MAX) return `재알림 대기는 0~${COOLDOWN_MAX}분 사이로 넣으세요.`
    out.repeat = 'every'
    out.hysteresis = h
    if (c > 0) out.cooldown = c
  }
  if (d.expires) {
    const at = new Date(d.expiresAt).getTime()
    if (!Number.isFinite(at)) return '만료 시각을 넣으세요.'
    if (at <= Date.now()) return '만료 시각은 지금보다 뒤여야 합니다.'
    out.expiresAt = at
  }
  return out
}

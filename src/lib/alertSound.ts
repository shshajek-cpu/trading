/**
 * 앱 안 알림 소리 — 파일 없이 Web Audio 로 짧은 두 음을 낸다.
 * 브라우저는 사용자 조작 전에는 소리를 막으므로, 처음 누르거나 키를 칠 때 오디오를 깨워 둔다(primeAlertSound).
 */
let ctx: AudioContext | null = null

function context(): AudioContext | null {
  if (ctx) return ctx
  if (typeof AudioContext === 'undefined') return null
  ctx = new AudioContext()
  return ctx
}

/** 사용자 조작 안에서 불러 오디오를 깨운다(소리 설정을 켤 때, 그리고 켜져 있으면 첫 조작 때). */
export function primeAlertSound(): void {
  const c = context()
  if (c && c.state === 'suspended') void c.resume().catch(() => {})
}

/** 알림 소리(880Hz → 660Hz, 약 0.4초). 오디오를 아직 깨우지 못했으면 조용히 넘어간다. */
export function playAlertSound(): void {
  const c = context()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => {})
  const start = c.currentTime + 0.01
  for (const [i, freq] of [880, 660].entries()) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    const t = start + i * 0.18
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    osc.connect(gain).connect(c.destination)
    osc.start(t)
    osc.stop(t + 0.22)
  }
}

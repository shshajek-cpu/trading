import type { Interval } from './binance'
import { INTERVAL_SECONDS } from './intervals'

const UNIT_SECONDS: Record<string, number> = { m: 60, h: 3600, H: 3600, d: 86400, D: 86400, w: 604800, W: 604800, M: 2592000 }

function bySeconds(seconds: number): Interval | null {
  for (const [id, secs] of Object.entries(INTERVAL_SECONDS)) {
    if (secs === seconds) return id as Interval
  }
  return null
}

/** "5"→5m, "60"/"1h"→1h, "240"→4h, "D"/"1D"→1d, "W"→1w, "M"→1M. Case matters: m=분, M=월. */
export function parseQuickInterval(raw: string): Interval | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return bySeconds(Number(s) * 60)
  const m = /^(\d*)([mMhHdDwW])$/.exec(s)
  if (!m) return null
  const count = m[1] === '' ? 1 : Number(m[1])
  return bySeconds(count * UNIT_SECONDS[m[2]])
}

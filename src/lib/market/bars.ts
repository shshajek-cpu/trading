/**
 * 봉 경계와 묶기. 거래소에 없는 주기를 작은 봉으로 만들 때 앱(provider)과 푸시 워커가 같이 쓴다.
 * window·document·localStorage 를 쓰지 않는다(워커가 번들한다).
 */
import { INTERVAL_SECONDS } from '../intervals'
import type { Candle, Interval } from './types'

const DAY = 86_400

/**
 * 봉의 시작 시각(초). t(초)가 속한 봉을 돌려준다.
 * - anchor 가 없으면 바이낸스 경계: 분·시간·1d 는 Unix 시각을 주기로 내림(UTC), 3d 는 1970-01-02 부터 3 일씩
 *   (바이낸스 3d 봉은 Unix 3 일 배수보다 하루 늦게 시작한다), 1w 는 월요일 00:00 UTC, 1M 은 달력 월 1 일 00:00 UTC.
 * - anchor(초)를 주면 그 시각에서 주기씩 끊는다 — 야후 주식의 2h·4h 처럼 장 시작(09:30 등)부터 세는 봉.
 */
export function barStart(interval: Interval, t: number, anchor?: number): number {
  if (interval === '1M') {
    const d = new Date(t * 1000)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000
  }
  const size = INTERVAL_SECONDS[interval]
  const base = anchor ?? (interval === '3d' ? DAY : interval === '1w' ? 4 * DAY : 0)
  return Math.floor((t - base) / size) * size + base
}

/** 봉이 닫히는 시각(초) — 다음 봉의 시작. */
export function barEnd(interval: Interval, start: number): number {
  if (interval === '1M') {
    const d = new Date(start * 1000)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000
  }
  return start + INTERVAL_SECONDS[interval]
}

/**
 * 작은 주기 봉(시간순)을 interval 봉으로 묶는다(경계는 barStart — anchor 는 거기로 넘긴다).
 * 맨 앞의 덜 찬 봉(경계에서 시작하지 않은 봉)은 버린다 — 과거를 더 받으면 그 봉이 온전히 채워진다.
 */
export function aggregate(candles: Candle[], interval: Interval, anchor?: number): Candle[] {
  const out: Candle[] = []
  for (const c of candles) {
    const time = barStart(interval, c.time, anchor)
    const last = out.at(-1)
    if (last?.time === time) {
      last.high = Math.max(last.high, c.high)
      last.low = Math.min(last.low, c.low)
      last.close = c.close
      last.volume += c.volume
    } else {
      out.push({ time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })
    }
  }
  if (out.length > 0 && out[0].time !== candles[0].time) out.shift()
  return out
}

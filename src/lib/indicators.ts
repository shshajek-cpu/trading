import type { Time } from 'lightweight-charts'

/**
 * 시간 타입은 호출측이 정한다. binance.ts 는 초 단위 `number` 를,
 * lightweight-charts 는 `Time` 을 쓰므로 둘 다 그대로 통과시키기 위함이다.
 */
export interface Candle<T = Time> {
  time: T
  close: number
}

/** VWMA 는 거래량이 있어야 계산된다. */
export interface VolumeCandle<T = Time> extends Candle<T> {
  volume: number
}

export interface LinePoint<T = Time> {
  time: T
  value: number
}

export interface MacdResult<T = Time> {
  macd: LinePoint<T>[]
  signal: LinePoint<T>[]
  histogram: LinePoint<T>[]
}

export function sma<T>(candles: Candle<T>[], period: number): LinePoint<T>[] {
  if (!Number.isFinite(period) || period < 1 || candles.length < period) return []

  const out: LinePoint<T>[] = []
  let sum = 0
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close
    if (i >= period) sum -= candles[i - period].close
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period })
  }
  return out
}

/**
 * 거래량 가중 이동평균(VWMA).
 *
 * 그냥 평균은 모든 봉을 똑같이 취급하지만, 이건 거래량이 많았던 봉의 가격에
 * 더 무게를 준다. 사람이 많이 붙은 가격이 진짜 가격에 가깝다는 생각이다.
 */
export function vwma<T>(candles: VolumeCandle<T>[], period: number): LinePoint<T>[] {
  if (!Number.isFinite(period) || period < 1 || candles.length < period) return []

  const out: LinePoint<T>[] = []
  let pv = 0
  let vol = 0
  for (let i = 0; i < candles.length; i++) {
    pv += candles[i].close * candles[i].volume
    vol += candles[i].volume
    if (i >= period) {
      pv -= candles[i - period].close * candles[i - period].volume
      vol -= candles[i - period].volume
    }
    // 거래량이 0인 구간은 나눌 수 없다 — 단순 평균으로 물러선다.
    if (i >= period - 1) {
      const window = candles.slice(i - period + 1, i + 1)
      const value = vol > 0 ? pv / vol : window.reduce((a, c) => a + c.close, 0) / period
      out.push({ time: candles[i].time, value })
    }
  }
  return out
}

export function ema<T>(candles: Candle<T>[], period: number): LinePoint<T>[] {
  if (!Number.isFinite(period) || period < 1 || candles.length < period) return []

  const k = 2 / (period + 1)
  const out: LinePoint<T>[] = []

  let seed = 0
  for (let i = 0; i < period; i++) seed += candles[i].close
  let prev = seed / period
  out.push({ time: candles[period - 1].time, value: prev })

  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k)
    out.push({ time: candles[i].time, value: prev })
  }
  return out
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export function rsi<T>(candles: Candle<T>[], period = 14): LinePoint<T>[] {
  if (!Number.isFinite(period) || period < 1 || candles.length < period + 1) return []

  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close
    if (diff >= 0) gainSum += diff
    else lossSum -= diff
  }

  let avgGain = gainSum / period
  let avgLoss = lossSum / period

  const out: LinePoint<T>[] = [{ time: candles[period].time, value: rsiFrom(avgGain, avgLoss) }]

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out.push({ time: candles[i].time, value: rsiFrom(avgGain, avgLoss) })
  }
  return out
}

export function macd<T>(
  candles: Candle<T>[],
  fast = 12,
  slow = 26,
  signal = 9,
): MacdResult<T> {
  const empty: MacdResult<T> = { macd: [], signal: [], histogram: [] }
  if (!Number.isFinite(fast) || !Number.isFinite(slow) || !Number.isFinite(signal)) return empty
  if (fast < 1 || slow < 1 || signal < 1 || fast >= slow) return empty
  if (candles.length < slow) return empty

  const fastEma = ema(candles, fast)
  const slowEma = ema(candles, slow)

  // fastEma starts at index fast-1, slowEma at slow-1: align both on slowEma's start
  const offset = fastEma.length - slowEma.length
  const macdLine: LinePoint<T>[] = slowEma.map((p, i) => ({
    time: p.time,
    value: fastEma[i + offset].value - p.value,
  }))

  if (macdLine.length < signal) return { macd: macdLine, signal: [], histogram: [] }

  const signalLine = ema(
    macdLine.map((p) => ({ time: p.time, close: p.value })),
    signal,
  )

  const signalOffset = macdLine.length - signalLine.length
  const histogram: LinePoint<T>[] = signalLine.map((p, i) => ({
    time: p.time,
    value: macdLine[i + signalOffset].value - p.value,
  }))

  return { macd: macdLine, signal: signalLine, histogram }
}

/** 거래량 급증 단계. 0 은 평범, 1~3 은 세기. */
export type VolumeTier = 0 | 1 | 2 | 3

/** 단계별 형광색. 평범한 봉은 기존 초록·빨강을 그대로 쓴다. */
export const VOLUME_TIER_COLORS: Record<Exclude<VolumeTier, 0>, string> = {
  1: '#fff23d',
  2: '#ff8a00',
  3: '#ff17d4',
}

export const VOLUME_TIER_LABELS: Record<Exclude<VolumeTier, 0>, string> = {
  1: '보통',
  2: '강함',
  3: '폭발',
}

/**
 * 각 봉의 거래량이 직전 평균의 몇 배인지 재서 단계를 매긴다.
 *
 * 고정 기준을 쓸 수 없다 — 종목마다 거래량 단위가 전혀 다르다. 그래서 자기
 * 직전 구간과 비교한 배율로 판단한다.
 *
 * 평균은 **자기 자신을 뺀** 직전 20봉으로 낸다. 급증한 봉이 평균에 섞이면
 * 스스로를 희석해 배율이 낮게 나온다.
 */
export function volumeTiers(
  volumes: number[],
  window = 20,
  thresholds: { low: number; mid: number; high: number } = { low: 2, mid: 3, high: 5 },
): VolumeTier[] {
  const out: VolumeTier[] = new Array(volumes.length).fill(0)
  if (volumes.length <= window) return out

  let sum = 0
  for (let i = 0; i < window; i++) sum += volumes[i]

  for (let i = window; i < volumes.length; i++) {
    const avg = sum / window
    if (avg > 0) {
      const r = volumes[i] / avg
      out[i] = r >= thresholds.high ? 3 : r >= thresholds.mid ? 2 : r >= thresholds.low ? 1 : 0
    }
    // 창을 한 칸 밀어 자기 자신은 항상 평균에서 제외한다.
    sum += volumes[i] - volumes[i - window]
  }
  return out
}

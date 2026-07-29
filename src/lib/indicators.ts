import type { Time } from 'lightweight-charts'

/**
 * 시간 타입은 호출측이 정한다. binance.ts 는 초 단위 `number` 를,
 * lightweight-charts 는 `Time` 을 쓰므로 둘 다 그대로 통과시키기 위함이다.
 */
export interface Candle<T = Time> {
  time: T
  close: number
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

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

/** 고가·저가·시가가 필요한 지표(스토캐스틱, ATR, CCI, ADX 등)용. */
export interface OhlcCandle<T = Time> extends Candle<T> {
  open: number
  high: number
  low: number
}

/** 고저 + 거래량이 모두 필요한 지표(MFI, VWAP)용. */
export interface OhlcvCandle<T = Time> extends OhlcCandle<T>, VolumeCandle<T> {}

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

/* ────────────────────────────────────────────────────────────────────────
   추가 지표들. 모두 순수 함수 — 같은 입력이면 같은 출력, 부수효과 없음.
   시간 타입 T 는 호출측이 정한다(앱은 초 단위 number 를 쓴다).
   ──────────────────────────────────────────────────────────────────────── */

/** 가중 이동평균(WMA). 최근 봉일수록 선형으로 더 무겁게 둔다. */
export function wma<T>(candles: Candle<T>[], period: number): LinePoint<T>[] {
  if (!Number.isFinite(period) || period < 1 || candles.length < period) return []
  const out: LinePoint<T>[] = []
  const denom = (period * (period + 1)) / 2
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) sum += candles[i - period + 1 + j].close * (j + 1)
    out.push({ time: candles[i].time, value: sum / denom })
  }
  return out
}

export interface BollingerResult<T = Time> {
  basis: LinePoint<T>[]
  upper: LinePoint<T>[]
  lower: LinePoint<T>[]
}

/** 볼린저 밴드. 중심선(SMA) ± 표준편차×배수. */
export function bollinger<T>(candles: Candle<T>[], period = 20, mult = 2): BollingerResult<T> {
  const empty: BollingerResult<T> = { basis: [], upper: [], lower: [] }
  if (!Number.isFinite(period) || period < 1 || candles.length < period) return empty
  const basis: LinePoint<T>[] = []
  const upper: LinePoint<T>[] = []
  const lower: LinePoint<T>[] = []
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close
    const mean = sum / period
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) {
      const d = candles[j].close - mean
      variance += d * d
    }
    const sd = Math.sqrt(variance / period)
    const t = candles[i].time
    basis.push({ time: t, value: mean })
    upper.push({ time: t, value: mean + mult * sd })
    lower.push({ time: t, value: mean - mult * sd })
  }
  return { basis, upper, lower }
}

/**
 * VWAP(거래량 가중 평균가). UTC 하루 세션마다 누적을 초기화한다.
 * time 은 초 단위 숫자로 취급한다(앱 전용).
 */
export function vwap<T>(candles: OhlcvCandle<T>[]): LinePoint<T>[] {
  if (candles.length === 0) return []
  const out: LinePoint<T>[] = []
  let day = -1
  let cumPV = 0
  let cumV = 0
  for (const c of candles) {
    const t = Number(c.time as unknown as number)
    const d = Math.floor(t / 86400)
    if (d !== day) {
      day = d
      cumPV = 0
      cumV = 0
    }
    const tp = (c.high + c.low + c.close) / 3
    cumPV += tp * c.volume
    cumV += c.volume
    out.push({ time: c.time, value: cumV > 0 ? cumPV / cumV : tp })
  }
  return out
}

export interface IchimokuResult<T = Time> {
  tenkan: LinePoint<T>[]
  kijun: LinePoint<T>[]
  spanA: LinePoint<T>[]
  spanB: LinePoint<T>[]
  chikou: LinePoint<T>[]
}

function hh<T>(candles: OhlcCandle<T>[], end: number, period: number): number {
  let m = -Infinity
  for (let i = end - period + 1; i <= end; i++) if (candles[i].high > m) m = candles[i].high
  return m
}
function ll<T>(candles: OhlcCandle<T>[], end: number, period: number): number {
  let m = Infinity
  for (let i = end - period + 1; i <= end; i++) if (candles[i].low < m) m = candles[i].low
  return m
}

/** 봉 간격(초)을 추정한다 — 이치모쿠 구름을 미래로 밀 때 쓴다. */
function stepOf<T>(candles: Candle<T>[]): number {
  const n = candles.length
  if (n < 2) return 0
  return Number(candles[n - 1].time as unknown as number) - Number(candles[n - 2].time as unknown as number)
}

/** 일목균형표. 전환·기준·선행A·선행B·후행. 선행선은 disp 봉만큼 미래로, 후행선은 과거로 민다. */
export function ichimoku<T>(
  candles: OhlcCandle<T>[],
  conv = 9,
  base = 26,
  spanBLen = 52,
  disp = 26,
): IchimokuResult<T> {
  const empty: IchimokuResult<T> = { tenkan: [], kijun: [], spanA: [], spanB: [], chikou: [] }
  if (candles.length < spanBLen) return empty
  const tenkan: LinePoint<T>[] = []
  const kijun: LinePoint<T>[] = []
  const spanA: LinePoint<T>[] = []
  const spanB: LinePoint<T>[] = []
  const chikou: LinePoint<T>[] = []
  const step = stepOf(candles)
  const lastT = Number(candles[candles.length - 1].time as unknown as number)
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time
    if (i >= conv - 1) tenkan.push({ time: t, value: (hh(candles, i, conv) + ll(candles, i, conv)) / 2 })
    if (i >= base - 1) kijun.push({ time: t, value: (hh(candles, i, base) + ll(candles, i, base)) / 2 })
    // 후행 스팬: 현재 종가를 disp 봉 과거 위치에 찍는다.
    if (i - disp >= 0) chikou.push({ time: candles[i - disp].time, value: candles[i].close })
  }
  // 선행 스팬 A/B: 값 계산 후 disp 봉만큼 미래 시각으로 민다.
  for (let i = 0; i < candles.length; i++) {
    if (i < base - 1) continue
    const tenkanV = (hh(candles, i, conv) + ll(candles, i, conv)) / 2
    const kijunV = (hh(candles, i, base) + ll(candles, i, base)) / 2
    const futureIdx = i + disp
    const futureT = (
      futureIdx < candles.length
        ? candles[futureIdx].time
        : ((lastT + (futureIdx - (candles.length - 1)) * step) as unknown as T)
    )
    spanA.push({ time: futureT, value: (tenkanV + kijunV) / 2 })
    if (i >= spanBLen - 1) spanB.push({ time: futureT, value: (hh(candles, i, spanBLen) + ll(candles, i, spanBLen)) / 2 })
  }
  return { tenkan, kijun, spanA, spanB, chikou }
}

/** 파라볼릭 SAR. 추세 반전점을 점으로 찍는다. */
export function psar<T>(candles: OhlcCandle<T>[], step = 0.02, stepInc = 0.02, max = 0.2): LinePoint<T>[] {
  if (candles.length < 2) return []
  const out: LinePoint<T>[] = []
  let bull = candles[1].close >= candles[0].close
  let af = step
  let ep = bull ? candles[0].high : candles[0].low
  let sar = bull ? candles[0].low : candles[0].high
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    sar = sar + af * (ep - sar)
    if (bull) {
      // SAR 은 직전 두 봉 저가보다 아래에 있어야 한다.
      sar = Math.min(sar, candles[i - 1].low, candles[Math.max(0, i - 2)].low)
      if (c.low < sar) {
        bull = false
        sar = ep
        ep = c.low
        af = step
      } else if (c.high > ep) {
        ep = c.high
        af = Math.min(max, af + stepInc)
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high, candles[Math.max(0, i - 2)].high)
      if (c.high > sar) {
        bull = true
        sar = ep
        ep = c.high
        af = step
      } else if (c.low < ep) {
        ep = c.low
        af = Math.min(max, af + stepInc)
      }
    }
    out.push({ time: c.time, value: sar })
  }
  return out
}

export interface StochResult<T = Time> {
  k: LinePoint<T>[]
  d: LinePoint<T>[]
}

function smaOfPoints<T>(points: LinePoint<T>[], period: number): LinePoint<T>[] {
  if (period <= 1) return points
  if (points.length < period) return []
  const out: LinePoint<T>[] = []
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    sum += points[i].value
    if (i >= period) sum -= points[i - period].value
    if (i >= period - 1) out.push({ time: points[i].time, value: sum / period })
  }
  return out
}

/** 스토캐스틱 %K/%D. kPeriod 관측창, kSmooth 로 %K 평활, dSmooth 로 %D. */
export function stochastic<T>(
  candles: OhlcCandle<T>[],
  kPeriod = 14,
  kSmooth = 1,
  dSmooth = 3,
): StochResult<T> {
  if (candles.length < kPeriod) return { k: [], d: [] }
  const rawK: LinePoint<T>[] = []
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const high = hh(candles, i, kPeriod)
    const low = ll(candles, i, kPeriod)
    const range = high - low
    rawK.push({ time: candles[i].time, value: range === 0 ? 50 : ((candles[i].close - low) / range) * 100 })
  }
  const k = smaOfPoints(rawK, kSmooth)
  const d = smaOfPoints(k, dSmooth)
  return { k, d }
}

/** 스토캐스틱 RSI. RSI 를 다시 스토캐스틱으로 정규화한다. */
export function stochRsi<T>(
  candles: Candle<T>[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
  dSmooth = 3,
): StochResult<T> {
  const r = rsi(candles, rsiPeriod)
  if (r.length < stochPeriod) return { k: [], d: [] }
  const rawK: LinePoint<T>[] = []
  for (let i = stochPeriod - 1; i < r.length; i++) {
    let high = -Infinity
    let low = Infinity
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (r[j].value > high) high = r[j].value
      if (r[j].value < low) low = r[j].value
    }
    const range = high - low
    rawK.push({ time: r[i].time, value: range === 0 ? 50 : ((r[i].value - low) / range) * 100 })
  }
  const k = smaOfPoints(rawK, kSmooth)
  const d = smaOfPoints(k, dSmooth)
  return { k, d }
}

/** 참 범위(TR): 오늘 고저폭과 전일 종가 대비 갭 중 최대. */
function trueRange<T>(candles: OhlcCandle<T>[], i: number): number {
  const c = candles[i]
  if (i === 0) return c.high - c.low
  const prev = candles[i - 1].close
  return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev))
}

/** 평균 실질 범위(ATR). Wilder 평활. */
export function atr<T>(candles: OhlcCandle<T>[], period = 14): LinePoint<T>[] {
  if (candles.length < period + 1) return []
  const out: LinePoint<T>[] = []
  let sum = 0
  for (let i = 1; i <= period; i++) sum += trueRange(candles, i)
  let prev = sum / period
  out.push({ time: candles[period].time, value: prev })
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + trueRange(candles, i)) / period
    out.push({ time: candles[i].time, value: prev })
  }
  return out
}

/** 상품 채널 지수(CCI). */
export function cci<T>(candles: OhlcCandle<T>[], period = 20): LinePoint<T>[] {
  if (candles.length < period) return []
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3)
  const out: LinePoint<T>[] = []
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += tp[j]
    const mean = sum / period
    let dev = 0
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j] - mean)
    const meanDev = dev / period
    out.push({ time: candles[i].time, value: meanDev === 0 ? 0 : (tp[i] - mean) / (0.015 * meanDev) })
  }
  return out
}

/** 온-밸런스 볼륨(OBV). 종가 방향으로 거래량을 누적한다. */
export function obv<T>(candles: VolumeCandle<T>[]): LinePoint<T>[] {
  if (candles.length === 0) return []
  const out: LinePoint<T>[] = [{ time: candles[0].time, value: 0 }]
  let acc = 0
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) acc += candles[i].volume
    else if (candles[i].close < candles[i - 1].close) acc -= candles[i].volume
    out.push({ time: candles[i].time, value: acc })
  }
  return out
}

/** 윌리엄스 %R. -100(과매도) ~ 0(과매수). */
export function williamsR<T>(candles: OhlcCandle<T>[], period = 14): LinePoint<T>[] {
  if (candles.length < period) return []
  const out: LinePoint<T>[] = []
  for (let i = period - 1; i < candles.length; i++) {
    const high = hh(candles, i, period)
    const low = ll(candles, i, period)
    const range = high - low
    out.push({ time: candles[i].time, value: range === 0 ? -50 : ((high - candles[i].close) / range) * -100 })
  }
  return out
}

/** 자금 흐름 지수(MFI). 거래량을 반영한 RSI 격. */
export function mfi<T>(candles: OhlcvCandle<T>[], period = 14): LinePoint<T>[] {
  if (candles.length < period + 1) return []
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3)
  const rmf = candles.map((c, i) => tp[i] * c.volume)
  const out: LinePoint<T>[] = []
  for (let i = period; i < candles.length; i++) {
    let pos = 0
    let neg = 0
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) pos += rmf[j]
      else if (tp[j] < tp[j - 1]) neg += rmf[j]
    }
    const value = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg)
    out.push({ time: candles[i].time, value })
  }
  return out
}

export interface AdxResult<T = Time> {
  adx: LinePoint<T>[]
  plusDI: LinePoint<T>[]
  minusDI: LinePoint<T>[]
}

/** 평균 방향성 지수(ADX) + +DI/-DI. Wilder 평활. */
export function adx<T>(candles: OhlcCandle<T>[], period = 14): AdxResult<T> {
  const empty: AdxResult<T> = { adx: [], plusDI: [], minusDI: [] }
  if (candles.length < period * 2) return empty
  const plusDM: number[] = [0]
  const minusDM: number[] = [0]
  const tr: number[] = [candles[0].high - candles[0].low]
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high
    const down = candles[i - 1].low - candles[i].low
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
    tr.push(trueRange(candles, i))
  }
  // 첫 평활값: 합.
  let trS = 0
  let plusS = 0
  let minusS = 0
  for (let i = 1; i <= period; i++) {
    trS += tr[i]
    plusS += plusDM[i]
    minusS += minusDM[i]
  }
  const plusDI: LinePoint<T>[] = []
  const minusDI: LinePoint<T>[] = []
  const dxList: { time: T; value: number }[] = []
  for (let i = period; i < candles.length; i++) {
    if (i > period) {
      trS = trS - trS / period + tr[i]
      plusS = plusS - plusS / period + plusDM[i]
      minusS = minusS - minusS / period + minusDM[i]
    }
    const pDI = trS === 0 ? 0 : (plusS / trS) * 100
    const mDI = trS === 0 ? 0 : (minusS / trS) * 100
    plusDI.push({ time: candles[i].time, value: pDI })
    minusDI.push({ time: candles[i].time, value: mDI })
    const sum = pDI + mDI
    dxList.push({ time: candles[i].time, value: sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100 })
  }
  // ADX = DX 의 Wilder 평활.
  const adxLine: LinePoint<T>[] = []
  if (dxList.length >= period) {
    let dxSum = 0
    for (let i = 0; i < period; i++) dxSum += dxList[i].value
    let prev = dxSum / period
    adxLine.push({ time: dxList[period - 1].time, value: prev })
    for (let i = period; i < dxList.length; i++) {
      prev = (prev * (period - 1) + dxList[i].value) / period
      adxLine.push({ time: dxList[i].time, value: prev })
    }
  }
  return { adx: adxLine, plusDI, minusDI }
}

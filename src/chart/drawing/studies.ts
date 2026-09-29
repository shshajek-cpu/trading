/**
 * 봉 값이나 레벨 표로 모양이 정해지는 그림의 순수 계산 — 캔버스·DOM 을 쓰지 않는다.
 * 추세 기반 피보나치 확장, 피보나치 타임 존, 회귀 추세, 고정 범위 볼륨 프로파일.
 */
import type { Candle } from '../../lib/market/types'
import type { Drawing } from '../../lib/drawings'
import { computeVolumeProfile, type VolumeProfile } from '../volumeProfile'

/** 추세 기반 피보나치 확장 레벨(TradingView 기본 표와 같은 값). */
export const FIB_EXT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236] as const

/** 1→2 움직임(p2 − p1)을 셋째 점 p3 에서 level 배만큼 이은 가격. */
export function fibExtensionPrice(p1: number, p2: number, p3: number, level: number): number {
  return p3 + level * (p2 - p1)
}

/** 피보나치 타임 존 배수. 두 점 사이 간격이 1 이다. */
export const FIB_TIME_ZONES = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const

/**
 * 두 점의 논리 인덱스(봉 번호)로 타임 존 세로선 자리를 낸다 — 시각이 아니라 봉 수로 센다.
 * 간격이 0 이면 모든 선이 한 자리라 첫 선만 돌려준다.
 */
export function fibTimeZoneLogicals(l0: number, l1: number): { n: number; logical: number }[] {
  const unit = l1 - l0
  if (unit === 0) return [{ n: 0, logical: l0 }]
  return FIB_TIME_ZONES.map((n) => ({ n, logical: l0 + n * unit }))
}

/** 회귀 추세 위·아래 선이 기준선에서 떨어진 표준편차 배수. */
export const REGRESSION_DEVIATION = 2

/** 종가 = intercept + slope × 봉 번호. stdev 는 잔차의 (모)표준편차, r 은 피어슨 상관계수. */
export interface Regression {
  slope: number
  intercept: number
  stdev: number
  r: number
  /** 계산에 쓴 봉 수. */
  count: number
}

/**
 * time 이 [min(t0,t1), max(t0,t1)] 인 봉들의 종가로 최소제곱 회귀선을 구한다. x 는 캔들 배열의 인덱스(= 논리 인덱스).
 * 봉이 둘 미만이면 null.
 */
export function regressionOf(candles: readonly Candle[], t0: number, t1: number): Regression | null {
  const from = Math.min(t0, t1)
  const to = Math.max(t0, t1)
  const start = lowerBound(candles, from)
  let n = 0
  let sx = 0
  let sy = 0
  let end = start
  for (; end < candles.length && candles[end].time <= to; end++) {
    sx += end
    sy += candles[end].close
    n++
  }
  if (n < 2) return null
  const mx = sx / n
  const my = sy / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = start; i < end; i++) {
    const dx = i - mx
    const dy = candles[i].close - my
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  const slope = sxy / sxx
  const intercept = my - slope * mx
  let sse = 0
  for (let i = start; i < end; i++) {
    const e = candles[i].close - (intercept + slope * i)
    sse += e * e
  }
  const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0
  return { slope, intercept, stdev: Math.sqrt(sse / n), r, count: n }
}

/** 회귀선의 논리 인덱스 자리 값(가격). */
export function regressionValue(reg: Regression, logical: number): number {
  return reg.intercept + reg.slope * logical
}

/** 고정 범위 볼륨 프로파일 행 수·가치 영역 % — 저장본 값이 이상해도 그릴 수 있게 범위로 자른다. */
export function profileOptions(d: Drawing): { rows: number; valueAreaPct: number } {
  const rows = d.style.vpRows
  const va = d.style.vpValueArea
  return {
    rows: typeof rows === 'number' && Number.isFinite(rows) ? Math.min(200, Math.max(4, Math.round(rows))) : 24,
    valueAreaPct: typeof va === 'number' && Number.isFinite(va) ? Math.min(100, Math.max(10, va)) : 70,
  }
}

/** 프로파일 막대 영역 폭: 구간 폭의 30%, 300px 를 넘지 않는다. */
export function profileWidth(rangeWidth: number): number {
  return Math.min(Math.abs(rangeWidth) * 0.3, 300)
}

// 한 화면에서 같은 그림을 그리기·잡기·축 라벨이 여러 번 묻는다. 캔들 배열은 바뀔 때마다 새 배열이라
// 배열을 열쇠로 결과를 붙여 두면 다음 틱에 저절로 버려진다. 끄는 동안 쌓이는 열쇠는 개수로 자른다.
const CACHE_LIMIT = 64
const regressionCache = new WeakMap<readonly Candle[], Map<string, Regression | null>>()
const profileCache = new WeakMap<readonly Candle[], Map<string, VolumeProfile | null>>()

export function cached<T>(
  store: WeakMap<readonly Candle[], Map<string, T>>,
  candles: readonly Candle[],
  key: string,
  make: () => T,
): T {
  let map = store.get(candles)
  if (!map) {
    map = new Map()
    store.set(candles, map)
  }
  if (map.has(key)) return map.get(key) as T
  if (map.size >= CACHE_LIMIT) map.clear()
  const value = make()
  map.set(key, value)
  return value
}

/** 회귀 추세 그림의 회귀선(두 점 시각 사이). */
export function regressionFor(d: Drawing, candles: readonly Candle[]): Regression | null {
  const [a, b] = d.points
  if (!a || !b) return null
  return cached(regressionCache, candles, `${a.time}|${b.time}`, () => regressionOf(candles, a.time, b.time))
}

/** 고정 범위 볼륨 프로파일 그림의 프로파일(두 점 시각 사이, 양끝 포함). */
export function profileFor(d: Drawing, candles: readonly Candle[]): VolumeProfile | null {
  const [a, b] = d.points
  if (!a || !b) return null
  const opts = profileOptions(d)
  const from = Math.min(a.time, b.time)
  const to = Math.max(a.time, b.time)
  return cached(profileCache, candles, `${from}|${to}|${opts.rows}|${opts.valueAreaPct}`, () =>
    computeVolumeProfile(candles as Candle[], from, to, opts),
  )
}

/** time 이상인 첫 봉의 인덱스(시각 오름차순). */
function lowerBound(candles: readonly Candle[], time: number): number {
  let lo = 0
  let hi = candles.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid].time < time) lo = mid + 1
    else hi = mid
  }
  return lo
}

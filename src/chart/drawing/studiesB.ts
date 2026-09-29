/**
 * 봉 값으로 모양이 정해지는 추가 그림(앵커 VWAP·앵커 볼륨 프로파일·바 패턴·예측)의 순수 계산.
 * 캔버스·DOM 을 쓰지 않는다. 결과는 캔들 배열을 열쇠로 붙여 두어 새 봉이 오면 저절로 다시 계산된다.
 */
import type { Candle } from '../../lib/market/types'
import type { Drawing, DrawingPoint } from '../../lib/drawings'
import { computeVolumeProfile, type VolumeProfile } from '../volumeProfile'
import { cached, profileOptions } from './studies'

/** time 을 품는 봉의 인덱스 — time 이하인 마지막 봉. 첫 봉보다 앞이면 0, 봉이 없으면 -1. */
export function barIndexAt(candles: readonly Candle[], time: number): number {
  let lo = 0
  let hi = candles.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid].time <= time) lo = mid + 1
    else hi = mid
  }
  return candles.length === 0 ? -1 : Math.max(0, lo - 1)
}

/** 앵커 VWAP 선: 앵커 봉(start)부터 마지막 봉까지 봉마다의 VWAP 과 거래량 가중 표준편차. */
export interface AnchoredVwap {
  start: number
  vwap: Float64Array
  dev: Float64Array
}

const vwapCache = new WeakMap<readonly Candle[], Map<string, AnchoredVwap | null>>()
const anchoredProfileCache = new WeakMap<readonly Candle[], Map<string, VolumeProfile | null>>()

/**
 * 앵커 시각을 품는 봉부터 끝까지 (고+저+종)/3 을 거래량으로 가중한 누적 평균. 앵커가 마지막 봉 뒤(미래)면 null.
 * 거래량이 아직 0 인 동안은 그 봉의 대표 가격을 쓴다.
 */
export function anchoredVwapOf(candles: readonly Candle[], anchorTime: number): AnchoredVwap | null {
  const n = candles.length
  if (n === 0 || anchorTime > candles[n - 1].time) return null
  const start = barIndexAt(candles, anchorTime)
  const len = n - start
  const vwap = new Float64Array(len)
  const dev = new Float64Array(len)
  let pv = 0
  let vol = 0
  let p2v = 0
  for (let i = 0; i < len; i++) {
    const c = candles[start + i]
    const tp = (c.high + c.low + c.close) / 3
    const v = c.volume > 0 ? c.volume : 0
    pv += tp * v
    vol += v
    p2v += tp * tp * v
    if (vol > 0) {
      const m = pv / vol
      vwap[i] = m
      dev[i] = Math.sqrt(Math.max(0, p2v / vol - m * m))
    } else {
      vwap[i] = tp
      dev[i] = 0
    }
  }
  return { start, vwap, dev }
}

/** 앵커 VWAP 그림의 선(캐시). */
export function vwapFor(d: Drawing, candles: readonly Candle[]): AnchoredVwap | null {
  const a = d.points[0]
  if (!a) return null
  return cached(vwapCache, candles, String(a.time), () => anchoredVwapOf(candles, a.time))
}

/** 앵커 VWAP 표준편차 밴드 수(0·1·2). 저장본 값이 이상하면 0. */
export function vwapBands(d: Drawing): 0 | 1 | 2 {
  const b = d.style.vwapBands
  return b === 1 || b === 2 ? b : 0
}

/** 앵커 볼륨 프로파일: 앵커 봉부터 마지막 봉까지(새 봉이 오면 늘어난다). */
export function anchoredProfileFor(d: Drawing, candles: readonly Candle[]): VolumeProfile | null {
  const a = d.points[0]
  const n = candles.length
  if (!a || n === 0 || a.time > candles[n - 1].time) return null
  const from = candles[barIndexAt(candles, a.time)].time
  const to = candles[n - 1].time
  const opts = profileOptions(d)
  return cached(anchoredProfileCache, candles, `${from}|${to}|${opts.rows}|${opts.valueAreaPct}`, () =>
    computeVolumeProfile(candles as Candle[], from, to, opts),
  )
}

/** 바 패턴이 복사해 둘 수 있는 최대 봉 수(동기화 크기 제한). */
export const BARS_PATTERN_MAX = 500

/** 바 패턴 원본 봉 구간 [i0, i1](인덱스, 양끝 포함). 봉이 없으면 null. */
export function barsSourceRange(candles: readonly Candle[], t0: number, t1: number): [number, number] | null {
  if (candles.length === 0) return null
  const a = barIndexAt(candles, Math.min(t0, t1))
  const b = barIndexAt(candles, Math.max(t0, t1))
  return [a, Math.min(b, a + BARS_PATTERN_MAX - 1)]
}

/** 원본 봉을 첫 봉 시가 기준 상대값 [시, 고, 저, 종] 으로 복사한다 — 어느 가격으로 옮겨도 모양이 같다. */
export function barsSnapshot(candles: readonly Candle[], range: [number, number]): number[][] {
  const base = candles[range[0]].open
  const out: number[][] = []
  for (let i = range[0]; i <= range[1]; i++) {
    const c = candles[i]
    out.push([c.open - base, c.high - base, c.low - base, c.close - base])
  }
  return out
}

/** 저장된 바 패턴 봉(깨진 행은 버린다). */
export function patternBars(d: Drawing): number[][] {
  const bars = d.style.bars
  if (!Array.isArray(bars)) return []
  return bars.filter((b) => Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === 'number' && Number.isFinite(v)))
}

/** 예측 결과: 목표 시각 안에 목표가에 닿았으면 성공, 목표 시각이 지났는데 못 닿았으면 실패, 아직이면 null. */
export function forecastOutcome(candles: readonly Candle[], from: DrawingPoint, to: DrawingPoint): 'success' | 'failure' | null {
  const n = candles.length
  if (n === 0 || to.time <= from.time) return null
  const up = to.price >= from.price
  const start = barIndexAt(candles, from.time) + 1
  for (let i = start; i < n && candles[i].time <= to.time; i++) {
    const c = candles[i]
    if (up ? c.high >= to.price : c.low <= to.price) return 'success'
  }
  return candles[n - 1].time >= to.time ? 'failure' : null
}

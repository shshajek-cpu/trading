import { FEATURE_LABELS, formatFeature, type FeatureSet } from './features'
import type { Pin, PinSide } from './pins'

export interface RuleBand {
  key: keyof FeatureSet
  /** 핀들이 모여 있는 구간 */
  min: number
  max: number
  /** 이 지표가 얼마나 좁게 모였는가 0~1 */
  tightness: number
  /** 반대 방향과 얼마나 갈라지는가 0~1. 이게 높아야 쓸모있는 조건이다. */
  separation: number
  /** 최종 가중치 */
  weight: number
}

export interface Rule {
  side: PinSide
  sampleCount: number
  bands: RuleBand[]
}

/** 전체 분포 대비 얼마나 좁은지 재려면 기준이 필요하다. 지표별 통상 범위. */
const TYPICAL_RANGE: Record<keyof FeatureSet, number> = {
  rsi14: 100,
  macdHistPct: 2,
  macdCross: 2,
  bbPosition: 1.4,
  bbWidthPct: 8,
  dev20: 6,
  dev50: 12,
  maTrend: 2,
  stochK: 100,
  stochD: 100,
  atrPct: 3,
  volRatio: 4,
  adx14: 100,
  obvSlope: 2,
  range50: 1,
  momentum5: 6,
  williamsR: 100,
  cci20: 400,
}

const KEYS = Object.keys(TYPICAL_RANGE) as (keyof FeatureSet)[]

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** 규칙을 뽑으려면 최소 이만큼의 핀이 필요하다. 이보다 적으면 그냥 외운 것과 같다. */
export const MIN_PINS = 8

/**
 * 같은 방향 핀들의 공통 구간을 찾는다.
 *
 * 양 끝 10%는 버린다 — 핀 하나가 튀면 구간이 통째로 늘어나 쓸모없어진다.
 *
 * 순위는 "좁게 모였는가"만으로 매기면 안 된다. 그렇게 하면 원래 잘 안 변하는 지표
 * (ATR 같은)가 늘 1등이 되는데, 그건 어느 방향에서나 좁으니 아무것도 구분하지 못한다.
 * 반대 방향과 얼마나 **갈라지는가**를 같이 봐야 실제로 쓸모있는 조건이 올라온다.
 */
export function deriveRule(pins: Pin[], side: PinSide): Rule | null {
  const mine = pins.filter((p) => p.side === side)
  if (mine.length < MIN_PINS) return null

  // 비교 대상: 반대 방향 + 관망. 없으면 분리도를 못 재니 tightness 만 쓴다.
  const opposite = pins.filter((p) => p.side !== side)

  const bands: RuleBand[] = []
  for (const key of KEYS) {
    const values = mine.map((p) => p.features[key]).sort((a, b) => a - b)
    const min = quantile(values, 0.1)
    const max = quantile(values, 0.9)
    const span = max - min
    const tightness = Math.max(0, 1 - span / TYPICAL_RANGE[key])

    // 반대편 핀 중 이 구간 밖에 있는 비율이 곧 분리도다.
    let separation = 0
    if (opposite.length > 0) {
      const outside = opposite.filter((p) => {
        const v = p.features[key]
        return v < min || v > max
      }).length
      separation = outside / opposite.length
    }

    // 좁기만 하고 안 갈라지면 소용없다. 갈라지는 쪽에 무게를 더 준다.
    const weight = opposite.length > 0 ? separation * (0.4 + 0.6 * tightness) : tightness
    bands.push({ key, min, max, tightness, separation, weight })
  }

  bands.sort((a, b) => b.weight - a.weight)
  return { side, sampleCount: mine.length, bands }
}

/** 한 시점이 규칙에 얼마나 맞는지 0~100 점으로. 상위 지표에 가중치를 더 준다. */
export function scoreAgainst(rule: Rule, f: FeatureSet, topN = 8): number {
  const used = rule.bands.slice(0, topN)
  let total = 0
  let hit = 0
  for (const band of used) {
    const w = band.weight
    total += w
    const v = f[band.key]
    if (v >= band.min && v <= band.max) {
      hit += w
    } else {
      // 살짝 벗어난 것은 부분 점수를 준다 — 경계에서 0점이 되면 점수가 널뛴다.
      const span = band.max - band.min || TYPICAL_RANGE[band.key] * 0.1
      const dist = v < band.min ? band.min - v : v - band.max
      hit += w * Math.max(0, 1 - dist / span)
    }
  }
  return total === 0 ? 0 : Math.round((hit / total) * 100)
}

export interface RuleLine {
  text: string
  /** 반대 방향을 얼마나 걸러내는가 0~100 */
  separation: number
}

/**
 * 규칙을 사람이 읽는 문장으로.
 *
 * 분리도를 같이 돌려준다 — 이게 낮은 줄은 롱·숏 어디서나 나오는 조건이라
 * 그럴듯해 보여도 판단에 쓰면 안 된다.
 */
export function describeRule(rule: Rule, topN = 6): RuleLine[] {
  return rule.bands.slice(0, topN).map((b) => {
    const label = FEATURE_LABELS[b.key]
    const text =
      b.key === 'macdCross' || b.key === 'maTrend'
        ? `${label} ${formatFeature(b.key, (b.min + b.max) / 2)}`
        : `${label} ${formatFeature(b.key, b.min)} ~ ${formatFeature(b.key, b.max)}`
    return { text, separation: Math.round(b.separation * 100) }
  })
}

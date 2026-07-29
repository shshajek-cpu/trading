import type { Candle } from './binance'
import { computeFeatures, FEATURE_LABELS, formatFeature, MIN_HISTORY, type FeatureSet } from './features'

export interface DiscoverConfig {
  /** 목표 수익률 % */
  target: number
  /** 이 이상 빠지면 실패로 본다 % */
  stop: number
  /** 몇 봉 안에 목표에 닿아야 하는가 */
  horizon: number
  /** 롱을 찾을지 숏을 찾을지 */
  side: 'long' | 'short'
}

export const DEFAULT_CONFIG: DiscoverConfig = {
  target: 2,
  stop: 1,
  horizon: 30,
  side: 'long',
}

export interface Band {
  key: keyof FeatureSet
  min: number
  max: number
  /** 이 조건 하나만 걸었을 때의 승률 */
  winRate: number
  /** 조건에 걸린 표본 수 */
  hits: number
  /** 전체 승률 대비 얼마나 나아졌나 (백분율 포인트) */
  lift: number
}

export interface DiscoverResult {
  config: DiscoverConfig
  /** 훑은 지점 수 */
  scanned: number
  /** 성공한 지점 수 */
  wins: number
  /** 아무 조건 없이 무작정 들어갔을 때의 승률 — 비교 기준 */
  baseRate: number
  /** 고른 조건들 */
  bands: Band[]
  /** 앞 70%(학습)에서의 성적 */
  train: Performance
  /** 뒤 30%(시험)에서의 성적 — 이게 학습과 비슷해야 믿을 만하다 */
  test: Performance
}

export interface Performance {
  /** 조건을 모두 만족한 지점 수 */
  signals: number
  winRate: number
  /** 평균 손익 % */
  avgReturn: number
}

interface Sample {
  index: number
  features: FeatureSet
  won: boolean
  /** 실제 손익 % */
  ret: number
}

/**
 * 한 지점에서 진입했다면 어떻게 됐는지 판정한다.
 *
 * 목표와 손절 중 **먼저 닿는 쪽**을 따른다. 종가만 보면 중간에 손절당한 것을
 * 성공으로 세게 되어 승률이 부풀려진다.
 */
function evaluate(candles: Candle[], index: number, cfg: DiscoverConfig): { won: boolean; ret: number } | null {
  const entry = candles[index].close
  const end = Math.min(index + cfg.horizon, candles.length - 1)
  if (end <= index) return null

  const long = cfg.side === 'long'
  const targetPrice = long ? entry * (1 + cfg.target / 100) : entry * (1 - cfg.target / 100)
  const stopPrice = long ? entry * (1 - cfg.stop / 100) : entry * (1 + cfg.stop / 100)

  for (let i = index + 1; i <= end; i++) {
    const c = candles[i]
    const hitTarget = long ? c.high >= targetPrice : c.low <= targetPrice
    const hitStop = long ? c.low <= stopPrice : c.high >= stopPrice
    // 한 봉 안에서 둘 다 닿았으면 알 수 없다. 불리한 쪽(손절)로 본다.
    if (hitStop) return { won: false, ret: -cfg.stop }
    if (hitTarget) return { won: true, ret: cfg.target }
  }

  const exit = candles[end].close
  const ret = ((long ? exit - entry : entry - exit) / entry) * 100
  return { won: false, ret }
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

const ALL_KEYS = Object.keys(FEATURE_LABELS) as (keyof FeatureSet)[]

/** 조건 하나가 최소 이만큼은 걸려야 통계로 인정한다. */
const MIN_HITS_RATIO = 0.05

function measure(samples: Sample[], bands: Band[]): Performance {
  const matched = samples.filter((s) => bands.every((b) => s.features[b.key] >= b.min && s.features[b.key] <= b.max))
  if (matched.length === 0) return { signals: 0, winRate: 0, avgReturn: 0 }
  const wins = matched.filter((s) => s.won).length
  const sum = matched.reduce((a, s) => a + s.ret, 0)
  return {
    signals: matched.length,
    winRate: (wins / matched.length) * 100,
    avgReturn: sum / matched.length,
  }
}

/**
 * 과거를 훑어 "실제로 통했던 자리"의 공통점을 찾는다.
 *
 * 사람이 찍지 않으므로 미래를 보고 고르는 편향이 없다. 대신 과거에만 맞는 규칙을
 * 잡아낼 위험이 있어, 앞 70%로 규칙을 만들고 뒤 30%로 시험해 둘을 같이 보여준다.
 */
export function discover(candles: Candle[], cfg: DiscoverConfig): DiscoverResult | null {
  // 지표 계산에 앞이 필요하고, 판정에 뒤가 필요하다.
  const first = MIN_HISTORY
  const last = candles.length - cfg.horizon - 1
  if (last - first < 150) return null

  const samples: Sample[] = []
  for (let i = first; i <= last; i++) {
    const features = computeFeatures(candles, i)
    if (!features) continue
    const outcome = evaluate(candles, i, cfg)
    if (!outcome) continue
    samples.push({ index: i, features, won: outcome.won, ret: outcome.ret })
  }
  if (samples.length < 150) return null

  // 앞뒤로 나눈다. 시간 순서를 지켜야 한다 — 섞으면 미래로 과거를 맞히는 셈이 된다.
  const cut = Math.floor(samples.length * 0.7)
  const trainSet = samples.slice(0, cut)
  const testSet = samples.slice(cut)

  const baseWins = trainSet.filter((s) => s.won).length
  const baseRate = (baseWins / trainSet.length) * 100
  const winners = trainSet.filter((s) => s.won)
  if (winners.length < 20) return null

  const minHits = Math.max(15, Math.floor(trainSet.length * MIN_HITS_RATIO))

  // 학습 구간을 다시 앞뒤로 쪼갠다. 앞에서 구간을 잡고 뒤에서 그게 통하는지 본다 —
  // 같은 데이터로 만들고 채점하면 우연한 패턴을 진짜로 착각한다.
  const vCut = Math.floor(trainSet.length * 0.6)
  const fitSet = trainSet.slice(0, vCut)
  const validSet = trainSet.slice(vCut)
  const fitWinners = fitSet.filter((s) => s.won)
  if (fitWinners.length < 15 || validSet.length < 50) return null

  const fitBase = (fitWinners.length / fitSet.length) * 100
  const validBase = (validSet.filter((s) => s.won).length / validSet.length) * 100

  // 지표별로 "성공한 지점들이 모여 있는 구간"을 잡고, 양쪽 모두에서 승률이 올랐는지 본다.
  const candidates: Band[] = []
  for (const key of ALL_KEYS) {
    const vals = fitWinners.map((s) => s.features[key]).sort((a, b) => a - b)
    const min = quantile(vals, 0.2)
    const max = quantile(vals, 0.8)
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) continue

    const inFit = fitSet.filter((s) => s.features[key] >= min && s.features[key] <= max)
    const inValid = validSet.filter((s) => s.features[key] >= min && s.features[key] <= max)
    if (inFit.length < minHits * 0.6 || inValid.length < minHits * 0.4) continue

    const fitRate = (inFit.filter((s) => s.won).length / inFit.length) * 100
    const validRate = (inValid.filter((s) => s.won).length / inValid.length) * 100

    // 한쪽에서만 좋은 것은 버린다. 양쪽 다 올라야 진짜다.
    if (fitRate - fitBase <= 1 || validRate - validBase <= 0) continue

    const inTrain = trainSet.filter((s) => s.features[key] >= min && s.features[key] <= max)
    const winRate = (inTrain.filter((s) => s.won).length / inTrain.length) * 100
    // 둘 중 낮은 쪽을 성적으로 삼는다 — 좋게 보이는 쪽만 믿으면 또 속는다.
    const lift = Math.min(fitRate - fitBase, validRate - validBase)
    candidates.push({ key, min, max, hits: inTrain.length, winRate, lift })
  }

  candidates.sort((a, b) => b.lift - a.lift)
  if (candidates.length === 0) return null

  // 하나씩 겹쳐가며, 검증 구간에서도 승률이 오를 때만 채택한다.
  const chosen: Band[] = []
  let best = measure(validSet, []).winRate || validBase
  for (const cand of candidates) {
    const next = [...chosen, cand]
    if (measure(trainSet, next).signals < minHits) continue
    const vPerf = measure(validSet, next)
    if (vPerf.signals < 20) continue
    if (vPerf.winRate > best + 0.5) {
      chosen.push(cand)
      best = vPerf.winRate
    }
    // 조건을 많이 겹칠수록 과거에만 맞는 규칙이 된다. 실측상 4개부터 무너졌다.
    if (chosen.length >= 3) break
  }
  if (chosen.length === 0) return null

  return {
    config: cfg,
    scanned: samples.length,
    wins: samples.filter((s) => s.won).length,
    baseRate,
    bands: chosen,
    train: measure(trainSet, chosen),
    test: measure(testSet, chosen),
  }
}

export type Verdict = 'good' | 'weak' | 'overfit'

export interface Judgement {
  verdict: Verdict
  label: string
  reason: string
}

/**
 * 결과를 믿어도 되는지 판정한다.
 *
 * 학습 성적이 아무리 좋아도 시험에서 무너지면 과거에만 맞는 규칙이다.
 * 사용자가 숫자만 보고 착각하지 않도록 말로 못박아 준다.
 */
export function judge(r: DiscoverResult): Judgement {
  const gap = r.train.winRate - r.test.winRate
  const edge = r.test.winRate - r.baseRate

  if (r.test.signals < 30) {
    return {
      verdict: 'weak',
      label: '표본 부족',
      reason: `시험 구간 신호가 ${r.test.signals}회뿐입니다. 더 긴 기간을 불러오세요.`,
    }
  }
  if (gap > 5) {
    return {
      verdict: 'overfit',
      label: '과거에만 맞음',
      reason: `학습 ${r.train.winRate.toFixed(0)}% → 시험 ${r.test.winRate.toFixed(0)}% 로 무너집니다. 실전에 쓰지 마세요.`,
    }
  }
  if (edge < 1) {
    return {
      verdict: 'weak',
      label: '우위 없음',
      reason: `아무 때나 들어가도 ${r.baseRate.toFixed(0)}% 입니다. 이 조건이 나은 게 없습니다.`,
    }
  }
  return {
    verdict: 'good',
    label: '검증 통과',
    reason: `처음 보는 구간에서도 승률이 ${edge.toFixed(1)}%p 높았습니다.`,
  }
}

/** 규칙을 사람이 읽는 문장으로. */
export function describeBand(b: Band): string {
  const label = FEATURE_LABELS[b.key]
  if (b.key === 'macdCross' || b.key === 'maTrend') {
    return `${label} ${formatFeature(b.key, (b.min + b.max) / 2)}`
  }
  return `${label} ${formatFeature(b.key, b.min)} ~ ${formatFeature(b.key, b.max)}`
}

/** 지금 시점이 이 규칙에 맞는지. */
export function matchesBands(bands: Band[], f: FeatureSet): boolean {
  return bands.every((b) => f[b.key] >= b.min && f[b.key] <= b.max)
}

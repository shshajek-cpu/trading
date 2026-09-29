/**
 * 지표 값 알림(예: "RSI 14 상향 교차 70")의 서버 판정. 앱이 닫혀 있어도 웹 푸시가 가게 한다.
 *
 * 동기화 설정의 알림 목록(trading.indicatorAlerts.v1)을 앱과 같은 검사(parseIndicatorAlerts)로 읽고,
 * 알림에 저장된 지표 사본을 앱과 같은 계산(computeIndicator)·판정(conditionMet)으로 본다.
 * (종목, 주기)마다 봉은 한 호출에 한 번만 읽고 그 봉을 보는 모든 알림이 함께 쓴다.
 *
 * 봉: 바이낸스 USDT-M 을 먼저, 막혔으면 gate.io 선물 봉(market.ts 와 같은 계약 이름·가격 배율)을 쓴다.
 * 과거 봉은 앱(1000 개)과 같은 값이 나오는 만큼만 읽는다(historyFor — 지표마다 다르고 1000 을 넘지 않는다).
 * gate 는 계약 수로 거래량을 주므로 quanto_multiplier 로 기초 자산 수량으로 바꾼다.
 * gate 와 바이낸스는 체결이 달라 값이 조금 다를 수 있다 — 거래량 기반 지표(거래량 급증 배율 등)가 특히 그렇다.
 *
 * gate 에 없는 주기는 더 작은 gate 주기를 바이낸스 봉 경계(barStart)로 묶어 만든다: 3m ← 1m, 3d ← 1d, 1M ← 1d.
 * (gate 선물 주기: 1m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 1w — 3m·3d 는 없고, 30d 는 달력 월이 아니다.
 *  gate 의 나머지 주기는 바이낸스와 경계가 같다: UTC 기준 배수, 1w 는 월요일 00:00 UTC.)
 * gate 는 한 번에 2000 개까지라 묶은 주기는 3m·3d 가 약 666 봉, 1M 이 약 65 봉(원본 일봉 2000 개)까지만 나온다.
 *
 * CPU: 무료 플랜은 호출 하나에 CPU 약 10ms 이고, 넘으면 호출 전체가 끊긴다. 응답을 읽는 데 봉 1000 개마다 약 0.6ms,
 * 계산에 알림마다 0.03~0.7ms 가 든다. 그래서 봉은 historyFor 만큼만 읽고, 한 호출에 INDICATOR_FEEDS_PER_RUN(3) 묶음만
 * 읽고 계산한다. 볼 묶음이 N 개면 분마다 3 개씩 돌아가며 보므로 묶음마다 ceil(N/3) 분에 한 번 판정한다 — 그만큼 늦게
 * 울리고, 짧은 주기(1m 등)에서는 차례가 아닌 분에 지나간 교차나 사이에 닫힌 봉을 놓칠 수 있다. 이번 봉에 이미 울린
 * 봉마다 알림의 묶음은 고르기 전에 뺀다. index.ts 는 가격·수평선 판정·발송·기록을 모두 마친 뒤에 이 계산을 한다 —
 * 여기서 호출이 끊겨도 그 결과는 남는다.
 */
import { computeIndicator, type ComputedIndicator } from '../src/chart/compute'
import type { Candle, Interval } from '../src/lib/binance'
import { conditionMet, type IndicatorAlert } from '../src/lib/indicatorAlerts'
import { multiMaSlots, setParts, type IndicatorInstance } from '../src/lib/indicatorConfig'
import { INTERVAL_SECONDS } from '../src/lib/intervals'
import { CHART_PALETTES } from '../src/lib/theme'
import {
  BINANCE_BLOCKED,
  CANDLE_FETCH_MAX,
  GATE_CANDLES_URL,
  KLINES_URL,
  loadCandles,
  SYMBOL_RE,
  type Budget,
  type GateTicker,
  type PriceSource,
} from './market'

/** 앱(useIndicatorAlerts.HISTORY)이 계산에 쓰는 과거 봉 수. 서버가 읽는 봉 수(historyFor)의 상한이다. */
export const HISTORY = 1000
/** gate.io 봉 조회 한 번의 최대 개수. */
const GATE_LIMIT = 2000
const DAY = 86_400
/** 한 호출에 읽고 계산하는 (종목, 주기) 묶음 수. 위의 CPU 설명 참고. */
export const INDICATOR_FEEDS_PER_RUN = 3

/** gate.io 에 없는 주기와, 묶어서 만들 더 작은 gate 주기. */
const GATE_SOURCE: Partial<Record<Interval, Interval>> = { '3m': '1m', '3d': '1d', '1M': '1d' }

/**
 * 바이낸스 봉의 시작 시각(초). t(초)가 속한 봉을 돌려준다.
 * - 분·시간·1d: Unix 시각을 주기로 내림(UTC 기준).
 * - 3d: 1970-01-02 00:00 UTC 부터 3 일씩. 바이낸스 3d 봉은 2026-08-03·08-06·08-09 처럼 Unix 3 일 배수보다 하루 늦게 시작한다.
 * - 1w: 월요일 00:00 UTC(1970-01-05 부터 7 일씩).
 * - 1M: 달력 월 1 일 00:00 UTC.
 */
export function barStart(interval: Interval, t: number): number {
  if (interval === '1M') {
    const d = new Date(t * 1000)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000
  }
  const size = INTERVAL_SECONDS[interval]
  const anchor = interval === '3d' ? DAY : interval === '1w' ? 4 * DAY : 0
  return Math.floor((t - anchor) / size) * size + anchor
}

/** 봉이 닫히는 시각(초) — 다음 봉의 시작. */
export function barEnd(interval: Interval, start: number): number {
  if (interval === '1M') {
    const d = new Date(start * 1000)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000
  }
  return start + INTERVAL_SECONDS[interval]
}

/** 작은 주기 봉(시간순)을 interval 봉으로 묶는다. 맨 앞의 덜 찬 봉(경계에서 시작하지 않은 봉)은 버린다. */
export function aggregate(candles: Candle[], interval: Interval): Candle[] {
  const out: Candle[] = []
  for (const c of candles) {
    const time = barStart(interval, c.time)
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

/** 봉을 함께 쓰는 알림 묶음의 키. */
export function feedKey(a: Pick<IndicatorAlert, 'symbol' | 'interval'>): string {
  return `${a.symbol}@${a.interval}`
}

/**
 * 지금 판정할 봉의 시작 시각(초) — 봉을 읽기 전에 이미 푸시한 봉인지 보는 데 쓴다. now 는 ms.
 * once·perBar 는 진행 중인 봉, perBarClose 는 마지막으로 닫힌 봉(알림을 만든 뒤에 닫힌 봉이 없으면 null).
 */
export function dueBar(alert: Pick<IndicatorAlert, 'interval' | 'trigger' | 'createdAt'>, now: number): number | null {
  const current = barStart(alert.interval, Math.floor(now / 1000))
  if (alert.trigger !== 'perBarClose') return current
  // 마지막으로 닫힌 봉은 지금 봉이 시작할 때 닫혔다.
  return current * 1000 > alert.createdAt ? barStart(alert.interval, current - 1) : null
}

/**
 * 알림 하나의 값을 앱(과거 HISTORY 봉)과 같게 내는 데 드는 봉 수. CPU(응답 읽기·계산)를 아끼려고 묶음마다 그 가운데
 * 가장 큰 만큼만 읽고 계산한다. 판정 봉과 그 앞 봉(교차의 prev) 값이 1000 봉으로 계산한 값과 같아야 한다.
 * - 창 안의 봉만 쓰는 지표(SMA·WMA·VWMA·BB·%R·CCI·MFI·스토캐스틱·급증 배율·일목·거래량): 창 길이 + 여유 2.
 * - 지수 평활은 앞쪽 봉의 영향이 사라질 만큼: EMA(2/(L+1)) 10(L+1) 봉, Wilder(1/L — RSI·ATR) 20L 봉, 두 번 평활하는
 *   ADX 40L 봉. 1000 봉 값과의 차이가 1e-8 배 아래로 준다.
 * - 처음부터 쌓거나 경로를 따라가는 지표(OBV·VWAP·PSAR·VPVR)와 위 값이 HISTORY 를 넘는 것은 HISTORY.
 */
export function historyFor(i: IndicatorInstance): number {
  const p = i.params
  const exact = (...lengths: number[]) => Math.max(...lengths) + 2
  const emaBars = (length: number) => 10 * (length + 1)
  let bars: number
  switch (i.kind) {
    case 'sma':
    case 'wma':
    case 'vwma':
    case 'bb':
    case 'williamsR':
    case 'cci':
    case 'mfi':
      bars = exact(p.length)
      break
    case 'volume':
      bars = exact(p.window)
      break
    case 'volumeSpike':
      bars = exact(p.count + 1)
      break
    case 'ichimoku':
      bars = exact(p.conversion, p.base, p.spanB) + p.displacement
      break
    case 'stoch':
      bars = exact(p.k + p.smooth + p.d)
      break
    case 'multiMa': {
      const longest = Math.max(...multiMaSlots(i).map((s) => s.length), 1)
      bars = p.ema ? emaBars(longest) : exact(longest)
      break
    }
    case 'ema':
      bars = emaBars(p.length)
      break
    case 'rsi':
    case 'atr':
      bars = 20 * p.length
      break
    case 'adx':
      bars = 40 * p.length
      break
    case 'macd':
      bars = emaBars(p.slow) + emaBars(p.signal)
      break
    case 'stochRsi':
      bars = 20 * p.rsiLength + exact(p.stochLength + p.k + p.d)
      break
    case 'maSet':
      bars = Math.max(...setParts(i).map((part) => (part.on ? historyFor(part.instance) : 0)))
      break
    case 'vwap':
    case 'obv':
    case 'psar':
    case 'vpvr':
      bars = HISTORY
      break
  }
  return Number.isFinite(bars) ? Math.min(HISTORY, Math.ceil(bars)) : HISTORY
}

export interface FeedSpec {
  key: string
  symbol: string
  interval: Interval
  /** 읽을 봉 수 — 이 묶음을 보는 알림의 historyFor 가운데 가장 큰 값. */
  bars: number
}

/** (종목, 주기) 하나의 봉. candles 는 시간순이고 마지막 봉은 진행 중일 수 있다. */
export interface Feed extends FeedSpec {
  source: PriceSource
  candles: Candle[]
  /** 같은 지표 설정·같은 봉까지의 계산은 한 번만 한다(여러 알림·여러 코드가 같은 봉을 본다). */
  computed: Map<string, ComputedIndicator>
}

/** 바이낸스 봉. 막혔으면 'blocked', 이 묶음만 실패했으면 null. */
async function binanceCandles(spec: FeedSpec, budget: Budget): Promise<Candle[] | 'blocked' | null> {
  budget.used++
  let res: Response
  try {
    res = await fetch(`${KLINES_URL}?symbol=${spec.symbol}&interval=${spec.interval}&limit=${spec.bars}`)
  } catch {
    return 'blocked'
  }
  if (BINANCE_BLOCKED.has(res.status)) return 'blocked'
  if (!res.ok) return null
  try {
    const rows = (await res.json()) as unknown[][]
    const candles = rows.map((r) => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }))
    return valid(candles) ? candles : null
  } catch {
    return null
  }
}

/** gate.io 봉(바이낸스 배율·수량으로 환산). gate 에 없는 주기는 더 작은 주기를 묶는다. 실패하면 null. */
async function gateCandles(spec: FeedSpec, ticker: GateTicker, budget: Budget): Promise<Candle[] | null> {
  // 계약 1장의 수량을 모르면 거래량을 맞출 수 없다.
  if (!(ticker.volume > 0)) return null
  const source = GATE_SOURCE[spec.interval]
  // 묶는 주기는 작은 봉이 배수만큼(1M 은 한 달 최대 31 일) 필요하고 맨 앞 덜 찬 봉 하나를 버린다. 한 번에 GATE_LIMIT 개까지.
  const limit = source
    ? Math.min(GATE_LIMIT, (spec.bars + 1) * (spec.interval === '1M' ? 31 : INTERVAL_SECONDS[spec.interval] / INTERVAL_SECONDS[source]))
    : spec.bars
  budget.used++
  try {
    const res = await fetch(
      `${GATE_CANDLES_URL}?contract=${ticker.contract}&interval=${source ?? spec.interval}&limit=${limit}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const rows = (await res.json()) as { t: number; o: string; h: string; l: string; c: string; v: number }[]
    const { scale, volume } = ticker
    const candles = rows.map((r) => ({
      time: r.t,
      open: Number(r.o) * scale,
      high: Number(r.h) * scale,
      low: Number(r.l) * scale,
      close: Number(r.c) * scale,
      volume: Number(r.v) * volume,
    }))
    if (!valid(candles)) return null
    return source ? aggregate(candles, spec.interval).slice(-spec.bars) : candles
  } catch {
    return null
  }
}

/** 비어 있지 않고 모든 값이 수다. */
function valid(candles: Candle[]): boolean {
  return (
    candles.length > 0 &&
    candles.every((c) => [c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite))
  )
}

/**
 * 이번 분에 볼 (종목, 주기) 묶음을 고른다 — INDICATOR_FEEDS_PER_RUN 개까지. 키 순으로 줄 세워 turn(분 번호)마다
 * 그만큼씩 시작점을 옮기므로, 묶음 목록이 그대로면 N 개 가운데 어느 묶음이든 연속 ceil(N/3) 분 안에 한 번은 뽑힌다.
 * 묶음마다 읽을 봉 수는 그 묶음을 보는 알림의 historyFor 가운데 가장 큰 값이다.
 */
export function pickFeeds(alerts: IndicatorAlert[], turn: number): FeedSpec[] {
  const specs = new Map<string, FeedSpec>()
  for (const a of alerts) {
    if (!SYMBOL_RE.test(a.symbol)) continue
    const key = feedKey(a)
    const bars = historyFor(a.indicator)
    const spec = specs.get(key)
    if (spec) spec.bars = Math.max(spec.bars, bars)
    else specs.set(key, { key, symbol: a.symbol, interval: a.interval, bars })
  }
  const sorted = [...specs.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
  if (sorted.length <= INDICATOR_FEEDS_PER_RUN) return sorted
  const start = (turn * INDICATOR_FEEDS_PER_RUN) % sorted.length
  return [...sorted.slice(start), ...sorted.slice(0, start)].slice(0, INDICATOR_FEEDS_PER_RUN)
}

/**
 * 고른 묶음마다 봉을 한 번씩 읽는다. 외부 요청 한도(가격 시세·푸시와 함께 쓴다)를 넘는 묶음은 이번 분에 읽지 않는다
 * (결과에 없다 — 그 알림들은 기록을 그대로 두고 다음 차례에 본다).
 */
export async function loadFeeds(specs: FeedSpec[], budget: Budget): Promise<Map<string, Feed>> {
  const loaded = await loadCandles(
    specs,
    budget,
    CANDLE_FETCH_MAX,
    (spec) => binanceCandles(spec, budget),
    (spec, ticker) => gateCandles(spec, ticker, budget),
  )
  const feeds = new Map<string, Feed>()
  for (const [spec, { source, value }] of loaded) feeds.set(spec.key, { ...spec, source, candles: value, computed: new Map() })
  return feeds
}

/** 판정 결과. bar: 판정한 봉의 시작 시각(초 — 앱의 lastBar 와 같은 단위), value: 그 봉의 지표 값, met: 조건 충족. */
export interface Judgement {
  bar: number
  value: number
  met: boolean
}

/**
 * 앱(useIndicatorAlerts 의 evaluate)과 같은 계산·판정. prev 는 판정 봉의 앞 봉, cur 는 판정 봉의 값.
 * - once·perBar: 진행 중인 마지막 봉으로 본다.
 * - perBarClose: 마지막으로 닫힌 봉으로 본다 — 그 봉까지의 봉으로 계산한다(앱이 봉 마감 이벤트에서 보는 것과 같다).
 *   알림을 만든 뒤에 닫힌 봉만 본다.
 * 판정할 봉이나 지금 봉까지 계산된 값이 없으면 null. now 는 ms.
 */
export function judgeIndicatorAlert(alert: IndicatorAlert, feed: Feed, now: number): Judgement | null {
  let candles = feed.candles
  if (alert.trigger === 'perBarClose') {
    let i = candles.length - 1
    while (i >= 0 && barEnd(feed.interval, candles[i].time) * 1000 > now) i--
    if (i < 0 || barEnd(feed.interval, candles[i].time) * 1000 <= alert.createdAt) return null
    candles = candles.slice(0, i + 1)
  }
  const bar = candles[candles.length - 1].time
  const cacheKey = `${bar}:${alert.indicator.kind}:${JSON.stringify(alert.indicator.params)}`
  let computed = feed.computed.get(cacheKey)
  if (!computed) {
    // 색은 판정에 쓰지 않는다 — 앱과 같은 팔레트를 넘긴다.
    computed = computeIndicator(alert.indicator, candles, CHART_PALETTES.dark)
    feed.computed.set(cacheKey, computed)
  }
  const line = computed.lines.find((l) => l.key === alert.lineKey)
  const points = line?.points
  const cur = points?.[points.length - 1]
  // 일목 선행·후행 스팬은 앞뒤로 밀려 그려져 마지막 점 시각이 다르지만, 그 점이 지금 봉으로 계산한 값이다.
  if (!line || !points || !cur || (!line.displaced && cur.time !== bar)) return null
  return {
    bar,
    value: cur.value,
    met: conditionMet(alert.condition, points[points.length - 2]?.value, cur.value, alert.value),
  }
}

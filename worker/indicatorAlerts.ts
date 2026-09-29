/**
 * 지표 값 알림(예: "RSI 14 상향 교차 70")의 서버 판정. 앱이 닫혀 있어도 웹 푸시가 가게 한다.
 *
 * 동기화 설정의 알림 목록(trading.indicatorAlerts.v1)을 앱과 같은 검사(parseIndicatorAlerts)로 읽고,
 * 알림에 저장된 지표 사본을 앱과 같은 계산(computeIndicator)·판정(conditionMet)으로 본다.
 * (종목, 주기)마다 봉은 한 호출에 한 번만 읽고 그 봉을 보는 모든 알림이 함께 쓴다.
 *
 * 봉은 market.ts 의 loadCandles 로 읽는다 — 심볼 id 로 거래소를 고른다.
 *  - 바이낸스 선물(BTCUSDT): 바이낸스를 먼저, 막혔으면 gate.io 선물 봉(같은 계약 이름·가격 배율, 거래량은 quanto_multiplier 로
 *    기초 자산 수량으로 바꾼다). gate 에 없는 3m·3d·1M 은 1m·1d 를 바이낸스 봉 경계(barStart)로 묶는다. gate 는 한 번에
 *    2000 개라 묶은 주기는 3m·3d 가 약 666 봉, 1M 이 약 65 봉까지.
 *  - 바이낸스 현물(BSPOT:): 바이낸스 현물을 먼저, 막혔으면 gate.io 현물 봉(BTC_USDT). gate 현물에 없는(경계가 다른) 3d·1M 은
 *    일봉을 묶는다. gate 현물은 한 번에 1000 개라 3d 가 약 333 봉, 1M 이 약 32 봉까지.
 *  - 업비트(UPBIT:): upbitPlan 의 source 주기를 200 개씩 최대 3 쪽(요청 3회, 600 개)까지 받아 묶는다(2h·6h ← 60분,
 *    8h·12h ← 240분, 3d ← 일봉 — UTC 경계). 그래서 그대로 받는 주기는 600 봉, 묶은 주기는 2h 약 300·6h 약 100·
 *    8h 약 300·12h 약 200·3d 약 200 봉까지.
 *  - 야후(YF:): yahooPlan 의 source 주기를 한 번(YAHOO_WINDOW 기간과 보관 한도 안)에 받아, 3m·2h~12h 는 장 시작 시각부터
 *    묶는다. 1m 은 5 일, 60m 은 200 일까지라 1m·3m 과 2h~12h 는 앱의 1000 봉보다 짧을 수 있다. 3d 알림은 보지 않는다.
 * 과거 봉은 앱(1000 개)과 같은 값이 나오는 만큼만 읽는다(historyFor — 지표마다 다르고 1000 을 넘지 않는다). 거래소 한도로
 * 그보다 짧게 받으면 앞쪽 봉에 기대는 지표(EMA·RSI 등)는 앱과 조금 다를 수 있다.
 * gate 와 바이낸스는 체결이 달라 값이 조금 다를 수 있다 — 거래량 기반 지표(거래량 급증 배율 등)가 특히 그렇다.
 *
 * CPU: 무료 플랜은 호출 하나에 CPU 약 10ms 이고, 넘으면 호출 전체가 끊긴다. 응답을 읽는 데 봉 1000 개마다 약 0.6ms,
 * 계산에 알림마다 0.03~0.7ms 가 든다. 그래서 봉은 historyFor 만큼만 읽고, 한 호출에 INDICATOR_FEEDS_PER_RUN(3) 묶음만
 * 읽고 계산한다. 볼 묶음이 N 개면 분마다 3 개씩 돌아가며 보므로 묶음마다 ceil(N/3) 분에 한 번 판정한다 — 그만큼 늦게
 * 울리고, 짧은 주기(1m 등)에서는 차례가 아닌 분에 지나간 교차나 사이에 닫힌 봉을 놓칠 수 있다. 이번 봉에 이미 울린
 * 봉마다 알림의 묶음은 고르기 전에 뺀다. index.ts 는 가격·수평선 판정·발송·기록을 모두 마친 뒤에 이 계산을 한다 —
 * 여기서 호출이 끊겨도 그 결과는 남는다.
 */
import { computeIndicator, type ComputedIndicator } from '../src/chart/compute'
import { conditionMet, type IndicatorAlert } from '../src/lib/indicatorAlerts'
import { multiMaSlots, setParts, type IndicatorInstance } from '../src/lib/indicatorConfig'
import { barEnd, barStart } from '../src/lib/market/bars'
import { isSymbolId, supportsInterval } from '../src/lib/market/ids'
import type { Candle, Interval } from '../src/lib/market/types'
import { CHART_PALETTES } from '../src/lib/theme'
import { CANDLE_FETCH_MAX, loadCandles, UPBIT_FEED_PAGES, type Budget, type PriceSource } from './market'

/** 앱(useIndicatorAlerts.HISTORY)이 계산에 쓰는 과거 봉 수. 서버가 읽는 봉 수(historyFor)의 상한이다. */
export const HISTORY = 1000
/** 한 호출에 읽고 계산하는 (종목, 주기) 묶음 수. 위의 CPU 설명 참고. */
export const INDICATOR_FEEDS_PER_RUN = 3

/** 봉을 함께 쓰는 알림 묶음의 키. */
export function feedKey(a: Pick<IndicatorAlert, 'symbol' | 'interval'>): string {
  return `${a.symbol}@${a.interval}`
}

/**
 * 지금 판정할 봉의 시작 시각(초) — 봉을 읽기 전에 이미 푸시한 봉인지 보는 데 쓴다. now 는 ms.
 * once·perBar 는 진행 중인 봉, perBarClose 는 마지막으로 닫힌 봉(알림을 만든 뒤에 닫힌 봉이 없으면 null).
 * 경계는 바이낸스(UTC) 기준이다 — 장 시작부터 묶는 야후 3m·2h~12h 와 현지 날짜로 찍는 야후 일봉은 판정 봉과 다를 수 있어
 * 여기서는 거르지 못하고, 판정한 봉(Judgement.bar)으로 한 번 더 거른다.
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

/**
 * 이번 분에 볼 (종목, 주기) 묶음을 고른다 — INDICATOR_FEEDS_PER_RUN 개까지. 키 순으로 줄 세워 turn(분 번호)마다
 * 그만큼씩 시작점을 옮기므로, 묶음 목록이 그대로면 N 개 가운데 어느 묶음이든 연속 ceil(N/3) 분 안에 한 번은 뽑힌다.
 * 묶음마다 읽을 봉 수는 그 묶음을 보는 알림의 historyFor 가운데 가장 큰 값이다.
 */
export function pickFeeds(alerts: IndicatorAlert[], turn: number): FeedSpec[] {
  const specs = new Map<string, FeedSpec>()
  for (const a of alerts) {
    if (!isSymbolId(a.symbol) || !supportsInterval(a.symbol, a.interval)) continue
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
  const loaded = await loadCandles(specs, budget, CANDLE_FETCH_MAX, UPBIT_FEED_PAGES)
  const feeds = new Map<string, Feed>()
  for (const [spec, { source, candles }] of loaded) feeds.set(spec.key, { ...spec, source, candles, computed: new Map() })
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

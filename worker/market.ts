/**
 * 감시기가 시세를 읽는 공통 부분 — 가격·선 알림의 1분봉(loadQuotes)과 지표 알림의 주기별 봉(indicatorAlerts.ts)이 함께 쓴다.
 *
 * 심볼 id(src/lib/market/ids.ts)로 거래소를 고른다.
 *  - BTCUSDT(바이낸스 USDT-M 선물): fapi.binance.com → 막혔거나 실패하면 같은 무기한 선물의 gate.io 봉.
 *  - BSPOT:BTCUSDT(바이낸스 현물): api.binance.com → 막혔거나 실패하면 gate.io 현물 봉(BTC_USDT).
 *  - UPBIT:KRW-BTC(업비트 원화): api.upbit.com 캔들. 대체 시세는 없다.
 *  - YF:AAPL(야후 — 주식·지수·환율·선물): query1.finance.yahoo.com chart(브라우저 User-Agent 를 붙인다). 대체 시세는 없다.
 * 바이낸스가 데이터센터 IP·지역을 막거나(403/451) 요청 한도에 걸리면(418/429) 이번 호출 동안은 선물·현물 모두 다시
 * 부르지 않고 gate.io 로 대신한다. 운영(Cloudflare)에서는 바이낸스가 막혀 있어 실제로는 gate.io 를 쓴다.
 * 거래소에 없는 주기는 더 작은 주기를 묶어(src/lib/market/bars.ts 의 aggregate) 만든다.
 * 봉 조회는 요청 하나마다(업비트 여러 쪽은 쪽마다) 1회로 세어 한 호출에서 CANDLE_FETCH_MAX 번까지 — 넘는 것은 다음 분에 읽는다.
 */
import { INTERVAL_SECONDS } from '../src/lib/intervals'
import { aggregate } from '../src/lib/market/bars'
import { isSymbolId, marketOf, nativeSymbol, upbitPlan, yahooPlan } from '../src/lib/market/ids'
import type { Candle, Interval } from '../src/lib/market/types'
import { parseUpbitCandles, UPBIT_PAGE, upbitCandlesUrl, type UpbitCandleRow } from '../src/lib/market/upbit'
import {
  parseYahooChart,
  YAHOO_CHART_URL,
  YAHOO_WINDOW,
  yahooChartParams,
  yahooOldest,
  type YahooChartJson,
} from '../src/lib/market/yahoo'

const KLINES_URL = 'https://fapi.binance.com/fapi/v1/klines'
const SPOT_KLINES_URL = 'https://api.binance.com/api/v3/klines'
const GATE_CANDLES_URL = 'https://api.gateio.ws/api/v4/futures/usdt/candlesticks'
const GATE_SPOT_CANDLES_URL = 'https://api.gateio.ws/api/v4/spot/candlesticks'
const TICKERS_URL = 'https://api.gateio.ws/api/v4/futures/usdt/tickers'

/** 무료 플랜의 호출 하나당 외부 요청(하위 요청) 한도. 시세·봉 조회와 푸시 발송이 함께 쓴다. */
export const SUBREQUEST_MAX = 50
/** 봉 조회(모든 거래소 합계, 가격 시세와 지표 봉 합계) 상한. 남는 14회는 전체 시세 한 번과 푸시 발송 몫이다. */
export const CANDLE_FETCH_MAX = 36
/** 이 응답이면 이번 호출 동안 바이낸스를 다시 부르지 않는다 — 지역·IP 차단(403/451)과 요청 한도(418/429). */
const BINANCE_BLOCKED = new Set([403, 418, 429, 451])
/** 요청 한 번의 최대 봉 수. 바이낸스 선물 1500·현물 1000, gate 선물 2000·현물 1000. */
const BINANCE_LIMIT = 1500
const SPOT_LIMIT = 1000
const GATE_LIMIT = 2000
const GATE_SPOT_LIMIT = 1000
/** 지표 봉 하나가 업비트에 쓰는 최대 쪽 수(쪽마다 UPBIT_PAGE 개, 요청 1회). 가격 시세는 1 쪽. */
export const UPBIT_FEED_PAGES = 3
/** 야후가 브라우저가 아닌 요청을 막지 않게 붙인다. */
const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json',
}
const HOUR = 3_600
const DAY = 86_400

/**
 * gate.io 에 없는 주기와, 묶어서 만들 더 작은 gate 주기(나머지는 바이낸스와 경계가 같다 — UTC 배수, 1w 는 월요일).
 * 선물: 1m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 1w 가 있고 3m·3d 가 없다.
 * 현물: 1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w(=7d) 가 있지만 3d 는 Unix 3 일 배수 경계라 바이낸스(1970-01-02 부터)와 다르다.
 * 둘 다 30d 는 달력 월이 아니라 1M 은 일봉을 묶는다.
 */
const GATE_SOURCE: Partial<Record<Interval, Interval>> = { '3m': '1m', '3d': '1d', '1M': '1d' }
const GATE_SPOT_SOURCE: Partial<Record<Interval, Interval>> = { '3d': '1d', '1M': '1d' }
/** 바이낸스 현물 심볼을 gate 현물 쌍(BTC_USDT)으로 나눌 때 보는 호가 자산(긴 것부터). */
const SPOT_QUOTES = ['FDUSD', 'USDT', 'USDC', 'BTC']

export type PriceSource = 'binance' | 'gate' | 'upbit' | 'yahoo'

/** 이번 호출에서 쓴 외부 요청과, 호출 안에서 한 번만 알아내면 되는 것. */
export interface Budget {
  /** 외부 요청(하위 요청) 수. 시세 조회와 푸시 발송이 함께 쓴다. */
  used: number
  /** 봉 조회 수. CANDLE_FETCH_MAX 까지. */
  candles: number
  /** 바이낸스가 막혔다 — 이번 호출에서는 다시 부르지 않는다. */
  binanceBlocked: boolean
  /** gate.io 전체 시세. 처음 필요할 때 한 번만 부른다. */
  tickers?: Promise<Map<string, GateTicker> | null>
  /** 전체 시세를 끝내 못 받은 이유(HTTP 상태 또는 'network'·'parse') — /debug 로 본다. */
  tickersError?: string
  /** gate 봉 조회 실패 이유(호스트·상태) — /debug 로 본다. 최근 10개. */
  errors: string[]
}

export function newBudget(): Budget {
  return { used: 0, candles: 0, binanceBlocked: false, errors: [] }
}

/** gate.io 계약 이름, 바이낸스 표기로 바꾸는 가격 배율, 현재가(바이낸스 배율), 계약 1장의 바이낸스 표기 수량. */
export interface GateTicker {
  contract: string
  scale: number
  last: number
  /** 봉 거래량(계약 수)에 곱해 바이낸스 거래량(기초 자산 수량)으로 바꾸는 값 — quanto_multiplier ÷ scale. */
  volume: number
}

/**
 * 마지막으로 받은 gate 계약 목록(이 워커 인스턴스가 살아 있는 동안). 계약 이름·배율·1장 수량은 거의 안 바뀌므로,
 * 전체 시세가 막힌 분에는 이것으로 봉을 읽는다 — 현재가(last)는 옛값이라 쓰지 않는다(NaN).
 */
let knownContracts: { at: number; map: Map<string, GateTicker> } | null = null
const KNOWN_CONTRACTS_MAX_AGE_MS = 24 * 60 * 60_000
/** 전체 시세가 429·연결 실패일 때 다시 받기 전 기다리는 시간(ms). 기다리는 동안 CPU 는 쓰지 않는다. */
const TICKER_RETRY_WAIT_MS = [400, 1200]

/**
 * gate.io 전체 시세. BTC_USDT 형식이라 밑줄을 빼 바이낸스 표기(BTCUSDT)로 맞춘다.
 * gate 는 1000 배 계약을 따로 상장하지 않고 원 코인만 둔다(PEPE_USDT 등).
 * 그래서 바이낸스 1000PEPEUSDT 도 찾을 수 있게 ×1000 항목을 함께 넣는다(같은 이름의 계약이 있으면 그쪽을 쓴다).
 * 호출 안에서 한 번만 부른다. 클라우드플레어에서는 이 큰 응답이 가끔 429 로 막힌다 — 조금 기다렸다 두 번 더 받아 보고,
 * 끝내 못 받으면 마지막으로 받은 계약 목록(현재가 없이)을 돌려준다.
 */
export function gateTickers(budget: Budget): Promise<Map<string, GateTicker> | null> {
  budget.tickers ??= (async () => {
    for (let attempt = 0; attempt <= TICKER_RETRY_WAIT_MS.length; attempt++) {
      if (attempt > 0) {
        if (budget.used >= SUBREQUEST_MAX) break
        await new Promise((resolve) => setTimeout(resolve, TICKER_RETRY_WAIT_MS[attempt - 1]))
      }
      budget.used++
      try {
        const res = await fetch(TICKERS_URL, { headers: { Accept: 'application/json' } })
        if (!res.ok) {
          budget.tickersError = String(res.status)
          continue
        }
        const list = (await res.json()) as { contract: string; last: string; quanto_multiplier?: string }[]
        const map = new Map<string, GateTicker>()
        const scaled: [string, GateTicker][] = []
        for (const t of list) {
          const last = Number(t.last)
          if (!Number.isFinite(last) || !t.contract.endsWith('_USDT')) continue
          const symbol = t.contract.replace('_', '')
          const multiplier = Number(t.quanto_multiplier)
          map.set(symbol, { contract: t.contract, scale: 1, last, volume: multiplier })
          scaled.push([
            `1000${symbol}`,
            { contract: t.contract, scale: 1000, last: last * 1000, volume: multiplier / 1000 },
          ])
        }
        for (const [symbol, ticker] of scaled) if (!map.has(symbol)) map.set(symbol, ticker)
        budget.tickersError = undefined
        knownContracts = { at: Date.now(), map }
        return map
      } catch (err) {
        budget.tickersError = err instanceof SyntaxError ? 'parse' : 'network'
      }
    }
    if (!knownContracts || Date.now() - knownContracts.at > KNOWN_CONTRACTS_MAX_AGE_MS) return null
    budget.tickersError = `${budget.tickersError} (계약 목록 캐시 사용)`
    return new Map([...knownContracts.map].map(([symbol, t]) => [symbol, { ...t, last: Number.NaN }]))
  })()
  return budget.tickers
}

/**
 * 전체 시세도 계약 목록 캐시도 없을 때 가격 봉만 읽는 계약 — BTCUSDT → BTC_USDT(배율 1). 거래량 환산값을 몰라 가격 전용
 * 요청(priceOnly)에만 쓴다. 1000 배 표기 종목은 gate 계약 이름을 알 수 없어 null.
 */
function derivedContract(symbol: string): GateTicker | null {
  if (!symbol.endsWith('USDT') || /^1000/.test(symbol)) return null
  return { contract: `${symbol.slice(0, -4)}_USDT`, scale: 1, last: Number.NaN, volume: 1 }
}

/** 읽을 봉 — 심볼 id, 앱 주기, 마지막(진행 중일 수 있는 봉)부터 거슬러 센 개수. */
export interface CandleRequest {
  symbol: string
  interval: Interval
  bars: number
  /** 가격만 쓴다(가격·선 알림 시세) — 거래량 환산을 몰라도 읽는다. 지표 봉은 거래량이 필요해 두지 않는다. */
  priceOnly?: boolean
}

/** 읽은 봉(시간순, 비어 있지 않고 값이 모두 수). 마지막 봉은 진행 중일 수 있다. */
export interface LoadedCandles {
  source: PriceSource
  candles: Candle[]
}

/** 묶어서 interval 봉 bars 개를 만드는 데 드는 source 봉 수(맨 앞 덜 찬 봉 하나를 버리고, 1M 은 한 달 최대 31 일). */
function sourceCount(req: CandleRequest, source: Interval): number {
  if (source === req.interval) return req.bars
  const ratio = req.interval === '1M' ? 31 : INTERVAL_SECONDS[req.interval] / INTERVAL_SECONDS[source]
  return (req.bars + 1) * ratio
}

/** 작은 주기로 받았으면 묶는다. anchor 는 장 시작 기준으로 묶는 야후 봉에만 준다. */
function grouped(candles: Candle[], interval: Interval, source: Interval, anchor?: number): Candle[] {
  return source === interval ? candles : aggregate(candles, interval, anchor)
}

/** 비어 있지 않고 모든 값이 수다. */
function valid(candles: Candle[]): boolean {
  return (
    candles.length > 0 &&
    candles.every((c) => [c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite))
  )
}

/** JSON 응답. 실패(연결·상태·본문)는 null — errors 를 주면 이유를 적는다(최근 10개). */
async function getJson<T>(
  url: string,
  headers: Record<string, string> = { Accept: 'application/json' },
  errors?: string[],
): Promise<T | null> {
  const note = (reason: string) => {
    if (!errors) return
    errors.push(`${new URL(url).pathname} ${reason}`)
    if (errors.length > 10) errors.shift()
  }
  try {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      note(String(res.status))
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    note(err instanceof SyntaxError ? 'parse' : 'network')
    return null
  }
}

/** 바이낸스 선물·현물 봉(모든 앱 주기가 있다). 막혔으면 'blocked', 이 항목만 실패했으면 null. */
async function binanceCandles(req: CandleRequest): Promise<Candle[] | 'blocked' | null> {
  const spot = marketOf(req.symbol) === 'bspot'
  const limit = Math.min(req.bars, spot ? SPOT_LIMIT : BINANCE_LIMIT)
  let res: Response
  try {
    res = await fetch(
      `${spot ? SPOT_KLINES_URL : KLINES_URL}?symbol=${nativeSymbol(req.symbol)}&interval=${req.interval}&limit=${limit}`,
    )
  } catch {
    // 연결부터 안 되면 다른 종목도 마찬가지다.
    return 'blocked'
  }
  if (BINANCE_BLOCKED.has(res.status)) return 'blocked'
  if (!res.ok) return null
  try {
    const rows = (await res.json()) as unknown[][]
    return rows.map((r) => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }))
  } catch {
    return null
  }
}

/** gate.io 선물 봉(바이낸스 배율·기초 자산 수량으로 환산). 계약 1장의 수량을 모르면 거래량을 맞출 수 없어 null. */
async function gateCandles(req: CandleRequest, ticker: GateTicker, errors: string[]): Promise<Candle[] | null> {
  if (!(ticker.volume > 0)) return null
  const source = GATE_SOURCE[req.interval] ?? req.interval
  const limit = Math.min(GATE_LIMIT, sourceCount(req, source))
  const rows = await getJson<{ t: number; o: string; h: string; l: string; c: string; v: number }[]>(
    `${GATE_CANDLES_URL}?contract=${ticker.contract}&interval=${source}&limit=${limit}`,
    undefined,
    errors,
  )
  if (!rows) return null
  const { scale, volume } = ticker
  const candles = rows.map((r) => ({
    time: r.t,
    open: Number(r.o) * scale,
    high: Number(r.h) * scale,
    low: Number(r.l) * scale,
    close: Number(r.c) * scale,
    volume: Number(r.v) * volume,
  }))
  return grouped(candles, req.interval, source)
}

/** 바이낸스 현물 심볼 → gate 현물 쌍(BTCUSDT → BTC_USDT). 호가 자산을 모르면 null. */
function gatePair(native: string): string | null {
  const quote = SPOT_QUOTES.find((q) => native.length > q.length && native.endsWith(q))
  return quote ? `${native.slice(0, -quote.length)}_${quote}` : null
}

/**
 * gate.io 현물 봉. 행은 [시작(초), 거래대금, 종가, 고가, 저가, 시가, 거래량(기초 자산), 닫힘] 문자열 배열이다 —
 * 거래량은 바이낸스와 같은 기초 자산 수량(6 번)을 쓴다. gate 에 없는 쌍이면 null.
 */
async function gateSpotCandles(req: CandleRequest, pair: string, errors: string[]): Promise<Candle[] | null> {
  const source = GATE_SPOT_SOURCE[req.interval] ?? req.interval
  const limit = Math.min(GATE_SPOT_LIMIT, sourceCount(req, source))
  const rows = await getJson<string[][]>(
    `${GATE_SPOT_CANDLES_URL}?currency_pair=${pair}&interval=${source}&limit=${limit}`,
    undefined,
    errors,
  )
  if (!rows) return null
  const candles = rows.map((r) => ({
    time: Number(r[0]),
    open: Number(r[5]),
    high: Number(r[3]),
    low: Number(r[4]),
    close: Number(r[2]),
    volume: Number(r[6]),
  }))
  return grouped(candles, req.interval, source)
}

/**
 * 업비트 봉. 최신 쪽부터 to(가장 오래된 봉 시각, 미포함)로 거슬러 pages 쪽까지 차례로 받는다. pages 만큼 봉 조회를 미리
 * 잡아 두고, 과거가 모자라 덜 부른 만큼은 돌려준다. 업비트는 거래가 없던 분의 봉을 주지 않는다.
 */
async function upbitCandles(req: CandleRequest, pages: number, budget: Budget): Promise<Candle[] | null> {
  const plan = upbitPlan(req.interval)
  const market = nativeSymbol(req.symbol)
  let need = Math.min(sourceCount(req, plan.source), pages * UPBIT_PAGE)
  let candles: Candle[] = []
  let to: number | undefined
  let made = 0
  try {
    while (made < pages && need > 0) {
      made++
      const rows = await getJson<UpbitCandleRow[]>(upbitCandlesUrl(market, plan.source, need, to))
      if (!rows) return null
      const page = parseUpbitCandles(rows)
      candles = page.concat(candles)
      if (page.length === 0 || rows.length < Math.min(need, UPBIT_PAGE)) break
      need -= rows.length
      to = page[0].time
    }
  } finally {
    budget.used -= pages - made
    budget.candles -= pages - made
  }
  return plan.group ? aggregate(candles, req.interval) : candles
}

/**
 * 야후 봉(요청 1회). 기간은 bars × 주기를 장이 서는 시간 비율(분·시간봉 ×4 — 하루 6.5 시간 안팎, 일봉 ×1.5 — 주말·휴일,
 * 주·월봉 ×1.1)로 늘린 것의 두 배에 1 시간(지연 시세 여유)을 더하고, YAHOO_WINDOW(한 요청 기간)와 야후 보관 한도
 * (yahooOldest)로 자른다. 2h~12h·3m 은 장 시작 시각(chart.anchor)부터 묶는다. 3d 는 계획이 없다(null).
 */
async function yahooCandles(req: CandleRequest): Promise<Candle[] | null> {
  const plan = yahooPlan(req.interval)
  if (!plan) return null
  const now = Math.floor(Date.now() / 1000)
  const size = INTERVAL_SECONDS[req.interval]
  const factor = size < DAY ? 4 : size === DAY ? 1.5 : 1.1
  const span = Math.min(YAHOO_WINDOW[plan.source] ?? Infinity, 2 * req.bars * size * factor + HOUR)
  const from = Math.max(yahooOldest(plan.source, now), now - span)
  const json = await getJson<YahooChartJson>(
    `${YAHOO_CHART_URL}${encodeURIComponent(nativeSymbol(req.symbol))}?${yahooChartParams(plan.source, from, now)}`,
    YAHOO_HEADERS,
  )
  const chart = json && parseYahooChart(json, plan.source)
  if (!chart) return null
  return grouped(chart.candles, req.interval, plan.source, plan.group === 'session' ? chart.anchor : undefined)
}

/**
 * 항목마다 봉을 읽는다(심볼 id 로 거래소를 고른다 — 머리말 참고).
 * - 바이낸스(선물·현물): 첫 항목으로 막혔는지 먼저 보고, 막혔으면 나머지에는 바이낸스 요청을 쓰지 않는다. 막혔거나 실패한
 *   항목은 gate.io 로 — 선물은 전체 시세에 있는 계약만(없는 종목에는 요청을 쓰지 않는다), 현물은 쌍 이름을 알 때만.
 * - 업비트: upbitPages 쪽까지(가격 1분봉은 1 쪽, 지표 봉은 UPBIT_FEED_PAGES). 쪽 수만큼 자리가 없으면 읽지 않는다.
 * - 야후: 요청 1회. 계획이 없는 주기(3d)는 요청을 쓰지 않는다.
 * 봉 조회 수가 ceiling(CANDLE_FETCH_MAX 이하)에 닿거나 외부 요청이 SUBREQUEST_MAX 에 닿으면 남은 항목은 이번 분에
 * 읽지 않는다(결과에 없다). 결과의 봉은 마지막 bars 개다(과거가 모자라면 더 적다).
 */
export async function loadCandles<K extends CandleRequest>(
  items: K[],
  budget: Budget,
  ceiling: number,
  upbitPages = 1,
): Promise<Map<K, LoadedCandles>> {
  const out = new Map<K, LoadedCandles>()
  // 이번 호출에 더 할 수 있는 봉 조회 수. reserve: 그 전에 따로 써야 할 외부 요청 수.
  const room = (reserve = 0) =>
    Math.max(0, Math.min(ceiling - budget.candles, SUBREQUEST_MAX - budget.used - reserve))
  // 봉 조회 n 회를 잡는다(요청 수와 봉 조회 수 모두). 자리가 모자라면 하나도 잡지 않는다.
  const take = (n: number): boolean => {
    if (n < 1 || room() < n) return false
    budget.used += n
    budget.candles += n
    return true
  }
  const keep = (item: K, source: PriceSource, candles: Candle[] | null): boolean => {
    const last = candles?.slice(-item.bars)
    if (!last || !valid(last)) return false
    out.set(item, { source, candles: last })
    return true
  }
  const failed = new Set<K>()
  const viaBinance = async (item: K): Promise<void> => {
    const got = await binanceCandles(item)
    if (got === 'blocked') budget.binanceBlocked = true
    if (got === 'blocked' || !keep(item, 'binance', got)) failed.add(item)
  }

  // 바이낸스가 막혔는지 첫 바이낸스(선물·현물) 항목으로 먼저 본다.
  const first = budget.binanceBlocked
    ? undefined
    : items.find((item) => marketOf(item.symbol) === 'binance' || marketOf(item.symbol) === 'bspot')
  const probed = first && take(1) ? first : undefined
  if (probed) await viaBinance(probed)
  const jobs: Promise<unknown>[] = []
  for (const item of items) {
    if (item === probed) continue
    const market = marketOf(item.symbol)
    if (market === 'upbit') {
      // 필요한 source 봉 수를 한 쪽(UPBIT_PAGE)씩 — upbitPages 쪽까지.
      const need = sourceCount(item, upbitPlan(item.interval).source)
      const pages = Math.min(upbitPages, Math.ceil(need / UPBIT_PAGE))
      if (take(pages)) jobs.push(upbitCandles(item, pages, budget).then((c) => keep(item, 'upbit', c)))
    } else if (market === 'yahoo') {
      if (yahooPlan(item.interval) && take(1)) jobs.push(yahooCandles(item).then((c) => keep(item, 'yahoo', c)))
    } else if (!budget.binanceBlocked && take(1)) {
      jobs.push(viaBinance(item))
    } else {
      failed.add(item)
    }
  }
  await Promise.all(jobs)

  const fallback = items.filter((item) => failed.has(item))
  if (fallback.length === 0) return out
  // 선물을 gate 로 읽으려면 전체 시세(아직 안 불렀으면 1회) 뒤에 봉 조회 1회가 들어갈 자리가 있어야 한다.
  const futures = fallback.some((item) => marketOf(item.symbol) === 'binance')
  const tickers = futures && room(budget.tickers ? 0 : 1) > 0 ? await gateTickers(budget) : null
  const gateJobs: Promise<unknown>[] = []
  // gate 봉 조회는 클라우드플레어에서 가끔 한 번씩 실패한다(나가는 IP 를 여러 워커가 같이 써 잠깐 막히는 등).
  // 자리가 있으면 한 번 더 받아 본다 — 못 받으면 선물은 전체 시세의 현재가 점 하나로만 판정돼 1분 안의 고가·저가를 놓친다.
  const gateRetry = async (load: () => Promise<Candle[] | null>, item: K): Promise<void> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!take(1)) return
      if (keep(item, 'gate', await load())) return
    }
  }
  for (const item of fallback) {
    if (marketOf(item.symbol) === 'binance') {
      const ticker = tickers?.get(item.symbol) ?? (item.priceOnly ? derivedContract(item.symbol) : null)
      if (ticker) gateJobs.push(gateRetry(() => gateCandles(item, ticker, budget.errors), item))
    } else {
      const pair = gatePair(nativeSymbol(item.symbol))
      if (pair) gateJobs.push(gateRetry(() => gateSpotCandles(item, pair, budget.errors), item))
    }
  }
  await Promise.all(gateJobs)
  return out
}

/**
 * 가격·선 알림이 종목마다 읽는 1분봉 수의 최소 — 진행 중인 봉과 앞선 두 봉. 크론이 한 번 늦거나 건너뛰어도 구간이
 * 끊기지 않는다. 이동 % 알림은 loadQuotes 의 barsFor 로 더 읽는다(바이낸스 선물 1500·현물 1000, gate 선물 2000·현물 1000,
 * 업비트 200(1 쪽), 야후 5 일까지).
 */
export const BAR_LIMIT = 3
const MINUTE_MS = 60_000

/** 1분봉 하나(가격은 바이낸스 표기 배율). 전체 시세의 현재가는 시작·끝이 같은 점 하나로 담는다. */
export interface Bar {
  /** 시작 시각(ms) */
  t: number
  /** 이 자료가 덮는 끝 시각(ms). 닫힌 봉은 t + 1분, 진행 중인 봉은 조회 시각. */
  end: number
  /** 더 바뀌지 않는 자료. 기준(SideMark)은 닫힌 자료로만 적는다 — 진행 중인 봉은 닫힌 뒤 다시 본다. */
  closed: boolean
  o: number
  h: number
  l: number
  c: number
}

/** 종목 하나의 시세. bars 는 시간순이고 비어 있지 않다. */
export interface Quote {
  source: PriceSource
  bars: Bar[]
}

/**
 * 1분 캔들(시간순, 비어 있지 않음)을 봉으로 바꾼다. 마지막 봉만 진행 중일 수 있다.
 * lastOpen: 늦게 오는 시세(야후 — 거래소에 따라 10~20분 지연)는 마지막 봉이 끝난 시각이 지나도 아직 채워지는 중일 수 있어
 * 늘 진행 중으로 본다(그 봉으로 기준을 적지 않는다).
 */
function toBars(candles: Candle[], lastOpen = false): Bar[] {
  const now = Date.now()
  const bars = candles.map(({ time, open, high, low, close }): Bar => {
    const t = time * 1000
    return { t, end: t + MINUTE_MS, closed: true, o: open, h: high, l: low, c: close }
  })
  const last = bars[bars.length - 1]
  if (lastOpen || last.end > now) {
    last.closed = false
    last.end = Math.max(now, last.t)
  }
  return bars
}

/**
 * 종목별 시세를 모은다. 거래소별 1분봉(loadCandles — 바이낸스 → gate.io, 업비트, 야후) → 봉을 못 읽은 바이낸스 선물은
 * gate.io 현재가. 종목마다 max(BAR_LIMIT, barsFor(종목)) 개를 읽는다(거래소 한도까지).
 * 봉 조회는 CANDLE_FETCH_MAX 에서 지표 봉 몫(reserve)을 뺀 만큼까지 — 넘는 선물 종목과 봉을 못 읽은 선물 종목은
 * 전체 시세 한 번(현재가 점 하나)으로 보고, 현물·업비트·야후 종목은 이번 분에 보지 않는다(결과에 없다).
 */
export async function loadQuotes(
  symbols: string[],
  budget: Budget,
  reserve: number,
  barsFor?: (symbol: string) => number,
): Promise<Map<string, Quote>> {
  const quotes = new Map<string, Quote>()
  const items = [...new Set(symbols)]
    .filter(isSymbolId)
    .sort()
    .map((symbol): CandleRequest => ({ symbol, interval: '1m', bars: Math.max(BAR_LIMIT, barsFor?.(symbol) ?? 0), priceOnly: true }))
  if (items.length === 0) return quotes

  const loaded = await loadCandles(items, budget, CANDLE_FETCH_MAX - reserve)
  for (const [{ symbol }, { source, candles }] of loaded) quotes.set(symbol, { source, bars: toBars(candles, source === 'yahoo') })
  const missing = items.filter(({ symbol }) => !quotes.has(symbol) && marketOf(symbol) === 'binance')
  if (missing.length === 0) return quotes

  const tickers = await gateTickers(budget)
  if (!tickers) return quotes
  const now = Date.now()
  for (const { symbol } of missing) {
    const ticker = tickers.get(symbol)
    // 계약 목록 캐시(현재가 NaN)는 현재가 점으로 쓰지 않는다.
    if (!ticker || !Number.isFinite(ticker.last)) continue
    const { last } = ticker
    quotes.set(symbol, { source: 'gate', bars: [{ t: now, end: now, closed: true, o: last, h: last, l: last, c: last }] })
  }
  return quotes
}

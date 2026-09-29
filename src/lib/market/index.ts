/**
 * 시장 공급자 층(브라우저). 앱은 심볼 id 만 넘기고, 여기서 시장(market/ids)에 맞는 어댑터로 보낸다.
 *  - 봉: fetchCandles(최신 limit 개) · fetchOlder(그 시각 이전 한 묶음)
 *  - 24시간 시세: fetchTicker · fetchTickers
 *  - 야후 검색: searchYahoo
 *  - 요청 한도: rateLimitedUntil(symbol)
 * 실시간(웹소켓·폴링)은 market/live.
 */
import { aggregate } from './bars'
import {
  binanceRateLimitedUntil,
  fetch24hTicker,
  fetch24hTickers,
  fetchKlines,
  type BinanceVenue,
} from './binance'
import { marketOf, nativeSymbol, symbolId, upbitPlan, yahooPlan } from './ids'
import { INTERVAL_SECONDS } from '../intervals'
import { RateLimitError, type Candle, type CandlePage, type Interval, type Ticker24h } from './types'
import {
  UPBIT_API,
  UPBIT_PAGE,
  parseUpbitCandles,
  parseUpbitTicker,
  upbitCandlesUrl,
  upbitGet,
  upbitRateLimitedUntil,
  type UpbitCandleRow,
  type UpbitTickerRow,
} from './upbit'
import {
  YAHOO_WINDOW,
  parseYahooChart,
  parseYahooSearch,
  yahooChartParams,
  yahooError,
  yahooOldest,
  type YahooChart,
  type YahooChartJson,
  type YahooMeta,
  type YahooQuote,
  type YahooSearchJson,
} from './yahoo'

/** 과거 한 번 불러오기의 봉 수(스크롤로 왼쪽 끝에 닿을 때). */
export const OLDER_CHUNK = 500
/** 업비트 한 번에 넘겨 받는 캔들 쪽수 상한(쪽당 200) — 묶는 주기도 처음 1,000 개 원본 봉까지만 받는다. */
const UPBIT_MAX_PAGES = 5
/** 야후 창이 비어(휴장·주말) 더 앞 창을 보는 횟수. */
const YAHOO_TRIES = 4

function venueOf(symbol: string): BinanceVenue {
  return marketOf(symbol) === 'bspot' ? 'spot' : 'futures'
}

/* ── 야후(프록시) ─────────────────────────────────────────── */

/** Pages Function 프록시(functions/api/yahoo.ts). 개발 서버는 vite.config 의 같은 처리기가 맡는다. */
const YAHOO_PROXY = '/api/yahoo'
let yahooCooldown = 0

/** 차트 메타를 받을 때마다 알린다 — 심볼 목록(useSymbols)이 이름·통화·자릿수·지연을 배운다. */
const metaListeners = new Set<(native: string, meta: YahooMeta) => void>()

export function onYahooMeta(listener: (native: string, meta: YahooMeta) => void): () => void {
  metaListeners.add(listener)
  return () => metaListeners.delete(listener)
}

async function yahooGet<T>(params: URLSearchParams, signal?: AbortSignal): Promise<{ status: number; body: T }> {
  if (yahooCooldown > Date.now()) throw new RateLimitError('Yahoo', yahooCooldown)
  const res = await fetch(`${YAHOO_PROXY}?${params}`, { signal })
  if (res.status === 429) {
    yahooCooldown = Date.now() + 30_000
    throw new RateLimitError('Yahoo', yahooCooldown)
  }
  const type = res.headers.get('Content-Type') ?? ''
  if (!type.includes('json')) throw new Error(`Yahoo 프록시 ${res.status}`)
  const body = (await res.json()) as T
  return { status: res.status, body }
}

/** 차트 한 번. 요청 기간이 야후 보관 한도 밖이면(422) null. 없는 종목 등은 오류를 던진다. */
async function yahooChart(native: string, params: URLSearchParams, source: Interval, signal?: AbortSignal): Promise<YahooChart | null> {
  params.set('type', 'chart')
  params.set('symbol', native)
  const { status, body } = await yahooGet<YahooChartJson>(params, signal)
  if (status === 422) return null
  const error = yahooError(body)
  const chart = error ? null : parseYahooChart(body, source)
  if (!chart) throw new Error(`Yahoo ${native}: ${error ?? status}`)
  for (const l of metaListeners) l(native, chart.meta)
  return chart
}

/**
 * end(초, 미포함) 이전 봉 한 묶음. 창(YAHOO_WINDOW)이 휴장으로 비면 몇 번 더 앞 창을 본다.
 * 야후 보관 한도(1m 30일, 5m~30m 60일, 60m 730일)나 상장일에 닿으면 done.
 */
async function yahooPage(native: string, interval: Interval, end: number, signal?: AbortSignal): Promise<CandlePage> {
  const plan = yahooPlan(interval)
  if (!plan) throw new Error(`야후는 ${interval} 주기를 주지 않습니다`)
  const oldest = yahooOldest(plan.source, Date.now() / 1000)
  const window = YAHOO_WINDOW[plan.source] ?? 0
  let p2 = end
  for (let tries = 0; tries < YAHOO_TRIES && p2 > oldest; tries++) {
    const p1 = Math.max(oldest, p2 - window)
    const chart = await yahooChart(native, yahooChartParams(plan.source, p1, p2), plan.source, signal)
    const first = chart?.meta.firstTradeDate
    const reachedStart = p1 <= oldest || (first !== undefined && p1 <= first)
    if (chart) {
      const inRange = chart.candles.filter((c) => c.time < end)
      const candles = plan.group ? aggregate(inRange, interval, chart.anchor) : inRange
      if (candles.length > 0 || reachedStart) return { candles, done: reachedStart }
    }
    p2 = p1
  }
  return { candles: [], done: p2 <= oldest }
}

/** 오늘 장 시세(전일 종가 대비). 1일 창의 일봉 메타를 쓴다. */
async function yahooTicker(native: string, id: string, signal?: AbortSignal): Promise<Ticker24h> {
  const chart = await yahooChart(native, new URLSearchParams({ interval: '1d', range: '1d' }), '1d', signal)
  if (!chart) throw new Error(`Yahoo ${native}: 시세 없음`)
  const m = chart.meta
  const last = m.regularMarketPrice ?? chart.candles.at(-1)?.close ?? NaN
  const prev = m.chartPreviousClose ?? last
  const volume = m.regularMarketVolume ?? 0
  return {
    symbol: id,
    lastPrice: last,
    priceChange: last - prev,
    priceChangePercent: prev > 0 ? ((last - prev) / prev) * 100 : 0,
    highPrice: m.regularMarketDayHigh ?? last,
    lowPrice: m.regularMarketDayLow ?? last,
    volume,
    quoteVolume: volume * last,
  }
}

/** 야후 종목 검색(영문·숫자 검색어 — 한글은 yahooNames 표로 찾는다). */
export async function searchYahoo(query: string, signal?: AbortSignal): Promise<YahooQuote[]> {
  const { status, body } = await yahooGet<YahooSearchJson>(new URLSearchParams({ type: 'search', q: query }), signal)
  if (status !== 200) return []
  return parseYahooSearch(body)
}

/* ── 업비트 ─────────────────────────────────────────────── */

/**
 * before(초, 미포함) 이전 봉 bars 개(묶는 주기는 원본 봉 bars×배수, 최대 UPBIT_MAX_PAGES 쪽).
 * before 가 없으면 최신(진행 중인 봉 포함). 한 쪽이 200 개보다 적으면 상장 첫 봉까지 온 것.
 */
async function upbitPage(market: string, interval: Interval, before: number | undefined, bars: number, signal?: AbortSignal): Promise<CandlePage> {
  const plan = upbitPlan(interval)
  const factor = plan.group ? INTERVAL_SECONDS[interval] / INTERVAL_SECONDS[plan.source] : 1
  const pages = Math.min(UPBIT_MAX_PAGES, Math.ceil((bars * factor) / UPBIT_PAGE))
  let all: Candle[] = []
  let to = before
  let done = false
  for (let i = 0; i < pages; i++) {
    const rows = await upbitGet<UpbitCandleRow[]>(upbitCandlesUrl(market, plan.source, UPBIT_PAGE, to), signal)
    const page = parseUpbitCandles(rows)
    all = [...page, ...all]
    if (rows.length < UPBIT_PAGE || page.length === 0) {
      done = true
      break
    }
    to = page[0].time
  }
  return { candles: plan.group && all.length > 0 ? aggregate(all, interval) : all, done }
}

/* ── 공통 ───────────────────────────────────────────────── */

/** 최신 봉 limit 개 안팎(야후는 창 단위라 봉 수가 다르다). 마지막 봉은 진행 중일 수 있다. */
export async function fetchCandles(symbol: string, interval: Interval, limit = 1000, signal?: AbortSignal): Promise<Candle[]> {
  const native = nativeSymbol(symbol)
  switch (marketOf(symbol)) {
    case 'binance':
    case 'bspot':
      return fetchKlines(native, interval, limit, signal, undefined, undefined, venueOf(symbol))
    case 'upbit':
      return (await upbitPage(native, interval, undefined, limit, signal)).candles
    case 'yahoo':
      return (await yahooPage(native, interval, Math.floor(Date.now() / 1000) + 60, signal)).candles
  }
}

/** before(초) 이전 봉 한 묶음(약 OLDER_CHUNK 개). */
export async function fetchOlder(symbol: string, interval: Interval, before: number, signal?: AbortSignal): Promise<CandlePage> {
  const native = nativeSymbol(symbol)
  switch (marketOf(symbol)) {
    case 'binance':
    case 'bspot': {
      // endTime 은 포함이라 1ms 빼서 겹침을 피한다.
      const list = await fetchKlines(native, interval, OLDER_CHUNK, signal, before * 1000 - 1, undefined, venueOf(symbol))
      return { candles: list.filter((c) => c.time < before), done: list.length < OLDER_CHUNK }
    }
    case 'upbit':
      return upbitPage(native, interval, before, OLDER_CHUNK, signal)
    case 'yahoo':
      return yahooPage(native, interval, before, signal)
  }
}

/** 이 심볼의 공급자가 요청 한도에 걸려 쉬는 중이면 재개 시각(ms), 아니면 0. */
export function rateLimitedUntil(symbol: string): number {
  switch (marketOf(symbol)) {
    case 'binance':
    case 'bspot':
      return binanceRateLimitedUntil(venueOf(symbol))
    case 'upbit':
      return upbitRateLimitedUntil()
    case 'yahoo':
      return yahooCooldown > Date.now() ? yahooCooldown : 0
  }
}

/** 한 종목 시세. */
export async function fetchTicker(symbol: string, signal?: AbortSignal): Promise<Ticker24h> {
  const native = nativeSymbol(symbol)
  switch (marketOf(symbol)) {
    case 'binance':
    case 'bspot':
      return fetch24hTicker(native, venueOf(symbol), symbol, signal)
    case 'upbit': {
      const [row] = await upbitGet<UpbitTickerRow[]>(`${UPBIT_API}/ticker?markets=${encodeURIComponent(native)}`, signal)
      if (!row) throw new Error(`Upbit ${native}: 시세 없음`)
      return parseUpbitTicker(row, symbol)
    }
    case 'yahoo':
      return yahooTicker(native, symbol, signal)
  }
}

/**
 * 한 시장의 여러 종목 시세(REST — 웹소켓이 값을 주기 전·끊겼을 때). 선물은 전 종목 한 번, 현물·업비트는 필요한 것만 한 번,
 * 야후는 종목마다 한 번씩(차례로). 받지 못한 종목은 결과에 없다.
 */
export async function fetchTickers(symbols: string[], signal?: AbortSignal): Promise<Ticker24h[]> {
  if (symbols.length === 0) return []
  const market = marketOf(symbols[0])
  if (market === 'binance' || market === 'bspot') {
    const venue = venueOf(symbols[0])
    const natives = symbols.map(nativeSymbol)
    const want = new Set(natives)
    const list = await fetch24hTickers(venue, natives, signal)
    return list.filter((t) => want.has(t.symbol)).map((t) => ({ ...t, symbol: symbolId(market, t.symbol) }))
  }
  if (market === 'upbit') {
    const markets = symbols.map(nativeSymbol).join(',')
    const rows = await upbitGet<UpbitTickerRow[]>(`${UPBIT_API}/ticker?markets=${encodeURIComponent(markets)}`, signal)
    return rows.map((r) => parseUpbitTicker(r, symbolId('upbit', r.market)))
  }
  const out: Ticker24h[] = []
  for (const symbol of symbols) {
    try {
      out.push(await yahooTicker(nativeSymbol(symbol), symbol, signal))
    } catch (err) {
      if (err instanceof RateLimitError || signal?.aborted) break
    }
  }
  return out
}

/**
 * 진행 중인 봉과 바로 앞 봉 몇 개 — 야후 폴링·업비트 실시간 봉의 시작값. 야후는 주기 두 개(묶는 봉이 온전히 들어가게)나
 * 원본 봉 세 개 가운데 긴 창만 받는다(휴장 중이면 빈 목록).
 */
export async function fetchLatest(symbol: string, interval: Interval, signal?: AbortSignal): Promise<Candle[]> {
  const market = marketOf(symbol)
  if (market !== 'yahoo') return (await fetchCandles(symbol, interval, 2, signal)).slice(-2)
  const plan = yahooPlan(interval)
  if (!plan) return []
  const now = Math.floor(Date.now() / 1000)
  const span = Math.max(2 * INTERVAL_SECONDS[interval], 3 * INTERVAL_SECONDS[plan.source])
  const chart = await yahooChart(nativeSymbol(symbol), yahooChartParams(plan.source, now - span, now + 60), plan.source, signal)
  if (!chart) return []
  return (plan.group ? aggregate(chart.candles, interval, chart.anchor) : chart.candles).slice(-2)
}

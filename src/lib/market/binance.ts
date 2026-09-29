/**
 * 바이낸스 어댑터 — USDT-M 선물(fapi, 접두사 없는 id)과 현물(api.binance.com, BSPOT: id).
 * 두 곳 모두 브라우저에서 직접 부른다(키 없음). 요청 한도는 호스트마다 따로 세므로 쿨다운도 호스트마다 둔다.
 * 이 파일의 함수는 거래소 심볼(BTCUSDT)을 받는다 — 앱 id 는 market/index 가 바꿔 넘긴다.
 */
import { RateLimitError, type Candle, type Interval, type Ticker24h } from './types'

const FAPI_BASE = 'https://fapi.binance.com'
const SPOT_BASE = 'https://api.binance.com'

export type BinanceVenue = 'futures' | 'spot'

/**
 * /fapi/v1/klines · /api/v3/klines 응답 한 행.
 * [openTime, open, high, low, close, volume, closeTime, quoteVolume,
 *  trades, takerBuyBase, takerBuyQuote, ignore]
 */
export type RawKline = [
  number, string, string, string, string, string,
  number, string, number, string, string, string,
]

export interface ExchangeSymbol {
  symbol: string
  /** 선물만 */
  pair?: string
  /** 선물만. PERPETUAL | CURRENT_QUARTER | … */
  contractType?: string
  baseAsset: string
  quoteAsset: string
  status: string
  /** 선물만 */
  pricePrecision?: number
  quantityPrecision?: number
  /** 분기물 인도일(ms). 무기한은 보통 아주 먼 미래값이 온다. */
  deliveryDate?: number
  /** COIN | INDEX 등. 주식·원자재 분류에 쓴다. */
  underlyingType?: string
  /** exchangeInfo 필터. 가격(PRICE_FILTER.tickSize)·수량(LOT_SIZE.stepSize/minQty)을 여기서 뽑는다. */
  filters?: { filterType: string; tickSize?: string; stepSize?: string; minQty?: string }[]
}

interface RawExchangeInfo {
  symbols: ExchangeSymbol[]
}

interface Raw24hTicker {
  symbol: string
  lastPrice: string
  priceChange: string
  priceChangePercent: string
  highPrice: string
  lowPrice: string
  volume: string
  quoteVolume: string
}

/** REST 는 대문자 심볼을 요구한다. */
export function toRestSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

/** 웹소켓 스트림 이름은 소문자다. */
export function toStreamSymbol(symbol: string): string {
  return symbol.trim().toLowerCase()
}

/** 호스트별 쿨다운. 마지막으로 받은 429/418 의 Retry-After 로 정해진다. */
const cooldownUntil: Record<BinanceVenue, number> = { futures: 0, spot: 0 }

/** 쿨다운이 살아 있으면 재개 가능 시각(ms), 아니면 0. */
export function binanceRateLimitedUntil(venue: BinanceVenue): number {
  return cooldownUntil[venue] > Date.now() ? cooldownUntil[venue] : 0
}

/** 경로로 호스트를 가른다 — /fapi/ 는 선물, /api/ 는 현물. */
async function getJson<T>(path: string, params: Record<string, string | number>, signal?: AbortSignal): Promise<T> {
  const venue: BinanceVenue = path.startsWith('/fapi/') ? 'futures' : 'spot'
  if (cooldownUntil[venue] > Date.now()) throw new RateLimitError('Binance', cooldownUntil[venue])
  const url = new URL(path, venue === 'futures' ? FAPI_BASE : SPOT_BASE)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  const res = await fetch(url, { signal })
  if (res.status === 429 || res.status === 418) {
    // Retry-After 는 초 단위. 없으면 429 는 60초, 418(차단)은 5분을 기본으로 쉰다.
    const header = Number(res.headers.get('Retry-After'))
    const fallback = res.status === 418 ? 300 : 60
    const secs = Number.isFinite(header) && header > 0 ? header : fallback
    cooldownUntil[venue] = Date.now() + secs * 1000
    throw new RateLimitError('Binance', cooldownUntil[venue])
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Binance ${path} ${res.status} ${res.statusText}${body ? `: ${body}` : ''}`)
  }
  return (await res.json()) as T
}

export function normalizeKline(raw: RawKline): Candle {
  return {
    time: Math.floor(raw[0] / 1000),
    open: Number(raw[1]),
    high: Number(raw[2]),
    low: Number(raw[3]),
    close: Number(raw[4]),
    volume: Number(raw[5]),
  }
}

/** 한 번에 받는 봉 수 상한 — 선물 1500, 현물 1000. */
export const KLINES_MAX: Record<BinanceVenue, number> = { futures: 1500, spot: 1000 }

export async function fetchKlines(
  symbol: string,
  interval: Interval,
  limit = 1000,
  signal?: AbortSignal,
  /** 이 시각(ms) 이전 캔들만 — 과거로 거슬러 올라갈 때 쓴다. */
  endTime?: number,
  /** 이 시각(ms) 이후 캔들만 — 되짚기에서 앞으로 나아갈 때 쓴다. */
  startTime?: number,
  venue: BinanceVenue = 'futures',
): Promise<Candle[]> {
  const params: Record<string, string | number> = {
    symbol: toRestSymbol(symbol),
    interval,
    limit: Math.min(limit, KLINES_MAX[venue]),
  }
  if (endTime !== undefined) params.endTime = endTime
  if (startTime !== undefined) params.startTime = startTime
  const raw = await getJson<RawKline[]>(venue === 'futures' ? '/fapi/v1/klines' : '/api/v3/klines', params, signal)
  return raw.map(normalizeKline)
}

/** USDT 마진 무기한/선물 페어 중 거래중(TRADING)인 것만 반환. */
export async function fetchExchangeInfo(signal?: AbortSignal): Promise<ExchangeSymbol[]> {
  const info = await getJson<RawExchangeInfo>('/fapi/v1/exchangeInfo', {}, signal)
  return info.symbols.filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
}

/** 현물 목록에 넣는 견적 자산. */
const SPOT_QUOTES = new Set(['USDT', 'USDC', 'FDUSD', 'BTC'])

/**
 * 거래중인 현물 페어(USDT·USDC·FDUSD·BTC 마켓). 권한 목록(permissionSets)을 빼 달라고 해 응답을 줄인다.
 */
export async function fetchSpotExchangeInfo(signal?: AbortSignal): Promise<ExchangeSymbol[]> {
  const info = await getJson<RawExchangeInfo>(
    '/api/v3/exchangeInfo',
    { symbolStatus: 'TRADING', showPermissionSets: 'false' },
    signal,
  )
  return info.symbols.filter((s) => SPOT_QUOTES.has(s.quoteAsset))
}

function toTicker(raw: Raw24hTicker, id: string): Ticker24h {
  return {
    symbol: id,
    lastPrice: Number(raw.lastPrice),
    priceChange: Number(raw.priceChange),
    priceChangePercent: Number(raw.priceChangePercent),
    highPrice: Number(raw.highPrice),
    lowPrice: Number(raw.lowPrice),
    volume: Number(raw.volume),
    quoteVolume: Number(raw.quoteVolume),
  }
}

/** 한 종목 24시간 시세. id 는 결과에 넣을 앱 심볼 id. */
export async function fetch24hTicker(
  symbol: string,
  venue: BinanceVenue,
  id: string,
  signal?: AbortSignal,
): Promise<Ticker24h> {
  const raw = await getJson<Raw24hTicker>(
    venue === 'futures' ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr',
    { symbol: toRestSymbol(symbol) },
    signal,
  )
  return toTicker(raw, id)
}

/**
 * 여러 종목 24시간 시세. 선물은 전 종목 한 번(가중치 40), 현물은 symbols=[…] 로 필요한 것만 받는다.
 * 결과의 symbol 은 거래소 심볼이다(호출하는 쪽이 id 로 바꾼다).
 */
export async function fetch24hTickers(
  venue: BinanceVenue,
  symbols: string[],
  signal?: AbortSignal,
): Promise<Ticker24h[]> {
  const raw =
    venue === 'futures'
      ? await getJson<Raw24hTicker[]>('/fapi/v1/ticker/24hr', {}, signal)
      : await getJson<Raw24hTicker[]>(
          '/api/v3/ticker/24hr',
          { symbols: JSON.stringify(symbols.map(toRestSymbol)) },
          signal,
        )
  return raw.map((r) => toTicker(r, r.symbol))
}

/** wss 스트림의 kline 이벤트 페이로드. */
export interface KlineStreamEvent {
  e: 'kline'
  E: number
  s: string
  k: {
    t: number
    T: number
    s: string
    i: string
    o: string
    h: string
    l: string
    c: string
    v: string
    x: boolean
  }
}

export function normalizeStreamKline(k: KlineStreamEvent['k']): Candle {
  return {
    time: Math.floor(k.t / 1000),
    open: Number(k.o),
    high: Number(k.h),
    low: Number(k.l),
    close: Number(k.c),
    volume: Number(k.v),
  }
}

/**
 * USDⓈ-M 선물 웹소켓은 2026-04-23부터 용도별 경로로 나뉘었다. kline·aggTrade·miniTicker 는
 * `/market` 경로에서만 온다 — 예전 `wss://fstream.binance.com/ws/...` 는 연결만 되고 데이터가 오지 않는다.
 * 현물은 stream.binance.com 결합 스트림.
 */
const MARKET_WS = 'wss://fstream.binance.com/market/stream?streams='
const SPOT_WS = 'wss://stream.binance.com:9443/stream?streams='

export function combinedStreamUrl(venue: BinanceVenue, streams: string[]): string {
  return (venue === 'futures' ? MARKET_WS : SPOT_WS) + streams.join('/')
}

/** 봉 스트림 이름. 메시지의 stream 이름은 `btcusdt@kline_1m` 꼴. */
export function klineStreamName(symbol: string, interval: Interval): string {
  return `${toStreamSymbol(symbol)}@kline_${interval}`
}

/** 결합 스트림 메시지 포장. */
export interface CombinedStreamMessage<T> {
  stream: string
  data: T
}

/** 체결(aggTrade) 이벤트. p=가격, q=수량, T=체결 시각(ms). */
export interface AggTradeEvent {
  e: 'aggTrade'
  E: number
  s: string
  p: string
  q: string
  T: number
}

/** 24시간 미니 티커(약 1~2초). c=현재가, o=24시간 전 시가. */
export interface MiniTickerEvent {
  e: '24hrMiniTicker'
  E: number
  s: string
  c: string
  o: string
  h: string
  l: string
  v: string
  q: string
}

/** 미니 티커 → 시세. id 는 결과에 넣을 앱 심볼 id. */
export function normalizeMiniTicker(t: MiniTickerEvent, id: string): Ticker24h {
  const last = Number(t.c)
  const open = Number(t.o)
  return {
    symbol: id,
    lastPrice: last,
    priceChange: last - open,
    priceChangePercent: open > 0 ? ((last - open) / open) * 100 : 0,
    highPrice: Number(t.h),
    lowPrice: Number(t.l),
    volume: Number(t.v),
    quoteVolume: Number(t.q),
  }
}

/* ── 모의 선물거래용 헬퍼 ─────────────────────────────────────── */

/** 시장가 체결에 쓰는 매수1/매도1 호가. time 은 이벤트 시각(ms). */
export interface BookTicker {
  bid: number
  ask: number
  time: number
}

interface RawBookTicker {
  bidPrice: string
  askPrice: string
  time: number
}

/** 매수1/매도1 호가 — 시장가 주문 체결가 산정용. */
export async function fetchBookTicker(symbol: string, signal?: AbortSignal): Promise<BookTicker> {
  const raw = await getJson<RawBookTicker>('/fapi/v1/ticker/bookTicker', { symbol: toRestSymbol(symbol) }, signal)
  return { bid: Number(raw.bidPrice), ask: Number(raw.askPrice), time: raw.time }
}

/** 호가창 스냅숏. bids 는 높은 가격부터, asks 는 낮은 가격부터 [가격, 수량]. time 은 거래 엔진 시각(ms). */
export interface OrderBook {
  bids: [number, number][]
  asks: [number, number][]
  time: number
}

interface RawDepth {
  T: number
  bids: [string, string][]
  asks: [string, string][]
}

/**
 * 호가창(/fapi/v1/depth) — 시장가 체결가를 호가창을 훑어 정할 때 쓴다. 가중치는 50단계 2, 100단계 5 —
 * 100단계는 50단계로 모자란 큰 주문만 받는다. 쿨다운 중이면 네트워크를 건드리지 않고 RateLimitError.
 */
export async function fetchDepth(symbol: string, limit: 50 | 100 = 50, signal?: AbortSignal): Promise<OrderBook> {
  const raw = await getJson<RawDepth>('/fapi/v1/depth', { symbol: toRestSymbol(symbol), limit }, signal)
  const levels = (rows: [string, string][]): [number, number][] => rows.map(([p, q]) => [Number(p), Number(q)])
  return { bids: levels(raw.bids), asks: levels(raw.asks), time: raw.T }
}

/** 마크 가격·펀딩 정보. */
export interface PremiumIndex {
  mark: number
  fundingRate: number
  nextFundingTime: number
  time: number
}

interface RawPremiumIndex {
  markPrice: string
  lastFundingRate: string
  nextFundingTime: number
  time: number
}

/** 마크 가격과 현재 펀딩비율·다음 정산 시각. */
export async function fetchPremiumIndex(symbol: string, signal?: AbortSignal): Promise<PremiumIndex> {
  const raw = await getJson<RawPremiumIndex>('/fapi/v1/premiumIndex', { symbol: toRestSymbol(symbol) }, signal)
  return {
    mark: Number(raw.markPrice),
    fundingRate: Number(raw.lastFundingRate),
    nextFundingTime: raw.nextFundingTime,
    time: raw.time,
  }
}

/** 펀딩 내역 한 건. time=정산 시각(ms), rate=펀딩비율, mark=정산 마크가. */
export interface FundingRate {
  time: number
  rate: number
  mark: number
}

interface RawFundingRate {
  symbol: string
  fundingTime: number
  fundingRate: string
  markPrice: string
}

/** 펀딩 내역(정산 이력). 되짚기에서 구간별 펀딩을 매길 때 쓴다. */
export async function fetchFundingRates(
  symbol: string,
  startTime: number,
  endTime?: number,
  signal?: AbortSignal,
): Promise<FundingRate[]> {
  const params: Record<string, string | number> = {
    symbol: toRestSymbol(symbol),
    startTime,
    limit: 1000,
  }
  if (endTime !== undefined) params.endTime = endTime
  const raw = await getJson<RawFundingRate[]>('/fapi/v1/fundingRate', params, signal)
  return raw.map((r) => ({ time: r.fundingTime, rate: Number(r.fundingRate), mark: Number(r.markPrice) }))
}

/** 마크 가격 캔들(강제 청산·유지증거금 되짚기용). time 은 초 단위. */
export async function fetchMarkKlines(
  symbol: string,
  interval: Interval,
  startTime: number,
  endTime: number,
  limit = 1500,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const raw = await getJson<RawKline[]>(
    '/fapi/v1/markPriceKlines',
    { symbol: toRestSymbol(symbol), interval, startTime, endTime, limit },
    signal,
  )
  return raw.map(normalizeKline)
}

/** 집계 체결 한 건. time=체결 시각(ms). */
export interface AggTrade {
  id: number
  price: number
  qty: number
  time: number
}

interface RawAggTrade {
  a: number
  p: string
  q: string
  T: number
}

/**
 * 집계 체결 이력(되짚기의 부분 분봉 채우기용). 창은 최대 1시간. fromId 로 페이지를 넘긴다.
 * fromId 를 주면 startTime/endTime 은 무시된다(바이낸스 규칙).
 */
export async function fetchAggTrades(
  symbol: string,
  startTime: number,
  endTime: number,
  fromId?: number,
  signal?: AbortSignal,
): Promise<AggTrade[]> {
  const params: Record<string, string | number> = {
    symbol: toRestSymbol(symbol),
    limit: 1000,
  }
  if (fromId !== undefined) params.fromId = fromId
  else {
    params.startTime = startTime
    params.endTime = endTime
  }
  const raw = await getJson<RawAggTrade[]>('/fapi/v1/aggTrades', params, signal)
  return raw.map((t) => ({ id: t.a, price: Number(t.p), qty: Number(t.q), time: t.T }))
}

/** wss 스트림의 markPrice(@1s) 이벤트. p=마크가, r=펀딩비율, T=다음 정산 시각(ms). */
export interface MarkPriceEvent {
  e: 'markPriceUpdate'
  E: number
  s: string
  p: string
  r: string
  T: number
}

/**
 * 모의 선물거래 결합 스트림: 종목마다 체결(aggTrade)과 마크가(markPrice@1s)를 함께 받는다.
 * 메시지의 stream 이름은 `btcusdt@aggTrade` · `btcusdt@markPrice@1s` 꼴.
 */
export function paperStreamUrl(symbols: string[]): string {
  const streams = symbols.flatMap((s) => {
    const lower = toStreamSymbol(s)
    return [`${lower}@aggTrade`, `${lower}@markPrice@1s`]
  })
  return MARKET_WS + streams.join('/')
}

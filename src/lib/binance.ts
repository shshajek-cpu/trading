const FAPI_BASE = 'https://fapi.binance.com'

export type Interval =
  | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '8h' | '12h'
  | '1d' | '3d' | '1w' | '1M'

/** 정규화된 캔들. time 은 초 단위(UTC) — lightweight-charts 규격. */
export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * /fapi/v1/klines 응답 한 행.
 * [openTime, open, high, low, close, volume, closeTime, quoteVolume,
 *  trades, takerBuyBase, takerBuyQuote, ignore]
 */
export type RawKline = [
  number, string, string, string, string, string,
  number, string, number, string, string, string,
]

export interface ExchangeSymbol {
  symbol: string
  pair: string
  contractType: string
  baseAsset: string
  quoteAsset: string
  status: string
  pricePrecision: number
  quantityPrecision: number
  /** 분기물 인도일(ms). 무기한은 보통 아주 먼 미래값이 온다. */
  deliveryDate?: number
  /** COIN | INDEX 등. 주식·원자재 분류에 쓴다. */
  underlyingType?: string
  /** exchangeInfo 필터. 가격 자릿수(PRICE_FILTER.tickSize)를 여기서 뽑는다. */
  filters?: { filterType: string; tickSize?: string }[]
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

export interface Ticker24h {
  symbol: string
  lastPrice: number
  priceChange: number
  priceChangePercent: number
  highPrice: number
  lowPrice: number
  volume: number
  quoteVolume: number
}

/** REST 는 대문자 심볼을 요구한다. */
export function toRestSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

/** 웹소켓 스트림 이름은 소문자다. */
export function toStreamSymbol(symbol: string): string {
  return symbol.trim().toLowerCase()
}

async function getJson<T>(path: string, params: Record<string, string | number>, signal?: AbortSignal): Promise<T> {
  const url = new URL(path, FAPI_BASE)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  const res = await fetch(url, { signal })
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

export async function fetchKlines(
  symbol: string,
  interval: Interval,
  limit = 1000,
  signal?: AbortSignal,
  /** 이 시각(ms) 이전 캔들만 — 과거로 거슬러 올라갈 때 쓴다. */
  endTime?: number,
): Promise<Candle[]> {
  const params: Record<string, string | number> = {
    symbol: toRestSymbol(symbol),
    interval,
    limit,
  }
  if (endTime !== undefined) params.endTime = endTime
  const raw = await getJson<RawKline[]>('/fapi/v1/klines', params, signal)
  return raw.map(normalizeKline)
}

/** USDT 마진 무기한/선물 페어 중 거래중(TRADING)인 것만 반환. */
export async function fetchExchangeInfo(signal?: AbortSignal): Promise<ExchangeSymbol[]> {
  const info = await getJson<RawExchangeInfo>('/fapi/v1/exchangeInfo', {}, signal)
  return info.symbols.filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
}

export async function fetch24hTicker(symbol: string, signal?: AbortSignal): Promise<Ticker24h> {
  const raw = await getJson<Raw24hTicker>(
    '/fapi/v1/ticker/24hr',
    { symbol: toRestSymbol(symbol) },
    signal,
  )
  return {
    symbol: raw.symbol,
    lastPrice: Number(raw.lastPrice),
    priceChange: Number(raw.priceChange),
    priceChangePercent: Number(raw.priceChangePercent),
    highPrice: Number(raw.highPrice),
    lowPrice: Number(raw.lowPrice),
    volume: Number(raw.volume),
    quoteVolume: Number(raw.quoteVolume),
  }
}

/**
 * 전 종목 24시간 시세. 관심 종목 시세판이 쓴다.
 *
 * 선물 웹소켓 전체 스트림(!miniTicker@arr)은 일부 망에서 응답이 오지 않아 REST 로 받는다.
 */
export async function fetchAll24hTickers(signal?: AbortSignal): Promise<Ticker24h[]> {
  const raw = await getJson<Raw24hTicker[]>('/fapi/v1/ticker/24hr', {}, signal)
  return raw.map((r) => ({
    symbol: r.symbol,
    lastPrice: Number(r.lastPrice),
    priceChange: Number(r.priceChange),
    priceChangePercent: Number(r.priceChangePercent),
    highPrice: Number(r.highPrice),
    lowPrice: Number(r.lowPrice),
    volume: Number(r.volume),
    quoteVolume: Number(r.quoteVolume),
  }))
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
 */
const MARKET_WS = 'wss://fstream.binance.com/market/stream?streams='

/** 차트용 결합 스트림: 봉(약 250ms)과 체결(거래마다)을 함께 받아 TradingView·바이낸스처럼 즉시 움직인다. */
export function klineStreamUrl(symbol: string, interval: Interval): string {
  const s = toStreamSymbol(symbol)
  return `${MARKET_WS}${s}@kline_${interval}/${s}@aggTrade`
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

export function miniTickerStreamUrl(symbols: string[]): string {
  return MARKET_WS + symbols.map((s) => `${toStreamSymbol(s)}@miniTicker`).join('/')
}

export function normalizeMiniTicker(t: MiniTickerEvent): Ticker24h {
  const last = Number(t.c)
  const open = Number(t.o)
  return {
    symbol: t.s,
    lastPrice: last,
    priceChange: last - open,
    priceChangePercent: open > 0 ? ((last - open) / open) * 100 : 0,
    highPrice: Number(t.h),
    lowPrice: Number(t.l),
    volume: Number(t.v),
    quoteVolume: Number(t.q),
  }
}

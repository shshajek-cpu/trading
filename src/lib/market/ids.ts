/**
 * 앱 심볼 id 규칙과 시장별 주기 계획. 다른 곳은 심볼을 불투명한 문자열로 다루고, 시장을 알아야 할 때만 여기를 부른다.
 *
 *  - `BTCUSDT`          바이낸스 USDT-M 선물(접두사 없음 — 예전부터 저장된 값 그대로)
 *  - `BSPOT:BTCUSDT`    바이낸스 현물
 *  - `UPBIT:KRW-BTC`    업비트 원화 마켓
 *  - `YF:AAPL`          야후 파이낸스(주식 `YF:005930.KS` · 지수 `YF:^GSPC` · 환율 `YF:KRW=X` · 선물 `YF:GC=F`)
 *
 * window·document·localStorage 를 쓰지 않는다(푸시 워커가 번들한다).
 */
import type { Interval, MarketId } from './types'

const PREFIX: Record<Exclude<MarketId, 'binance'>, string> = {
  bspot: 'BSPOT:',
  upbit: 'UPBIT:',
  yahoo: 'YF:',
}

export function marketOf(symbol: string): MarketId {
  if (symbol.startsWith(PREFIX.bspot)) return 'bspot'
  if (symbol.startsWith(PREFIX.upbit)) return 'upbit'
  if (symbol.startsWith(PREFIX.yahoo)) return 'yahoo'
  return 'binance'
}

/** 거래소가 쓰는 심볼(BTCUSDT, KRW-BTC, AAPL). */
export function nativeSymbol(symbol: string): string {
  const market = marketOf(symbol)
  return market === 'binance' ? symbol : symbol.slice(PREFIX[market].length)
}

/** 거래소 심볼 → 앱 id. */
export function symbolId(market: MarketId, native: string): string {
  return market === 'binance' ? native : PREFIX[market] + native
}

/** 모양 검사. 동기화·푸시 워커가 받은 값으로 요청을 쓰기 전에 본다. */
const SHAPE: Record<MarketId, RegExp> = {
  binance: /^[0-9A-Z_]{2,40}$/,
  bspot: /^BSPOT:[0-9A-Z]{2,30}$/,
  upbit: /^UPBIT:KRW-[0-9A-Z]{1,20}$/,
  yahoo: /^YF:[0-9A-Za-z^=.\-&]{1,24}$/,
}

export function isSymbolId(symbol: string): boolean {
  return SHAPE[marketOf(symbol)].test(symbol)
}

/** 모의 선물거래는 바이낸스 USDT-M 선물에서만 된다(호가·마크가·펀딩·OKX 규칙이 선물 전용). */
export function supportsPaperTrading(symbol: string): boolean {
  return marketOf(symbol) === 'binance'
}

/**
 * 공급자에서 받을 봉과 묶는 방법.
 *  - source: 받을 앱 주기(거래소에 있는 주기)
 *  - group:  null = 그대로, 'utc' = 바이낸스 경계(UTC)로 묶기, 'session' = 거래소 장 시작 시각부터 주기씩 묶기
 */
export interface FetchPlan {
  source: Interval
  group: null | 'utc' | 'session'
}

/**
 * 업비트: 분(1·3·5·10·15·30·60·240)·일·주·월봉. 모두 UTC 경계라(일봉은 09:00 KST = 00:00 UTC) 나머지는
 * 바이낸스 경계로 묶는다 — 2h·6h ← 60분, 8h·12h ← 240분, 3d ← 일봉.
 */
export function upbitPlan(interval: Interval): FetchPlan {
  switch (interval) {
    case '2h':
    case '6h':
      return { source: '1h', group: 'utc' }
    case '8h':
    case '12h':
      return { source: '4h', group: 'utc' }
    case '3d':
      return { source: '1d', group: 'utc' }
    default:
      return { source: interval, group: null }
  }
}

/**
 * 야후: 1m·5m·15m·30m·60m·1d·1wk·1mo. 3m 은 1m, 2h~12h 는 60m 을 장 시작 시각부터 묶는다(TradingView 주식 봉처럼
 * 09:30·11:30 …). 3d 는 거래일 경계가 모호해 끈다(null).
 */
export function yahooPlan(interval: Interval): FetchPlan | null {
  switch (interval) {
    case '3m':
      return { source: '1m', group: 'session' }
    case '2h':
    case '4h':
    case '6h':
    case '8h':
    case '12h':
      return { source: '1h', group: 'session' }
    case '3d':
      return null
    default:
      return { source: interval, group: null }
  }
}

const ALL_INTERVALS: Interval[] = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']

/** 이 심볼에서 고를 수 있는 주기(메뉴 순서). */
export function supportedIntervals(symbol: string): Interval[] {
  if (marketOf(symbol) === 'yahoo') return ALL_INTERVALS.filter((i) => yahooPlan(i) !== null)
  return ALL_INTERVALS
}

export function supportsInterval(symbol: string, interval: Interval): boolean {
  return marketOf(symbol) !== 'yahoo' || yahooPlan(interval) !== null
}

/** 시장 이름(검색 탭·배지·범례). */
export const MARKET_LABEL: Record<MarketId, string> = {
  binance: '바이낸스 선물',
  bspot: '바이낸스 현물',
  upbit: '업비트',
  yahoo: '주식·지수',
}

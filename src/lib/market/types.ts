/**
 * 시장 공통 자료형. 거래소(바이낸스 선물·현물, 업비트, 야후 파이낸스)와 상관없이 앱이 다루는 모양이다.
 * 푸시 워커도 이 파일을 번들한다 — window·document·localStorage 를 쓰지 않는다.
 */

/** 앱 주기. 거래소에 없는 주기는 작은 봉을 묶어 만들거나(market/plan) 메뉴에서 끈다. */
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
 * 24시간(업비트·야후는 오늘 장, 전일 종가 대비) 시세. symbol 은 앱 심볼 id(BTCUSDT, UPBIT:KRW-BTC, YF:AAPL …).
 */
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

/**
 * 시장 구분.
 *  - binance: 바이낸스 USDT-M 선물(접두사 없는 id — 예전부터 저장된 모든 값)
 *  - bspot:   바이낸스 현물(BSPOT:)
 *  - upbit:   업비트 원화 마켓(UPBIT:)
 *  - yahoo:   야후 파이낸스 — 주식·지수·환율·선물(YF:)
 */
export type MarketId = 'binance' | 'bspot' | 'upbit' | 'yahoo'

/**
 * 요청 한도 초과(429) 또는 IP 차단(418)에 걸린 상태. until 은 요청을 재개해도 되는 시각(epoch ms).
 * 쿨다운이 도는 동안 REST 헬퍼는 네트워크를 건드리지 않고 이 오류를 즉시 던진다 — 차단이 길어지지 않게.
 */
export class RateLimitError extends Error {
  readonly until: number
  constructor(source: string, until: number) {
    super(`${source} rate limited until ${new Date(until).toISOString()}`)
    this.name = 'RateLimitError'
    this.until = until
  }
}

/** 과거 한 번 불러오기의 결과. done 이면 거래소(또는 공급자의 보관 한도)에 더 이상 과거가 없다. */
export interface CandlePage {
  candles: Candle[]
  done: boolean
}

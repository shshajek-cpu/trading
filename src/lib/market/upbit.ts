/**
 * 업비트 어댑터(원화 마켓, UPBIT:KRW-BTC). REST api.upbit.com 은 CORS 가 열려 있어 브라우저에서 바로 부른다.
 * 요청 한도: 캔들·시세 그룹마다 초당 10회(IP 기준) — 응답의 Remaining-Req 로 남은 수를 알려 준다. 넘으면 429,
 * 계속 넘으면 418 로 한동안 막는다. 캔들은 한 번에 200개까지라 과거는 to(그 시각 이전, 미포함)로 넘겨 가며 받는다.
 * 파싱·URL 함수는 푸시 워커도 쓴다(window 를 쓰지 않는다).
 */
import { RateLimitError, type Candle, type Interval, type Ticker24h } from './types'

export const UPBIT_API = 'https://api.upbit.com/v1'
/** 캔들 한 번 요청의 최대 개수. */
export const UPBIT_PAGE = 200

/** 업비트에 있는 주기의 캔들 경로(market/ids 의 upbitPlan 이 고른 source 만 온다). */
const UNIT: Partial<Record<Interval, string>> = {
  '1m': 'minutes/1',
  '3m': 'minutes/3',
  '5m': 'minutes/5',
  '15m': 'minutes/15',
  '30m': 'minutes/30',
  '1h': 'minutes/60',
  '4h': 'minutes/240',
  '1d': 'days',
  '1w': 'weeks',
  '1M': 'months',
}

/** 캔들 URL. to(초)를 주면 그 시각 이전(미포함) 봉만 — 최신부터 count 개. */
export function upbitCandlesUrl(market: string, source: Interval, count: number, to?: number): string {
  const unit = UNIT[source]
  if (!unit) throw new Error(`업비트에 없는 주기: ${source}`)
  const params = new URLSearchParams({ market, count: String(Math.min(count, UPBIT_PAGE)) })
  if (to !== undefined) params.set('to', new Date(to * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'))
  return `${UPBIT_API}/candles/${unit}?${params}`
}

export interface UpbitCandleRow {
  candle_date_time_utc: string
  opening_price: number
  high_price: number
  low_price: number
  trade_price: number
  candle_acc_trade_volume: number
}

/** 캔들 응답(최신부터) → 시간순 캔들. 값이 이상한 행은 버린다. */
export function parseUpbitCandles(rows: UpbitCandleRow[]): Candle[] {
  const out: Candle[] = []
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    const candle = {
      time: Date.parse(`${r.candle_date_time_utc}Z`) / 1000,
      open: r.opening_price,
      high: r.high_price,
      low: r.low_price,
      close: r.trade_price,
      volume: r.candle_acc_trade_volume,
    }
    if (Object.values(candle).every(Number.isFinite)) out.push(candle)
  }
  return out
}

export interface UpbitTickerRow {
  market: string
  trade_price: number
  signed_change_price: number
  signed_change_rate: number
  high_price: number
  low_price: number
  acc_trade_volume_24h: number
  acc_trade_price_24h: number
}

/** 시세 행 → Ticker24h(등락은 업비트처럼 전일 종가 — 09:00 KST — 대비). */
export function parseUpbitTicker(r: UpbitTickerRow, id: string): Ticker24h {
  return {
    symbol: id,
    lastPrice: r.trade_price,
    priceChange: r.signed_change_price,
    priceChangePercent: r.signed_change_rate * 100,
    highPrice: r.high_price,
    lowPrice: r.low_price,
    volume: r.acc_trade_volume_24h,
    quoteVolume: r.acc_trade_price_24h,
  }
}

/**
 * 원화 호가 단위(업비트 원화 마켓 규칙). 가격 표시 자릿수를 정하는 데 쓴다.
 * 2,000,000 이상 1,000 · 1,000,000 이상 500 · 500,000 이상 100 · 100,000 이상 50 · 10,000 이상 10 ·
 * 1,000 이상 1 · 100 이상 0.1 · 10 이상 0.01 · 1 이상 0.001 · 0.1 이상 0.0001 · 그 아래는 한 자리씩 더.
 */
export function upbitTickSize(price: number): number {
  const steps: [number, number][] = [
    [2_000_000, 1000],
    [1_000_000, 500],
    [500_000, 100],
    [100_000, 50],
    [10_000, 10],
    [1_000, 1],
    [100, 0.1],
    [10, 0.01],
    [1, 0.001],
    [0.1, 0.0001],
    [0.01, 0.00001],
    [0.001, 0.000001],
    [0.0001, 0.0000001],
  ]
  for (const [floor, tick] of steps) if (price >= floor) return tick
  return 0.00000001
}

/* ── 브라우저 REST(요청 간격·쿨다운) ─────────────────────────── */

/** 초당 10회 한도 안에 머물도록 요청 사이를 벌린다(여러 칸이 동시에 과거를 받아도). */
const SPACING_MS = 125
let nextSlot = 0
let cooldownUntil = 0

export function upbitRateLimitedUntil(): number {
  return cooldownUntil > Date.now() ? cooldownUntil : 0
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

export async function upbitGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (cooldownUntil > Date.now()) throw new RateLimitError('Upbit', cooldownUntil)
  const now = Date.now()
  const slot = Math.max(now, nextSlot)
  nextSlot = slot + SPACING_MS
  if (slot > now) await wait(slot - now, signal)
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (res.status === 429 || res.status === 418) {
    // 429 는 1초 뒤면 풀린다. 418(차단)은 기간을 알려 주지 않아 1분 쉰다.
    cooldownUntil = Date.now() + (res.status === 418 ? 60_000 : 1_500)
    throw new RateLimitError('Upbit', cooldownUntil)
  }
  if (!res.ok) throw new Error(`Upbit ${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export interface UpbitMarketRow {
  market: string
  korean_name: string
  english_name: string
}

export function fetchUpbitMarkets(signal?: AbortSignal): Promise<UpbitMarketRow[]> {
  return upbitGet<UpbitMarketRow[]>(`${UPBIT_API}/market/all?isDetails=false`, signal)
}

/** 원화 마켓 전 종목 시세 — 한 번에(관심 목록·호가 단위). */
export function fetchUpbitKrwTickers(signal?: AbortSignal): Promise<UpbitTickerRow[]> {
  return upbitGet<UpbitTickerRow[]>(`${UPBIT_API}/ticker/all?quote_currencies=KRW`, signal)
}

/* ── 실시간(웹소켓) ─────────────────────────────────────────── */

export const UPBIT_WS = 'wss://api.upbit.com/websocket/v1'

/** SIMPLE 형식 체결. cd=마켓, tp=체결가, tv=체결량, ttms=체결 시각(ms). */
export interface UpbitTradeMessage {
  ty: 'trade'
  cd: string
  tp: number
  tv: number
  ttms: number
}

/** SIMPLE 형식 시세. */
export interface UpbitTickerMessage {
  ty: 'ticker'
  cd: string
  tp: number
  scp: number
  scr: number
  hp: number
  lp: number
  atv24h: number
  atp24h: number
}

/** 구독 요청 본문. types 마다 codes 를 받는다. */
export function upbitSubscribe(types: ('trade' | 'ticker')[], codes: string[]): string {
  return JSON.stringify([
    { ticket: `trading-${Math.random().toString(36).slice(2, 10)}` },
    ...types.map((type) => ({ type, codes })),
    { format: 'SIMPLE' },
  ])
}

/**
 * 야후 파이낸스 어댑터(YF:AAPL, YF:005930.KS, YF:^GSPC, YF:KRW=X, YF:GC=F).
 *
 * 브라우저는 CORS 로 막혀 있어 Pages Function 프록시(/api/yahoo — functions/api/yahoo.ts)를 거친다. 푸시 워커는
 * query1.finance.yahoo.com 을 바로 부른다. 둘 다 이 파일의 파라미터·파싱을 쓴다(window 를 쓰지 않는다).
 *
 * 보관 한도(야후): 1m 은 최근 30일(한 요청 8일 이내), 5m~30m 은 60일, 60m 은 730일, 일·주·월봉은 상장 이후 전부.
 * 한도를 넘는 과거는 요청하지 않는다(422 가 온다).
 */
import { barStart } from './bars'
import type { Candle, Interval } from './types'

export const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/'
export const YAHOO_SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search'

const DAY = 86_400

/** 앱 주기(야후에 있는 source 만) → 야후 interval. */
export const YAHOO_INTERVAL: Partial<Record<Interval, string>> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '60m',
  '1d': '1d',
  '1w': '1wk',
  '1M': '1mo',
}

/** 이보다 오래된 봉은 야후가 주지 않는다(초, 지금부터). 여유로 하루 뺐다. 없으면 한도 없음. */
export const YAHOO_MAX_AGE: Partial<Record<Interval, number>> = {
  '1m': 29 * DAY,
  '5m': 59 * DAY,
  '15m': 59 * DAY,
  '30m': 59 * DAY,
  '1h': 729 * DAY,
}

/**
 * 한 번에 받는 기간(초). 미국 주식 기준 1m 5일 ≈ 1,950봉, 5m 20일 ≈ 1,560봉, 60m 200일 ≈ 1,400봉,
 * 일봉 5년 ≈ 1,260봉 — 앱이 처음 받는 1,000봉 안팎이다. 1m 은 한 요청 8일 한도 안이다.
 */
export const YAHOO_WINDOW: Partial<Record<Interval, number>> = {
  '1m': 5 * DAY,
  '5m': 20 * DAY,
  '15m': 59 * DAY,
  '30m': 59 * DAY,
  '1h': 200 * DAY,
  '1d': 5 * 365 * DAY,
  '1w': 20 * 365 * DAY,
  '1M': 60 * 365 * DAY,
}

/** 프록시와 워커가 보내는 chart 파라미터(프록시가 같은 이름만 받는다). */
export function yahooChartParams(source: Interval, period1: number, period2: number): URLSearchParams {
  const interval = YAHOO_INTERVAL[source]
  if (!interval) throw new Error(`야후에 없는 주기: ${source}`)
  return new URLSearchParams({
    interval,
    period1: String(Math.max(0, Math.floor(period1))),
    period2: String(Math.floor(period2)),
    includePrePost: 'false',
  })
}

/** 받을 수 있는 가장 오래된 시각(초). 한도 없는 주기는 0. */
export function yahooOldest(source: Interval, nowSec: number): number {
  const age = YAHOO_MAX_AGE[source]
  return age === undefined ? 0 : nowSec - age
}

export interface YahooMeta {
  currency?: string
  symbol?: string
  exchangeName?: string
  fullExchangeName?: string
  instrumentType?: string
  gmtoffset?: number
  exchangeTimezoneName?: string
  regularMarketPrice?: number
  chartPreviousClose?: number
  regularMarketDayHigh?: number
  regularMarketDayLow?: number
  regularMarketVolume?: number
  regularMarketTime?: number
  longName?: string
  shortName?: string
  priceHint?: number
  firstTradeDate?: number
  currentTradingPeriod?: { regular?: { start?: number; end?: number } }
}

export interface YahooChartJson {
  chart?: {
    result?: {
      meta?: YahooMeta
      timestamp?: number[]
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] }
    }[] | null
    error?: { code?: string; description?: string } | null
  }
}

export interface YahooChart {
  meta: YahooMeta
  candles: Candle[]
  /** 장 시작 시각(초, 아무 날이나) — 2h·4h 처럼 묶는 봉의 기준. */
  anchor: number
}

/**
 * chart 응답 → 시간순 캔들. 빈 행(null — 휴장·거래 없음)은 버린다.
 * - 분·시간봉: 진행 중인 마지막 행은 지금 시각이 찍혀 오므로 장 시작 기준 경계로 내리고, 같은 봉이 겹치면 합친다.
 * - 일·주·월봉: 거래소 현지 날짜의 00:00 UTC 로 맞춘다(일봉 경계를 다른 시장과 같게).
 * 오류 응답이면 null.
 */
export function parseYahooChart(json: YahooChartJson, source: Interval): YahooChart | null {
  const result = json.chart?.result?.[0]
  if (!result?.meta) return null
  const meta = result.meta
  const offset = meta.gmtoffset ?? 0
  const anchor = meta.currentTradingPeriod?.regular?.start ?? 0
  const daily = source === '1d' || source === '1w' || source === '1M'
  const times = result.timestamp ?? []
  const q = result.indicators?.quote?.[0]
  const candles: Candle[] = []
  for (let i = 0; i < times.length; i++) {
    const open = q?.open?.[i]
    const high = q?.high?.[i]
    const low = q?.low?.[i]
    const close = q?.close?.[i]
    if (open == null || high == null || low == null || close == null) continue
    const raw = times[i]
    const time = daily ? Math.floor((raw + offset) / DAY) * DAY : barStart(source, raw, anchor)
    const volume = q?.volume?.[i] ?? 0
    const last = candles.at(-1)
    if (last && last.time === time) {
      last.high = Math.max(last.high, high)
      last.low = Math.min(last.low, low)
      last.close = close
      last.volume = Math.max(last.volume, volume)
      continue
    }
    if (last && time < last.time) continue
    candles.push({ time, open, high, low, close, volume })
  }
  return { meta, candles, anchor }
}

/** 오류 응답의 설명(없으면 null). */
export function yahooError(json: YahooChartJson): string | null {
  const err = json.chart?.error
  return err ? (err.description ?? err.code ?? 'error') : null
}

/**
 * 야후가 늦게 주는 거래소(분). 차트 메타에는 지연 값이 없어 야후 안내(거래소별 지연)를 표로 둔다.
 * 미국 주식·지수(나스닥·NYSE 등)와 환율은 실시간이다.
 */
const DELAY_MIN: Record<string, number> = {
  KSC: 20,
  KOE: 20,
  JPX: 20,
  TYO: 20,
  OSA: 20,
  HKG: 15,
  SHH: 30,
  SHZ: 30,
  TAI: 20,
  TWO: 20,
  LSE: 20,
  GER: 15,
  FRA: 15,
  PAR: 15,
  AMS: 15,
  CME: 10,
  CMX: 10,
  NYM: 10,
  CBT: 10,
  NYB: 10,
}

export function yahooDelayMinutes(exchangeName: string | undefined): number {
  return (exchangeName && DELAY_MIN[exchangeName]) || 0
}

/** search 응답의 종목 한 줄. */
export interface YahooQuote {
  symbol: string
  shortname?: string
  longname?: string
  exchange?: string
  exchDisp?: string
  quoteType?: string
  typeDisp?: string
}

/** 검색에 보이는 종류(옵션·뮤추얼펀드·뉴스 제외). */
const SEARCH_TYPES: Record<string, true> = { EQUITY: true, ETF: true, INDEX: true, CURRENCY: true, FUTURE: true, CRYPTOCURRENCY: true }

/** search 응답 모양(quotes 만 쓴다). */
export interface YahooSearchJson {
  quotes?: YahooQuote[]
}

export function parseYahooSearch(json: YahooSearchJson): YahooQuote[] {
  if (!Array.isArray(json.quotes)) return []
  return json.quotes.filter((q) => typeof q.symbol === 'string' && SEARCH_TYPES[q.quoteType ?? ''])
}

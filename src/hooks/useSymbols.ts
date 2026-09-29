import { useEffect, useSyncExternalStore } from 'react'
import { fetchExchangeInfo, fetchSpotExchangeInfo } from '../lib/market/binance'
import { onYahooMeta } from '../lib/market'
import { marketOf, nativeSymbol } from '../lib/market/ids'
import { RateLimitError, type MarketId } from '../lib/market/types'
import { fetchUpbitKrwTickers, fetchUpbitMarkets } from '../lib/market/upbit'
import type { YahooMeta, YahooQuote } from '../lib/market/yahoo'
import { knownYahoo } from '../lib/market/yahooNames'
import { baseCode, coinName, displaySymbol, toSymbolInfo, upbitInfo, yahooInfo, type SymbolInfo } from '../lib/symbols'

/** 목록을 받아 오는 시장. 야후는 전체 목록이 없어 차트·검색에서 본 종목만 배운다. */
type ListMarket = Exclude<MarketId, 'yahoo'>

/** 기기 캐시(동기화하지 않는다 — 거래소에서 다시 받을 수 있는 값). 선물 키는 예전 그대로. */
const CACHE_KEY: Record<ListMarket, string> = {
  binance: 'trading.symbols.v4',
  bspot: 'trading.symbols.spot.v1',
  upbit: 'trading.symbols.upbit.v1',
}
const YAHOO_CACHE_KEY = 'trading.symbols.yahoo.v1'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

/** 실패 뒤 다시 받기까지 기다리는 시간(ms). 끝 값을 계속 쓴다. */
const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 180_000, 300_000]

const FALLBACK: SymbolInfo = {
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  contractType: 'PERPETUAL',
  underlyingType: 'COIN',
  pricePrecision: 2,
  tickSize: 0.1,
  stepSize: 0.001,
  minQty: 0.001,
}

interface Cached {
  at: number
  infos: SymbolInfo[]
}

function readCached(market: ListMarket): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY[market])
    if (!raw) return null
    const c = JSON.parse(raw) as Cached
    if (!Array.isArray(c.infos) || c.infos.length === 0) return null
    if (typeof c.at !== 'number') return null
    return c
  } catch {
    return null
  }
}

export interface SymbolsStatus {
  /** 받은 목록도 캐시도 없다(선물은 BTCUSDT 하나로 버티는 중). */
  missing: boolean
  /** 마지막 시도가 실패했고 지금 받는 중이 아니다(다시 시도 버튼을 보여 줄 때). */
  failed: boolean
}

interface ListState {
  infos: SymbolInfo[]
  fresh: boolean
  status: SymbolsStatus
  loading: boolean
  started: boolean
  attempt: number
  retryTimer: number
}

/** 거래소 목록 → SymbolInfo. 업비트는 원화 마켓만, 시세로 호가 단위(표시 자릿수)를 정한다. */
const LOADERS: Record<ListMarket, () => Promise<SymbolInfo[]>> = {
  binance: async () => (await fetchExchangeInfo()).map((s) => toSymbolInfo(s)),
  bspot: async () => (await fetchSpotExchangeInfo()).map((s) => toSymbolInfo(s, `BSPOT:${s.symbol}`)),
  upbit: async () => {
    const [markets, tickers] = await Promise.all([fetchUpbitMarkets(), fetchUpbitKrwTickers()])
    const price = new Map(tickers.map((t) => [t.market, t.trade_price]))
    return markets.filter((m) => m.market.startsWith('KRW-')).map((m) => upbitInfo(m, price.get(m.market)))
  },
}

// ── 모듈 전역 저장소 ──
// 목록은 앱 하나에 하나다. 훅을 쓰는 곳마다 따로 받지 않게 여기서 한 번만 받는다.
function initialState(market: ListMarket): ListState {
  const cached = readCached(market)
  return {
    infos: cached?.infos ?? (market === 'binance' ? [FALLBACK] : []),
    fresh: cached !== null && Date.now() - cached.at < CACHE_TTL_MS,
    status: { missing: cached === null, failed: false },
    loading: false,
    started: false,
    attempt: 0,
    retryTimer: 0,
  }
}

const lists: Record<ListMarket, ListState> = {
  binance: initialState('binance'),
  bspot: initialState('bspot'),
  upbit: initialState('upbit'),
}

/** 야후: 차트 메타·검색에서 배운 종목(id → 정보). */
const yahoo = new Map<string, SymbolInfo>(readYahooCache())
let yahooSaveTimer = 0

function readYahooCache(): [string, SymbolInfo][] {
  try {
    const raw = JSON.parse(localStorage.getItem(YAHOO_CACHE_KEY) ?? '{}') as Record<string, SymbolInfo>
    return Object.entries(raw).filter(([id, info]) => typeof info?.symbol === 'string' && info.symbol === id)
  } catch {
    return []
  }
}

let all: SymbolInfo[] = []
const listeners = new Set<() => void>()

function rebuild(): void {
  all = [...lists.binance.infos, ...lists.bspot.infos, ...lists.upbit.infos, ...yahoo.values()]
}
rebuild()

function emit(): void {
  rebuild()
  for (const l of listeners) l()
}

function setStatus(state: ListState, next: Partial<SymbolsStatus>): void {
  const merged = { ...state.status, ...next }
  if (merged.missing === state.status.missing && merged.failed === state.status.failed) return
  state.status = merged
}

function scheduleRetry(market: ListMarket, err: unknown): void {
  const state = lists[market]
  const base = RETRY_DELAYS_MS[Math.min(state.attempt, RETRY_DELAYS_MS.length - 1)]
  state.attempt += 1
  // 요청 한도에 걸렸으면 풀리는 시각 전에는 다시 두드리지 않는다.
  const wait = err instanceof RateLimitError ? Math.max(base, err.until - Date.now()) : base
  window.clearTimeout(state.retryTimer)
  state.retryTimer = window.setTimeout(() => load(market), wait)
}

function load(market: ListMarket): void {
  const state = lists[market]
  if (state.loading || state.fresh) return
  window.clearTimeout(state.retryTimer)
  state.retryTimer = 0
  state.loading = true
  setStatus(state, { failed: false })
  emit()
  LOADERS[market]()
    .then((list) => {
      const next = list.sort((a, b) => a.symbol.localeCompare(b.symbol))
      if (next.length === 0) throw new Error('빈 심볼 목록')
      state.infos = next
      state.fresh = true
      state.attempt = 0
      setStatus(state, { missing: false, failed: false })
      try {
        localStorage.setItem(CACHE_KEY[market], JSON.stringify({ at: Date.now(), infos: next } satisfies Cached))
      } catch {
        /* 저장 실패해도 이번 세션은 동작한다 */
      }
    })
    .catch((err: unknown) => {
      // 목록을 못 받아도 차트는 돌아야 한다. 만료된 캐시가 있으면 그대로 쓰고, 조용히 다시 받는다.
      setStatus(state, { failed: true })
      scheduleRetry(market, err)
    })
    .finally(() => {
      state.loading = false
      emit()
    })
}

/** 야후 종목 정보를 배운다(같으면 아무도 깨우지 않는다). 저장은 모아서 한 번. */
function learnYahoo(info: SymbolInfo): void {
  const prev = yahoo.get(info.symbol)
  const merged: SymbolInfo = prev ? { ...prev, ...info, name: info.name ?? prev.name, exchange: info.exchange ?? prev.exchange } : info
  if (prev && JSON.stringify(prev) === JSON.stringify(merged)) return
  yahoo.set(info.symbol, merged)
  emit()
  window.clearTimeout(yahooSaveTimer)
  yahooSaveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(YAHOO_CACHE_KEY, JSON.stringify(Object.fromEntries(yahoo)))
    } catch {
      /* 캐시라 저장 못 해도 된다 */
    }
  }, 1000)
}

let wired = false
function start(market: ListMarket): void {
  if (!wired) {
    wired = true
    // 회선이 돌아오면 기다리지 말고 바로 다시 받는다.
    window.addEventListener('online', () => {
      for (const m of Object.keys(lists) as ListMarket[]) if (lists[m].started && !lists[m].fresh) load(m)
    })
    onYahooMeta((native: string, meta: YahooMeta) => learnYahoo(yahooInfo(native, meta)))
  }
  const state = lists[market]
  if (state.started) return
  state.started = true
  load(market)
}

/** 검색에서 고른 야후 종목의 이름·거래소를 차트 메타가 오기 전에 먼저 적어 둔다. */
export function rememberYahooQuote(q: YahooQuote): void {
  const id = `YF:${q.symbol}`
  if (yahoo.has(id)) return
  learnYahoo({
    symbol: id,
    baseAsset: q.symbol,
    quoteAsset: '',
    contractType: '',
    pricePrecision: q.symbol.endsWith('=X') ? 4 : 2,
    tickSize: 0,
    stepSize: 1,
    minQty: 1,
    name: q.longname ?? q.shortname,
    exchange: q.exchDisp,
    kind: q.quoteType,
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 사용자가 누른 '다시 시도' — 기다리던 재시도를 앞당긴다. */
export function retrySymbols(market: ListMarket = 'binance'): void {
  load(market)
}

/** 이 시장의 목록을 (아직 안 받았으면) 받기 시작한다 — 검색 창의 탭. */
export function requireSymbolList(market: MarketId): void {
  if (market !== 'yahoo') start(market)
}

/**
 * 전 시장 심볼 메타데이터(선물 + 받아 둔 현물·업비트 목록 + 본 적 있는 야후 종목).
 *
 * 선물 exchangeInfo(약 1MB)는 모바일 회선에서 곧잘 끊긴다. 한 번 받으면 반나절 재사용하고,
 * 실패하면 지난 목록으로 버티며 점점 간격을 늘려 다시 받는다. 아무것도 없으면 BTCUSDT 하나로 시작.
 * 현물·업비트 목록은 need 에 그 시장 심볼이 있을 때(차트·관심 목록) 또는 검색 탭을 열 때만 받는다.
 */
export function useSymbols(need: readonly string[] = []): SymbolInfo[] {
  const needKey = [...new Set(need.map(marketOf))].sort().join(',')
  useEffect(() => {
    start('binance')
    for (const market of needKey ? (needKey.split(',') as MarketId[]) : []) requireSymbolList(market)
  }, [needKey])
  return useSyncExternalStore(subscribe, () => all)
}

/** 목록을 못 받은 상태 — 검색 창이 '불러오는 중'/'다시 시도'를 보여 줄 때 쓴다. */
export function useSymbolsStatus(market: ListMarket = 'binance'): SymbolsStatus {
  useEffect(() => start(market), [market])
  return useSyncExternalStore(subscribe, () => lists[market].status)
}

/** 검색어(대문자)에 대한 순위 점수. 낮을수록 위. -1 이면 제외. 심볼 검색과 빠른 검색이 같이 쓴다. */
export function rankSymbol(info: SymbolInfo, q: string): number {
  const native = nativeSymbol(info.symbol).toUpperCase()
  const disp = displaySymbol(info.symbol, [info]).toUpperCase()
  const market = marketOf(info.symbol)
  const base = market === 'yahoo' ? native : baseCode(info.baseAsset)
  const known = market === 'yahoo' ? knownYahoo(info.baseAsset) : undefined
  const names = [
    market === 'binance' || market === 'bspot' ? coinName(info.baseAsset) : '',
    info.name ?? '',
    info.altName ?? '',
    known?.ko ?? '',
    known?.alt ?? '',
  ].map((n) => n.toUpperCase())
  if (native === q || disp === q) return 0
  if (base === q) return 1
  if (native.startsWith(q) || disp.startsWith(q)) return 2
  if (names.some((n) => n.startsWith(q))) return 3
  if (native.includes(q) || names.some((n) => n.includes(q))) return 4
  return -1
}

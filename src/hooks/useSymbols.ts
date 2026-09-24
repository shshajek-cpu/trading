import { useEffect, useSyncExternalStore } from 'react'
import { RateLimitError, fetchExchangeInfo } from '../lib/binance'
import { baseCode, coinName, displaySymbol, toSymbolInfo, type SymbolInfo } from '../lib/symbols'

const CACHE_KEY = 'trading.symbols.v4'
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

function readCached(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
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
  /** 받은 목록도 캐시도 없어 BTCUSDT 하나로 버티는 중. */
  missing: boolean
  /** 마지막 시도가 실패했고 지금 받는 중이 아니다(다시 시도 버튼을 보여 줄 때). */
  failed: boolean
}

// ── 모듈 전역 저장소 ──
// 목록은 앱 하나에 하나다. 훅을 쓰는 곳마다 1MB 를 따로 받지 않게 여기서 한 번만 받는다.
const initial = readCached()
let infos: SymbolInfo[] = initial?.infos ?? [FALLBACK]
let fresh = initial !== null && Date.now() - initial.at < CACHE_TTL_MS
let status: SymbolsStatus = { missing: initial === null, failed: false }
let loading = false
let started = false
let attempt = 0
let retryTimer = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function setStatus(next: Partial<SymbolsStatus>): void {
  const merged = { ...status, ...next }
  if (merged.missing === status.missing && merged.failed === status.failed) return
  status = merged
}

function scheduleRetry(err: unknown): void {
  const base = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
  attempt += 1
  // 요청 한도에 걸렸으면 풀리는 시각 전에는 다시 두드리지 않는다.
  const wait = err instanceof RateLimitError ? Math.max(base, err.until - Date.now()) : base
  window.clearTimeout(retryTimer)
  retryTimer = window.setTimeout(load, wait)
}

function load(): void {
  if (loading || fresh) return
  window.clearTimeout(retryTimer)
  retryTimer = 0
  loading = true
  setStatus({ failed: false })
  emit()
  fetchExchangeInfo()
    .then((list) => {
      const next = list.map(toSymbolInfo).sort((a, b) => a.symbol.localeCompare(b.symbol))
      if (next.length === 0) throw new Error('빈 심볼 목록')
      infos = next
      fresh = true
      attempt = 0
      setStatus({ missing: false, failed: false })
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), infos: next } satisfies Cached))
      } catch {
        /* 저장 실패해도 이번 세션은 동작한다 */
      }
    })
    .catch((err: unknown) => {
      // 목록을 못 받아도 차트는 돌아야 한다. 만료된 캐시가 있으면 그대로 쓰고, 조용히 다시 받는다.
      setStatus({ failed: true })
      scheduleRetry(err)
    })
    .finally(() => {
      loading = false
      emit()
    })
}

function start(): void {
  if (started) return
  started = true
  // 회선이 돌아오면 기다리지 말고 바로 다시 받는다.
  window.addEventListener('online', () => {
    if (!fresh) load()
  })
  load()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 사용자가 누른 '다시 시도' — 기다리던 재시도를 앞당긴다. */
export function retrySymbols(): void {
  load()
}

/**
 * 거래중인 USDT 선물 심볼 메타데이터.
 *
 * exchangeInfo(약 1MB)는 모바일 회선에서 곧잘 끊긴다. 한 번 받으면 반나절 재사용하고,
 * 실패하면 지난 목록으로 버티며 점점 간격을 늘려 다시 받는다. 아무것도 없으면 BTCUSDT 하나로 시작.
 */
export function useSymbols(): SymbolInfo[] {
  useEffect(start, [])
  return useSyncExternalStore(subscribe, () => infos)
}

/** 목록을 못 받은 상태 — 검색 창이 '불러오는 중'/'다시 시도'를 보여 줄 때 쓴다. */
export function useSymbolsStatus(): SymbolsStatus {
  useEffect(start, [])
  return useSyncExternalStore(subscribe, () => status)
}

/** 검색어(대문자)에 대한 순위 점수. 낮을수록 위. -1 이면 제외. 심볼 검색과 빠른 검색이 같이 쓴다. */
export function rankSymbol(info: SymbolInfo, q: string): number {
  const sym = info.symbol.toUpperCase()
  const disp = displaySymbol(info.symbol, [info]).toUpperCase()
  const base = baseCode(info.baseAsset)
  const name = coinName(info.baseAsset).toUpperCase()
  if (sym === q || disp === q) return 0
  if (base === q) return 1
  if (sym.startsWith(q) || disp.startsWith(q)) return 2
  if (name.startsWith(q)) return 3
  if (sym.includes(q) || name.includes(q)) return 4
  return -1
}

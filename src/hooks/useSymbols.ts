import { useEffect, useState } from 'react'
import { fetchExchangeInfo } from '../lib/binance'
import { toSymbolInfo, type SymbolInfo } from '../lib/symbols'

const CACHE_KEY = 'trading.symbols.v4'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

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

/**
 * 거래중인 USDT 선물 심볼 메타데이터.
 *
 * exchangeInfo(약 1MB)는 모바일 회선에서 곧잘 끊긴다. 한 번 받으면 반나절 재사용하고,
 * 실패해도 지난 목록으로 버틴다(만료 캐시 폴백). 아무것도 없으면 BTCUSDT 하나로 시작.
 */
export function useSymbols(): SymbolInfo[] {
  const [infos, setInfos] = useState<SymbolInfo[]>(() => readCached()?.infos ?? [FALLBACK])

  useEffect(() => {
    const cached = readCached()
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return

    const controller = new AbortController()
    fetchExchangeInfo(controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return
        const next = list
          .map(toSymbolInfo)
          .sort((a, b) => a.symbol.localeCompare(b.symbol))
        if (next.length === 0) return
        setInfos(next)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), infos: next } satisfies Cached))
        } catch {
          /* 저장 실패해도 이번 세션은 동작한다 */
        }
      })
      .catch(() => {
        // 목록을 못 받아도 차트는 돌아야 한다. 만료된 캐시라도 있으면 쓴다.
        if (cached) setInfos(cached.infos)
      })
    return () => controller.abort()
  }, [])

  return infos
}

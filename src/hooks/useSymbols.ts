import { useEffect, useState } from 'react'
import { fetchExchangeInfo } from '../lib/binance'

const CACHE_KEY = 'trading.symbols.v1'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

interface Cached {
  at: number
  names: string[]
}

function readCache(): string[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Cached
    if (!Array.isArray(c.names) || c.names.length === 0) return null
    return Date.now() - c.at < CACHE_TTL_MS ? c.names : null
  } catch {
    return null
  }
}

/**
 * 거래중인 USDT 선물 심볼 이름 목록.
 *
 * 원본(exchangeInfo)이 1MB 라 모바일 회선에서 곧잘 끊긴다. 한 번 받으면 반나절 재사용하고,
 * 실패해도 지난 목록으로 버틴다.
 */
export function useSymbols(fallback: string): string[] {
  const [symbols, setSymbols] = useState<string[]>(() => readCache() ?? [fallback])

  useEffect(() => {
    if (readCache()) return

    const controller = new AbortController()
    fetchExchangeInfo(controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return
        const names = list.map((s) => s.symbol).sort((a, b) => a.localeCompare(b))
        if (names.length === 0) return
        setSymbols(names)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), names } satisfies Cached))
        } catch {
          /* 저장 실패해도 이번 세션은 동작한다 */
        }
      })
      .catch(() => {
        // 목록을 못 받아도 차트는 돌아야 한다. 만료된 캐시라도 있으면 쓴다.
        try {
          const raw = localStorage.getItem(CACHE_KEY)
          if (!raw) return
          const c = JSON.parse(raw) as Cached
          if (Array.isArray(c.names) && c.names.length > 0) setSymbols(c.names)
        } catch {
          /* 그래도 없으면 fallback 으로 둔다 */
        }
      })
    return () => controller.abort()
  }, [])

  return symbols
}

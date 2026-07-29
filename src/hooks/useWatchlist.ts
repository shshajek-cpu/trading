import { useCallback, useEffect, useRef, useState } from 'react'
import { notifySettingsChanged } from '../lib/syncBus'
import { fetchAll24hTickers } from '../lib/binance'

const STORAGE_KEY = 'trading.watchlist.v1'

const REFRESH_MS = 5000

const DEFAULT_LIST = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT']

export interface WatchRow {
  symbol: string
  price: number
  changePercent: number
}

function loadList(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LIST
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_LIST
    const list = parsed.filter((s): s is string => typeof s === 'string')
    return list.length > 0 ? list : DEFAULT_LIST
  } catch {
    return DEFAULT_LIST
  }
}

function saveList(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** 관심 종목 시세판. 전 종목 시세를 한 번에 받아 필요한 것만 골라 쓴다. */
export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(loadList)
  const [rows, setRows] = useState<Record<string, WatchRow>>({})
  const symbolsRef = useRef(symbols)
  symbolsRef.current = symbols

  // 선물 전체 스트림은 일부 망에서 막힌다. REST 를 짧게 돌려 채운다.
  useEffect(() => {
    const controller = new AbortController()

    const load = () => {
      fetchAll24hTickers(controller.signal)
        .then((list) => {
          if (controller.signal.aborted) return
          const want = new Set(symbolsRef.current)
          const next: Record<string, WatchRow> = {}
          for (const t of list) {
            if (!want.has(t.symbol)) continue
            next[t.symbol] = {
              symbol: t.symbol,
              price: t.lastPrice,
              changePercent: t.priceChangePercent,
            }
          }
          setRows(next)
        })
        .catch(() => {
          /* 폴링이라 다음 주기에 회복된다 */
        })
    }

    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [])

  const add = useCallback((symbol: string) => {
    setSymbols((prev) => {
      if (prev.includes(symbol)) return prev
      const next = [...prev, symbol]
      saveList(next)
      return next
    })
  }, [])

  const remove = useCallback((symbol: string) => {
    setSymbols((prev) => {
      const next = prev.filter((s) => s !== symbol)
      saveList(next)
      return next
    })
  }, [])

  const toggle = useCallback((symbol: string) => {
    setSymbols((prev) => {
      const next = prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
      saveList(next)
      return next
    })
  }, [])

  return { symbols, rows, add, remove, toggle }
}

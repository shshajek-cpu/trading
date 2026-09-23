import { useCallback, useEffect, useRef, useState } from 'react'
import { notifySettingsChanged } from '../lib/syncBus'
import { fetchAll24hTickers } from '../lib/binance'
import { useMiniTickers } from './useMiniTickers'

const STORAGE_KEY = 'trading.watchlist.v1'

/** 실시간 값은 웹소켓 미니 티커가 1~2초마다 준다. REST 는 첫 값과 끊겼을 때를 위한 예비다. */
const REFRESH_MS = 30000

const DEFAULT_LIST = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT']

export interface WatchRow {
  symbol: string
  price: number
  changePercent: number
  /** 절대 24시간 변동액(견적 통화). */
  change: number
}

function loadList(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LIST
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_LIST
    const list = parsed.filter((s): s is string => typeof s === 'string')
    return list
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

  // 첫 화면과 웹소켓이 막힌 망을 위한 REST 예비 조회.
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
              change: t.priceChange,
            }
          }
          setRows((prev) => ({ ...prev, ...next }))
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

  // 바이낸스 화면처럼 1~2초마다 갱신되는 실시간 시세.
  useMiniTickers(symbols, (t) => {
    setRows((prev) => ({
      ...prev,
      [t.symbol]: { symbol: t.symbol, price: t.lastPrice, changePercent: t.priceChangePercent, change: t.priceChange },
    }))
  })

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

  const reorder = useCallback((next: string[]) => {
    setSymbols((prev) => {
      // 순서만 바꾼다. 현재 목록과 구성이 다르면(경합) 무시한다.
      if (next.length !== prev.length) return prev
      const same = new Set(prev)
      if (!next.every((s) => same.has(s))) return prev
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

  return { symbols, rows, add, remove, toggle, reorder }
}

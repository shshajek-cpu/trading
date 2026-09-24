import { useCallback, useEffect, useRef, useState } from 'react'
import { notifySettingsChanged } from '../lib/syncBus'
import { fetchAll24hTickers, rateLimitedUntil } from '../lib/binance'
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

  // 바이낸스 화면처럼 1~2초마다 갱신되는 실시간 시세. liveRef 가 true 면 REST 예비는 쉰다.
  const wsLive = useMiniTickers(symbols, (t) => {
    setRows((prev) => ({
      ...prev,
      [t.symbol]: { symbol: t.symbol, price: t.lastPrice, changePercent: t.priceChangePercent, change: t.priceChange },
    }))
  })

  // 웹소켓이 값을 주기 전(첫 화면)·끊겼을 때만 도는 REST 예비 조회. 숨은 탭·한도 초과 중엔 건너뛴다.
  useEffect(() => {
    const controller = new AbortController()

    const load = () => {
      if (document.hidden || wsLive.current || rateLimitedUntil() > Date.now()) return
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
    // 탭으로 돌아오면 조건을 확인해 한 번만 새로 받는다.
    document.addEventListener('visibilitychange', load)
    return () => {
      controller.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
    }
  }, [wsLive])

  // 다음 목록을 ref 로 계산해 상태를 갱신하고 저장한다 — setState 갱신 함수 안에서
  // 부작용(localStorage 쓰기·이벤트)을 내지 않는다(StrictMode 중복 실행 대비).
  const replace = useCallback((next: string[]) => {
    symbolsRef.current = next
    setSymbols(next)
    saveList(next)
  }, [])

  // 다른 탭(또는 PWA 창)이 바꾼 목록을 받아 온다. 안 받으면 이 탭이 옛 목록을 통째로 저장해
  // 다른 탭이 방금 추가하거나 내려받은 종목을 되돌린다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const next = loadList()
      symbolsRef.current = next
      setSymbols(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const add = useCallback(
    (symbol: string) => {
      const prev = symbolsRef.current
      if (prev.includes(symbol)) return
      replace([...prev, symbol])
    },
    [replace],
  )

  const remove = useCallback(
    (symbol: string) => {
      replace(symbolsRef.current.filter((s) => s !== symbol))
    },
    [replace],
  )

  const reorder = useCallback(
    (next: string[]) => {
      // 순서만 바꾼다. 현재 목록과 구성이 다르면(경합) 무시한다.
      const prev = symbolsRef.current
      if (next.length !== prev.length) return
      const same = new Set(prev)
      if (!next.every((s) => same.has(s))) return
      replace(next)
    },
    [replace],
  )

  const toggle = useCallback(
    (symbol: string) => {
      const prev = symbolsRef.current
      replace(prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol])
    },
    [replace],
  )

  return { symbols, rows, add, remove, toggle, reorder }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { notifySettingsChanged } from '../lib/syncBus'
import { createLiveStore } from '../lib/liveStore'
import { useMiniTickers } from './useMiniTickers'

const STORAGE_KEY = 'trading.watchlist.v1'

const DEFAULT_LIST = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT']

export interface WatchRow {
  symbol: string
  price: number
  changePercent: number
  /** 절대 변동액(견적 통화) — 바이낸스는 24시간, 업비트·야후는 전일 종가 대비. */
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

/**
 * 관심 종목 시세판(바이낸스 선물·현물·업비트·야후 종목이 섞여도 된다).
 * 시세(rows)는 1~2초마다 바뀐다 — React 상태가 아니라 저장소에 두어 이 훅을 쓰는 App 은 다시 그리지 않고,
 * 관심 목록 위젯만 구독해 다시 그린다.
 */
export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(loadList)
  const [rows] = useState(() => createLiveStore<Record<string, WatchRow>>({}))
  const symbolsRef = useRef(symbols)
  symbolsRef.current = symbols

  // 시장이 섞인 목록의 실시간 시세(바이낸스·업비트 웹소켓 1~2초, 야후 폴링 15초 — REST 예비 조회 포함).
  useMiniTickers(symbols, (t) => {
    rows.set({
      ...rows.get(),
      [t.symbol]: { symbol: t.symbol, price: t.lastPrice, changePercent: t.priceChangePercent, change: t.priceChange },
    })
  })

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

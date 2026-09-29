import { useEffect, useState } from 'react'
import type { Ticker24h } from '../lib/market/types'
import { useMiniTickers } from './useMiniTickers'

/** 한 종목의 24시간 시세(실시간 — useMiniTickers). 종목이 바뀌면 새 값이 올 때까지 null. */
export function useTicker24h(symbol: string): Ticker24h | null {
  const [ticker, setTicker] = useState<Ticker24h | null>(null)
  useEffect(() => setTicker(null), [symbol])
  useMiniTickers([symbol], (t) => {
    if (t.symbol === symbol) setTicker(t)
  })
  return ticker
}

import { useEffect, useState } from 'react'
import { fetch24hTicker, type Ticker24h } from '../lib/binance'

const REFRESH_MS = 10000

export function useTicker24h(symbol: string): Ticker24h | null {
  const [ticker, setTicker] = useState<Ticker24h | null>(null)

  useEffect(() => {
    setTicker(null)
    const controller = new AbortController()

    const load = () => {
      fetch24hTicker(symbol, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setTicker(data)
        })
        .catch(() => {
          /* 폴링이므로 실패는 다음 주기에 회복된다. */
        })
    }

    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [symbol])

  return ticker
}

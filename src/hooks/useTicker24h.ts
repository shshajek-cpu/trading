import { useEffect, useState } from 'react'
import { fetch24hTicker, type Ticker24h } from '../lib/binance'
import { useMiniTickers } from './useMiniTickers'

/** 실시간 값은 웹소켓 미니 티커(1~2초)가 준다. REST 는 첫 값과 끊겼을 때를 위한 예비다. */
const REFRESH_MS = 60000

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
          /* 예비 조회라 실패는 다음 주기에 회복된다. */
        })
    }

    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [symbol])

  useMiniTickers([symbol], (t) => {
    if (t.symbol === symbol) setTicker(t)
  })

  return ticker
}

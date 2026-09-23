import { useEffect, useState } from 'react'
import { fetch24hTicker, rateLimitedUntil, type Ticker24h } from '../lib/binance'
import { useMiniTickers } from './useMiniTickers'

/** 실시간 값은 웹소켓 미니 티커(1~2초)가 준다. REST 는 첫 값과 끊겼을 때를 위한 예비다. */
const REFRESH_MS = 60000

export function useTicker24h(symbol: string): Ticker24h | null {
  const [ticker, setTicker] = useState<Ticker24h | null>(null)

  const wsLive = useMiniTickers([symbol], (t) => {
    if (t.symbol === symbol) setTicker(t)
  })

  useEffect(() => {
    setTicker(null)
    const controller = new AbortController()

    // 웹소켓이 값을 주기 전·끊겼을 때만 도는 예비 조회. 숨은 탭·한도 초과 중엔 건너뛴다.
    const load = () => {
      if (document.hidden || wsLive.current || rateLimitedUntil() > Date.now()) return
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
    document.addEventListener('visibilitychange', load)
    return () => {
      controller.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
    }
  }, [symbol, wsLive])

  return ticker
}

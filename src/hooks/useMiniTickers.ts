import { useEffect, useRef } from 'react'
import { subscribeTickers } from '../lib/market/live'
import type { Ticker24h } from '../lib/market/types'

/**
 * 여러 종목(시장이 섞여도 된다)의 24시간 시세를 받는다 — 바이낸스·업비트는 웹소켓(1~2초), 야후는 폴링(15초).
 * 웹소켓이 값을 주기 전·끊겼을 때의 REST 예비 조회도 lib/market/live 가 한다.
 */
export function useMiniTickers(symbols: string[], onTicker: (ticker: Ticker24h) => void): void {
  const onTickerRef = useRef(onTicker)
  onTickerRef.current = onTicker
  const key = [...new Set(symbols)].sort().join(',')

  useEffect(() => {
    if (!key) return
    return subscribeTickers(key.split(','), (t) => onTickerRef.current(t))
  }, [key])
}

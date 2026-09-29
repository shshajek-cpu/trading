import { useEffect, useRef, useState } from 'react'
import { subscribeCandles, type CandleHandlers, type LiveStatus } from '../lib/market/live'
import type { Interval } from '../lib/market/types'

export interface UseLiveCandlesOptions extends Omit<CandleHandlers, 'onStatus'> {
  enabled?: boolean
}

/**
 * 차트 한 칸의 실시간 봉(바이낸스·업비트 웹소켓, 야후 폴링 — lib/market/live). 연결 상태를 돌려준다(범례의 점).
 * 핸들러는 ref 로 들고 있어 바뀌어도 다시 연결하지 않는다.
 */
export function useLiveCandles(symbol: string, interval: Interval, options: UseLiveCandlesOptions): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('idle')
  const optionsRef = useRef(options)
  optionsRef.current = options
  const enabled = options.enabled ?? true

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return
    }
    return subscribeCandles(symbol, interval, {
      onCandle: (candle, closed) => optionsRef.current.onCandle(candle, closed),
      onTrade: (price, qty, time) => optionsRef.current.onTrade?.(price, qty, time),
      onReconnect: () => optionsRef.current.onReconnect?.(),
      onStatus: setStatus,
    })
  }, [symbol, interval, enabled])

  return status
}

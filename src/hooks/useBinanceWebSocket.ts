import { useEffect, useRef, useState } from 'react'
import {
  klineStreamUrl,
  normalizeStreamKline,
  type AggTradeEvent,
  type Candle,
  type CombinedStreamMessage,
  type Interval,
  type KlineStreamEvent,
} from '../lib/binance'

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed'

export interface UseBinanceWebSocketOptions {
  /** 캔들 갱신(미확정 포함). closed=true 면 해당 봉이 확정된 것. */
  onCandle: (candle: Candle, closed: boolean) => void
  /** 체결마다 호출 — 봉 이벤트 사이에도 현재가·거래량을 즉시 움직이는 용도. time 은 ms. */
  onTrade?: (price: number, qty: number, time: number) => void
  /** 재연결 성공 시 호출 — 끊긴 동안의 갭을 klines 재조회로 메우는 용도. */
  onReconnect?: () => void
  enabled?: boolean
}

const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000
/** kline 스트림은 느려도 2초마다 온다. 이만큼 조용하면 죽은 연결로 본다. */
const IDLE_TIMEOUT_MS = 20000

export function useBinanceWebSocket(
  symbol: string,
  interval: Interval,
  options: UseBinanceWebSocketOptions,
): WsStatus {
  const [status, setStatus] = useState<WsStatus>('idle')

  const optionsRef = useRef(options)
  optionsRef.current = options

  const enabled = options.enabled ?? true

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return
    }

    let disposed = false
    let socket: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let backoff = INITIAL_BACKOFF_MS
    let hasConnectedBefore = false

    // 핸드셰이크만 되고 데이터가 안 오는 "좀비 연결"을 끊어낸다.
    const armIdleWatchdog = (ws: WebSocket) => {
      if (idleTimer !== null) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (!disposed && socket === ws) ws.close()
      }, IDLE_TIMEOUT_MS)
    }

    const url = klineStreamUrl(symbol, interval)

    const scheduleReconnect = () => {
      if (disposed) return
      const delay = backoff
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      retryTimer = setTimeout(connect, delay)
    }

    const connect = () => {
      if (disposed) return
      setStatus('connecting')
      const ws = new WebSocket(url)
      socket = ws

      ws.onopen = () => {
        if (disposed) return
        backoff = INITIAL_BACKOFF_MS
        setStatus('open')
        if (hasConnectedBefore) optionsRef.current.onReconnect?.()
        hasConnectedBefore = true
        armIdleWatchdog(ws)
      }

      ws.onmessage = (event: MessageEvent<string>) => {
        if (disposed) return
        armIdleWatchdog(ws)
        let message: CombinedStreamMessage<KlineStreamEvent | AggTradeEvent>
        try {
          message = JSON.parse(event.data) as CombinedStreamMessage<KlineStreamEvent | AggTradeEvent>
        } catch {
          return
        }
        const payload = message.data
        if (!payload) return
        if (payload.e === 'kline' && payload.k) {
          optionsRef.current.onCandle(normalizeStreamKline(payload.k), payload.k.x)
        } else if (payload.e === 'aggTrade') {
          optionsRef.current.onTrade?.(Number(payload.p), Number(payload.q), payload.T)
        }
      }

      ws.onerror = () => {
        ws.close()
      }

      ws.onclose = () => {
        if (disposed) return
        setStatus('closed')
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      disposed = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      if (idleTimer !== null) clearTimeout(idleTimer)
      if (socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        socket.close()
      }
    }
  }, [symbol, interval, enabled])

  return status
}

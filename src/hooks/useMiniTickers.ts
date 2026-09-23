import { useEffect, useRef } from 'react'
import {
  miniTickerStreamUrl,
  normalizeMiniTicker,
  type CombinedStreamMessage,
  type MiniTickerEvent,
  type Ticker24h,
} from '../lib/binance'

const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000
/** 미니 티커는 종목당 1~2초마다 온다. 이만큼 조용하면 죽은 연결로 보고 다시 붙는다. */
const IDLE_TIMEOUT_MS = 30000

/**
 * 여러 종목의 24시간 시세를 웹소켓으로 받는다(바이낸스 화면처럼 1~2초마다 갱신).
 * REST 폴링은 호출하는 쪽이 첫 값·예비용으로 느리게 유지한다.
 */
export function useMiniTickers(symbols: string[], onTicker: (ticker: Ticker24h) => void): void {
  const onTickerRef = useRef(onTicker)
  onTickerRef.current = onTicker
  const key = [...symbols].sort().join(',')

  useEffect(() => {
    if (!key) return
    const url = miniTickerStreamUrl(key.split(','))
    let disposed = false
    let socket: WebSocket | null = null
    let retryTimer: number | undefined
    let idleTimer: number | undefined
    let backoff = INITIAL_BACKOFF_MS

    const armIdle = (ws: WebSocket) => {
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        if (!disposed && socket === ws) ws.close()
      }, IDLE_TIMEOUT_MS)
    }

    const connect = () => {
      if (disposed) return
      const ws = new WebSocket(url)
      socket = ws
      ws.onopen = () => {
        backoff = INITIAL_BACKOFF_MS
        armIdle(ws)
      }
      ws.onmessage = (event: MessageEvent<string>) => {
        if (disposed) return
        armIdle(ws)
        try {
          const message = JSON.parse(event.data) as CombinedStreamMessage<MiniTickerEvent>
          if (message.data?.e === '24hrMiniTicker') onTickerRef.current(normalizeMiniTicker(message.data))
        } catch {
          /* 깨진 메시지는 버린다 */
        }
      }
      ws.onerror = () => ws.close()
      ws.onclose = () => {
        if (disposed) return
        const delay = backoff
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        retryTimer = window.setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      disposed = true
      window.clearTimeout(retryTimer)
      window.clearTimeout(idleTimer)
      if (socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        socket.close()
      }
    }
  }, [key])
}

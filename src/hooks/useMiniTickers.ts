import { useEffect, useRef, type MutableRefObject } from 'react'
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
 * 반환하는 ref 는 지금 소켓이 값을 주고 있는지를 알려준다(첫 메시지 이후 true, 끊기거나 멎으면 false).
 * 호출하는 쪽은 이 값이 false 일 때만 REST 예비 조회를 돌린다.
 */
export function useMiniTickers(
  symbols: string[],
  onTicker: (ticker: Ticker24h) => void,
): MutableRefObject<boolean> {
  const onTickerRef = useRef(onTicker)
  onTickerRef.current = onTicker
  const liveRef = useRef(false)
  const key = [...symbols].sort().join(',')

  useEffect(() => {
    liveRef.current = false
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
          if (message.data?.e === '24hrMiniTicker') {
            liveRef.current = true
            onTickerRef.current(normalizeMiniTicker(message.data))
          }
        } catch {
          /* 깨진 메시지는 버린다 */
        }
      }
      ws.onerror = () => ws.close()
      ws.onclose = () => {
        liveRef.current = false
        if (disposed) return
        const delay = backoff
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        retryTimer = window.setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      disposed = true
      liveRef.current = false
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

  return liveRef
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchKlines, type Candle, type Interval } from '../lib/binance'

export interface UseBinanceKlinesResult {
  candles: Candle[]
  loading: boolean
  error: Error | null
  /** 수동 재조회(갭 메우기 등). */
  reload: () => Promise<void>
}

const MAX_ATTEMPTS = 4
const BASE_DELAY_MS = 700

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

export function useBinanceKlines(
  symbol: string,
  interval: Interval,
  limit = 1000,
): UseBinanceKlinesResult {
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const reloadRef = useRef<(() => void) | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)

      // 모바일에선 화면 전환·신호 끊김으로 한 번씩 실패한다. 몇 번 더 두드려본다.
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const data = await fetchKlines(symbol, interval, limit, signal)
          if (signal?.aborted) return
          setCandles(data)
          setError(null)
          setLoading(false)
          return
        } catch (err) {
          if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
          if (attempt === MAX_ATTEMPTS) {
            setError(err instanceof Error ? err : new Error(String(err)))
            setLoading(false)
            return
          }
          try {
            await sleep(BASE_DELAY_MS * 2 ** (attempt - 1), signal)
          } catch {
            return
          }
        }
      }
    },
    [symbol, interval, limit],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    reloadRef.current = () => void load(controller.signal)
    return () => {
      controller.abort()
      reloadRef.current = null
    }
  }, [load])

  // 화면으로 돌아오거나 망이 살아나면 스스로 복구한다 — 사용자가 누르게 두지 않는다.
  useEffect(() => {
    const retry = () => {
      if (document.visibilityState === 'visible') reloadRef.current?.()
    }
    document.addEventListener('visibilitychange', retry)
    window.addEventListener('online', retry)
    return () => {
      document.removeEventListener('visibilitychange', retry)
      window.removeEventListener('online', retry)
    }
  }, [])

  const reload = useCallback(() => load(), [load])

  return { candles, loading, error, reload }
}

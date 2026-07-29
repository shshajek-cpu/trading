import { useCallback, useEffect, useState } from 'react'
import { fetchKlines, type Candle, type Interval } from '../lib/binance'

export interface UseBinanceKlinesResult {
  candles: Candle[]
  loading: boolean
  error: Error | null
  /** 수동 재조회(갭 메우기 등). */
  reload: () => Promise<void>
}

export function useBinanceKlines(
  symbol: string,
  interval: Interval,
  limit = 1000,
): UseBinanceKlinesResult {
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchKlines(symbol, interval, limit, signal)
        if (signal?.aborted) return
        setCandles(data)
      } catch (err) {
        if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [symbol, interval, limit],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const reload = useCallback(() => load(), [load])

  return { candles, loading, error, reload }
}

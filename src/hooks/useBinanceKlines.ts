import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchKlines, type Candle, type Interval } from '../lib/binance'

export interface UseBinanceKlinesResult {
  candles: Candle[]
  loading: boolean
  error: Error | null
  /** 수동 재조회(갭 메우기 등). */
  reload: () => Promise<void>
  /** 더 오래된 캔들을 앞에 붙인다. */
  loadOlder: () => Promise<void>
  loadingOlder: boolean
  /** 거래소에 더 이상 과거가 없음. */
  exhausted: boolean
}

const MAX_ATTEMPTS = 4
const BASE_DELAY_MS = 700
const OLDER_CHUNK = 500

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
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const reloadRef = useRef<(() => void) | null>(null)
  // 상태가 아니라 ref 로 가진다 — 스크롤 중 연달아 불려도 중복 요청을 막아야 한다.
  const busyRef = useRef(false)
  const candlesRef = useRef<Candle[]>([])
  candlesRef.current = candles

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
          setExhausted(false)
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
    setCandles([])
    setExhausted(false)
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

  const loadOlder = useCallback(async () => {
    if (busyRef.current || exhausted) return
    const oldest = candlesRef.current[0]
    if (!oldest) return

    // 받아오는 사이에 종목·주기가 바뀔 수 있다. 그때 온 것을 그대로 앞에 붙이면
    // 다른 주기의 캔들이 섞여 시간 순서가 깨진다.
    const token = `${symbol}|${interval}`
    busyRef.current = true
    setLoadingOlder(true)
    try {
      // endTime 은 포함이라 1ms 빼서 겹침을 피한다.
      const older = await fetchKlines(
        symbol,
        interval,
        OLDER_CHUNK,
        undefined,
        oldest.time * 1000 - 1,
      )
      if (token !== `${symbol}|${interval}`) return
      const current = candlesRef.current[0]
      // 그 사이 새로 불러왔다면 기준점이 달라졌다는 뜻이다. 버린다.
      if (!current || current.time !== oldest.time) return

      const fresh = older.filter((c) => c.time < oldest.time)
      if (fresh.length === 0) {
        setExhausted(true)
      } else {
        setCandles((prev) => [...fresh, ...prev])
        if (fresh.length < OLDER_CHUNK) setExhausted(true)
      }
    } catch {
      /* 과거 로딩 실패는 조용히 넘긴다 — 이미 보고 있는 차트는 멀쩡하다. */
    } finally {
      busyRef.current = false
      setLoadingOlder(false)
    }
  }, [symbol, interval, exhausted])

  const reload = useCallback(() => load(), [load])

  return { candles, loading, error, reload, loadOlder, loadingOlder, exhausted }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchKlines, RateLimitError, rateLimitedUntil, type Candle, type Interval } from '../lib/binance'
import { INTERVAL_SECONDS } from '../lib/intervals'

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
  /**
   * 실시간으로 끝난 봉을 목록에 확정한다(같은 시각이면 바꾸고, 바로 다음 봉이면 붙인다).
   * 사이에 빠진 봉이 있으면(끊겨 있던 동안) 붙이지 않고 다시 받아 메운다.
   */
  commit: (candle: Candle) => void
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

/**
 * 다시 받은 최신 구간을 이미 가진 캔들 뒤에 잇는다.
 * 통째로 갈아끼우면 스크롤해서 불러온 과거가 사라지고 보던 위치가 다른 날짜로 튄다
 * (탭에 돌아올 때·웹소켓이 잠깐 끊겨 재조회할 때). 오래 떠나 있어 틈이 생기면 새 구간으로 바꾼다.
 */
function mergeLatest(prev: Candle[], fresh: Candle[], step: number): Candle[] {
  if (prev.length === 0 || fresh.length === 0) return fresh
  const first = fresh[0].time
  const cut = prev.findIndex((c) => c.time >= first)
  const older = cut === -1 ? prev : prev.slice(0, cut)
  const lastOlder = older[older.length - 1]
  if (!lastOlder || first - lastOlder.time > step * 1.5) return fresh
  return [...older, ...fresh]
}

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
  const seriesKeyRef = useRef(`${symbol}|${interval}`)
  seriesKeyRef.current = `${symbol}|${interval}`
  const olderControllerRef = useRef<AbortController | null>(null)
  // 429/418 쿨다운이 끝나면 한 번만 자동 재시도할 타이머.
  const rateTimerRef = useRef<number | undefined>(undefined)
  const candlesRef = useRef<Candle[]>([])
  candlesRef.current = candles

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      const key = `${symbol}|${interval}`

      // 모바일에선 화면 전환·신호 끊김으로 한 번씩 실패한다. 몇 번 더 두드려본다.
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const data = await fetchKlines(symbol, interval, limit, signal)
          // 받는 사이 종목·주기가 바뀌었으면 버린다(다른 차트 캔들이 섞이지 않게).
          if (signal?.aborted || seriesKeyRef.current !== key) return
          setCandles((prev) => mergeLatest(prev, data, INTERVAL_SECONDS[interval]))
          setError(null)
          setLoading(false)
          return
        } catch (err) {
          if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
          // 한도 초과는 재시도로 두드려도 소용없다 — 쿨다운이 끝날 때 딱 한 번만 다시 받는다.
          if (err instanceof RateLimitError) {
            if (seriesKeyRef.current !== key) return
            setError(err)
            setLoading(false)
            window.clearTimeout(rateTimerRef.current)
            const wait = Math.max(0, err.until - Date.now()) + 250 + Math.random() * 500
            rateTimerRef.current = window.setTimeout(() => {
              if (!signal?.aborted) void load(signal)
            }, wait)
            return
          }
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
    olderControllerRef.current?.abort()
    olderControllerRef.current = null
    busyRef.current = false
    setLoadingOlder(false)
    setCandles([])
    setExhausted(false)
    void load(controller.signal)
    reloadRef.current = () => void load(controller.signal)
    return () => {
      controller.abort()
      olderControllerRef.current?.abort()
      olderControllerRef.current = null
      reloadRef.current = null
      window.clearTimeout(rateTimerRef.current)
    }
  }, [load])

  // 화면으로 돌아오거나 망이 살아나면 스스로 복구한다 — 사용자가 누르게 두지 않는다.
  useEffect(() => {
    const retry = () => {
      // 한도 초과 중엔 두드리지 않는다 — 쿨다운이 끝나면 load 가 스스로 재시도한다.
      if (document.visibilityState === 'visible' && rateLimitedUntil() <= Date.now()) reloadRef.current?.()
    }
    document.addEventListener('visibilitychange', retry)
    window.addEventListener('online', retry)
    return () => {
      document.removeEventListener('visibilitychange', retry)
      window.removeEventListener('online', retry)
    }
  }, [])

  const loadOlder = useCallback(async () => {
    if (busyRef.current || exhausted || rateLimitedUntil() > Date.now()) return
    const oldest = candlesRef.current[0]
    if (!oldest) return

    // 받아오는 사이에 종목·주기가 바뀔 수 있다. 그때 온 것을 그대로 앞에 붙이면
    // 다른 주기의 캔들이 섞여 시간 순서가 깨진다.
    const token = `${symbol}|${interval}`
    const controller = new AbortController()
    olderControllerRef.current = controller
    busyRef.current = true
    setLoadingOlder(true)
    try {
      // endTime 은 포함이라 1ms 빼서 겹침을 피한다.
      const older = await fetchKlines(
        symbol,
        interval,
        OLDER_CHUNK,
        controller.signal,
        oldest.time * 1000 - 1,
      )
      if (controller.signal.aborted || seriesKeyRef.current !== token) return
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
      if (olderControllerRef.current === controller) {
        olderControllerRef.current = null
        busyRef.current = false
        setLoadingOlder(false)
      }
    }

  }, [symbol, interval, exhausted])

  const reload = useCallback(() => load(), [load])

  const commit = useCallback(
    (candle: Candle) => {
      const last = candlesRef.current[candlesRef.current.length - 1]
      if (!last || candle.time < last.time) return
      if (candle.time - last.time > INTERVAL_SECONDS[interval] * 1.5) {
        // 붙이면 그 사이 봉이 빠진 채 이어져 가격이 뚝 끊겨 보인다 — 다시 받아 메운다.
        if (rateLimitedUntil() <= Date.now()) reloadRef.current?.()
        return
      }
      setCandles((prev) => {
        const tail = prev[prev.length - 1]
        if (!tail || candle.time < tail.time) return prev
        if (candle.time === tail.time) return [...prev.slice(0, -1), candle]
        return [...prev, candle]
      })
    },
    [interval],
  )

  return { candles, loading, error, reload, loadOlder, loadingOlder, exhausted, commit }
}

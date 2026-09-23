import { useCallback, useEffect, useRef, useState } from 'react'
import {
  combinedKlineStreamUrl,
  fetchKlines,
  klineStreamName,
  normalizeStreamKline,
  type Candle,
  type CombinedStreamMessage,
  type Interval,
  type KlineStreamEvent,
} from '../lib/binance'
import { computeIndicator, type ComputedIndicator } from '../chart/compute'
import { CHART_PALETTES } from '../lib/theme'
import {
  conditionMet,
  loadIndicatorAlerts,
  saveIndicatorAlerts,
  type IndicatorAlert,
  type NewIndicatorAlert,
} from '../lib/indicatorAlerts'

export interface UseIndicatorAlertsResult {
  alerts: IndicatorAlert[]
  addAlert: (alert: NewIndicatorAlert) => void
  removeAlert: (id: string) => void
}

/** 지표 계산에 쓰는 과거 봉 수 — 급증 강도(기본 100봉)·일목 등 긴 지표도 값이 나오게 넉넉히. */
const HISTORY = 1000
const MAX_CANDLES = 1500
/** 진행 중인 봉은 1초에 한 번까지만 판정한다. 봉 마감은 항상 판정한다. */
const EVAL_INTERVAL_MS = 1000
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000
/** 봉 스트림이 이만큼 조용하면 죽은 연결로 보고 다시 연결한다. */
const IDLE_TIMEOUT_MS = 30000

interface Feed {
  symbol: string
  interval: Interval
  candles: Candle[]
  loaded: boolean
  lastEval: number
}

/** 새 봉이면 붙이고 같은 봉이면 바꾼다. 과거 봉 이벤트는 버린다. */
function mergeCandle(list: Candle[], candle: Candle): void {
  const last = list[list.length - 1]
  if (!last) return
  if (candle.time === last.time) list[list.length - 1] = candle
  else if (candle.time > last.time) {
    list.push(candle)
    if (list.length > MAX_CANDLES) list.splice(0, list.length - MAX_CANDLES)
  }
}

/**
 * 지표 값 알림. 활성 알림의 (종목, 주기)마다 과거 봉을 받고 봉 스트림 하나로 실시간 봉을 이어 받아,
 * 알림에 저장된 지표 사본으로 값을 계산해 조건을 판정한다. 차트에 그 종목이 떠 있지 않아도 동작한다.
 * 브라우저에서 계산하므로 앱이 열려 있을 때(백그라운드 탭 포함)만 울린다.
 */
export function useIndicatorAlerts(onFire: (alert: IndicatorAlert, value: number) => void): UseIndicatorAlertsResult {
  const [alerts, setAlerts] = useState<IndicatorAlert[]>(loadIndicatorAlerts)
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts
  const fireRef = useRef(onFire)
  fireRef.current = onFire

  useEffect(() => saveIndicatorAlerts(alerts), [alerts])

  const addAlert = useCallback((input: NewIndicatorAlert) => {
    if (!Number.isFinite(input.value)) return
    const message = input.message?.trim()
    setAlerts((prev) => [
      ...prev,
      {
        ...input,
        id: `ia-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        active: true,
        createdAt: Date.now(),
        ...(message ? { message } : { message: undefined }),
      },
    ])
  }, [])

  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  // 감시할 (종목, 주기) 묶음. 이게 바뀔 때만 데이터 연결을 다시 만든다.
  const watchKey = [...new Set(alerts.filter((a) => a.active).map((a) => klineStreamName(a.symbol, a.interval)))]
    .sort()
    .join('/')
  const feedSpecRef = useRef(new Map<string, { symbol: string; interval: Interval }>())
  feedSpecRef.current = new Map(
    alerts.map((a) => [klineStreamName(a.symbol, a.interval), { symbol: a.symbol, interval: a.interval }]),
  )

  useEffect(() => {
    if (!watchKey) return
    const feeds = new Map<string, Feed>()
    for (const stream of watchKey.split('/')) {
      const spec = feedSpecRef.current.get(stream)
      if (spec) feeds.set(stream, { ...spec, candles: [], loaded: false, lastEval: 0 })
    }

    let disposed = false
    const controller = new AbortController()
    const palette = CHART_PALETTES.dark

    const evaluate = (feed: Feed, closed: boolean) => {
      const barTime = feed.candles[feed.candles.length - 1]?.time
      if (barTime === undefined) return
      // 같은 지표 설정을 쓰는 알림끼리는 한 번만 계산한다.
      const cache = new Map<string, ComputedIndicator>()
      const fired: { alert: IndicatorAlert; value: number }[] = []
      for (const alert of alertsRef.current) {
        if (!alert.active || alert.symbol !== feed.symbol || alert.interval !== feed.interval) continue
        if (alert.trigger === 'perBarClose' && !closed) continue
        if (alert.trigger !== 'once' && alert.lastBar === barTime) continue
        const cacheKey = `${alert.indicator.kind}:${JSON.stringify(alert.indicator.params)}`
        let computed = cache.get(cacheKey)
        if (!computed) {
          computed = computeIndicator(alert.indicator, feed.candles, palette)
          cache.set(cacheKey, computed)
        }
        const points = computed.lines.find((l) => l.key === alert.lineKey)?.points
        const cur = points?.[points.length - 1]
        // 지표가 지금 봉까지 계산돼야 판정한다(앞쪽 봉이 모자라 값이 없으면 건너뛴다).
        if (!points || !cur || cur.time !== barTime) continue
        if (!conditionMet(alert.condition, points[points.length - 2]?.value, cur.value, alert.value)) continue
        fired.push({ alert, value: cur.value })
      }
      if (fired.length === 0) return
      const now = Date.now()
      const update = (a: IndicatorAlert): IndicatorAlert => {
        if (!fired.some((f) => f.alert.id === a.id)) return a
        return a.trigger === 'once' ? { ...a, active: false, firedAt: now } : { ...a, lastBar: barTime, firedAt: now }
      }
      // 다음 틱이 렌더 전에 와도 두 번 울리지 않게 ref 도 바로 바꾼다.
      alertsRef.current = alertsRef.current.map(update)
      setAlerts((prev) => prev.map(update))
      for (const f of fired) fireRef.current(f.alert, f.value)
    }

    const load = async (feed: Feed) => {
      try {
        const data = await fetchKlines(feed.symbol, feed.interval, HISTORY, controller.signal)
        if (disposed) return
        // 받는 사이 스트림으로 온 더 최신 봉은 살린다.
        const tail = feed.candles.filter((c) => c.time > (data[data.length - 1]?.time ?? Infinity))
        feed.candles = [...data, ...tail]
        feed.loaded = true
      } catch {
        /* 다음 재연결 때 다시 받는다 */
      }
    }

    let socket: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let backoff = INITIAL_BACKOFF_MS

    const armIdle = (ws: WebSocket) => {
      if (idleTimer !== null) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (!disposed && socket === ws) ws.close()
      }, IDLE_TIMEOUT_MS)
    }

    const connect = () => {
      if (disposed) return
      const ws = new WebSocket(combinedKlineStreamUrl([...feeds.keys()]))
      socket = ws
      ws.onopen = () => {
        if (disposed) return
        backoff = INITIAL_BACKOFF_MS
        armIdle(ws)
        // 처음 연결과 재연결 모두 과거 봉을 다시 받아 끊긴 동안의 빈틈을 메운다.
        for (const feed of feeds.values()) void load(feed)
      }
      ws.onmessage = (event: MessageEvent<string>) => {
        if (disposed) return
        armIdle(ws)
        let message: CombinedStreamMessage<KlineStreamEvent>
        try {
          message = JSON.parse(event.data) as CombinedStreamMessage<KlineStreamEvent>
        } catch {
          return
        }
        const feed = feeds.get(message.stream)
        const k = message.data?.k
        if (!feed || !k) return
        const candle = normalizeStreamKline(k)
        if (feed.candles.length === 0) feed.candles = [candle]
        else mergeCandle(feed.candles, candle)
        if (!feed.loaded) return
        const now = Date.now()
        if (k.x || now - feed.lastEval >= EVAL_INTERVAL_MS) {
          feed.lastEval = now
          evaluate(feed, k.x)
        }
      }
      ws.onerror = () => ws.close()
      ws.onclose = () => {
        if (disposed) return
        const delay = backoff
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        retryTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      disposed = true
      controller.abort()
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
  }, [watchKey])

  return { alerts, addAlert, removeAlert }
}

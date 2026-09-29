import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCandles } from '../lib/market'
import { subscribeCandles } from '../lib/market/live'
import type { Candle, Interval } from '../lib/market/types'
import { computeIndicator, type ComputedIndicator } from '../chart/compute'
import { CHART_PALETTES } from '../lib/theme'
import {
  conditionMet,
  INDICATOR_ALERTS_STORAGE_KEY,
  parseIndicatorAlerts,
  type IndicatorAlert,
  type NewIndicatorAlert,
} from '../lib/indicatorAlerts'
import { notifySettingsChanged } from '../lib/syncBus'

export interface UseIndicatorAlertsResult {
  alerts: IndicatorAlert[]
  addAlert: (alert: NewIndicatorAlert) => void
  removeAlert: (id: string) => void
  /** 서버(푸시 워커)가 먼저 울린 알림을 로컬에서도 울린 것으로 표시한다. 켜진 '한 번만' 알림만 끄고 나머지 id 는 넘긴다. */
  markFired: (ids: string[]) => void
}

function loadAlerts(): IndicatorAlert[] {
  try {
    return parseIndicatorAlerts(localStorage.getItem(INDICATOR_ALERTS_STORAGE_KEY))
  } catch {
    return []
  }
}

function saveAlerts(alerts: IndicatorAlert[]): void {
  try {
    localStorage.setItem(INDICATOR_ALERTS_STORAGE_KEY, JSON.stringify(alerts))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 — 메모리 상태는 유지된다. */
  }
}

/** 지표 계산에 쓰는 과거 봉 수 — 급증 강도(기본 100봉)·일목 등 긴 지표도 값이 나오게 넉넉히. */
const HISTORY = 1000
const MAX_CANDLES = 1500
/** 진행 중인 봉은 1초에 한 번까지만 판정한다. 봉 마감은 항상 판정한다. */
const EVAL_INTERVAL_MS = 1000

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
 * 지표 값 알림. 활성 알림의 (종목, 주기)마다 과거 봉을 받고 실시간 봉(lib/market/live — 바이낸스·업비트 웹소켓,
 * 야후 폴링)을 이어 받아,
 * 알림에 저장된 지표 사본으로 값을 계산해 조건을 판정한다. 차트에 그 종목이 떠 있지 않아도 동작한다.
 * 앱이 열려 있을 때(백그라운드 탭 포함) 여기서 울린다. 앱이 닫혀 있으면 푸시 워커(worker/indicatorAlerts.ts)가
 * 동기화된 이 목록을 매분 같은 계산·판정으로 보고 웹 푸시를 보낸다 — 같은 태그(ind-<id>)라 OS 가 하나로 합친다.
 */
export function useIndicatorAlerts(onFire: (alert: IndicatorAlert, value: number) => void): UseIndicatorAlertsResult {
  const [alerts, setAlerts] = useState<IndicatorAlert[]>(loadAlerts)
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts
  const fireRef = useRef(onFire)
  fireRef.current = onFire

  useEffect(() => saveAlerts(alerts), [alerts])

  // 다른 탭이 바꾼 알림을 받아 온다. 안 받으면 이 탭이 옛 목록을 통째로 저장해 꺼진 알림을 되살린다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== INDICATOR_ALERTS_STORAGE_KEY) return
      const next = loadAlerts()
      alertsRef.current = next
      setAlerts(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

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

  const markFired = useCallback((ids: string[]) => {
    const fired = new Set(ids)
    const hit = (a: IndicatorAlert) => a.active && a.trigger === 'once' && fired.has(a.id)
    if (!alertsRef.current.some(hit)) return
    const now = Date.now()
    const update = (a: IndicatorAlert): IndicatorAlert => (hit(a) ? { ...a, active: false, firedAt: now } : a)
    // 스트림 판정이 렌더 전에 와도 다시 울리지 않게 ref 도 바로 바꾼다.
    alertsRef.current = alertsRef.current.map(update)
    setAlerts((prev) => prev.map(update))
  }, [])

  // 감시할 (종목, 주기) 묶음. 이게 바뀔 때만 데이터 연결을 다시 만든다.
  // 키는 `종목|주기`(종목 id 에는 | 가 없다).
  const watchKey = [...new Set(alerts.filter((a) => a.active).map((a) => `${a.symbol}|${a.interval}`))].sort().join(',')

  useEffect(() => {
    if (!watchKey) return
    const feeds: Feed[] = watchKey.split(',').map((key) => {
      const cut = key.lastIndexOf('|')
      return { symbol: key.slice(0, cut), interval: key.slice(cut + 1) as Interval, candles: [], loaded: false, lastEval: 0 }
    })

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
        // 만료된 알림은 울리지 않는다(목록에는 「만료됨」으로 남는다).
        if (alert.expiresAt !== undefined && Date.now() >= alert.expiresAt) continue
        if (alert.trigger === 'perBarClose' && !closed) continue
        if (alert.trigger !== 'once' && alert.lastBar === barTime) continue
        const cacheKey = `${alert.indicator.kind}:${JSON.stringify(alert.indicator.params)}`
        let computed = cache.get(cacheKey)
        if (!computed) {
          computed = computeIndicator(alert.indicator, feed.candles, palette)
          cache.set(cacheKey, computed)
        }
        const line = computed.lines.find((l) => l.key === alert.lineKey)
        const points = line?.points
        const cur = points?.[points.length - 1]
        // 지표가 지금 봉까지 계산돼야 판정한다(앞쪽 봉이 모자라 값이 없으면 건너뛴다).
        // 일목 선행·후행 스팬은 앞뒤로 밀려 그려져 마지막 점 시각이 다르지만, 그 점이 지금 봉으로 계산한 값이다.
        if (!line || !points || !cur || (!line.displaced && cur.time !== barTime)) continue
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
        const data = await fetchCandles(feed.symbol, feed.interval, HISTORY, controller.signal)
        if (disposed) return
        // 받는 사이 실시간으로 온 더 최신 봉은 살린다.
        const tail = feed.candles.filter((c) => c.time > (data[data.length - 1]?.time ?? Infinity))
        feed.candles = [...data, ...tail]
        feed.loaded = true
      } catch {
        /* 다음 재연결 때 다시 받는다 */
      }
    }

    // (종목, 주기)마다 실시간 봉을 구독한다. 처음 연결과 재연결 모두 과거 봉을 다시 받아 끊긴 동안의 빈틈을 메운다.
    const stops = feeds.map((feed) => {
      void load(feed)
      return subscribeCandles(feed.symbol, feed.interval, {
        onReconnect: () => void load(feed),
        onCandle: (candle, closed) => {
          if (disposed) return
          if (feed.candles.length === 0) feed.candles = [candle]
          else mergeCandle(feed.candles, candle)
          if (!feed.loaded) return
          const now = Date.now()
          if (closed || now - feed.lastEval >= EVAL_INTERVAL_MS) {
            feed.lastEval = now
            evaluate(feed, closed)
          }
        },
      })
    })

    return () => {
      disposed = true
      controller.abort()
      for (const stop of stops) stop()
    }
  }, [watchKey])

  return { alerts, addAlert, removeAlert, markFired }
}

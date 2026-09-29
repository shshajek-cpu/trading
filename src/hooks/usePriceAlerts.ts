import { useCallback, useEffect, useRef, useState } from 'react'
import { notifySettingsChanged } from '../lib/syncBus'
import {
  alertSince,
  initialPriceState,
  isExpired,
  isMoveKind,
  moveHit,
  MOVE_MINUTES_MAX,
  parsePriceAlert,
  priceBand,
  startTarget,
  stepRule,
  type PriceAlert,
  type PriceAlertInput,
  type RuleState,
  type Sample,
} from '../lib/alertRules'

const STORAGE_KEY = 'trading.priceAlerts.v1'

/**
 * 「매번」 알림의 이 기기 판정 상태(걸림·마지막으로 울린 시각). 틱마다 바뀔 수 있어 동기화하지 않는다 —
 * 서버 감시기는 자기 기록(w:<code>.ruleMarks)으로 따로 판정한다. 키는 `${id}@${감시 시작}` 이라 고치거나 다시 켜면 새로 시작한다.
 * 새로 고쳐도 남겨 둬야 '보다 큼'·'채널 안' 같은 알림이 새로 열 때마다 다시 울리지 않는다.
 */
const REPEAT_KEY = 'trading.alertRepeat.v1'

/** 이동 % 판정용 가격 표본 한 칸의 길이. 이 안의 틱은 최저·최고 하나로 묶는다. */
const SAMPLE_MS = 5_000

function loadAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(parsePriceAlert).filter((a): a is PriceAlert => a !== null) : []
  } catch {
    return []
  }
}

function loadRepeat(): Record<string, RuleState> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(REPEAT_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, RuleState>) : {}
  } catch {
    return {}
  }
}

/** 새로 켤 때 거는 조건부터 봐야 하는 조건(교차·상향/하향 교차·채널 진입/이탈). */
function needsArm(alert: PriceAlert): boolean {
  const kind = alert.kind ?? 'cross'
  return !isMoveKind(kind) && startTarget(kind) === null
}

export interface UsePriceAlertsResult {
  alerts: PriceAlert[]
  addAlert: (input: PriceAlertInput) => void
  /** 알림을 고치고 다시 켠다(종목은 그대로). */
  updateAlert: (id: string, input: Omit<PriceAlertInput, 'symbol'>) => void
  removeAlert: (id: string) => void
  /** 최신 가격을 흘려보내면 조건 충족 알림을 발동시킨다. */
  checkPrice: (symbol: string, price: number) => void
  /** 다른 곳(푸시 워커)에서 이미 울린 한 번만 알림을 끈다 — 앱을 다시 열었을 때 또 울리지 않게. */
  markFired: (ids: readonly string[]) => void
  /** 알림을 켜거나 끈다(울린 알림 '다시 켜기'). */
  setActive: (id: string, active: boolean) => void
}

export function usePriceAlerts(onTrigger: (alert: PriceAlert, price: number) => void): UsePriceAlertsResult {
  const [alerts, setAlerts] = useState<PriceAlert[]>(loadAlerts)
  // 진짜 상태는 ref 에 둔다 — 발동 판정을 setState 업데이터 밖에서 동기로 해야 한 번만 울린다(업데이터는 두 번 돌 수 있다).
  const current = useRef(alerts)
  const repeat = useRef<Record<string, RuleState>>(loadRepeat())
  /** 종목별 가격 표본(시간순) — 이동 % 알림이 있는 종목만 모은다. */
  const samples = useRef(new Map<string, Sample[]>())

  const triggerRef = useRef(onTrigger)
  triggerRef.current = onTrigger

  const replace = useCallback((next: PriceAlert[]) => {
    current.current = next
    setAlerts(next)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
      notifySettingsChanged()
    } catch {
      /* 저장 실패(용량 초과 등)는 무시 — 메모리 상태는 유지된다. */
    }
  }, [alerts])

  // 다른 탭이 바꾼 알림을 받아 온다. 안 받으면 이 탭이 옛 목록을 통째로 저장해 꺼진 알림을 되살린다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) replace(loadAlerts())
      else if (e.key === REPEAT_KEY) repeat.current = loadRepeat()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [replace])

  const addAlert = useCallback(
    (input: PriceAlertInput) => {
      const now = Date.now()
      const alert = parsePriceAlert({
        ...input,
        message: input.message?.trim() || undefined,
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      if (alert && alert.price > 0) replace([...current.current, alert])
    },
    [replace],
  )

  const updateAlert = useCallback<UsePriceAlertsResult['updateAlert']>(
    (id, input) => {
      replace(
        current.current.map((a) => {
          if (a.id !== id) return a
          // 선택 필드는 새로 정한 값만 남긴다(메모·만료를 지웠으면 빠진다). 모양이 틀리면 고치지 않는다.
          const next = parsePriceAlert({
            ...input,
            message: input.message?.trim() || undefined,
            id,
            symbol: a.symbol,
            active: true,
            createdAt: a.createdAt,
            updatedAt: Date.now(),
          })
          return next && next.price > 0 ? next : a
        }),
      )
    },
    [replace],
  )

  const removeAlert = useCallback(
    (id: string) => {
      replace(current.current.filter((a) => a.id !== id))
    },
    [replace],
  )

  const markFired = useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 0) return
      const set = new Set(ids)
      let changed = false
      const next = current.current.map((a) => {
        if (!a.active || !set.has(a.id) || a.repeat === 'every') return a
        changed = true
        return { ...a, active: false }
      })
      if (changed) replace(next)
    },
    [replace],
  )

  const setActive = useCallback(
    (id: string, active: boolean) => {
      let changed = false
      const next = current.current.map((a) => {
        if (a.id !== id || a.active === active) return a
        changed = true
        const { pending: _p, ...rest } = a
        // 교차·진입·이탈 알림을 다시 켜면 새로 넘어올 때 울린다 — 이미 넘어가 있는 가격으로 곧바로 울리지 않게 다시 건다.
        // 다시 켠 시각을 적어 서버 감시기가 그 뒤의 움직임만 보게 한다.
        const on = active ? { ...rest, active, updatedAt: Date.now() } : { ...rest, active }
        return active && needsArm(a) ? { ...on, pending: true } : on
      })
      if (changed) replace(next)
    },
    [replace],
  )

  const checkPrice = useCallback(
    (symbol: string, price: number) => {
      if (!Number.isFinite(price)) return
      const now = Date.now()
      const list = current.current
      const store = repeat.current

      // 이동 % 알림이 있는 종목은 가격 표본을 모은다(가장 긴 창까지만 남긴다).
      if (list.some((a) => a.active && a.symbol === symbol && a.kind && isMoveKind(a.kind))) {
        const series = samples.current.get(symbol) ?? []
        const last = series.at(-1)
        if (last && Math.floor(last.t / SAMPLE_MS) === Math.floor(now / SAMPLE_MS)) {
          last.lo = Math.min(last.lo, price)
          last.hi = Math.max(last.hi, price)
        } else {
          series.push({ t: now, lo: price, hi: price })
        }
        const keepFrom = now - MOVE_MINUTES_MAX * 60_000
        while (series.length > 0 && series[0].t < keepFrom) series.shift()
        samples.current.set(symbol, series)
      }

      const fired: PriceAlert[] = []
      let changed = false
      let repeatChanged = false
      const next = list.map((alert) => {
        if (!alert.active || alert.symbol !== symbol || isExpired(alert, now)) return alert
        const kind = alert.kind ?? 'cross'
        const every = alert.repeat === 'every'
        const key = `${alert.id}@${alertSince(alert)}`

        if (isMoveKind(kind)) {
          const last = every ? store[key]?.firedAt : undefined
          // 「매번」은 마지막으로 울린 뒤의 움직임만 보고, 재알림 대기 중에는 울리지 않는다.
          if (last !== undefined && now < last + (alert.cooldown ?? 0) * 60_000) return alert
          const from = Math.max(alertSince(alert), last ?? 0)
          if (!moveHit(kind, alert.price, alert.minutes ?? 1, samples.current.get(symbol) ?? [], from, now, price)) return alert
          fired.push(alert)
          if (every) {
            store[key] = { target: null, firedAt: now }
            repeatChanged = true
            return alert
          }
          changed = true
          return { ...alert, active: false }
        }

        const state = (every ? store[key] : undefined) ?? initialPriceState(alert)
        const step = stepRule(kind, state, price, priceBand(alert), now, alert)
        if (every) {
          if (step.state !== state) {
            store[key] = step.state
            repeatChanged = true
          }
          if (step.fired) fired.push(alert)
          return alert
        }
        if (step.fired) {
          fired.push(alert)
          changed = true
          return { ...alert, active: false }
        }
        const target = step.state.target
        if (step.state === state || target === null) return alert
        // 한 번만 알림이 걸렸다 — 가격 하나 조건은 넘어갈 쪽을 condition 에 적는다. 걸린 시각도 적는다(서버 감시기도
        // 이 뒤의 움직임으로만 울린다 — 걸기 전에 지나간 가격으로 울리지 않게).
        changed = true
        const { pending: _p, ...rest } = alert
        const condition = target === 'down' ? 'below' : target === 'up' ? 'above' : alert.condition
        return { ...rest, condition, updatedAt: now } satisfies PriceAlert
      })

      if (repeatChanged) {
        // 지운·고친 알림의 옛 상태는 뺀다.
        const live = new Set(next.map((a) => `${a.id}@${alertSince(a)}`))
        for (const key of Object.keys(store)) if (!live.has(key)) delete store[key]
        try {
          localStorage.setItem(REPEAT_KEY, JSON.stringify(store))
        } catch {
          /* 저장 실패는 무시 — 메모리 상태로 계속 판정한다 */
        }
      }
      if (changed) replace(next)
      for (const alert of fired) triggerRef.current(alert, price)
    },
    [replace],
  )

  return { alerts, addAlert, updateAlert, removeAlert, checkPrice, markFired, setActive }
}

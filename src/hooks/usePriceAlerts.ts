import { useCallback, useEffect, useRef, useState } from 'react'
import { notifySettingsChanged } from '../lib/syncBus'

export type AlertCondition = 'above' | 'below'

export interface PriceAlert {
  id: string
  symbol: string
  condition: AlertCondition
  price: number
  active: boolean
  createdAt: number
  /** 발동 시 함께 보여줄 메모. 선택. */
  message?: string
}

const STORAGE_KEY = 'trading.priceAlerts.v1'

function isAlert(value: unknown): value is PriceAlert {
  if (typeof value !== 'object' || value === null) return false
  const a = value as Record<string, unknown>
  return (
    typeof a.id === 'string' &&
    typeof a.symbol === 'string' &&
    (a.condition === 'above' || a.condition === 'below') &&
    typeof a.price === 'number' &&
    Number.isFinite(a.price) &&
    typeof a.active === 'boolean' &&
    typeof a.createdAt === 'number' &&
    (a.message === undefined || typeof a.message === 'string')
  )
}

function loadAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isAlert) : []
  } catch {
    return []
  }
}

export interface UsePriceAlertsResult {
  alerts: PriceAlert[]
  addAlert: (symbol: string, condition: AlertCondition, price: number, message?: string) => void
  removeAlert: (id: string) => void
  /** 최신 가격을 흘려보내면 조건 충족 알림을 발동시킨다. */
  checkPrice: (symbol: string, price: number) => void
  /** 다른 곳(푸시 워커)에서 이미 울린 알림을 끈다 — 앱을 다시 열었을 때 또 울리지 않게. */
  markFired: (ids: readonly string[]) => void
  /** 알림을 켜거나 끈다(울린 알림 '다시 켜기'). */
  setActive: (id: string, active: boolean) => void
}

export function usePriceAlerts(
  onTrigger: (alert: PriceAlert, price: number) => void,
): UsePriceAlertsResult {
  const [alerts, setAlerts] = useState<PriceAlert[]>(loadAlerts)
  // 진짜 상태는 ref 에 둔다 — 발동 판정을 setState 업데이터 밖에서 동기로 해야 한 번만 울린다(업데이터는 두 번 돌 수 있다).
  const current = useRef(alerts)

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
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [replace])

  const addAlert = useCallback(
    (symbol: string, condition: AlertCondition, price: number, message?: string) => {
      if (!Number.isFinite(price) || price <= 0) return
      const trimmed = message?.trim()
      replace([
        ...current.current,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          symbol,
          condition,
          price,
          active: true,
          createdAt: Date.now(),
          ...(trimmed ? { message: trimmed } : {}),
        },
      ])
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
        if (!a.active || !set.has(a.id)) return a
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
        return { ...a, active }
      })
      if (changed) replace(next)
    },
    [replace],
  )

  const checkPrice = useCallback(
    (symbol: string, price: number) => {
      if (!Number.isFinite(price)) return
      const fired: PriceAlert[] = []
      const next = current.current.map((alert) => {
        if (!alert.active || alert.symbol !== symbol) return alert
        const hit = alert.condition === 'above' ? price >= alert.price : price <= alert.price
        if (!hit) return alert
        const updated = { ...alert, active: false }
        fired.push(updated)
        return updated
      })
      if (fired.length === 0) return
      replace(next)
      for (const alert of fired) triggerRef.current(alert, price)
    },
    [replace],
  )

  return { alerts, addAlert, removeAlert, checkPrice, markFired, setActive }
}

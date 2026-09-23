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
}

export function usePriceAlerts(
  onTrigger: (alert: PriceAlert, price: number) => void,
): UsePriceAlertsResult {
  const [alerts, setAlerts] = useState<PriceAlert[]>(loadAlerts)

  const triggerRef = useRef(onTrigger)
  triggerRef.current = onTrigger

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
      notifySettingsChanged()
    } catch {
      /* 저장 실패(용량 초과 등)는 무시 — 메모리 상태는 유지된다. */
    }
  }, [alerts])

  const addAlert = useCallback(
    (symbol: string, condition: AlertCondition, price: number, message?: string) => {
      if (!Number.isFinite(price) || price <= 0) return
      const trimmed = message?.trim()
      setAlerts((prev) => [
        ...prev,
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
    [],
  )

  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const checkPrice = useCallback((symbol: string, price: number) => {
    if (!Number.isFinite(price)) return
    setAlerts((prev) => {
      const fired: PriceAlert[] = []
      const next = prev.map((alert) => {
        if (!alert.active || alert.symbol !== symbol) return alert
        const hit =
          alert.condition === 'above' ? price >= alert.price : price <= alert.price
        if (!hit) return alert
        const updated = { ...alert, active: false }
        fired.push(updated)
        return updated
      })
      if (fired.length === 0) return prev
      // 렌더 중 부수효과를 피하려고 커밋 이후로 미룬다.
      queueMicrotask(() => {
        for (const alert of fired) triggerRef.current(alert, price)
      })
      return next
    })
  }, [])

  return { alerts, addAlert, removeAlert, checkPrice }
}

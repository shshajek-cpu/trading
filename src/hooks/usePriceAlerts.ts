import { useCallback, useEffect, useRef, useState } from 'react'
import { notifySettingsChanged } from '../lib/syncBus'

export type AlertCondition = 'above' | 'below'

/** 알림 창에서 고른 조건 — 표시·편집용. 판정은 condition(이상/이하)으로 한다. */
export type PriceAlertKind = 'cross' | 'crossUp' | 'crossDown' | 'gt' | 'lt'

export const PRICE_ALERT_KINDS: PriceAlertKind[] = ['cross', 'crossUp', 'crossDown', 'gt', 'lt']

export const PRICE_ALERT_KIND_LABELS: Record<PriceAlertKind, string> = {
  cross: '교차',
  crossUp: '상향 교차',
  crossDown: '하향 교차',
  gt: '보다 큼',
  lt: '보다 작음',
}

export interface PriceAlert {
  id: string
  symbol: string
  condition: AlertCondition
  price: number
  active: boolean
  createdAt: number
  /** 발동 시 함께 보여줄 메모. 선택. */
  message?: string
  /** 고른 조건(예전 알림에는 없다 — 그때는 condition 으로 이상/이하를 보인다). */
  kind?: PriceAlertKind
  /**
   * 교차 알림이 아직 걸리지 않았다 — 현재가와 같은 가격에 만들었거나, 울린 뒤 다시 켰을 때. 가격이 먼저
   * 반대편(armOf)에 있어야 걸리고, 그때 넘어갈 쪽을 condition 으로 정한다. 그전에는 울리지 않는다.
   */
  pending?: boolean
}

/** 새 알림·편집에 함께 넘기는 조건 정보. */
export interface PriceAlertExtra {
  kind?: PriceAlertKind
  pending?: boolean
}

/**
 * 교차 알림을 걸기 전에 가격이 먼저 있어야 할 쪽. 상향 교차는 아래(below), 하향 교차는 위(above),
 * 방향 없는 교차는 선에서 벗어나기만 하면(away) 된다. 보다 큼/작음은 교차가 아니라 null.
 * 서버 감시기(worker)도 같은 값을 받아 같은 규칙으로 건다.
 */
export type AlertArm = 'below' | 'above' | 'away'

export function armOf(alert: Pick<PriceAlert, 'kind'>): AlertArm | null {
  const kind = alert.kind ?? 'cross' // 예전 알림은 대부분 기본값(교차)으로 만들었다
  if (kind === 'crossUp') return 'below'
  if (kind === 'crossDown') return 'above'
  if (kind === 'cross') return 'away'
  return null
}

/** 걸 조건이 맞으면 이제 기다릴 쪽(넘어가면 울릴 쪽), 아직이면 null. */
function armedTarget(arm: AlertArm | null, price: number, level: number): AlertCondition | null {
  if (arm === 'below') return price < level ? 'above' : null
  if (arm === 'above') return price > level ? 'below' : null
  if (price === level) return null
  return price > level ? 'below' : 'above'
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
    (a.message === undefined || typeof a.message === 'string') &&
    (a.kind === undefined || PRICE_ALERT_KINDS.includes(a.kind as PriceAlertKind)) &&
    (a.pending === undefined || typeof a.pending === 'boolean')
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
  addAlert: (symbol: string, condition: AlertCondition, price: number, message?: string, extra?: PriceAlertExtra) => void
  /** 알림을 고치고 다시 켠다(가격·조건·메모). */
  updateAlert: (
    id: string,
    patch: { condition: AlertCondition; price: number; message?: string } & PriceAlertExtra,
  ) => void
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
    (symbol: string, condition: AlertCondition, price: number, message?: string, extra?: PriceAlertExtra) => {
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
          ...(extra?.kind ? { kind: extra.kind } : {}),
          ...(extra?.pending ? { pending: true } : {}),
        },
      ])
    },
    [replace],
  )

  const updateAlert = useCallback<UsePriceAlertsResult['updateAlert']>(
    (id, patch) => {
      if (!Number.isFinite(patch.price) || patch.price <= 0) return
      const trimmed = patch.message?.trim()
      replace(
        current.current.map((a) => {
          if (a.id !== id) return a
          // 선택 필드는 새로 정한 값만 남긴다(메모를 지웠으면 빠진다).
          const { message: _m, kind: _k, pending: _p, ...base } = a
          return {
            ...base,
            condition: patch.condition,
            price: patch.price,
            active: true,
            ...(trimmed ? { message: trimmed } : {}),
            ...(patch.kind ? { kind: patch.kind } : {}),
            ...(patch.pending ? { pending: true } : {}),
          }
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
        const { pending: _p, ...rest } = a
        // 교차 알림을 다시 켜면 새로 교차할 때 울린다 — 이미 넘어가 있는 가격으로 곧바로 울리지 않게 다시 건다.
        return active && armOf(a) !== null ? { ...rest, active, pending: true } : { ...rest, active }
      })
      if (changed) replace(next)
    },
    [replace],
  )

  const checkPrice = useCallback(
    (symbol: string, price: number) => {
      if (!Number.isFinite(price)) return
      const fired: PriceAlert[] = []
      let changed = false
      const next = current.current.map((alert) => {
        if (!alert.active || alert.symbol !== symbol) return alert
        if (alert.pending) {
          // 아직 걸리지 않았다 — 가격이 먼저 반대편에 있어야 교차로 본다. 걸리면 넘어갈 쪽을 condition 으로 정한다.
          const target = armedTarget(armOf(alert), price, alert.price)
          if (target === null) return alert
          changed = true
          const { pending: _p, ...rest } = alert
          return { ...rest, condition: target } satisfies PriceAlert
        }
        const hit = alert.condition === 'above' ? price >= alert.price : price <= alert.price
        if (!hit) return alert
        const updated = { ...alert, active: false }
        fired.push(updated)
        changed = true
        return updated
      })
      if (!changed) return
      replace(next)
      for (const alert of fired) triggerRef.current(alert, price)
    },
    [replace],
  )

  return { alerts, addAlert, updateAlert, removeAlert, checkPrice, markFired, setActive }
}

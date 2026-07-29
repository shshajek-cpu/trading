import { useCallback, useEffect, useRef, useState } from 'react'
import { loadDrawings, saveDrawings, type Drawing } from '../lib/drawings'

export interface UseDrawingsResult {
  drawings: Drawing[]
  addDrawing: (symbol: string, price: number, color: string, alert: boolean) => void
  removeDrawing: (id: string) => void
  updateDrawing: (id: string, patch: Partial<Drawing>) => void
  clearSymbol: (symbol: string) => void
  /** 실시간 가격을 흘려보내면 선을 통과한 순간 알림을 발동시킨다. */
  checkPrice: (symbol: string, price: number) => void
}

export function useDrawings(
  onCross: (drawing: Drawing, price: number) => void,
): UseDrawingsResult {
  const [drawings, setDrawings] = useState<Drawing[]>(loadDrawings)

  const crossRef = useRef(onCross)
  crossRef.current = onCross

  useEffect(() => {
    saveDrawings(drawings)
  }, [drawings])

  const addDrawing = useCallback(
    (symbol: string, price: number, color: string, alert: boolean) => {
      if (!Number.isFinite(price) || price <= 0) return
      setDrawings((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          symbol,
          kind: 'horizontal',
          price,
          color,
          alert,
          fired: false,
          above: null,
          createdAt: Date.now(),
        },
      ])
    },
    [],
  )

  const removeDrawing = useCallback((id: string) => {
    setDrawings((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const updateDrawing = useCallback((id: string, patch: Partial<Drawing>) => {
    setDrawings((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }, [])

  const clearSymbol = useCallback((symbol: string) => {
    setDrawings((prev) => prev.filter((d) => d.symbol !== symbol))
  }, [])

  const checkPrice = useCallback((symbol: string, price: number) => {
    if (!Number.isFinite(price)) return
    setDrawings((prev) => {
      const fired: Drawing[] = []
      let changed = false

      const next = prev.map((d) => {
        if (d.symbol !== symbol) return d
        const nowAbove = price >= d.price

        // 첫 관측은 기준점만 잡는다 — 선을 그은 순간 바로 울리는 것을 막는다.
        if (d.above === null) {
          changed = true
          return { ...d, above: nowAbove }
        }
        if (d.above === nowAbove) return d

        changed = true
        const updated = { ...d, above: nowAbove }
        // 교차했고, 알림이 켜져 있고, 아직 안 울렸으면 발동.
        if (d.alert && !d.fired) {
          updated.fired = true
          fired.push(updated)
        }
        return updated
      })

      if (fired.length > 0) {
        queueMicrotask(() => {
          for (const d of fired) crossRef.current(d, price)
        })
      }
      return changed ? next : prev
    })
  }, [])

  return { drawings, addDrawing, removeDrawing, updateDrawing, clearSymbol, checkPrice }
}

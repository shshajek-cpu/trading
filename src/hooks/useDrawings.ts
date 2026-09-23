import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadDrawings,
  saveDrawings,
  type Drawing,
  type NewDrawing,
} from '../lib/drawings'

export interface UseDrawingsResult {
  drawings: Drawing[]
  addDrawing: (d: NewDrawing) => string
  updateDrawing: (
    id: string,
    patch: Partial<Omit<Drawing, 'id'>>,
    opts?: { history?: boolean },
  ) => void
  removeDrawing: (id: string) => void
  removeAll: (symbol: string) => void
  /** 실시간 가격을 흘려보내면 수평선을 통과한 순간 알림을 발동시킨다. */
  checkPrice: (symbol: string, price: number) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

const HISTORY_DEPTH = 20

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `d${Date.now().toString(36)}${idCounter.toString(36)}`
}

export function useDrawings(
  onCross: (drawing: Drawing, price: number) => void,
): UseDrawingsResult {
  const [drawings, setDrawings] = useState<Drawing[]>(loadDrawings)

  // 실행 취소/다시 실행 스택. 가격 감시(checkPrice)와 드래그 도중 변화는 담지 않는다.
  const undoStack = useRef<Drawing[][]>([])
  const redoStack = useRef<Drawing[][]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const crossRef = useRef(onCross)
  crossRef.current = onCross

  useEffect(() => {
    saveDrawings(drawings)
  }, [drawings])

  const syncFlags = useCallback(() => {
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [])

  // 되돌릴 수 있는 변경을 적용한다: 현재 상태를 스냅샷으로 밀어 넣고 redo 를 비운다.
  const commit = useCallback(
    (next: (prev: Drawing[]) => Drawing[]) => {
      setDrawings((prev) => {
        undoStack.current.push(prev)
        if (undoStack.current.length > HISTORY_DEPTH) undoStack.current.shift()
        redoStack.current = []
        return next(prev)
      })
      syncFlags()
    },
    [syncFlags],
  )

  const addDrawing = useCallback(
    (d: NewDrawing): string => {
      const id = nextId()
      const drawing: Drawing = {
        id,
        symbol: d.symbol,
        kind: d.kind,
        points: d.points,
        style: d.style,
        locked: false,
        hidden: false,
        alert: d.alert ?? false,
        fired: false,
        above: null,
        createdAt: Date.now(),
      }
      commit((prev) => [...prev, drawing])
      return id
    },
    [commit],
  )

  const updateDrawing = useCallback(
    (id: string, patch: Partial<Omit<Drawing, 'id'>>, opts?: { history?: boolean }) => {
      const apply = (prev: Drawing[]): Drawing[] => {
        let changed = false
        const next = prev.map((d) => {
          if (d.id !== id) return d
          changed = true
          return { ...d, ...patch }
        })
        return changed ? next : prev
      }
      // 드래그 중간(history:false)은 스택에 담지 않고 바로 반영한다.
      if (opts?.history === false) {
        setDrawings(apply)
      } else {
        commit(apply)
      }
    },
    [commit],
  )

  const removeDrawing = useCallback(
    (id: string) => {
      commit((prev) => prev.filter((d) => d.id !== id))
    },
    [commit],
  )

  const removeAll = useCallback(
    (symbol: string) => {
      commit((prev) => prev.filter((d) => d.symbol !== symbol))
    },
    [commit],
  )

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return
    setDrawings((prev) => {
      const snapshot = undoStack.current.pop()
      if (snapshot === undefined) return prev
      redoStack.current.push(prev)
      if (redoStack.current.length > HISTORY_DEPTH) redoStack.current.shift()
      return snapshot
    })
    syncFlags()
  }, [syncFlags])

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return
    setDrawings((prev) => {
      const snapshot = redoStack.current.pop()
      if (snapshot === undefined) return prev
      undoStack.current.push(prev)
      if (undoStack.current.length > HISTORY_DEPTH) undoStack.current.shift()
      return snapshot
    })
    syncFlags()
  }, [syncFlags])

  const checkPrice = useCallback((symbol: string, price: number) => {
    if (!Number.isFinite(price)) return
    setDrawings((prev) => {
      const fired: Drawing[] = []
      let changed = false

      const next = prev.map((d) => {
        if (d.symbol !== symbol) return d
        // 기울어진 선은 가격 하나로 교차를 판정할 수 없다 — 수평선만 감시한다.
        if (d.kind !== 'horizontal') return d
        const linePrice = d.points[0]?.price
        if (linePrice === undefined || !Number.isFinite(linePrice)) return d
        const nowAbove = price >= linePrice

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

  return useMemo(
    () => ({
      drawings,
      addDrawing,
      updateDrawing,
      removeDrawing,
      removeAll,
      checkPrice,
      undo,
      redo,
      canUndo,
      canRedo,
    }),
    [
      drawings,
      addDrawing,
      updateDrawing,
      removeDrawing,
      removeAll,
      checkPrice,
      undo,
      redo,
      canUndo,
      canRedo,
    ],
  )
}

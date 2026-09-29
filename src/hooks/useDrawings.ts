import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DRAWINGS_STORAGE_KEY,
  loadDrawings,
  saveDrawings,
  type Drawing,
  type NewDrawing,
} from '../lib/drawings'
import { bandAt, isExpired, lineAlertMode, lineRule, stepRule, type RuleState } from '../lib/alertRules'
import { alertSettings } from '../lib/alertSettings'

export interface UseDrawingsResult {
  drawings: Drawing[]
  addDrawing: (d: NewDrawing) => string
  updateDrawing: (
    id: string,
    patch: Partial<Omit<Drawing, 'id'>>,
    opts?: { history?: boolean },
  ) => void
  removeDrawing: (id: string) => void
  /** 그 종목 그림을 모두 지우고, 지운 그림을 돌려준다(삭제 토스트의 '되돌리기'용). */
  removeAll: (symbol: string) => Drawing[]
  /** 지운 그림을 되살린다. 그사이 새로 그린 그림은 그대로 둔다. 되돌리기 이력에 남는다. */
  restoreDrawings: (list: readonly Drawing[]) => void
  /** 그리는 순서 바꾸기 — 뒤에 그린 것이 위에 보인다. */
  reorderDrawing: (id: string, where: 'front' | 'back') => void
  /** 실시간 가격을 흘려보내면 알림이 켜진 선·도형을 판정해 울린다(수평선·추세선·레이·채널·사각형·수직선 — lib/alertRules). */
  checkPrice: (symbol: string, price: number) => void
  /** 다른 곳(푸시 워커)에서 이미 울린 한 번만 선 알림을 울린 것으로 표시한다. 되돌리기 이력에 남기지 않는다. */
  markFired: (ids: readonly string[]) => void
  /** 되돌리기/다시 실행. 바뀐 그림의 종목들을 돌려준다(화면에 없는 종목이면 셸이 알린다). */
  undo: () => string[]
  redo: () => string[]
  canUndo: boolean
  canRedo: boolean
}

const HISTORY_DEPTH = 20

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `d${Date.now().toString(36)}${idCounter.toString(36)}`
}

/** 두 스냅샷 사이에 그림이 더해지거나·지워지거나·바뀌거나·순서가 바뀐 종목들. */
function changedSymbols(before: readonly Drawing[], after: readonly Drawing[]): string[] {
  const bySymbol = (list: readonly Drawing[]) => {
    const map = new Map<string, Drawing[]>()
    for (const d of list) {
      const group = map.get(d.symbol)
      if (group) group.push(d)
      else map.set(d.symbol, [d])
    }
    return map
  }
  const a = bySymbol(before)
  const b = bySymbol(after)
  const out: string[] = []
  for (const symbol of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(symbol) ?? []
    const y = b.get(symbol) ?? []
    // 그림은 바뀔 때마다 새 객체가 된다 — 같은 자리에 같은 객체면 그대로다.
    if (x.length !== y.length || x.some((d, i) => d !== y[i])) out.push(symbol)
  }
  return out
}

export function useDrawings(
  onCross: (drawing: Drawing, price: number) => void,
): UseDrawingsResult {
  const [drawings, setDrawings] = useState<Drawing[]>(loadDrawings)
  // 진짜 상태는 ref 에 둔다. 되돌리기 스택·교차 판정을 setState 업데이터 안에서 하면 업데이터가 나중에
  // (또는 StrictMode 에서 두 번) 돌아 버튼 상태가 한 박자 늦고 스냅샷·알림이 겹친다. 여기서 동기로 계산하고 결과만 넘긴다.
  const current = useRef(drawings)

  // 실행 취소/다시 실행 스택. 가격 감시(checkPrice)와 드래그 도중 변화는 담지 않는다.
  const undoStack = useRef<Drawing[][]>([])
  const redoStack = useRef<Drawing[][]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const crossRef = useRef(onCross)
  crossRef.current = onCross

  // 선마다의 판정 상태(걸렸는지·기다리는 쪽·「매번」의 마지막 발동). 틱마다 바뀌는 실행 상태라 저장·동기화하지 않는다 —
  // 그림 데이터에 넣으면 가격이 선을 오갈 때마다 저장되고 동기화 서버에 올라간다. 수직선은 그 시각 전에 본 적이 있으면 'beforeTime'.
  const sideRef = useRef(new Map<string, RuleState | 'beforeTime'>())

  useEffect(() => {
    saveDrawings(drawings)
  }, [drawings])

  // 다른 탭이 바꾼 그림을 받아 온다. 안 받으면 이 탭이 옛 목록을 통째로 저장해 그쪽 변경을 지운다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DRAWINGS_STORAGE_KEY) return
      current.current = loadDrawings()
      setDrawings(current.current)
      // 되돌리기 스택은 이 탭의 옛 상태라 다른 탭의 변경을 되돌려 버린다 — 비운다.
      undoStack.current = []
      redoStack.current = []
      setCanUndo(false)
      setCanRedo(false)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const syncFlags = useCallback(() => {
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [])

  const replace = useCallback((next: Drawing[]) => {
    current.current = next
    setDrawings(next)
  }, [])

  // 되돌릴 수 있는 변경을 적용한다: 현재 상태를 스냅샷으로 밀어 넣고 redo 를 비운다. 바뀐 것이 없으면 아무것도 쌓지 않는다.
  const commit = useCallback(
    (fn: (prev: Drawing[]) => Drawing[]) => {
      const prev = current.current
      const next = fn(prev)
      if (next === prev) return
      undoStack.current.push(prev)
      if (undoStack.current.length > HISTORY_DEPTH) undoStack.current.shift()
      redoStack.current = []
      replace(next)
      syncFlags()
    },
    [replace, syncFlags],
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
        // 알림을 걸 수 있는 선·도형은 설정(「새 수평선에 알림 자동 켜기」)을 따른다. 복제처럼 정해 넘기면 그 값.
        alert: d.alert ?? (alertSettings.get().autoLineAlert && lineAlertMode(d.kind) !== undefined),
        fired: false,
        createdAt: Date.now(),
      }
      commit((prev) => [...prev, drawing])
      return id
    },
    [commit],
  )

  const updateDrawing = useCallback(
    (id: string, patch: Partial<Omit<Drawing, 'id'>>, opts?: { history?: boolean }) => {
      // 선을 옮기거나 알림을 다시 켜면 현재가와의 위·아래 기준을 새로 잡는다. 옛 기준이 남으면 옮긴 것만으로 '교차'로 울린다.
      const rearm = Boolean(patch.points || patch.alert || patch.alertOpts)
      if (rearm) sideRef.current.delete(id)
      const now = Date.now()
      const apply = (prev: Drawing[]): Drawing[] => {
        let changed = false
        const next = prev.map((d) => {
          if (d.id !== id) return d
          changed = true
          const merged = { ...d, ...patch }
          // 알림이 켜진 선을 옮기거나 알림을 켜면 그 시각을 적는다 — 서버 감시기는 이 뒤의 움직임만 본다(옮기기 전 가격으로 울리지 않게).
          if (!rearm || !merged.alert || lineAlertMode(merged.kind) === undefined) return merged
          return { ...merged, alertOpts: { ...merged.alertOpts, since: now } }
        })
        return changed ? next : prev
      }
      // 드래그 중간(history:false)은 스택에 담지 않고 바로 반영한다.
      if (opts?.history === false) {
        const next = apply(current.current)
        if (next !== current.current) replace(next)
      } else {
        commit(apply)
      }
    },
    [commit, replace],
  )

  const removeDrawing = useCallback(
    (id: string) => {
      commit((prev) => prev.filter((d) => d.id !== id))
    },
    [commit],
  )

  const removeAll = useCallback(
    (symbol: string): Drawing[] => {
      const removed = current.current.filter((d) => d.symbol === symbol)
      if (removed.length > 0) commit((prev) => prev.filter((d) => d.symbol !== symbol))
      return removed
    },
    [commit],
  )

  const restoreDrawings = useCallback(
    (list: readonly Drawing[]) => {
      commit((prev) => {
        const have = new Set(prev.map((d) => d.id))
        const back = list.filter((d) => !have.has(d.id))
        // 옛 그림이라 그사이 새로 그린 것 아래에 둔다.
        return back.length > 0 ? [...back, ...prev] : prev
      })
    },
    [commit],
  )

  const reorderDrawing = useCallback(
    (id: string, where: 'front' | 'back') => {
      commit((prev) => {
        const target = prev.find((d) => d.id === id)
        if (!target) return prev
        const rest = prev.filter((d) => d.id !== id)
        return where === 'front' ? [...rest, target] : [target, ...rest]
      })
    },
    [commit],
  )

  const undo = useCallback((): string[] => {
    const snapshot = undoStack.current.pop()
    if (snapshot === undefined) return []
    const before = current.current
    redoStack.current.push(before)
    if (redoStack.current.length > HISTORY_DEPTH) redoStack.current.shift()
    // 되돌아온 수평선은 그동안 가격이 어디로 갔는지 모른다 — 기준을 새로 잡게 한다.
    sideRef.current.clear()
    replace(snapshot)
    syncFlags()
    return changedSymbols(before, snapshot)
  }, [replace, syncFlags])

  const redo = useCallback((): string[] => {
    const snapshot = redoStack.current.pop()
    if (snapshot === undefined) return []
    const before = current.current
    undoStack.current.push(before)
    if (undoStack.current.length > HISTORY_DEPTH) undoStack.current.shift()
    sideRef.current.clear()
    replace(snapshot)
    syncFlags()
    return changedSymbols(before, snapshot)
  }, [replace, syncFlags])

  const markFired = useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 0) return
      const set = new Set(ids)
      let changed = false
      const next = current.current.map((d) => {
        if (!set.has(d.id) || !d.alert || d.fired) return d
        changed = true
        return { ...d, fired: true }
      })
      if (changed) replace(next)
    },
    [replace],
  )

  const checkPrice = useCallback(
    (symbol: string, price: number) => {
      if (!Number.isFinite(price)) return
      const states = sideRef.current
      const now = Date.now()
      const fired = new Set<string>()

      for (const d of current.current) {
        if (d.symbol !== symbol || !d.alert || d.fired) continue
        const mode = lineAlertMode(d.kind)
        if (!mode || isExpired(d.alertOpts ?? {}, now)) continue
        if (mode === 'time') {
          // 수직선: 그 시각 전에 본 적이 있고 이제 그 시각이 됐으면 울린다. 앱을 연 게 그 시각 뒤면 울리지 않는다(서버 몫).
          const at = d.points[0].time * 1000
          if (now < at) states.set(d.id, 'beforeTime')
          else if (states.get(d.id) === 'beforeTime') {
            states.delete(d.id)
            fired.add(d.id)
          }
          continue
        }
        // 추세선·레이는 지금 시각의 선 가격, 채널·사각형은 두 경계. 그 시각에 그림이 없으면(레이 시작 전 등) 보지 않는다.
        const band = bandAt(d, now)
        if (!band) continue
        const prev = states.get(d.id)
        // 첫 관측은 기준만 잡는다(거는 점에서는 울리지 않는다) — 선을 그은 순간 바로 울리는 것을 막는다.
        const state = prev === undefined || prev === 'beforeTime' ? { target: null } : prev
        const step = stepRule(lineRule(mode, d.alertOpts), state, price, band, now, d.alertOpts ?? {})
        states.set(d.id, step.state)
        if (step.fired) fired.add(d.id)
      }

      if (fired.size === 0) return
      // 한 번만 알림은 울린 것으로 적는다. 「매번」 알림은 켜 둔 채 다시 걸리기를 기다린다.
      const next = current.current.map((d) => (fired.has(d.id) && d.alertOpts?.repeat !== 'every' ? { ...d, fired: true } : d))
      if (next.some((d, i) => d !== current.current[i])) replace(next)
      for (const d of next) if (fired.has(d.id)) crossRef.current(d, price)
    },
    [replace],
  )

  return useMemo(
    () => ({
      drawings,
      addDrawing,
      updateDrawing,
      removeDrawing,
      removeAll,
      restoreDrawings,
      reorderDrawing,
      checkPrice,
      markFired,
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
      restoreDrawings,
      reorderDrawing,
      checkPrice,
      markFired,
      undo,
      redo,
      canUndo,
      canRedo,
    ],
  )
}

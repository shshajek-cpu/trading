import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  formatCombo,
  loadShortcutOverrides,
  resolveBindings,
  saveShortcutOverrides,
  SHORTCUT_DEFS,
  SHORTCUTS_STORAGE_KEY,
  type ShortcutId,
  type ShortcutOverrides,
} from '../lib/shortcuts'

export interface ShortcutBindings {
  /** 동작별 최종 조합(기본값 + 사용자 설정). */
  bindings: Record<ShortcutId, string[]>
  /** 조합 → 동작. 키 입력 처리용. */
  byCombo: Record<string, ShortcutId>
  /** 메뉴·도움말에 보여 줄 첫 번째 조합("Alt+R"). 없으면 undefined. */
  label: (id: ShortcutId) => string | undefined
  isCustom: (id: ShortcutId) => boolean
  /** id 에 combo 를 준다. 다른 동작이 쓰던 조합이면 거기서 빼고 그 동작을 돌려준다. */
  assign: (id: ShortcutId, combo: string) => ShortcutId | null
  reset: (id: ShortcutId) => void
  resetAll: () => void
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

/** 기본값과 같아진 항목은 저장에서 뺀다 — 기본값이 바뀌면 그대로 따라가게. */
function normalize(overrides: ShortcutOverrides): ShortcutOverrides {
  const out: ShortcutOverrides = {}
  for (const def of SHORTCUT_DEFS) {
    const value = overrides[def.id]
    if (value && !sameList(value, def.defaults)) out[def.id] = value
  }
  return out
}

export function useShortcutBindings(): ShortcutBindings {
  const [overrides, setOverrides] = useState<ShortcutOverrides>(loadShortcutOverrides)

  const commit = useCallback((next: ShortcutOverrides) => {
    const clean = normalize(next)
    saveShortcutOverrides(clean)
    setOverrides(clean)
  }, [])

  // 다른 탭에서 바꾼 단축키를 받아 온다. 안 받으면 이 탭이 옛 설정을 통째로 저장해 그쪽 변경을 되돌린다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHORTCUTS_STORAGE_KEY) setOverrides(loadShortcutOverrides())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const bindings = useMemo(() => resolveBindings(overrides), [overrides])

  const byCombo = useMemo(() => {
    const map: Record<string, ShortcutId> = {}
    for (const def of SHORTCUT_DEFS) for (const combo of bindings[def.id]) map[combo] = def.id
    return map
  }, [bindings])

  // 다른 동작들에서 combos 를 빼 앞으로의 충돌을 막는다.
  const without = useCallback(
    (next: ShortcutOverrides, keep: ShortcutId, combos: string[]): ShortcutId | null => {
      let movedFrom: ShortcutId | null = null
      for (const def of SHORTCUT_DEFS) {
        if (def.id === keep) continue
        const current = next[def.id] ?? bindings[def.id]
        const filtered = current.filter((c) => !combos.includes(c))
        if (filtered.length !== current.length) {
          next[def.id] = filtered
          movedFrom = def.id
        }
      }
      return movedFrom
    },
    [bindings],
  )

  const assign = useCallback(
    (id: ShortcutId, combo: string) => {
      const next: ShortcutOverrides = { ...overrides, [id]: [combo] }
      const movedFrom = without(next, id, [combo])
      commit(next)
      return movedFrom
    },
    [overrides, without, commit],
  )

  const reset = useCallback(
    (id: ShortcutId) => {
      const next: ShortcutOverrides = { ...overrides }
      delete next[id]
      const def = SHORTCUT_DEFS.find((d) => d.id === id)
      if (def) without(next, id, def.defaults)
      commit(next)
    },
    [overrides, without, commit],
  )

  const resetAll = useCallback(() => commit({}), [commit])

  const label = useCallback(
    (id: ShortcutId) => {
      const first = bindings[id][0]
      return first ? formatCombo(first) : undefined
    },
    [bindings],
  )

  const isCustom = useCallback((id: ShortcutId) => overrides[id] !== undefined, [overrides])

  return useMemo(
    () => ({ bindings, byCombo, label, isCustom, assign, reset, resetAll }),
    [bindings, byCombo, label, isCustom, assign, reset, resetAll],
  )
}

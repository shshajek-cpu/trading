import { useEffect, useRef } from 'react'
import { comboOf, type ShortcutId } from '../lib/shortcuts'

export interface ShortcutHandlers {
  /** 바꿀 수 있는 단축키가 눌렸을 때(lib/shortcuts 의 SHORTCUT_DEFS). */
  run: (id: ShortcutId) => void
  /** Esc: back to the cross cursor and close open menus. */
  onEscape: () => void
  /** A bare letter opens symbol search prefilled with it. */
  onSymbolChar: (ch: string) => void
  /** A bare digit opens the 주기 변경 box prefilled with it; `,` opens it empty. */
  onIntervalChar: (ch: string) => void
  /** ←/→ 한 봉, Ctrl+←/→ 더 멀리. -1 = 과거 쪽. */
  onScroll: (direction: -1 | 1, far: boolean) => void
}

function inField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Global keyboard shortcuts. Suppressed while focus is in a form field, a dialog or a menu,
 * when an earlier handler already consumed the key (e.g. arrows moving a selected drawing), or when disabled.
 * `byCombo` maps "Alt+KeyR"-style combos to actions; the user can rebind them in the shortcuts dialog.
 */
export function useShortcuts(handlers: ShortcutHandlers, byCombo: Record<string, ShortcutId>, enabled = true): void {
  const ref = useRef(handlers)
  ref.current = handlers
  const mapRef = useRef(byCombo)
  mapRef.current = byCombo

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || inField(e.target)) return
      if (e.target instanceof Element && e.target.closest('.tv-dialog, .tv-popover')) return
      const h = ref.current
      const combo = comboOf(e)
      const id = combo ? mapRef.current[combo] : undefined
      if (id) {
        e.preventDefault()
        h.run(id)
        return
      }

      const { key, code } = e
      const ctrl = e.ctrlKey || e.metaKey
      if (key === 'Escape') {
        h.onEscape()
        return
      }
      if (e.altKey || e.shiftKey) return
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        e.preventDefault()
        h.onScroll(key === 'ArrowLeft' ? -1 : 1, ctrl)
        return
      }
      if (ctrl) return

      // Bare character: `,`·digit → interval box, letter → symbol search.
      const run = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      if (key === ',') return run(() => h.onIntervalChar(''))
      if (key.length === 1 && /[0-9]/.test(key)) return run(() => h.onIntervalChar(key))
      if (key.length === 1 && /[a-zA-Z]/.test(key)) return run(() => h.onSymbolChar(key))
      // 한글 입력 상태('ㅂ' 또는 조합 중 'Process')의 글자키도 영문 글자로 심볼 검색을 연다.
      if (/^Key[A-Z]$/.test(code) && (key === 'Process' || key.length === 1)) {
        return run(() => h.onSymbolChar(code.slice(3)))
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

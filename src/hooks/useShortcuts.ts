import { useEffect, useRef } from 'react'
import type { DrawingTool } from '../lib/drawings'

export interface ShortcutHandlers {
  /** Alt+T/H/J/V/C/F, Alt+Shift+R map to a drawing tool. */
  onTool: (tool: DrawingTool) => void
  /** Esc: back to the cross cursor and close open menus. */
  onEscape: () => void
  onUndo: () => void
  onRedo: () => void
  /** Alt+R: reset the chart view. */
  onResetView: () => void
  /** Alt+A: create alert. */
  onCreateAlert: () => void
  /** Alt+S: snapshot. */
  onSnapshot: () => void
  /** Ctrl+K: quick search. */
  onQuickSearch: () => void
  /** Shift+F: fullscreen. */
  onFullscreen: () => void
  /** A bare letter opens symbol search prefilled with it. */
  onSymbolChar: (ch: string) => void
  /** A bare digit opens the 주기 변경 box prefilled with it. */
  onIntervalChar: (ch: string) => void
}

const TOOL_KEYS: Record<string, DrawingTool> = {
  t: 'trend',
  h: 'horizontal',
  j: 'horizontalRay',
  v: 'vertical',
  c: 'crossLine',
  f: 'fibRetracement',
}

function inField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/** Global keyboard shortcuts. Suppressed while focus is in a form field or when disabled. */
export function useShortcuts(handlers: ShortcutHandlers, enabled = true): void {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target)) return
      const h = ref.current
      const key = e.key
      const lower = key.length === 1 ? key.toLowerCase() : key

      // Alt-combos → drawing tools.
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.shiftKey && lower === 'r') {
          e.preventDefault()
          h.onTool('rectangle')
          return
        }
        if (!e.shiftKey && lower === 'r') {
          e.preventDefault()
          h.onResetView()
          return
        }
        if (!e.shiftKey && lower === 'a') {
          e.preventDefault()
          h.onCreateAlert()
          return
        }
        if (!e.shiftKey && lower === 's') {
          e.preventDefault()
          h.onSnapshot()
          return
        }
        if (!e.shiftKey && TOOL_KEYS[lower]) {
          e.preventDefault()
          h.onTool(TOOL_KEYS[lower])
          return
        }
        return
      }

      // Ctrl/Cmd combos.
      if (e.ctrlKey || e.metaKey) {
        if (lower === 'z' && !e.shiftKey) {
          e.preventDefault()
          h.onUndo()
        } else if (lower === 'y' || (lower === 'z' && e.shiftKey)) {
          e.preventDefault()
          h.onRedo()
        } else if (lower === 'k') {
          e.preventDefault()
          h.onQuickSearch()
        }
        return
      }

      if (key === 'Escape') {
        h.onEscape()
        return
      }

      if (e.shiftKey && lower === 'f') {
        e.preventDefault()
        h.onFullscreen()
        return
      }

      // Bare single character: digit → interval box, letter → symbol search.
      if (!e.shiftKey && key.length === 1) {
        if (/[0-9]/.test(key)) {
          e.preventDefault()
          h.onIntervalChar(key)
        } else if (/[a-zA-Z]/.test(key)) {
          e.preventDefault()
          h.onSymbolChar(key)
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

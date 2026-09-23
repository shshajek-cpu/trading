import { useEffect, useRef } from 'react'
import type { DrawingTool } from '../lib/drawings'

/** TradingView 단축키 표(Advanced Charts 문서 기준)를 따른다. */
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
  /** A bare digit opens the 주기 변경 box prefilled with it; `,` opens it empty. */
  onIntervalChar: (ch: string) => void
  /** `/`: 지표 창. */
  onOpenIndicators: () => void
  /** Ctrl+S: 레이아웃 저장. */
  onSave: () => void
  /** ←/→ 한 봉, Ctrl+←/→ 더 멀리. -1 = 과거 쪽. */
  onScroll: (direction: -1 | 1, far: boolean) => void
  /** Ctrl+↑ 확대(+1), Ctrl+↓ 축소(-1). */
  onZoom: (direction: -1 | 1) => void
  /** Alt+G: 날짜로 이동. */
  onGoToDate: () => void
  /** Alt+I: 눈금 반전. */
  onInvertScale: () => void
  /** Alt+L: 로그 눈금 켜기/끄기. */
  onToggleLog: () => void
  /** Alt+P: 퍼센트 눈금 켜기/끄기. */
  onTogglePercent: () => void
  /** Alt+W: 관심 목록에 추가. */
  onAddToWatchlist: () => void
  /** Ctrl+Alt+H: 그림 모두 숨기기/보이기. */
  onToggleDrawingsHidden: () => void
  /** Alt+Enter: 분할 화면에서 활성 차트 최대화/복원. */
  onToggleMaximize: () => void
}

// 한글 입력 상태에서는 e.key 가 'ㅅ' 처럼 오므로 조합키는 물리 키(e.code)로 가린다.
const TOOL_CODES: Record<string, DrawingTool> = {
  KeyT: 'trend',
  KeyH: 'horizontal',
  KeyJ: 'horizontalRay',
  KeyV: 'vertical',
  KeyC: 'crossLine',
  KeyF: 'fibRetracement',
}

function inField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Global keyboard shortcuts. Suppressed while focus is in a form field, a dialog or a menu,
 * when an earlier handler already consumed the key (e.g. arrows moving a selected drawing), or when disabled.
 */
export function useShortcuts(handlers: ShortcutHandlers, enabled = true): void {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || inField(e.target)) return
      if (e.target instanceof Element && e.target.closest('.tv-dialog, .tv-popover')) return
      const h = ref.current
      const { key, code } = e
      const ctrl = e.ctrlKey || e.metaKey
      const run = (fn: () => void) => {
        e.preventDefault()
        fn()
      }

      // Alt 조합: 그리기 도구와 차트 명령.
      if (e.altKey && !ctrl) {
        if (e.shiftKey) {
          if (code === 'KeyR') run(() => h.onTool('rectangle'))
          return
        }
        switch (code) {
          case 'KeyR':
            return run(h.onResetView)
          case 'KeyA':
            return run(h.onCreateAlert)
          case 'KeyS':
            return run(h.onSnapshot)
          case 'KeyG':
            return run(h.onGoToDate)
          case 'KeyI':
            return run(h.onInvertScale)
          case 'KeyL':
            return run(h.onToggleLog)
          case 'KeyP':
            return run(h.onTogglePercent)
          case 'KeyW':
            return run(h.onAddToWatchlist)
          case 'Enter':
          case 'NumpadEnter':
            return run(h.onToggleMaximize)
        }
        const tool = TOOL_CODES[code]
        if (tool) run(() => h.onTool(tool))
        return
      }

      // Ctrl/Cmd 조합.
      if (ctrl) {
        if (e.altKey) {
          if (code === 'KeyH') run(h.onToggleDrawingsHidden)
          return
        }
        if (code === 'KeyZ' && !e.shiftKey) run(h.onUndo)
        else if (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey)) run(h.onRedo)
        else if (code === 'KeyK') run(h.onQuickSearch)
        else if (code === 'KeyS') run(h.onSave)
        else if (key === 'ArrowLeft') run(() => h.onScroll(-1, true))
        else if (key === 'ArrowRight') run(() => h.onScroll(1, true))
        else if (key === 'ArrowUp') run(() => h.onZoom(1))
        else if (key === 'ArrowDown') run(() => h.onZoom(-1))
        return
      }

      if (key === 'Escape') {
        h.onEscape()
        return
      }

      if (e.shiftKey && code === 'KeyF') return run(h.onFullscreen)

      if (e.shiftKey) return
      if (key === 'ArrowLeft') return run(() => h.onScroll(-1, false))
      if (key === 'ArrowRight') return run(() => h.onScroll(1, false))

      // Bare character: `/` → 지표, `,`·digit → interval box, letter → symbol search.
      if (key === '/') return run(h.onOpenIndicators)
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

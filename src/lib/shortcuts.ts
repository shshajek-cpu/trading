import type { DrawingTool } from './drawings'

/**
 * 바꿀 수 있는 단축키. 기본값은 TradingView 단축키 표를 따른다.
 * 조합은 "Ctrl+Alt+Shift+<KeyboardEvent.code>" 꼴로 저장한다 — 한글 입력 상태에서도
 * 같은 물리 키로 맞게 글자(e.key)가 아니라 키 위치(e.code)를 쓴다.
 */
export type ShortcutId =
  | 'resetView'
  | 'createAlert'
  | 'snapshot'
  | 'goToDate'
  | 'invertScale'
  | 'toggleLog'
  | 'togglePercent'
  | 'addToWatchlist'
  | 'toggleMaximize'
  | 'quickSearch'
  | 'openIndicators'
  | 'save'
  | 'undo'
  | 'redo'
  | 'zoomIn'
  | 'zoomOut'
  | 'fullscreen'
  | 'toggleDrawingsHidden'
  | 'tool.trend'
  | 'tool.horizontal'
  | 'tool.horizontalRay'
  | 'tool.vertical'
  | 'tool.crossLine'
  | 'tool.fibRetracement'
  | 'tool.rectangle'

export interface ShortcutDef {
  id: ShortcutId
  label: string
  group: '차트' | '그리기'
  defaults: string[]
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  { id: 'openIndicators', label: '지표', group: '차트', defaults: ['Slash'] },
  { id: 'quickSearch', label: '빠른 검색', group: '차트', defaults: ['Ctrl+KeyK'] },
  { id: 'save', label: '레이아웃 저장', group: '차트', defaults: ['Ctrl+KeyS'] },
  { id: 'undo', label: '실행 취소', group: '차트', defaults: ['Ctrl+KeyZ'] },
  { id: 'redo', label: '다시 실행', group: '차트', defaults: ['Ctrl+KeyY', 'Ctrl+Shift+KeyZ'] },
  { id: 'zoomIn', label: '확대', group: '차트', defaults: ['Ctrl+ArrowUp'] },
  { id: 'zoomOut', label: '축소', group: '차트', defaults: ['Ctrl+ArrowDown'] },
  { id: 'resetView', label: '차트 보기 초기화', group: '차트', defaults: ['Alt+KeyR'] },
  { id: 'goToDate', label: '날짜로 이동', group: '차트', defaults: ['Alt+KeyG'] },
  { id: 'invertScale', label: '눈금 반전', group: '차트', defaults: ['Alt+KeyI'] },
  { id: 'toggleLog', label: '로그 눈금 켜기/끄기', group: '차트', defaults: ['Alt+KeyL'] },
  { id: 'togglePercent', label: '퍼센트 눈금 켜기/끄기', group: '차트', defaults: ['Alt+KeyP'] },
  { id: 'createAlert', label: '알림 만들기', group: '차트', defaults: ['Alt+KeyA'] },
  { id: 'addToWatchlist', label: '관심 목록에 추가', group: '차트', defaults: ['Alt+KeyW'] },
  { id: 'snapshot', label: '스냅샷', group: '차트', defaults: ['Alt+KeyS'] },
  { id: 'toggleMaximize', label: '분할 화면에서 차트 최대화 / 복원', group: '차트', defaults: ['Alt+Enter'] },
  { id: 'fullscreen', label: '전체 화면', group: '차트', defaults: ['Shift+KeyF'] },
  { id: 'tool.trend', label: '추세선', group: '그리기', defaults: ['Alt+KeyT'] },
  { id: 'tool.horizontal', label: '수평선', group: '그리기', defaults: ['Alt+KeyH'] },
  { id: 'tool.horizontalRay', label: '수평 레이', group: '그리기', defaults: ['Alt+KeyJ'] },
  { id: 'tool.vertical', label: '수직선', group: '그리기', defaults: ['Alt+KeyV'] },
  { id: 'tool.crossLine', label: '교차선', group: '그리기', defaults: ['Alt+KeyC'] },
  { id: 'tool.fibRetracement', label: '피보나치 되돌림', group: '그리기', defaults: ['Alt+KeyF'] },
  { id: 'tool.rectangle', label: '사각형', group: '그리기', defaults: ['Alt+Shift+KeyR'] },
  { id: 'toggleDrawingsHidden', label: '그림 모두 숨기기 / 보이기', group: '그리기', defaults: ['Ctrl+Alt+KeyH'] },
]

/** 도구 단축키 id → 그리기 도구. */
export const TOOL_SHORTCUTS: Partial<Record<ShortcutId, DrawingTool>> = {
  'tool.trend': 'trend',
  'tool.horizontal': 'horizontal',
  'tool.horizontalRay': 'horizontalRay',
  'tool.vertical': 'vertical',
  'tool.crossLine': 'crossLine',
  'tool.fibRetracement': 'fibRetracement',
  'tool.rectangle': 'rectangle',
}

/** 바꿀 수 없는 키(도움말에 보여 주기만 한다). */
export const FIXED_SHORTCUTS: { group: '차트' | '그리기'; keys: string; label: string }[] = [
  { group: '차트', keys: '글자', label: '심볼 검색' },
  { group: '차트', keys: '숫자 · ,', label: '주기 변경' },
  { group: '차트', keys: '← / →', label: '차트 한 봉씩 이동' },
  { group: '차트', keys: 'Ctrl+← / →', label: '차트 멀리 이동' },
  { group: '차트', keys: '우클릭', label: '차트 · 그림 · 가격축 · 시간축 메뉴' },
  { group: '그리기', keys: 'Ctrl+C / Ctrl+V', label: '선택한 그림 복사 / 붙여넣기' },
  { group: '그리기', keys: '방향키', label: '선택한 그림 옮기기' },
  { group: '그리기', keys: 'Delete', label: '선택한 그림 삭제' },
  { group: '그리기', keys: 'Shift+드래그', label: '측정' },
  { group: '그리기', keys: 'Esc', label: '십자선으로 · 그리기 취소 · 메뉴 닫기' },
]

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
  'Lang1',
  'Lang2',
])

/** 키 입력 → 조합 문자열. 수식키만 누른 중이면 null. */
export function comboOf(e: KeyboardEvent): string | null {
  let code = e.code
  if (code === 'NumpadEnter') code = 'Enter'
  if (code === 'NumpadDivide') code = 'Slash'
  if (!code || MODIFIER_CODES.has(code)) return null
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(code)
  return parts.join('+')
}

const CODE_LABELS: Record<string, string> = {
  Slash: '/',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

/** "Alt+KeyR" → "Alt+R". */
export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((part) => {
      if (part.startsWith('Key')) return part.slice(3)
      if (part.startsWith('Digit')) return part.slice(5)
      if (part.startsWith('Numpad')) return `Num${part.slice(6)}`
      return CODE_LABELS[part] ?? part
    })
    .join('+')
}

/** 브라우저가 먼저 가져가 사이트가 받을 수 없는 조합. */
const BROWSER_RESERVED = new Set([
  'Ctrl+KeyT',
  'Ctrl+KeyW',
  'Ctrl+KeyN',
  'Ctrl+Shift+KeyT',
  'Ctrl+Shift+KeyW',
  'Ctrl+Shift+KeyN',
  'Ctrl+Tab',
  'Ctrl+Shift+Tab',
  'Ctrl+PageUp',
  'Ctrl+PageDown',
  'Alt+F4',
])

/** 앱이 이미 고정으로 쓰는 조합. */
const APP_FIXED = new Set([
  'Ctrl+KeyC',
  'Ctrl+KeyV',
  'Ctrl+ArrowLeft',
  'Ctrl+ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Escape',
  'Delete',
  'Backspace',
  'Tab',
  'Enter',
  'Space',
  'Comma',
])

/** 새 조합을 쓸 수 없으면 이유를, 쓸 수 있으면 null. */
export function rejectReason(combo: string): string | null {
  if (BROWSER_RESERVED.has(combo)) return '브라우저가 먼저 가져가는 키입니다.'
  if (APP_FIXED.has(combo)) return '차트에서 이미 쓰는 키입니다.'
  const parts = combo.split('+')
  const key = parts[parts.length - 1]
  const bare = parts.length === 1
  if (bare && (key.startsWith('Key') || key.startsWith('Digit') || key.startsWith('Numpad'))) {
    return '글자·숫자 키만으로는 쓸 수 없습니다(심볼 검색·주기 변경 입력). Ctrl·Alt·Shift 와 함께 누르세요.'
  }
  return null
}

const STORAGE_KEY = 'trading.shortcuts.v1'

/** 사용자가 바꾼 단축키만 저장한다. 기기마다 다른 프로그램과 겹치는 키가 다르므로 동기화하지 않는다. */
export type ShortcutOverrides = Partial<Record<ShortcutId, string[]>>

export function loadShortcutOverrides(): ShortcutOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: ShortcutOverrides = {}
    for (const def of SHORTCUT_DEFS) {
      const value = (parsed as Record<string, unknown>)[def.id]
      if (Array.isArray(value)) out[def.id] = value.filter((v): v is string => typeof v === 'string')
    }
    return out
  } catch {
    return {}
  }
}

export function saveShortcutOverrides(overrides: ShortcutOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** 기본값 위에 사용자 설정을 얹은 최종 단축키. */
export function resolveBindings(overrides: ShortcutOverrides): Record<ShortcutId, string[]> {
  const out = {} as Record<ShortcutId, string[]>
  for (const def of SHORTCUT_DEFS) out[def.id] = overrides[def.id] ?? def.defaults
  return out
}

import { useEffect, useState } from 'react'
import { Dialog } from './ui/Dialog'
import type { ShortcutBindings } from '../hooks/useShortcutBindings'
import {
  comboOf,
  FIXED_SHORTCUTS,
  formatCombo,
  rejectReason,
  SHORTCUT_DEFS,
  type ShortcutId,
} from '../lib/shortcuts'

interface ShortcutsDialogProps {
  open: boolean
  onClose: () => void
  keys: ShortcutBindings
}

const GROUPS = ['차트', '그리기'] as const

function labelOf(id: ShortcutId): string {
  return SHORTCUT_DEFS.find((d) => d.id === id)?.label ?? id
}

/** 단축키 도움말 + 바꾸기. 키 칸을 누르고 새 조합을 누르면 바뀐다. */
export function ShortcutsDialog({ open, onClose, keys }: ShortcutsDialogProps) {
  const [editing, setEditing] = useState<ShortcutId | null>(null)
  const [notice, setNotice] = useState<{ id: ShortcutId; text: string; error: boolean } | null>(null)

  useEffect(() => {
    if (open) return
    setEditing(null)
    setNotice(null)
  }, [open])

  // 키 입력 받기: 창 전체에서 가장 먼저 가로채 다른 단축키·대화상자 Esc 가 반응하지 않게 한다.
  useEffect(() => {
    if (!editing) return
    const onDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        setEditing(null)
        return
      }
      const combo = comboOf(e)
      if (!combo) return
      const reason = rejectReason(combo)
      if (reason) {
        setNotice({ id: editing, text: `${formatCombo(combo)} — ${reason}`, error: true })
        return
      }
      const movedFrom = keys.assign(editing, combo)
      setNotice({
        id: editing,
        text: movedFrom
          ? `${formatCombo(combo)}(으)로 바꿨습니다. '${labelOf(movedFrom)}'에서 쓰던 키라 그쪽은 비웠습니다.`
          : `${formatCombo(combo)}(으)로 바꿨습니다.`,
        error: false,
      })
      setEditing(null)
    }
    // Alt 만 눌렀다 떼면 크롬이 자기 메뉴로 포커스를 옮긴다 — 떼는 것도 막는다.
    const onUp = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
    }
  }, [editing, keys])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="키보드 단축키"
      width={520}
      footer={
        <button type="button" className="tv-btn" onClick={() => keys.resetAll()}>
          모두 기본값으로
        </button>
      }
    >
      <p className="tv-shortcuts-note">
        키 칸을 누른 뒤 새 조합을 누르면 바뀝니다(Esc 취소). 그래픽 드라이버·크롬 확장 같은 다른 프로그램이 먼저
        쓰는 키는 사이트가 받을 수 없으니, 눌러도 반응이 없으면 다른 키로 바꾸세요.
      </p>
      {GROUPS.map((group) => (
        <section key={group} className="tv-shortcuts-group">
          <h3>{group}</h3>
          <ul className="tv-shortcuts-list">
            {SHORTCUT_DEFS.filter((d) => d.group === group).map((def) => {
              const current = keys.bindings[def.id].map(formatCombo).join(' / ')
              return (
                <li key={def.id}>
                  <button
                    type="button"
                    className={`tv-kbd-btn${editing === def.id ? ' editing' : ''}${keys.isCustom(def.id) ? ' custom' : ''}`}
                    aria-label={`${def.label} 단축키 바꾸기`}
                    onClick={() => {
                      setNotice(null)
                      setEditing((cur) => (cur === def.id ? null : def.id))
                    }}
                    onBlur={() => setEditing((cur) => (cur === def.id ? null : cur))}
                  >
                    {editing === def.id ? '키를 누르세요' : current || '없음'}
                  </button>
                  <span>{def.label}</span>
                  {keys.isCustom(def.id) && (
                    <button type="button" className="tv-shortcuts-reset" onClick={() => keys.reset(def.id)}>
                      기본값
                    </button>
                  )}
                  {notice?.id === def.id && (
                    <small className={`tv-shortcuts-notice${notice.error ? ' error' : ''}`}>{notice.text}</small>
                  )}
                </li>
              )
            })}
            {FIXED_SHORTCUTS.filter((f) => f.group === group).map((f) => (
              <li key={f.keys}>
                <kbd>{f.keys}</kbd>
                <span>{f.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Dialog>
  )
}

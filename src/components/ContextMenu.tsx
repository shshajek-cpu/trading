import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MenuDivider, MenuItem, Popover } from './ui/Popover'
import { Icon } from './Icon'

export type MenuEntry =
  | {
      type: 'item'
      label: string
      icon?: ReactNode
      shortcut?: string
      /** 켜고 끄는 항목. 켜져 있으면 아이콘 자리에 체크를 그린다. */
      checked?: boolean
      disabled?: boolean
      onSelect: () => void
    }
  | { type: 'divider' }

interface ContextMenuProps {
  /** 화면 좌표. null 이면 닫힌 상태. */
  at: { x: number; y: number } | null
  entries: MenuEntry[]
  onClose: () => void
}

/** 우클릭 메뉴. 다른 자리를 다시 우클릭하면 그 자리에서 새로 연다. */
export function ContextMenu({ at, entries, onClose }: ContextMenuProps) {
  // 창 크기가 바뀌거나 탭을 떠나면 TradingView 처럼 닫는다.
  useEffect(() => {
    if (!at) return
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [at, onClose])

  if (!at) return null
  return <MenuAt key={`${at.x}:${at.y}`} x={at.x} y={at.y} entries={entries} onClose={onClose} />
}

/**
 * 커서 자리에 보이지 않는 1px 기준점을 두고 Popover 에 매달아
 * 화면 가장자리에서 뒤집기·밀어 넣기를 그대로 쓴다.
 */
function MenuAt({ x, y, entries, onClose }: { x: number; y: number; entries: MenuEntry[]; onClose: () => void }) {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null)
  // 조건부 항목이 빠져 생긴 맨 앞·맨 뒤·연속 구분선은 버린다.
  const cleaned: MenuEntry[] = []
  for (const e of entries) {
    if (e.type === 'divider' && (cleaned.length === 0 || cleaned[cleaned.length - 1].type === 'divider')) continue
    cleaned.push(e)
  }
  if (cleaned[cleaned.length - 1]?.type === 'divider') cleaned.pop()
  return (
    <>
      {createPortal(
        <span
          ref={setAnchor}
          aria-hidden="true"
          style={{ position: 'fixed', left: x, top: y, width: 1, height: 1, pointerEvents: 'none' }}
        />,
        document.body,
      )}
      <Popover anchor={anchor} open onClose={onClose} placement="bottom-start" offset={0} shift className="tv-context-menu">
        {cleaned.map((e, i) =>
          e.type === 'divider' ? (
            <MenuDivider key={`divider-${i}`} />
          ) : (
            <MenuItem
              key={e.label}
              icon={e.checked === undefined ? e.icon : e.checked ? <Icon name="check" size={18} /> : <span />}
              label={e.label}
              shortcut={e.shortcut}
              checked={e.checked}
              disabled={e.disabled}
              onSelect={() => {
                onClose()
                e.onSelect()
              }}
            />
          ),
        )}
      </Popover>
    </>
  )
}

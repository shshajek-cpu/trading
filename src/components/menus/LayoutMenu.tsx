import { LAYOUT_MODES, LAYOUT_SYNC_ITEMS, type LayoutMode, type LayoutSync, type LayoutSyncKey } from '../../lib/layoutConfig'
import { MenuDivider, MenuItem, MenuSection, Popover } from '../ui/Popover'
import { Icon } from '../Icon'
import { LAYOUT_ICON } from '../../lib/chartTypeIcons'

interface LayoutMenuProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  value: LayoutMode
  onChange: (mode: LayoutMode) => void
  onEqualize: () => void
  /** "모든 칸에 같이 적용" 항목들의 현재 상태. */
  sync: LayoutSync
  onSyncChange: (key: LayoutSyncKey, on: boolean) => void
}

export function LayoutMenu({
  anchor,
  open,
  onClose,
  value,
  onChange,
  onEqualize,
  sync,
  onSyncChange,
}: LayoutMenuProps) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-end">
      {LAYOUT_MODES.map((o) => (
        <MenuItem
          key={o.mode}
          icon={<Icon name={LAYOUT_ICON[o.mode]} size={20} />}
          label={o.label}
          active={o.mode === value}
          onSelect={() => {
            onChange(o.mode)
            onClose()
          }}
        />
      ))}
      <MenuDivider />
      <MenuItem
        icon={<Icon name="equalize" size={20} />}
        label="균등 분할"
        disabled={value === 1}
        onSelect={() => {
          onEqualize()
          onClose()
        }}
      />
      <MenuDivider />
      <MenuSection title="모든 칸에 같이 적용">
        {/* 켜고 끄는 항목이라 메뉴를 닫지 않는다. */}
        {LAYOUT_SYNC_ITEMS.map((s) => (
          <MenuItem
            key={s.key}
            icon={sync[s.key] ? <Icon name="check" size={18} /> : <span />}
            label={s.label}
            checked={sync[s.key]}
            onSelect={() => onSyncChange(s.key, !sync[s.key])}
          />
        ))}
      </MenuSection>
    </Popover>
  )
}

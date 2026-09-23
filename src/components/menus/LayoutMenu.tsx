import type { LayoutMode } from '../../lib/layoutConfig'
import { MenuDivider, MenuItem, Popover } from '../ui/Popover'
import { Icon, type IconName } from '../Icon'

interface LayoutMenuProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  value: LayoutMode
  onChange: (mode: LayoutMode) => void
  onEqualize: () => void
}

const OPTIONS: { mode: LayoutMode; label: string; icon: IconName }[] = [
  { mode: 1, label: '단일 차트', icon: 'layout1' },
  { mode: 2, label: '2분할', icon: 'layout2' },
  { mode: 4, label: '4분할', icon: 'layout4' },
]

export function LayoutMenu({ anchor, open, onClose, value, onChange, onEqualize }: LayoutMenuProps) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-end">
      {OPTIONS.map((o) => (
        <MenuItem
          key={o.mode}
          icon={<Icon name={o.icon} size={20} />}
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
    </Popover>
  )
}

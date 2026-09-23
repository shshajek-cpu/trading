import type { LayoutMode } from '../../lib/layoutConfig'
import { MenuDivider, MenuItem, MenuSection, Popover } from '../ui/Popover'
import { Icon, type IconName } from '../Icon'

interface LayoutMenuProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  value: LayoutMode
  onChange: (mode: LayoutMode) => void
  onEqualize: () => void
  syncChartType: boolean
  onSyncChartTypeChange: (on: boolean) => void
}

const OPTIONS: { mode: LayoutMode; label: string; icon: IconName }[] = [
  { mode: 1, label: '단일 차트', icon: 'layout1' },
  { mode: 2, label: '2분할', icon: 'layout2' },
  { mode: 4, label: '4분할', icon: 'layout4' },
]

export function LayoutMenu({
  anchor,
  open,
  onClose,
  value,
  onChange,
  onEqualize,
  syncChartType,
  onSyncChartTypeChange,
}: LayoutMenuProps) {
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
      <MenuDivider />
      <MenuSection title="모든 칸에 같이 적용">
        {/* 켜고 끄는 항목이라 메뉴를 닫지 않는다. */}
        <MenuItem
          icon={syncChartType ? <Icon name="check" size={18} /> : <span />}
          label="차트 종류"
          checked={syncChartType}
          onSelect={() => onSyncChartTypeChange(!syncChartType)}
        />
      </MenuSection>
    </Popover>
  )
}

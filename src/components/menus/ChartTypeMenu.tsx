import { Fragment } from 'react'
import { CHART_TYPES, type ChartType } from '../../lib/chartTypes'
import { CHART_TYPE_ICON } from '../../lib/chartTypeIcons'
import { MenuDivider, MenuItem, Popover } from '../ui/Popover'
import { Icon } from '../Icon'

interface ChartTypeMenuProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  value: ChartType
  onChange: (type: ChartType) => void
}

export function ChartTypeMenu({ anchor, open, onClose, value, onChange }: ChartTypeMenuProps) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-start">
      {CHART_TYPES.map((t, i) => {
        const prev = CHART_TYPES[i - 1]
        return (
          <Fragment key={t.id}>
            {prev && prev.group !== t.group && <MenuDivider />}
            <MenuItem
              icon={<Icon name={CHART_TYPE_ICON[t.id]} size={22} />}
              label={t.label}
              active={t.id === value}
              onSelect={() => {
                onChange(t.id)
                onClose()
              }}
            />
          </Fragment>
        )
      })}
    </Popover>
  )
}

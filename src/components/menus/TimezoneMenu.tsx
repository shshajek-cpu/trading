import { TIMEZONES } from '../../lib/chartSettings'
import { MenuItem, Popover } from '../ui/Popover'

interface TimezoneMenuProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  value: string
  onChange: (id: string) => void
}

export function TimezoneMenu({ anchor, open, onClose, value, onChange }: TimezoneMenuProps) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="top-end">
      {TIMEZONES.map((tz) => (
        <MenuItem
          key={tz.id}
          label={tz.label}
          active={tz.id === value}
          onSelect={() => {
            onChange(tz.id)
            onClose()
          }}
        />
      ))}
    </Popover>
  )
}

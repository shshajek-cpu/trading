import type { Interval } from '../../lib/binance'
import { INTERVAL_GROUPS, INTERVALS } from '../../lib/intervals'
import { MenuItem, MenuSection, Popover } from '../ui/Popover'
import { Icon } from '../Icon'

interface IntervalMenuProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  value: Interval
  favorites: Interval[]
  onChange: (interval: Interval) => void
  onToggleFavorite: (interval: Interval) => void
}

export function IntervalMenu({ anchor, open, onClose, value, favorites, onChange, onToggleFavorite }: IntervalMenuProps) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-start">
      {INTERVAL_GROUPS.map((group) => (
        <MenuSection key={group.id} title={group.label}>
          {INTERVALS.filter((i) => i.group === group.id).map((info) => (
            <MenuItem
              key={info.id}
              label={info.label}
              active={info.id === value}
              trailing={
                <button
                  type="button"
                  className={`tv-fav-star${favorites.includes(info.id) ? ' on' : ''}`}
                  aria-label={favorites.includes(info.id) ? '즐겨찾기 해제' : '즐겨찾기'}
                  aria-pressed={favorites.includes(info.id)}
                  onClick={() => onToggleFavorite(info.id)}
                >
                  <Icon name={favorites.includes(info.id) ? 'starFill' : 'star'} size={16} />
                </button>
              }
              onSelect={() => {
                onChange(info.id)
                onClose()
              }}
            />
          ))}
        </MenuSection>
      ))}
    </Popover>
  )
}

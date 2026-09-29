import type { Interval } from '../../lib/market/types'
import { supportsInterval } from '../../lib/market/ids'
import { INTERVAL_GROUPS, INTERVALS } from '../../lib/intervals'
import { MenuItem, MenuSection, Popover } from '../ui/Popover'
import { Icon } from '../Icon'

/** 이 종목 시장에서 못 그리는 주기(야후 3d)의 안내 — 주기 메뉴·시트·상단 즐겨찾기·빠른 주기 입력이 같이 쓴다. */
export const UNSUPPORTED_INTERVAL = '이 시장에서 지원하지 않는 주기'

interface IntervalMenuProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  /** 활성 칸 종목 — 이 시장에서 못 그리는 주기를 끈다. */
  symbol: string
  value: Interval
  favorites: Interval[]
  onChange: (interval: Interval) => void
  onToggleFavorite: (interval: Interval) => void
}

export function IntervalMenu({ anchor, open, onClose, symbol, value, favorites, onChange, onToggleFavorite }: IntervalMenuProps) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-start">
      {INTERVAL_GROUPS.map((group) => (
        <MenuSection key={group.id} title={group.label}>
          {INTERVALS.filter((i) => i.group === group.id).map((info) => {
            const off = !supportsInterval(symbol, info.id)
            return (
            <MenuItem
              key={info.id}
              label={
                off ? (
                  <span title={UNSUPPORTED_INTERVAL} aria-label={`${info.label} — ${UNSUPPORTED_INTERVAL}`}>
                    {info.label}
                  </span>
                ) : (
                  info.label
                )
              }
              shortcut={off ? '미지원' : undefined}
              disabled={off}
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
            )
          })}
        </MenuSection>
      ))}
    </Popover>
  )
}

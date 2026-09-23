import { useEffect, useRef, useState } from 'react'
import type { Interval } from '../lib/binance'
import type { ScaleMode } from '../lib/chartTypes'
import { MenuItem, Popover } from './ui/Popover'
import { TimezoneMenu } from './menus/TimezoneMenu'
import { Icon } from './Icon'

interface BottomBarProps {
  variant?: 'desktop' | 'mobile'
  interval: Interval
  onApplyRange: (interval: Interval, from: number, to: number) => void
  timezone: string
  onTimezoneChange: (id: string) => void
  scaleMode: ScaleMode
  onScaleModeChange: (mode: ScaleMode) => void
  autoScale: boolean
  onAutoScaleChange: (v: boolean) => void
}

const DAY = 86400

/** Bottom-bar quick ranges: label, target interval and lookback in seconds ('ytd'/'all' special). */
const RANGES: { id: string; label: string; interval: Interval; span: number | 'ytd' | 'all' }[] = [
  { id: '1d', label: '1일', interval: '1m', span: DAY },
  { id: '5d', label: '5일', interval: '5m', span: 5 * DAY },
  { id: '1mo', label: '1개월', interval: '30m', span: 30 * DAY },
  { id: '3mo', label: '3개월', interval: '1h', span: 90 * DAY },
  { id: '6mo', label: '6개월', interval: '2h', span: 180 * DAY },
  { id: 'ytd', label: 'YTD', interval: '1d', span: 'ytd' },
  { id: '1y', label: '1년', interval: '1d', span: 365 * DAY },
  { id: '5y', label: '5년', interval: '1w', span: 5 * 365 * DAY },
  { id: 'all', label: '전체', interval: '1M', span: 'all' },
]

function zoneArg(tz: string): string | undefined {
  return tz === 'local' ? undefined : tz
}

function offsetLabel(tz: string): string {
  if (tz === 'UTC') return 'UTC'
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zoneArg(tz),
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'UTC'
    return name.replace('GMT', 'UTC')
  } catch {
    return 'UTC'
  }
}

export function BottomBar({
  variant = 'desktop',
  interval,
  onApplyRange,
  timezone,
  onTimezoneChange,
  scaleMode,
  onScaleModeChange,
  autoScale,
  onAutoScaleChange,
}: BottomBarProps) {
  const mobile = variant === 'mobile'
  const [now, setNow] = useState(() => new Date())
  const [tzOpen, setTzOpen] = useState(false)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [lastRange, setLastRange] = useState<string | null>(null)
  const clockRef = useRef<HTMLButtonElement>(null)
  const rangeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: zoneArg(timezone),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)

  const applyRange = (r: (typeof RANGES)[number]) => {
    const to = Math.floor(Date.now() / 1000)
    let from: number
    if (r.span === 'ytd') {
      from = Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000)
    } else if (r.span === 'all') {
      from = 0
    } else {
      from = to - r.span
    }
    setLastRange(r.id)
    onApplyRange(r.interval, from, to)
  }

  // A range stays highlighted only while the active cell still sits on its interval.
  const isActiveRange = (r: (typeof RANGES)[number]) => r.id === lastRange && r.interval === interval

  return (
    <div className={`tv-bottom-bar${mobile ? ' mobile' : ''}`}>
      {mobile ? (
        <>
          <button ref={rangeRef} type="button" className="tv-range-menu-btn" onClick={() => setRangeOpen((v) => !v)}>
            기간
            <Icon name="chevron" size={16} />
          </button>
          <Popover anchor={rangeRef.current} open={rangeOpen} onClose={() => setRangeOpen(false)} placement="top-start">
            {RANGES.map((r) => (
              <MenuItem
                key={r.id}
                label={r.label}
                active={isActiveRange(r)}
                onSelect={() => {
                  applyRange(r)
                  setRangeOpen(false)
                }}
              />
            ))}
          </Popover>
        </>
      ) : (
        <div className="tv-ranges">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`tv-range-btn${isActiveRange(r) ? ' active' : ''}`}
              onClick={() => applyRange(r)}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      <div className="tv-bottom-right">
        <button ref={clockRef} type="button" className="tv-clock" onClick={() => setTzOpen((v) => !v)}>
          <Icon name="clock" size={16} />
          <span className="tv-clock-time">{time}</span>
          <span className="tv-clock-zone">({offsetLabel(timezone)})</span>
        </button>
        <TimezoneMenu
          anchor={clockRef.current}
          open={tzOpen}
          onClose={() => setTzOpen(false)}
          value={timezone}
          onChange={onTimezoneChange}
        />

        {!mobile && (
          <>
            <span className="tv-bottom-sep" />
            <button
              type="button"
              className={`tv-scale-btn${scaleMode === 'percent' ? ' active' : ''}`}
              title="퍼센트 스케일"
              aria-pressed={scaleMode === 'percent'}
              onClick={() => onScaleModeChange(scaleMode === 'percent' ? 'normal' : 'percent')}
            >
              %
            </button>
            <button
              type="button"
              className={`tv-scale-btn${scaleMode === 'log' ? ' active' : ''}`}
              title="로그 스케일"
              aria-pressed={scaleMode === 'log'}
              onClick={() => onScaleModeChange(scaleMode === 'log' ? 'normal' : 'log')}
            >
              log
            </button>
            <button
              type="button"
              className={`tv-scale-btn${autoScale ? ' active' : ''}`}
              title="자동 스케일"
              aria-pressed={autoScale}
              onClick={() => onAutoScaleChange(!autoScale)}
            >
              auto
            </button>
          </>
        )}
      </div>
    </div>
  )
}

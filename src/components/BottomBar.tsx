import { useEffect, useRef, useState } from 'react'
import type { Interval } from '../lib/binance'
import type { ScaleMode } from '../lib/chartTypes'
import { DATE_RANGES, rangeBounds, type DateRange } from '../lib/dateRanges'
import { TimezoneMenu } from './menus/TimezoneMenu'
import { Icon } from './Icon'

interface BottomBarProps {
  interval: Interval
  onApplyRange: (interval: Interval, from: number, to: number) => void
  timezone: string
  onTimezoneChange: (id: string) => void
  scaleMode: ScaleMode
  onScaleModeChange: (mode: ScaleMode) => void
  autoScale: boolean
  onAutoScaleChange: (v: boolean) => void
}

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

/** 데스크톱 차트 아래 줄: 기간 버튼 · 시계(시간대) · %/log/auto. 폰은 모바일 셸의 ⋯·⚙ 시트가 맡는다. */
export function BottomBar({
  interval,
  onApplyRange,
  timezone,
  onTimezoneChange,
  scaleMode,
  onScaleModeChange,
  autoScale,
  onAutoScaleChange,
}: BottomBarProps) {
  const [now, setNow] = useState(() => new Date())
  const [tzOpen, setTzOpen] = useState(false)
  const [lastRange, setLastRange] = useState<string | null>(null)
  const clockRef = useRef<HTMLButtonElement>(null)
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

  const applyRange = (r: DateRange) => {
    const { from, to } = rangeBounds(r)
    setLastRange(r.id)
    onApplyRange(r.interval, from, to)
  }

  // A range stays highlighted only while the active cell still sits on its interval.
  const isActiveRange = (r: DateRange) => r.id === lastRange && r.interval === interval

  return (
    <div className="tv-bottom-bar">
      <div className="tv-ranges">
        {DATE_RANGES.map((r) => (
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
      </div>
    </div>
  )
}

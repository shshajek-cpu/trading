import { useEffect, useRef, useState } from 'react'
import type { Interval } from '../lib/binance'
import type { ScaleMode } from '../lib/chartTypes'
import { DATE_RANGES, rangeBounds, type DateRange } from '../lib/dateRanges'
import { intlZone } from '../lib/timezone'
import { TimezoneMenu } from './menus/TimezoneMenu'
import { Icon } from './Icon'
import { INTERVAL_INFO } from '../lib/intervals'
import { tip } from '../lib/tooltip'
import type { ShortcutId } from '../lib/shortcuts'

interface BottomBarProps {
  interval: Interval
  onApplyRange: (interval: Interval, from: number, to: number) => void
  timezone: string
  onTimezoneChange: (id: string) => void
  scaleMode: ScaleMode
  onScaleModeChange: (mode: ScaleMode) => void
  autoScale: boolean
  onAutoScaleChange: (v: boolean) => void
  /** 툴팁에 보일 단축키(사용자가 바꾼 키 반영). */
  shortcut: (id: ShortcutId) => string | undefined
}

function offsetLabel(tz: string): string {
  if (tz === 'UTC') return 'UTC'
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: intlZone(tz),
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
  shortcut,
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
    timeZone: intlZone(timezone),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)

  const applyRange = (r: DateRange) => {
    const { from, to } = rangeBounds(r, timezone)
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
            {...tip(
              r.label,
              `${r.span === 'ytd' ? '올해 1월 1일부터' : r.span === 'all' ? '처음부터 전체를' : `최근 ${r.label}을`} ${INTERVAL_INFO[r.interval].label} 봉으로 봅니다.`,
            )}
            onClick={() => applyRange(r)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="tv-bottom-right">
        <button
          ref={clockRef}
          type="button"
          className="tv-clock"
          {...tip('시간대', '차트 시각을 어느 지역 시간으로 볼지 고릅니다.')}
          onClick={() => setTzOpen((v) => !v)}
        >
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
          {...tip('퍼센트 눈금', '가격 축을 화면 첫 봉 대비 % 로 보여 줍니다.', shortcut('togglePercent'))}
          aria-pressed={scaleMode === 'percent'}
          onClick={() => onScaleModeChange(scaleMode === 'percent' ? 'normal' : 'percent')}
        >
          %
        </button>
        <button
          type="button"
          className={`tv-scale-btn${scaleMode === 'log' ? ' active' : ''}`}
          {...tip('로그 눈금', '가격 축을 로그로 — 오르내림을 금액이 아니라 비율로 비교합니다.', shortcut('toggleLog'))}
          aria-pressed={scaleMode === 'log'}
          onClick={() => onScaleModeChange(scaleMode === 'log' ? 'normal' : 'log')}
        >
          log
        </button>
        <button
          type="button"
          className={`tv-scale-btn${autoScale ? ' active' : ''}`}
          {...tip('자동 눈금', '보이는 봉에 맞춰 가격 축 범위를 자동으로 맞춥니다. 끄면 축을 끌어 직접 조절합니다.')}
          aria-pressed={autoScale}
          onClick={() => onAutoScaleChange(!autoScale)}
        >
          auto
        </button>
      </div>
    </div>
  )
}

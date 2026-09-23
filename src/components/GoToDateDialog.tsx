import { useEffect, useState } from 'react'
import { Dialog } from './ui/Dialog'

interface GoToDateDialogProps {
  open: boolean
  onClose: () => void
  /** 차트 시간대(settings.timezone). 입력한 날짜·시각을 이 시간대의 벽시계로 읽는다. */
  timezone: string
  /** 분·시간봉이면 시각 입력도 받는다. */
  intraday: boolean
  /** unix 초. */
  onGo: (time: number) => void
}

/** 시간대 tz 에서 epochMs 순간의 UTC 대비 차이(ms). */
function zoneOffsetMs(epochMs: number, tz: string): number {
  if (tz === 'local') return -new Date(epochMs).getTimezoneOffset() * 60_000
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(epochMs))
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - epochMs
}

/** "2026-09-23" + "14:30" (tz 벽시계) → unix 초. 서머타임 경계는 한 번 더 맞춘다. */
function zonedToEpoch(date: string, time: string, tz: string): number | null {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '00:00').split(':').map(Number)
  if (!y || !m || !d) return null
  const wall = Date.UTC(y, m - 1, d, hh || 0, mm || 0)
  const first = zoneOffsetMs(wall, tz)
  const second = zoneOffsetMs(wall - first, tz)
  return Math.floor((wall - second) / 1000)
}

/** 지금을 tz 벽시계의 날짜·시각 문자열로. */
function nowIn(tz: string): { date: string; time: string } {
  const shifted = new Date(Date.now() + zoneOffsetMs(Date.now(), tz))
  const iso = shifted.toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) }
}

/** TradingView "날짜로 이동"(Alt+G). */
export function GoToDateDialog({ open, onClose, timezone, intraday, onGo }: GoToDateDialogProps) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const now = nowIn(timezone)
    setDate(now.date)
    setTime(now.time)
    setError('')
  }, [open, timezone])

  const submit = () => {
    const ts = zonedToEpoch(date, intraday ? time : '00:00', timezone)
    if (ts === null) {
      setError('날짜를 입력하세요.')
      return
    }
    if (ts * 1000 > Date.now()) {
      setError('미래 날짜로는 이동할 수 없습니다.')
      return
    }
    onGo(ts)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="날짜로 이동"
      width={360}
      footer={
        <>
          <button type="button" className="tv-btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="tv-btn primary" onClick={submit}>
            이동
          </button>
        </>
      }
    >
      <form
        className="goto-body"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="goto-field">
          <span>날짜</span>
          <input
            className="tv-input"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setError('')
            }}
          />
        </label>
        {intraday && (
          <label className="goto-field">
            <span>시각</span>
            <input className="tv-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        )}
        {error && <p className="goto-error">{error}</p>}
        {/* Enter 로 제출되게 숨은 버튼을 둔다. */}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

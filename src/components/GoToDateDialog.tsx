import { useEffect, useState } from 'react'
import { Dialog } from './ui/Dialog'
import { nowIn, zonedToEpoch } from '../lib/timezone'

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

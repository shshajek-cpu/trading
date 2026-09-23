import { useEffect, useRef, useState } from 'react'
import type { Interval } from '../lib/binance'
import { parseQuickInterval } from '../lib/quickInterval'

interface QuickIntervalBoxProps {
  /** Non-null string = open, seeded with the typed character. */
  seed: string | null
  onApply: (interval: Interval) => void
  onClose: () => void
}

export function QuickIntervalBox({ seed, onApply, onClose }: QuickIntervalBoxProps) {
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (seed !== null) {
      setValue(seed)
      setInvalid(false)
      // Focus after mount so the seeded character is editable immediately.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [seed])

  if (seed === null) return null

  const submit = () => {
    const iv = parseQuickInterval(value)
    if (!iv) {
      setInvalid(true)
      return
    }
    onApply(iv)
    onClose()
  }

  return (
    <div className="tv-quickiv-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tv-quickiv">
        <label className="tv-quickiv-label" htmlFor="tv-quickiv-input">주기 변경</label>
        <input
          id="tv-quickiv-input"
          ref={inputRef}
          className={`tv-input${invalid ? ' invalid' : ''}`}
          value={value}
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value)
            setInvalid(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        {invalid && <span className="tv-quickiv-error">알 수 없는 주기</span>}
      </div>
    </div>
  )
}

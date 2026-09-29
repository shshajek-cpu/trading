import { useEffect, useRef, useState } from 'react'
import type { Interval } from '../lib/market/types'
import { supportsInterval } from '../lib/market/ids'
import { parseQuickInterval } from '../lib/quickInterval'
import { UNSUPPORTED_INTERVAL } from './menus/IntervalMenu'

interface QuickIntervalBoxProps {
  /** Non-null string = open, seeded with the typed character. */
  seed: string | null
  /** 활성 칸 종목 — 이 시장에서 못 그리는 주기는 적용하지 않는다. */
  symbol: string
  onApply: (interval: Interval) => void
  onClose: () => void
}

export function QuickIntervalBox({ seed, symbol, onApply, onClose }: QuickIntervalBoxProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (seed !== null) {
      setValue(seed)
      setError(null)
      // Focus after mount so the seeded character is editable immediately.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [seed])

  if (seed === null) return null

  const submit = () => {
    const iv = parseQuickInterval(value)
    if (!iv) {
      setError('알 수 없는 주기')
      return
    }
    if (!supportsInterval(symbol, iv)) {
      setError(UNSUPPORTED_INTERVAL)
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
          className={`tv-input${error ? ' invalid' : ''}`}
          aria-invalid={error ? true : undefined}
          value={value}
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
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
        {error && <span className="tv-quickiv-error">{error}</span>}
      </div>
    </div>
  )
}

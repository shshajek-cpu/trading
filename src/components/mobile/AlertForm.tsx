import { useState } from 'react'
import { Icon } from '../Icon'
import type { AlertCondition } from '../../hooks/usePriceAlerts'

interface AlertFormProps {
  symbol: string
  livePrice: number | null
  onAdd: (symbol: string, condition: AlertCondition, price: number) => void
  onDone: () => void
}

/** 현재가 대비 몇 % 위/아래를 한 번에 고르게 한다 — 숫자를 직접 치는 건 폰에서 번거롭다. */
const QUICK = [-5, -3, -1, 1, 3, 5]

export function AlertForm({ symbol, livePrice, onAdd, onDone }: AlertFormProps) {
  const [condition, setCondition] = useState<AlertCondition>('above')
  const [price, setPrice] = useState('')

  const value = Number(price)
  const valid = Number.isFinite(value) && value > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onAdd(symbol, condition, value)
    onDone()
  }

  const pickPercent = (pct: number) => {
    if (livePrice === null) return
    const target = livePrice * (1 + pct / 100)
    const digits = target >= 1000 ? 2 : target >= 1 ? 4 : 6
    setPrice(target.toFixed(digits))
    setCondition(pct >= 0 ? 'above' : 'below')
  }

  return (
    <form className="alert-form-page" onSubmit={submit}>
      {livePrice !== null && (
        <p className="now-price">
          현재가 <b>{livePrice.toLocaleString('en-US')}</b>
        </p>
      )}

      {/* 이상/이하 — 크게 둘로 나눠 잘못 누를 일이 없게. */}
      <div className="seg-tabs cond-tabs">
        {(['above', 'below'] as const).map((c) => (
          <button
            key={c}
            type="button"
            className={condition === c ? 'active' : undefined}
            onClick={() => setCondition(c)}
          >
            <Icon name={c === 'above' ? 'arrowUp' : 'arrowDown'} size={15} />
            {c === 'above' ? '이상일 때' : '이하일 때'}
          </button>
        ))}
      </div>

      <label className="big-input">
        <span>목표 가격</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          autoFocus
          placeholder="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>

      {livePrice !== null && (
        <div className="quick-pct">
          {QUICK.map((p) => (
            <button key={p} type="button" onClick={() => pickPercent(p)}>
              {p > 0 ? '+' : ''}
              {p}%
            </button>
          ))}
        </div>
      )}

      <button type="submit" className="cta" disabled={!valid}>
        <Icon name="bell" size={16} />
        알림 걸기
      </button>
    </form>
  )
}

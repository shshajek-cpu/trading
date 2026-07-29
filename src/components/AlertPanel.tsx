import { useState } from 'react'
import type { AlertCondition, PriceAlert } from '../hooks/usePriceAlerts'
import { COLORS } from '../lib/theme'

interface AlertPanelProps {
  symbol: string
  alerts: PriceAlert[]
  permission: NotificationPermission | 'unsupported'
  onAdd: (symbol: string, condition: AlertCondition, price: number) => void
  onRemove: (id: string) => void
}

export function AlertPanel({ symbol, alerts, permission, onAdd, onRemove }: AlertPanelProps) {
  const [condition, setCondition] = useState<AlertCondition>('above')
  const [price, setPrice] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = Number(price)
    if (!Number.isFinite(value) || value <= 0) return
    onAdd(symbol, condition, value)
    setPrice('')
  }

  return (
    <section className="panel">
      <h2>가격 알림</h2>

      {permission === 'denied' && (
        <p className="hint">시스템 알림이 차단되어 화면 안내로만 표시됩니다.</p>
      )}
      {permission === 'unsupported' && (
        <p className="hint">이 브라우저는 알림을 지원하지 않아 화면 안내로만 표시됩니다.</p>
      )}

      <form className="alert-form" onSubmit={submit}>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as AlertCondition)}
        >
          <option value="above">이상</option>
          <option value="below">이하</option>
        </select>
        <input
          type="number"
          step="any"
          min="0"
          placeholder="가격"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button type="submit">추가</button>
      </form>

      <ul className="alert-list">
        {alerts.map((alert) => (
          <li key={alert.id} className={alert.active ? undefined : 'fired'}>
            <span
              className="alert-dir"
              style={{ color: alert.condition === 'above' ? COLORS.up : COLORS.down }}
            >
              {alert.condition === 'above' ? '▲' : '▼'}
            </span>
            <span className="alert-symbol">{alert.symbol}</span>
            <span className="alert-price">{alert.price}</span>
            {!alert.active && <span className="alert-badge">발동됨</span>}
            <button type="button" className="remove" onClick={() => onRemove(alert.id)}>
              ✕
            </button>
          </li>
        ))}
        {alerts.length === 0 && <li className="empty">등록된 알림이 없습니다.</li>}
      </ul>
    </section>
  )
}

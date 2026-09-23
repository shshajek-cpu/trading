import { useState } from 'react'
import type { AlertCondition, PriceAlert } from '../hooks/usePriceAlerts'
import { COLORS } from '../lib/theme'
import { Icon } from './Icon'
import { PushBox, type PushProps } from './PushBox'

interface AlertPanelProps {
  symbol: string
  alerts: PriceAlert[]
  permission: NotificationPermission | 'unsupported'
  onAdd: (symbol: string, condition: AlertCondition, price: number) => void
  onRemove: (id: string) => void
  /** 앱을 닫아도 오는 알림. 동기화 코드가 있어야 켤 수 있다. */
  push: PushProps
  hasSyncCode: boolean
  /** 코드가 없을 때 한 번에 만들어 주기 위해. */
  onCreateSyncCode: () => string
}

export function AlertPanel({
  symbol,
  alerts,
  permission,
  onAdd,
  onRemove,
  push,
  hasSyncCode,
  onCreateSyncCode,
}: AlertPanelProps) {
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
      {permission === 'denied' && (
        <p className="hint">시스템 알림이 차단되어 화면 안내로만 표시됩니다.</p>
      )}
      {permission === 'unsupported' && (
        <p className="hint">이 브라우저는 알림을 지원하지 않아 화면 안내로만 표시됩니다.</p>
      )}

      <PushBox push={push} hasSyncCode={hasSyncCode} onCreateSyncCode={onCreateSyncCode} />

      <form className="inline-form" onSubmit={submit}>
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
          placeholder={`${symbol.replace('USDT', '')} 가격`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button type="submit">추가</button>
      </form>

      <ul className="row-list">
        {alerts.map((alert) => (
          <li key={alert.id} className={alert.active ? undefined : 'fired'}>
            <span
              className="row-dir"
              style={{ color: alert.condition === 'above' ? COLORS.up : COLORS.down }}
            >
              <Icon name={alert.condition === 'above' ? 'arrowUp' : 'arrowDown'} size={14} />
            </span>
            <span className="row-name">{alert.symbol.replace('USDT', '')}</span>
            <span className="row-value">{alert.price}</span>
            {!alert.active && <span className="tag">발동됨</span>}
            <button
              type="button"
              className="icon-btn remove"
              aria-label="알림 지우기"
              onClick={() => onRemove(alert.id)}
            >
              <Icon name="close" size={15} />
            </button>
          </li>
        ))}
        {alerts.length === 0 && <li className="empty">등록된 알림이 없습니다.</li>}
      </ul>
    </section>
  )
}

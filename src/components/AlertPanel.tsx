import { useState } from 'react'
import type { AlertCondition, PriceAlert } from '../hooks/usePriceAlerts'
import type { PushState } from '../hooks/usePushAlerts'
import { COLORS } from '../lib/theme'

interface AlertPanelProps {
  symbol: string
  alerts: PriceAlert[]
  permission: NotificationPermission | 'unsupported'
  onAdd: (symbol: string, condition: AlertCondition, price: number) => void
  onRemove: (id: string) => void
  /** 앱을 닫아도 오는 알림. 동기화 코드가 있어야 켤 수 있다. */
  push: {
    state: PushState
    message: string
    supported: boolean
    enable: () => Promise<void>
    disable: () => Promise<void>
  }
  hasSyncCode: boolean
}

export function AlertPanel({
  symbol,
  alerts,
  permission,
  onAdd,
  onRemove,
  push,
  hasSyncCode,
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
      <h2>가격 알림</h2>

      {permission === 'denied' && (
        <p className="hint">시스템 알림이 차단되어 화면 안내로만 표시됩니다.</p>
      )}
      {permission === 'unsupported' && (
        <p className="hint">이 브라우저는 알림을 지원하지 않아 화면 안내로만 표시됩니다.</p>
      )}

      {/* 앱을 닫아도 오는 알림 */}
      {push.supported && (
        <div className="push-row">
          {hasSyncCode ? (
            <>
              <button
                type="button"
                className={push.state === 'on' ? 'active' : undefined}
                disabled={push.state === 'working'}
                onClick={() => void (push.state === 'on' ? push.disable() : push.enable())}
              >
                {push.state === 'on' ? '✓ 백그라운드 알림 켜짐' : '백그라운드 알림 켜기'}
              </button>
              {push.message && <p className="hint">{push.message}</p>}
            </>
          ) : (
            <p className="hint">동기화 코드를 만들면 앱을 닫아도 알림을 받을 수 있습니다.</p>
          )}
        </div>
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

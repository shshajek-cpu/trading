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
  /** 코드가 없을 때 한 번에 만들어 주기 위해. */
  onCreateSyncCode: () => void
}

/** 아이폰은 홈 화면에 추가하지 않으면 푸시가 원천적으로 막힌다. 미리 알려줘야 한다. */
function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  return ios && !standalone
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
      <h2>가격 알림</h2>

      {permission === 'denied' && (
        <p className="hint">시스템 알림이 차단되어 화면 안내로만 표시됩니다.</p>
      )}
      {permission === 'unsupported' && (
        <p className="hint">이 브라우저는 알림을 지원하지 않아 화면 안내로만 표시됩니다.</p>
      )}

      {/* 앱을 닫아도 오는 알림 — 켜지 않으면 앱을 띄워둬야만 동작한다는 걸 못박아 알린다. */}
      {push.supported && (
        <div className={`push-box ${push.state === 'on' ? 'on' : 'off'}`}>
          {push.state === 'on' ? (
            <>
              <p className="push-title">앱을 꺼도 알림이 옵니다</p>
              <p className="push-desc">
                서버가 1분마다 시세를 확인합니다. 폰이 잠겨 있어도 받습니다.
              </p>
              <button
                type="button"
                className="push-off"
                onClick={() => void push.disable()}
              >
                끄기
              </button>
            </>
          ) : (
            <>
              <p className="push-title">지금은 앱을 켜둬야만 알림이 옵니다</p>
              <p className="push-desc">
                켜두면 앱을 닫아도 서버가 대신 감시해 알려줍니다.
              </p>
              <button
                type="button"
                className="push-on"
                disabled={push.state === 'working'}
                onClick={() => {
                  // 코드가 없으면 먼저 만든다 — 사용자가 두 곳을 오가지 않게.
                  if (!hasSyncCode) onCreateSyncCode()
                  void push.enable()
                }}
              >
                {push.state === 'working' ? '켜는 중…' : '앱 꺼도 알림 받기'}
              </button>
              {isIosSafari() && (
                <p className="push-warn">
                  아이폰은 <b>홈 화면에 추가</b>한 뒤 그 아이콘으로 열어야 알림이 옵니다.
                </p>
              )}
            </>
          )}
          {push.message && <p className="push-msg">{push.message}</p>}
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

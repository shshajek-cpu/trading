import { Icon } from '../Icon'
import type { PriceAlert } from '../../hooks/usePriceAlerts'
import type { Drawing } from '../../lib/drawings'
import { COLORS } from '../../lib/theme'

interface AlertsScreenProps {
  alerts: PriceAlert[]
  drawings: Drawing[]
  onRemoveAlert: (id: string) => void
  onRemoveDrawing: (id: string) => void
  onToggleDrawingAlert: (id: string, on: boolean) => void
  /** 종목을 누르면 그 차트로 이동한다. */
  onGoSymbol: (symbol: string) => void
  /** 새 알림 만들기 — 알림 추가 페이지를 연다. */
  onAdd: () => void
  children?: React.ReactNode
}

/**
 * 알림 화면.
 *
 * 가격 알림과 선 통과 알림은 사용자 입장에서 똑같이 '울리는 것'이다.
 * 원래는 서로 다른 패널에 흩어져 있어 어디에 뭘 걸었는지 알기 어려웠다 — 한 곳에 모은다.
 */
export function AlertsScreen({
  alerts,
  drawings,
  onRemoveAlert,
  onRemoveDrawing,
  onToggleDrawingAlert,
  onGoSymbol,
  onAdd,
  children,
}: AlertsScreenProps) {
  const lineAlerts = drawings.filter((d) => d.alert)
  const empty = alerts.length === 0 && lineAlerts.length === 0

  return (
    <div className="screen alerts-screen">
      {children}

      <button type="button" className="cta add-alert" onClick={onAdd}>
        <Icon name="plus" size={17} />
        가격 알림 추가
      </button>

      {empty && (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="bell" size={26} />
          </span>
          <strong>걸어 둔 알림이 없습니다</strong>
          <span>목표 가격을 정해 두면 닿는 순간 알려 드립니다.</span>
        </div>
      )}

      {alerts.length > 0 && (
        <>
          <p className="screen-label">가격 알림</p>
          <ul className="alert-rows">
            {alerts.map((a) => (
              <li key={a.id} className={a.active ? undefined : 'fired'}>
                <span
                  className="alert-dir"
                  style={{ color: a.condition === 'above' ? COLORS.up : COLORS.down }}
                >
                  <Icon name={a.condition === 'above' ? 'arrowUp' : 'arrowDown'} size={15} />
                </span>
                <button type="button" className="alert-main" onClick={() => onGoSymbol(a.symbol)}>
                  <strong>{a.symbol.replace('USDT', '')}</strong>
                  <em>
                    {a.condition === 'above' ? '이상' : '이하'} {a.price}
                  </em>
                </button>
                {!a.active && <span className="tag">울렸음</span>}
                <button
                  type="button"
                  className="icon-btn remove"
                  aria-label="알림 삭제"
                  onClick={() => onRemoveAlert(a.id)}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {lineAlerts.length > 0 && (
        <>
          <p className="screen-label">선 통과 알림</p>
          <ul className="alert-rows">
            {lineAlerts.map((d) => (
              <li key={d.id} className={d.fired ? 'fired' : undefined}>
                <span className="draw-dot" style={{ background: d.color }} />
                <button type="button" className="alert-main" onClick={() => onGoSymbol(d.symbol)}>
                  <strong>{d.symbol.replace('USDT', '')}</strong>
                  <em>수평선 {d.price}</em>
                </button>
                <button
                  type="button"
                  className="icon-btn bell on"
                  aria-label="알림 끄기"
                  onClick={() => onToggleDrawingAlert(d.id, false)}
                >
                  <Icon name="bell" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn remove"
                  aria-label="선 삭제"
                  onClick={() => onRemoveDrawing(d.id)}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

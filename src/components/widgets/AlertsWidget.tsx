import { useState } from 'react'
import type { AlertCondition, PriceAlert } from '../../hooks/usePriceAlerts'
import type { Drawing } from '../../lib/drawings'
import type { Interval } from '../../lib/binance'
import type { IndicatorInstance } from '../../lib/indicatorConfig'
import { INTERVAL_INFO } from '../../lib/intervals'
import {
  describeIndicatorAlert,
  TRIGGER_LABELS,
  type IndicatorAlert,
  type NewIndicatorAlert,
} from '../../lib/indicatorAlerts'
import { Icon } from '../Icon'
import { PushBox, type PushProps } from '../PushBox'
import { CreateAlertDialog } from '../CreateAlertDialog'
import { displaySymbol, priceDecimals, type SymbolInfo } from '../../lib/symbols'
import { ToolIcon } from '../../chart/drawing/toolIcons'
import './widgets.css'

interface AlertsWidgetProps {
  symbol: string
  livePrice: number | null
  alerts: PriceAlert[]
  lineAlerts: Drawing[]
  symbols: SymbolInfo[]
  onAdd: (symbol: string, condition: AlertCondition, price: number, message?: string) => void
  onRemove: (id: string) => void
  onDisableLineAlert: (id: string) => void
  indicatorAlerts: IndicatorAlert[]
  onRemoveIndicatorAlert: (id: string) => void
  /** 지표 알림을 만들 때 쓰는 지금 차트의 주기·지표. */
  interval: Interval
  indicators: IndicatorInstance[]
  onAddIndicatorAlert: (alert: NewIndicatorAlert) => void
  permission: NotificationPermission | 'unsupported'
  push: PushProps
  hasSyncCode: boolean
  onCreateSyncCode: () => string
  /** panel = 데스크톱 오른쪽 위젯, page = 폰 앱의 "알림" 탭. */
  variant: 'panel' | 'page'
}

function fmtAlertPrice(n: number, decimals: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function AlertsWidget({
  symbol,
  livePrice,
  alerts,
  lineAlerts,
  symbols,
  onAdd,
  onRemove,
  onDisableLineAlert,
  indicatorAlerts,
  onRemoveIndicatorAlert,
  interval,
  indicators,
  onAddIndicatorAlert,
  permission,
  push,
  hasSyncCode,
  onCreateSyncCode,
  variant,
}: AlertsWidgetProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const isPage = variant === 'page'

  return (
    <section className={`aw${isPage ? ' aw-page' : ''}`}>
      <header className={isPage ? 'm-page-head' : 'wl-head'}>
        {isPage ? <h1 className="m-page-title">알림</h1> : <span className="wl-title">알림</span>}
        <button type="button" className="tv-icon-btn" aria-label="알림 만들기" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={isPage ? 22 : 18} />
        </button>
      </header>

      <div className="aw-body">
        {permission === 'denied' && (
          <p className="aw-hint">시스템 알림이 차단되어 화면 안내로만 표시됩니다.</p>
        )}
        {permission === 'unsupported' && (
          <p className="aw-hint">이 브라우저는 알림을 지원하지 않아 화면 안내로만 표시됩니다.</p>
        )}

        <PushBox push={push} hasSyncCode={hasSyncCode} onCreateSyncCode={onCreateSyncCode} />

        <ul className="aw-rows">
          {alerts.map((a) => {
            const up = a.condition === 'above'
            const color = up ? 'var(--tv-up)' : 'var(--tv-down)'
            return (
              <li key={a.id} className={`aw-row${a.active ? '' : ' fired'}`}>
                <span className="aw-dir" style={{ color }}>
                  <Icon name={up ? 'arrowUp' : 'arrowDown'} size={15} />
                </span>
                <div className="aw-main">
                  <span className="aw-sym">{displaySymbol(a.symbol, symbols)}</span>
                  <span className="aw-cond">{`${fmtAlertPrice(a.price, priceDecimals(a.symbol, symbols))} ${a.condition === 'above' ? '이상' : '이하'}`}</span>
                  {a.message && <span className="aw-msg">{a.message}</span>}
                </div>
                <span className={`aw-status${a.active ? '' : ' fired'}`}>{a.active ? '활성' : '발동됨'}</span>
                <button
                  type="button"
                  className="tv-icon-btn aw-remove"
                  aria-label="알림 지우기"
                  onClick={() => onRemove(a.id)}
                >
                  <Icon name="close" size={15} />
                </button>
              </li>
            )
          })}
          {alerts.length === 0 && indicatorAlerts.length === 0 && <li className="aw-empty">등록된 알림이 없습니다.</li>}
        </ul>

        {indicatorAlerts.length > 0 && (
          <div className="aw-section">
            <p className="aw-section-title">지표 알림 · 앱이 열려 있을 때</p>
            <ul className="aw-rows">
              {indicatorAlerts.map((a) => (
                <li key={a.id} className={`aw-row${a.active ? '' : ' fired'}`}>
                  <span className="aw-dir">
                    <ToolIcon name="indicator" size={18} />
                  </span>
                  <div className="aw-main">
                    <span className="aw-sym">
                      {displaySymbol(a.symbol, symbols)} · {INTERVAL_INFO[a.interval].short}
                    </span>
                    <span className="aw-cond">{describeIndicatorAlert(a)}</span>
                    <span className="aw-msg">{TRIGGER_LABELS[a.trigger]}</span>
                  </div>
                  <span className={`aw-status${a.active ? '' : ' fired'}`}>{a.active ? '활성' : '발동됨'}</span>
                  <button
                    type="button"
                    className="tv-icon-btn aw-remove"
                    aria-label="지표 알림 지우기"
                    onClick={() => onRemoveIndicatorAlert(a.id)}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lineAlerts.length > 0 && (
          <div className="aw-section">
            <p className="aw-section-title">수평선 알림</p>
            <ul className="aw-rows">
              {lineAlerts.map((d) => {
                const price = d.points[0]?.price ?? 0
                const up = d.above !== false
                const color = up ? 'var(--tv-up)' : 'var(--tv-down)'
                return (
                  <li key={d.id} className={`aw-row${d.fired ? ' fired' : ''}`}>
                    <span className="aw-dir" style={{ color }}>
                      <ToolIcon name="horizontal" size={18} />
                    </span>
                    <div className="aw-main">
                      <span className="aw-sym">{displaySymbol(d.symbol, symbols)}</span>
                      <span className="aw-cond">{`${fmtAlertPrice(price, priceDecimals(d.symbol, symbols))} 교차`}</span>
                    </div>
                    <span className={`aw-status${d.fired ? ' fired' : ''}`}>{d.fired ? '발동됨' : '활성'}</span>
                    <button
                      type="button"
                      className="tv-icon-btn aw-remove"
                      aria-label="수평선 알림 끄기"
                      onClick={() => onDisableLineAlert(d.id)}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <CreateAlertDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        symbol={symbol}
        livePrice={livePrice}
        onCreate={onAdd}
        interval={interval}
        indicators={indicators}
        onCreateIndicatorAlert={onAddIndicatorAlert}
      />
    </section>
  )
}

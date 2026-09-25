import { useState } from 'react'
import {
  PRICE_ALERT_KIND_LABELS,
  type AlertCondition,
  type PriceAlert,
  type PriceAlertExtra,
} from '../../hooks/usePriceAlerts'
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
import { isIosSafari } from '../../hooks/usePushAlerts'
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
  onAdd: (symbol: string, condition: AlertCondition, price: number, message?: string, extra?: PriceAlertExtra) => void
  /** 가격 알림을 고친다(연필 버튼). 없으면 편집 버튼을 두지 않는다. */
  onUpdateAlert?: (id: string, patch: { condition: AlertCondition; price: number; message?: string } & PriceAlertExtra) => void
  onRemove: (id: string) => void
  onDisableLineAlert: (id: string) => void
  indicatorAlerts: IndicatorAlert[]
  onRemoveIndicatorAlert: (id: string) => void
  /** 지표 알림을 만들 때 쓰는 지금 차트의 주기·지표. */
  interval: Interval
  indicators: IndicatorInstance[]
  onAddIndicatorAlert: (alert: NewIndicatorAlert) => void
  permission: NotificationPermission | 'unsupported'
  /** 시스템 알림 권한 요청 — 버튼을 눌렀을 때만 묻는다. */
  onRequestPermission: () => void
  push: PushProps
  hasSyncCode: boolean
  onCreateSyncCode: () => string
  /** panel = 데스크톱 오른쪽 위젯, page = 폰 앱의 "알림" 탭. */
  variant: 'panel' | 'page'
  /** 행을 누르면 그 종목을 차트에 띄운다(폰은 차트 탭으로 넘어간다). */
  onPickSymbol?: (symbol: string) => void
  /** 발동된 가격 알림을 다시 켠다. */
  onReactivateAlert?: (id: string) => void
  /** 발동된 수평선 알림을 다시 켠다. */
  onReactivateLine?: (drawingId: string) => void
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
  onUpdateAlert,
  onRemove,
  onDisableLineAlert,
  indicatorAlerts,
  onRemoveIndicatorAlert,
  interval,
  indicators,
  onAddIndicatorAlert,
  permission,
  onRequestPermission,
  push,
  hasSyncCode,
  onCreateSyncCode,
  variant,
  onPickSymbol,
  onReactivateAlert,
  onReactivateLine,
}: AlertsWidgetProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<PriceAlert | null>(null)
  const isPage = variant === 'page'
  const rowClass = (fired: boolean) => `aw-row${fired ? ' fired' : ''}${onPickSymbol ? ' pick' : ''}`

  // 행 안의 버튼(다시 켜기·지우기)은 행 클릭(종목 이동)으로 번지지 않게 한다.
  const rowButton = (run: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    run()
  }

  const reactivateButton = (label: string, run: () => void) => (
    <button type="button" className="aw-reactivate" aria-label={label} onClick={rowButton(run)}>
      다시 켜기
    </button>
  )

  return (
    <section className={`aw${isPage ? ' aw-page' : ''}`}>
      <header className={isPage ? 'm-page-head' : 'wl-head'}>
        {isPage ? <h1 className="m-page-title">알림</h1> : <span className="wl-title">알림</span>}
        <button type="button" className="tv-icon-btn" aria-label="알림 만들기" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={isPage ? 22 : 18} />
        </button>
      </header>

      <div className="aw-body">
        {permission === 'default' && (
          <p className="aw-hint aw-hint-action">
            <span>시스템 알림을 켜면 다른 창을 보고 있어도 알려 줍니다.</span>
            <button type="button" className="tv-btn primary" onClick={onRequestPermission}>
              알림 허용
            </button>
          </p>
        )}
        {permission === 'denied' && (
          <p className="aw-hint">시스템 알림이 차단되어 화면 안내로만 표시됩니다.</p>
        )}
        {/* 아이폰 사파리 탭은 아래 푸시 카드가 '홈 화면에 추가' 방법을 대신 알려 준다. */}
        {permission === 'unsupported' && !isIosSafari() && (
          <p className="aw-hint">이 브라우저는 알림을 지원하지 않아 화면 안내로만 표시됩니다.</p>
        )}

        <PushBox push={push} hasSyncCode={hasSyncCode} onCreateSyncCode={onCreateSyncCode} />

        <ul className="aw-rows">
          {alerts.map((a) => {
            const up = a.condition === 'above'
            // 아직 걸리지 않은 교차 알림은 방향이 없다 — 기본색으로 둔다.
            const color = a.pending ? 'var(--tv-text-dim)' : up ? 'var(--tv-up)' : 'var(--tv-down)'
            const cond = a.kind ? PRICE_ALERT_KIND_LABELS[a.kind] : up ? '이상' : '이하'
            return (
              <li key={a.id} className={rowClass(!a.active)} onClick={onPickSymbol && (() => onPickSymbol(a.symbol))}>
                <span className="aw-dir" style={{ color }}>
                  <Icon name={up ? 'arrowUp' : 'arrowDown'} size={15} />
                </span>
                <div className="aw-main">
                  <span className="aw-sym">{displaySymbol(a.symbol, symbols)}</span>
                  <span className="aw-cond">{`${fmtAlertPrice(a.price, priceDecimals(a.symbol, symbols))} ${cond}`}</span>
                  {a.message && <span className="aw-msg">{a.message}</span>}
                </div>
                <span className={`aw-status${a.active ? '' : ' fired'}`}>{a.active ? '활성' : '발동됨'}</span>
                {!a.active && onReactivateAlert && reactivateButton('가격 알림 다시 켜기', () => onReactivateAlert(a.id))}
                {onUpdateAlert && (
                  <button
                    type="button"
                    className="tv-icon-btn aw-remove"
                    aria-label="알림 편집"
                    onClick={rowButton(() => setEditing(a))}
                  >
                    <Icon name="pencil" size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="tv-icon-btn aw-remove"
                  aria-label="알림 지우기"
                  onClick={rowButton(() => onRemove(a.id))}
                >
                  <Icon name="close" size={15} />
                </button>
              </li>
            )
          })}
          {alerts.length === 0 && indicatorAlerts.length === 0 && lineAlerts.length === 0 && (
            <li className="aw-empty">등록된 알림이 없습니다.</li>
          )}
        </ul>

        {indicatorAlerts.length > 0 && (
          <div className="aw-section">
            <p className="aw-section-title">지표 알림 · 앱이 열려 있을 때</p>
            <ul className="aw-rows">
              {indicatorAlerts.map((a) => (
                <li key={a.id} className={rowClass(!a.active)} onClick={onPickSymbol && (() => onPickSymbol(a.symbol))}>
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
                    onClick={rowButton(() => onRemoveIndicatorAlert(a.id))}
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
            <p className="aw-section-title">
              {/* 푸시가 켜져 있으면 서버가 수평선 알림도 감시한다(앱을 닫아도 옴). */}
              {!push.supported
                ? '수평선 알림'
                : push.state === 'on'
                  ? '수평선 알림 · 앱을 닫아도 푸시로 옴'
                  : '수평선 알림 · 푸시를 켜면 앱을 닫아도 옴'}
            </p>
            <ul className="aw-rows">
              {lineAlerts.map((d) => {
                const price = d.points[0]?.price ?? 0
                // 지금 가격이 선 위면 초록, 아래면 빨강. 다른 종목은 실시간 가격을 모르니 기본색.
                const up = d.symbol !== symbol || livePrice === null || livePrice >= price
                const color = up ? 'var(--tv-up)' : 'var(--tv-down)'
                return (
                  <li key={d.id} className={rowClass(Boolean(d.fired))} onClick={onPickSymbol && (() => onPickSymbol(d.symbol))}>
                    <span className="aw-dir" style={{ color }}>
                      <ToolIcon name="horizontal" size={18} />
                    </span>
                    <div className="aw-main">
                      <span className="aw-sym">{displaySymbol(d.symbol, symbols)}</span>
                      <span className="aw-cond">{`${fmtAlertPrice(price, priceDecimals(d.symbol, symbols))} 교차`}</span>
                    </div>
                    <span className={`aw-status${d.fired ? ' fired' : ''}`}>{d.fired ? '발동됨' : '활성'}</span>
                    {d.fired && onReactivateLine && reactivateButton('수평선 알림 다시 켜기', () => onReactivateLine(d.id))}
                    <button
                      type="button"
                      className="tv-icon-btn aw-remove"
                      aria-label="수평선 알림 끄기"
                      onClick={rowButton(() => onDisableLineAlert(d.id))}
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
      {onUpdateAlert && (
        <CreateAlertDialog
          open={editing !== null}
          onClose={() => setEditing(null)}
          symbol={editing?.symbol ?? symbol}
          // 실시간 가격은 지금 차트 종목 것뿐 — 다른 종목 알림은 모른다고 두면 교차 방향을 첫 가격으로 정한다.
          livePrice={editing && editing.symbol === symbol ? livePrice : null}
          onCreate={onAdd}
          editing={editing}
          onUpdate={onUpdateAlert}
        />
      )}
    </section>
  )
}

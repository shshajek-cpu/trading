import { useState } from 'react'
import {
  describeLineAlert,
  describePriceAlert,
  isChannelKind,
  isExpired,
  REPEAT_LABELS,
  type AlertTiming,
  type PriceAlert,
  type PriceAlertInput,
} from '../../lib/alertRules'
import type { Drawing } from '../../lib/drawings'
import type { Interval } from '../../lib/market/types'
import type { IndicatorInstance } from '../../lib/indicatorConfig'
import { INTERVAL_INFO } from '../../lib/intervals'
import {
  describeIndicatorAlert,
  TRIGGER_LABELS,
  type IndicatorAlert,
  type NewIndicatorAlert,
} from '../../lib/indicatorAlerts'
import { useLiveStore } from '../../lib/liveStore'
import { alertSettings, setAlertSettings } from '../../lib/alertSettings'
import { alertLog, clearAlertLog } from '../../lib/alertLog'
import { primeAlertSound } from '../../lib/alertSound'
import { Icon } from '../Icon'
import { PushBox, type PushProps } from '../PushBox'
import { isIosSafari } from '../../hooks/usePushAlerts'
import { CreateAlertDialog } from '../CreateAlertDialog'
import { LineAlertDialog } from '../LineAlertDialog'
import { displaySymbol, priceDecimals, type SymbolInfo } from '../../lib/symbols'
import { ToolIcon, type IconName } from '../../chart/drawing/toolIcons'
import './widgets.css'

interface AlertsWidgetProps {
  symbol: string
  livePrice: number | null
  alerts: PriceAlert[]
  /** 알림이 켜진 그림(선·도형·수직선). */
  lineAlerts: Drawing[]
  symbols: SymbolInfo[]
  onAdd: (input: PriceAlertInput) => void
  /** 가격 알림을 고친다(연필 버튼). 없으면 편집 버튼을 두지 않는다. */
  onUpdateAlert?: (id: string, input: Omit<PriceAlertInput, 'symbol'>) => void
  onRemove: (id: string) => void
  /** 선 알림 끄기·다시 켜기·설정 저장. */
  onUpdateLine: (id: string, patch: Partial<Pick<Drawing, 'alert' | 'fired' | 'alertOpts'>>) => void
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
  /** panel = 데스크톱 오른쪽 위젯, page = 폰 앱의 "알림" 탭. */
  variant: 'panel' | 'page'
  /** 행을 누르면 그 종목을 차트에 띄운다(폰은 차트 탭으로 넘어간다). */
  onPickSymbol?: (symbol: string) => void
  /** 발동된 가격 알림을 다시 켠다. */
  onReactivateAlert?: (id: string) => void
}

function fmtAlertPrice(n: number, decimals: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const TIME_FMT = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

/** 행 셋째 줄 — 트리거·만료·메모. */
function timingNote(t: AlertTiming, message?: string): string {
  const parts: string[] = [REPEAT_LABELS[t.repeat ?? 'once']]
  if (t.expiresAt !== undefined) parts.push(`${TIME_FMT.format(t.expiresAt)} 만료`)
  if (message) parts.push(message)
  return parts.join(' · ')
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
  onUpdateLine,
  indicatorAlerts,
  onRemoveIndicatorAlert,
  interval,
  indicators,
  onAddIndicatorAlert,
  permission,
  onRequestPermission,
  push,
  variant,
  onPickSymbol,
  onReactivateAlert,
}: AlertsWidgetProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<PriceAlert | null>(null)
  const [editingLine, setEditingLine] = useState<Drawing | null>(null)
  const settings = useLiveStore(alertSettings)
  const log = useLiveStore(alertLog)
  const isPage = variant === 'page'
  const now = Date.now()
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

  /** 상태 글자: 만료됨 > 발동됨 > 활성. */
  const status = (on: boolean, expired: boolean) => (
    <span className={`aw-status${on && !expired ? '' : ' fired'}`}>{expired ? '만료됨' : on ? '활성' : '발동됨'}</span>
  )

  // 푸시가 켜져 있으면 서버도 감시한다(앱을 닫아도 옴).
  const reach = !push.supported ? '' : push.state === 'on' ? ' · 앱을 닫아도 푸시로 옴' : ' · 푸시를 켜면 앱을 닫아도 옴'

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

        <PushBox push={push} />

        <ul className="aw-rows">
          {alerts.map((a) => {
            const kind = a.kind ?? 'cross'
            const up = a.condition === 'above'
            const expired = isExpired(a, now)
            // 방향이 없는 조건(채널·아직 안 걸린 교차)은 기본색으로 둔다.
            const plain = a.pending || isChannelKind(kind)
            const color = plain ? 'var(--tv-text-dim)' : up ? 'var(--tv-up)' : 'var(--tv-down)'
            const dec = priceDecimals(a.symbol, symbols)
            // 알림 창이 채운 자동 문구(조건 설명 그대로)는 둘째 줄과 같으니 보이지 않는다 — 직접 쓴 메모만 보인다.
            const auto = `${displaySymbol(a.symbol, symbols)} ${describePriceAlert(a, (p) => String(Number(p.toFixed(dec))))}`
            return (
              <li key={a.id} className={rowClass(!a.active || expired)} onClick={onPickSymbol && (() => onPickSymbol(a.symbol))}>
                <span className="aw-dir" style={{ color }}>
                  {isChannelKind(kind) ? <ToolIcon name="parallelChannel" size={18} /> : <Icon name={up ? 'arrowUp' : 'arrowDown'} size={15} />}
                </span>
                <div className="aw-main">
                  <span className="aw-sym">{displaySymbol(a.symbol, symbols)}</span>
                  <span className="aw-cond">{describePriceAlert(a, (p) => fmtAlertPrice(p, dec))}</span>
                  <span className="aw-msg">{timingNote(a, a.message === auto ? undefined : a.message)}</span>
                </div>
                {status(a.active, expired)}
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
            <p className="aw-section-title">{`지표 알림${reach || ' · 앱이 열려 있을 때'}`}</p>
            <ul className="aw-rows">
              {indicatorAlerts.map((a) => {
                const expired = a.expiresAt !== undefined && now >= a.expiresAt
                return (
                  <li key={a.id} className={rowClass(!a.active || expired)} onClick={onPickSymbol && (() => onPickSymbol(a.symbol))}>
                    <span className="aw-dir">
                      <ToolIcon name="indicator" size={18} />
                    </span>
                    <div className="aw-main">
                      <span className="aw-sym">
                        {displaySymbol(a.symbol, symbols)} · {INTERVAL_INFO[a.interval].short}
                      </span>
                      <span className="aw-cond">{describeIndicatorAlert(a)}</span>
                      <span className="aw-msg">
                        {TRIGGER_LABELS[a.trigger]}
                        {a.expiresAt !== undefined ? ` · ${TIME_FMT.format(a.expiresAt)} 만료` : ''}
                      </span>
                    </div>
                    {status(a.active, expired)}
                    <button
                      type="button"
                      className="tv-icon-btn aw-remove"
                      aria-label="지표 알림 지우기"
                      onClick={rowButton(() => onRemoveIndicatorAlert(a.id))}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {lineAlerts.length > 0 && (
          <div className="aw-section">
            <p className="aw-section-title">{`선 알림${reach}`}</p>
            <ul className="aw-rows">
              {lineAlerts.map((d) => {
                const price = d.points[0]?.price ?? 0
                const level = d.kind === 'horizontal' || d.kind === 'horizontalRay'
                // 수평선은 지금 가격이 선 위면 초록, 아래면 빨강. 다른 종목·다른 그림은 기본색.
                const color =
                  !level || d.symbol !== symbol || livePrice === null
                    ? 'var(--tv-text-dim)'
                    : livePrice >= price
                      ? 'var(--tv-up)'
                      : 'var(--tv-down)'
                const opts = d.alertOpts ?? {}
                const expired = isExpired(opts, now)
                const cond = level
                  ? `${fmtAlertPrice(price, priceDecimals(d.symbol, symbols))} 교차`
                  : describeLineAlert(d, d.alertOpts)
                return (
                  <li key={d.id} className={rowClass(d.fired || expired)} onClick={onPickSymbol && (() => onPickSymbol(d.symbol))}>
                    <span className="aw-dir" style={{ color }}>
                      <ToolIcon name={d.kind as IconName} size={18} />
                    </span>
                    <div className="aw-main">
                      <span className="aw-sym">{displaySymbol(d.symbol, symbols)}</span>
                      <span className="aw-cond">{cond}</span>
                      <span className="aw-msg">{timingNote(opts, opts.message)}</span>
                    </div>
                    {status(!d.fired, expired)}
                    {d.fired && reactivateButton('선 알림 다시 켜기', () => onUpdateLine(d.id, { alert: true, fired: false }))}
                    <button
                      type="button"
                      className="tv-icon-btn aw-remove"
                      aria-label="선 알림 설정"
                      onClick={rowButton(() => setEditingLine(d))}
                    >
                      <Icon name="pencil" size={15} />
                    </button>
                    <button
                      type="button"
                      className="tv-icon-btn aw-remove"
                      aria-label="선 알림 끄기"
                      onClick={rowButton(() => onUpdateLine(d.id, { alert: false }))}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="aw-section">
          <p className="aw-section-title">알림 설정</p>
          <label className="aw-setting">
            <span>새 수평선에 알림 자동 켜기</span>
            <input
              className="tv-switch"
              type="checkbox"
              checked={settings.autoLineAlert}
              onChange={(e) => setAlertSettings({ autoLineAlert: e.target.checked })}
            />
          </label>
          <label className="aw-setting">
            <span>알림 소리</span>
            <input
              className="tv-switch"
              type="checkbox"
              checked={settings.sound}
              onChange={(e) => {
                // 이 누름(사용자 조작) 안에서 오디오를 깨워 둬야 나중에 소리가 난다.
                if (e.target.checked) primeAlertSound()
                setAlertSettings({ sound: e.target.checked })
              }}
            />
          </label>
        </div>

        <div className="aw-section">
          <p className="aw-section-title aw-log-head">
            <span>알림 기록</span>
            {log.length > 0 && (
              <button type="button" className="aw-reactivate" onClick={clearAlertLog}>
                지우기
              </button>
            )}
          </p>
          <ul className="aw-rows">
            {log.map((e) => (
              <li key={e.id} className={rowClass(false)} onClick={onPickSymbol && (() => onPickSymbol(e.symbol))}>
                <div className="aw-main">
                  <span className="aw-cond">{`${TIME_FMT.format(e.at)} · ${displaySymbol(e.symbol, symbols)}`}</span>
                  <span className="aw-log-msg">{e.message}</span>
                </div>
                <span className="aw-source">{e.source === 'app' ? '앱' : '서버'}</span>
              </li>
            ))}
            {log.length === 0 && <li className="aw-empty">아직 울린 알림이 없습니다.</li>}
          </ul>
        </div>
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
      <LineAlertDialog drawing={editingLine} onClose={() => setEditingLine(null)} onSave={onUpdateLine} />
    </section>
  )
}

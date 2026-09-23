import { useCallback, useEffect, useState } from 'react'
import { MobileShell } from './MobileShell'
import { ChartScreen } from './ChartScreen'
import { MarketsScreen } from './MarketsScreen'
import { AlertsScreen } from './AlertsScreen'
import { MoreScreen } from './MoreScreen'
import { SubPage } from './SubPage'
import { useBackClose } from '../../hooks/useBackClose'
import {
  MOBILE_PAGE_MAP,
  type MobilePage,
  type MobileTab,
} from '../../lib/mobileNav'
import type { PriceAlert } from '../../hooks/usePriceAlerts'
import type { Drawing } from '../../lib/drawings'
import type { Interval, Ticker24h } from '../../lib/binance'
import type { WatchRow } from '../../hooks/useWatchlist'

interface MobileAppProps {
  symbol: string
  interval: Interval
  onIntervalChange: (iv: Interval) => void
  onSymbolChange: (symbol: string) => void
  ticker: Ticker24h | null
  livePrice: number | null

  favorites: string[]
  watchRows: Record<string, WatchRow>
  allSymbols: string[]
  onToggleFavorite: (symbol: string) => void

  alerts: PriceAlert[]
  drawings: Drawing[]
  onRemoveAlert: (id: string) => void
  onRemoveDrawing: (id: string) => void
  onToggleDrawingAlert: (id: string, on: boolean) => void
  alertCount: number

  drawMode: boolean
  onToggleDraw: () => void
  canUndo: boolean
  onUndo: () => void

  install: {
    canShow: boolean
    ios: boolean
    installable: boolean
    install: () => void
  }

  /** 차트 본체 — 부모가 만든 것을 그대로 끼운다. */
  chart: React.ReactNode
  /** 상세 페이지 내용. 부모가 기존 패널을 그대로 넘긴다. */
  renderPage: (page: MobilePage) => React.ReactNode
  /** 알림 화면 위쪽에 붙일 것(백그라운드 알림 안내 + 추가 폼). */
  alertsHeader?: React.ReactNode
  /** 알림 추가 폼. 저장하면 onDone 을 불러 화면을 닫는다. */
  renderAlertForm: (onDone: () => void) => React.ReactNode
}

/**
 * 폰 전용 앱.
 *
 * 데스크톱과 상태(차트·지표·알림)는 그대로 나눠 쓰고 화면 구조만 다르게 간다.
 * 폰은 넓이가 없으니 '한 화면에 한 가지 일' 원칙으로 탭을 나누고,
 * 자주 쓰지 않는 것은 더보기 아래로 한 겹 내린다.
 */
export function MobileApp({
  symbol,
  interval,
  onIntervalChange,
  onSymbolChange,
  ticker,
  livePrice,
  favorites,
  watchRows,
  allSymbols,
  onToggleFavorite,
  alerts,
  drawings,
  onRemoveAlert,
  onRemoveDrawing,
  onToggleDrawingAlert,
  alertCount,
  drawMode,
  onToggleDraw,
  canUndo,
  onUndo,
  install,
  chart,
  renderPage,
  alertsHeader,
  renderAlertForm,
}: MobileAppProps) {
  const [tab, setTab] = useState<MobileTab>('chart')
  const [page, setPage] = useState<MobilePage | null>(null)
  /** 알림 추가 폼을 펼쳤는지. */
  const [addingAlert, setAddingAlert] = useState(false)

  const closePage = useCallback(() => setPage(null), [])
  const closeAdd = useCallback(() => setAddingAlert(false), [])

  // 기기 뒤로가기로 상세 페이지부터 닫는다 — 앱의 기본 동작.
  useBackClose(page !== null, closePage)
  useBackClose(addingAlert, closeAdd)

  // 탭을 옮기면 열려 있던 상세는 닫는다.
  useEffect(() => {
    setPage(null)
  }, [tab])

  const goChart = useCallback(
    (s: string) => {
      onSymbolChange(s)
      setTab('chart')
    },
    [onSymbolChange],
  )

  const meta = page ? MOBILE_PAGE_MAP[page] : null

  return (
    <MobileShell
      tab={tab}
      onTabChange={setTab}
      alertCount={alertCount}
      pageOpen={page !== null || addingAlert}
    >
      {/* 차트는 항상 살려 둔다 — 탭을 옮길 때마다 다시 받으면 느리고 깜빡인다. */}
      <div className="screen-slot" hidden={tab !== 'chart'}>
        <ChartScreen
          symbol={symbol}
          interval={interval}
          onIntervalChange={onIntervalChange}
          onPickSymbol={() => setTab('markets')}
          ticker={ticker}
          livePrice={livePrice}
          favorite={favorites.includes(symbol)}
          onToggleFavorite={() => onToggleFavorite(symbol)}
          drawMode={drawMode}
          onToggleDraw={onToggleDraw}
          canUndo={canUndo}
          onUndo={onUndo}
          onOpenIndicators={() => {
            setTab('more')
            setPage('indicators')
          }}
        >
          {chart}
        </ChartScreen>
      </div>

      {tab === 'markets' && (
        <MarketsScreen
          favorites={favorites}
          rows={watchRows}
          allSymbols={allSymbols}
          current={symbol}
          onPick={goChart}
          onToggleFavorite={onToggleFavorite}
        />
      )}

      {tab === 'alerts' && (
        <AlertsScreen
          alerts={alerts}
          drawings={drawings}
          onRemoveAlert={onRemoveAlert}
          onRemoveDrawing={onRemoveDrawing}
          onToggleDrawingAlert={onToggleDrawingAlert}
          onGoSymbol={goChart}
          onAdd={() => setAddingAlert(true)}
        >
          {alertsHeader}
        </AlertsScreen>
      )}

      {tab === 'more' && (
        <MoreScreen
          onOpen={setPage}
          showInstall={install.canShow}
          installable={install.installable}
          ios={install.ios}
          onInstall={install.install}
        />
      )}

      {/* 상세 페이지 — 탭 위로 밀려 들어온다. */}
      {meta && (
        <SubPage title={meta.label} hint={meta.hint} onBack={closePage}>
          {renderPage(meta.id)}
        </SubPage>
      )}

      {addingAlert && (
        <SubPage
          title="가격 알림 추가"
          hint={`${symbol.replace('USDT', '')} 가 목표에 닿으면 알려 드립니다`}
          onBack={closeAdd}
        >
          {renderAlertForm(closeAdd)}
        </SubPage>
      )}
    </MobileShell>
  )
}

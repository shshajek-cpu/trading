import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'

import { ChartCell } from './components/ChartCell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TopToolbar } from './components/TopToolbar'
import { BottomBar } from './components/BottomBar'
import { WidgetBar } from './components/WidgetBar'
import type { WidgetId } from './lib/widgets'
import { MainMenuDrawer } from './components/MainMenuDrawer'
import { SettingsDialog } from './components/SettingsDialog'
import { IndicatorSettingsDialog } from './components/IndicatorSettingsDialog'
import { TooltipLayer } from './components/ui/TooltipLayer'
import { tip } from './lib/tooltip'
import { QuickSearchDialog } from './components/QuickSearchDialog'
import { QuickIntervalBox } from './components/QuickIntervalBox'
import { Toasts, type ToastItem } from './components/Toasts'
import { Icon, type IconName } from './components/Icon'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { ContextMenu, type MenuEntry } from './components/ContextMenu'
import { GoToDateDialog } from './components/GoToDateDialog'
import { ToolIcon } from './chart/drawing/toolIcons'
import { cloneOffset } from './chart/drawing/builders'
import { copyDrawing, hasCopiedDrawing, pasteDrawing } from './chart/drawing/clipboard'
import { formatPrice } from './chart/format'

import { DrawingToolbar } from './components/DrawingToolbar'
import { IndicatorTemplatesMenu } from './components/IndicatorTemplatesMenu'
import { MobileShell, type MobileSheet } from './components/mobile/MobileShell'
import { MobileMenuPage } from './components/mobile/MobileMenuPage'
import type { MobileTab } from './components/mobile/MobileBars'
import { ObjectTree } from './components/ObjectTree'
import { IndicatorsDialog } from './components/IndicatorsDialog'
import { SymbolSearchDialog } from './components/SymbolSearchDialog'
import { CreateAlertDialog } from './components/CreateAlertDialog'
import { WatchlistWidget } from './components/widgets/WatchlistWidget'
import { SymbolDetails } from './components/widgets/SymbolDetails'
import { AlertsWidget } from './components/widgets/AlertsWidget'

import { SyncPanel } from './components/SyncPanel'
import { PinPanel } from './components/PinPanel'
import { DiscoverPanel } from './components/DiscoverPanel'
import { MtfPanel } from './components/MtfPanel'
import { OrderPanel, type OrderDraft } from './components/trade/OrderPanel'
import { TradingPanel } from './components/trade/TradingPanel'
import { MobileTrade } from './components/trade/MobileTrade'

import { usePriceAlerts, type PriceAlert, type AlertCondition } from './hooks/usePriceAlerts'
import { useIndicatorAlerts } from './hooks/useIndicatorAlerts'
import {
  describeIndicatorAlert,
  formatAlertValue,
  type IndicatorAlert,
  type NewIndicatorAlert,
} from './lib/indicatorAlerts'
import { useNotifications } from './hooks/useNotifications'
import { useSymbols } from './hooks/useSymbols'
import { usePipWindow } from './hooks/usePipWindow'
import { useDrawings } from './hooks/useDrawings'
import { useIsMobile } from './hooks/useIsMobile'
import { useInstallPrompt } from './hooks/useInstallPrompt'
import { useSync } from './hooks/useSync'
import { usePushAlerts, type LineWatch } from './hooks/usePushAlerts'
import { useMiniTickers } from './hooks/useMiniTickers'
import { useBackClose } from './hooks/useBackClose'
import { useWatchlist } from './hooks/useWatchlist'
import { usePins } from './hooks/usePins'
import { useUiPrefs } from './hooks/useUiPrefs'
import { useFullscreen } from './hooks/useFullscreen'
import { useShortcuts } from './hooks/useShortcuts'
import { useShortcutBindings } from './hooks/useShortcutBindings'
import { usePaperTrading } from './hooks/usePaperTrading'
import { PaperContext } from './lib/paper/context'

import {
  clampSplit,
  DEFAULT_LAYOUT,
  layoutSync,
  loadLayout,
  saveLayout,
  type CellConfig,
  type LayoutMode,
  type LayoutState,
  type LayoutSyncKey,
} from './lib/layoutConfig'
import {
  createIndicator,
  loadIndicators,
  saveIndicators,
  indicatorTitle,
  type IndicatorInstance,
  type IndicatorKind,
} from './lib/indicatorConfig'
import {
  legendShown,
  loadChartSettings,
  saveChartSettings,
  toggleLegend,
  type ChartSettings,
} from './lib/chartSettings'
import { describeSymbol, displaySymbol, priceDecimals } from './lib/symbols'
import { defaultStyle, type Drawing, type DrawingTool, type MagnetMode, type NewDrawing } from './lib/drawings'
import type { PinSide } from './lib/pins'
import type { FeatureSet } from './lib/features'
import { getChart } from './lib/chartRegistry'
import { SCALE_MODES, type ChartType, type ScaleMode } from './lib/chartTypes'
import type { Interval } from './lib/binance'
import type { ChartMenuRequest } from './lib/chartMenu'
import { INTERVAL_SECONDS } from './lib/intervals'
import { TOOL_SHORTCUTS, type ShortcutId } from './lib/shortcuts'

const TOAST_MS = 6000
/** 최대화 중 가린 칸. 언마운트하지 않아야 되돌렸을 때 보던 위치·불러온 옛 봉·리플레이가 그대로 남는다. */
const HIDDEN_CELL: React.CSSProperties = { display: 'none' }
const COMPARE_SCALE_MSG = '비교 중에는 퍼센트 눈금만 쓸 수 있습니다'
/** 바이낸스 선물 심볼 모양 — 주소(?symbol=)·알림 클릭으로 들어온 값을 거른다. */
const SYMBOL_RE = /^[A-Z0-9]{2,30}$/

/** 지운 지표를 원래 순서 자리로 되돌린다. 그사이 바꾼 설정·새로 더한 지표는 그대로 둔다. */
function restoreIndicators(
  cur: IndicatorInstance[],
  before: IndicatorInstance[],
  removed: IndicatorInstance[],
): IndicatorInstance[] {
  const now = new Map(cur.map((i) => [i.id, i]))
  const back = new Set(removed.filter((i) => !now.has(i.id)).map((i) => i.id))
  if (back.size === 0) return cur
  const known = new Set(before.map((i) => i.id))
  return [
    ...before.filter((i) => now.has(i.id) || back.has(i.id)).map((i) => now.get(i.id) ?? i),
    ...cur.filter((i) => !known.has(i.id)),
  ]
}

function App() {
  // ── persisted core state ──────────────────────────────────────────
  const [layoutState, setLayoutState] = useState<LayoutState>(loadLayout)
  const [indicators, setIndicators] = useState<IndicatorInstance[]>(loadIndicators)
  const [settings, setSettings] = useState<ChartSettings>(loadChartSettings)
  const { prefs, patch: patchPrefs, toggleFavorite } = useUiPrefs()
  const shortcutKeys = useShortcutBindings()

  // 다른 탭이 저장한 값을 받아 온 상태는 도로 저장하지 않는다 — 같은 값을 또 쓰고 동기화 올리기만 한 번 더 예약된다.
  const adopted = useRef(new WeakSet<object>())
  useEffect(() => {
    if (!adopted.current.has(layoutState)) saveLayout(layoutState)
  }, [layoutState])
  useEffect(() => {
    if (!adopted.current.has(indicators)) saveIndicators(indicators)
  }, [indicators])
  useEffect(() => {
    if (!adopted.current.has(settings)) saveChartSettings(settings)
    const root = document.documentElement
    root.dataset.theme = settings.theme
    // 폰 상태 표시줄·주소창 색을 앱 배경에 맞춘다(첫 화면은 index.html 이 저장된 테마로 먼저 맞춘다).
    const bg = getComputedStyle(root).getPropertyValue('--tv-bg').trim()
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
    // iOS 는 앱을 켤 때만 읽는다 — 다음 실행부터 라이트는 검은 글자 막대, 다크는 앱 위에 흰 글자.
    document
      .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute('content', settings.theme === 'light' ? 'default' : 'black-translucent')
  }, [settings])

  // 다른 탭(설치 앱 + 브라우저 탭 등)이 레이아웃·지표·차트 설정을 바꾸면 받아 온다. 안 받으면 이 탭이 다음에 무엇이든
  // 바꿀 때 옛 값을 통째로 저장하고 동기화 서버에도 올려, 그쪽 변경(내려받은 설정 포함)을 지운다.
  useEffect(() => {
    const take = <T extends object>(next: T, set: React.Dispatch<React.SetStateAction<T>>) => {
      set((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev
        adopted.current.add(next)
        return next
      })
    }
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return
      const key = e.key
      // 다른 탭에서 그림을 끌어 옮기는 동안에는 프레임마다 이벤트가 온다 — 이 셋이 아니면 읽지 않는다.
      if (key === null || key.startsWith('trading.layout')) take(loadLayout(), setLayoutState)
      if (key === null || key.startsWith('trading.indicators.')) take(loadIndicators(), setIndicators)
      if (key === null || key.startsWith('trading.chartSettings')) take(loadChartSettings(), setSettings)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ── toasts ────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])
  /** 토스트를 띄운다. action 이 있으면 '되돌리기' 같은 버튼이 붙는다. ms 가 0 이면 닫을 때까지 남는다. */
  const pushToast = useCallback(
    (message: string, action?: ToastItem['action'], ms = TOAST_MS) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((prev) => [...prev, action ? { id, message, action } : { id, message }])
      if (ms > 0) window.setTimeout(() => dismissToast(id), ms)
    },
    [dismissToast],
  )

  // ── transient shell state ─────────────────────────────────────────
  const [tool, setTool] = useState<DrawingTool>('cross')
  /** 리플레이 중인 칸. 시작한 칸에 머문다 — 다른 칸을 눌러 활성이 바뀌어도 옮겨 가지 않는다. */
  const [replayCell, setReplayCell] = useState<number | null>(null)
  /** 마지막으로 받은 활성 종목 가격. 종목을 함께 들고 있어 종목이 바뀌면 바로 무효가 된다. */
  const [live, setLive] = useState<{ symbol: string; price: number } | null>(null)
  const [liveFeatures, setLiveFeatures] = useState<FeatureSet | null>(null)
  const [pinMode, setPinMode] = useState(false)
  const [pinSide, setPinSide] = useState<PinSide>('long')

  // dialogs / popovers / overlays
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false)
  const [symbolSearchMode, setSymbolSearchMode] = useState<'search' | 'compare'>('search')
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('')
  const [indicatorsOpen, setIndicatorsOpen] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [ivSeed, setIvSeed] = useState<string | null>(null)
  const [goToOpen, setGoToOpen] = useState(false)
  /** 우클릭 "…에 알림 추가"가 정한 가격. 단축키·툴바로 열면 null(현재가). */
  const [alertPrice, setAlertPrice] = useState<number | null>(null)
  /** 범례 🔔 로 열면 그 지표를 미리 고른다. */
  const [alertIndicatorId, setAlertIndicatorId] = useState<string | null>(null)
  /** 설정 창을 연 지표(범례 ⚙·지표 이름 두 번 누르기·객체 트리). */
  const [editIndicatorId, setEditIndicatorId] = useState<string | null>(null)
  const [chartMenu, setChartMenu] = useState<(ChartMenuRequest & { cellIndex: number }) | null>(null)
  /** 칸별 "시간 기준 세로 커서 고정" 시각. */
  const [cursorLocks, setCursorLocks] = useState<Record<number, number | null>>({})
  /** 분할 화면에서 활성 차트만 크게(Alt+Enter). */
  const [maximized, setMaximized] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // 오른쪽 위젯 페이지는 접힌 채로 시작한다(차트를 넓게). 탭을 누르면 펼친다.
  const [widgetOpen, setWidgetOpen] = useState<WidgetId | null>(null)
  /** 폰 앱: 아래 탭과 열린 아래 시트. */
  const [mobileTab, setMobileTab] = useState<MobileTab>('chart')
  const [mobileSheet, setMobileSheet] = useState<MobileSheet | null>(null)
  const [saved, setSaved] = useState(false)
  /** 객체 트리에서 누른 그림 — 그 칸의 차트가 선택한다. nonce 가 바뀔 때마다 한 번. */
  const [drawingSelect, setDrawingSelect] = useState<{ cell: number; req: { id: string; nonce: number } } | null>(null)

  // ── data hooks ────────────────────────────────────────────────────
  const symbols = useSymbols()
  const { notify, permission, requestPermission } = useNotifications()
  const isMobile = useIsMobile()
  // 폰↔데스크톱 화면이 바뀌면(회전·창 크기) 한쪽 전용 겹침은 닫는다. 남겨 두면 되돌아올 때 저절로 다시 뜨거나
  // 데스크톱 서랍이 폰 화면 위에 남는다.
  useEffect(() => {
    setMobileSheet(null)
    setMenuOpen(false)
  }, [isMobile])
  const fullscreen = useFullscreen()
  const pip = usePipWindow()
  const install = useInstallPrompt()
  const watchlist = useWatchlist()
  const pinStore = usePins()
  const sync = useSync({ onNotice: pushToast })

  // 칸마다 그 종목·주기의 핀. 렌더마다 새 배열을 넘기면 차트가 초당 몇 번씩 마커를 다시 건다.
  const pinsFor = useMemo(() => {
    const cache = new Map<string, typeof pinStore.pins>()
    return (symbol: string, interval: string) => {
      const key = `${symbol}|${interval}`
      let list = cache.get(key)
      if (!list) {
        list = pinStore.pins.filter((p) => p.symbol === symbol && p.interval === interval)
        cache.set(key, list)
      }
      return list
    }
  }, [pinStore.pins])

  const { layout, active, cells, splitCol, splitRow } = layoutState
  const activeCell = cells[active] ?? cells[0]
  const activeSymbol = activeCell.symbol
  const activeSymbolRef = useRef(activeSymbol)
  activeSymbolRef.current = activeSymbol
  // 종목을 바꾸면 새 종목의 첫 틱 전까지는 가격을 모른다 — 옛 종목 가격을 알림 창·알림 위젯에 쓰지 않는다.
  const livePrice = live && live.symbol === activeSymbol ? live.price : null
  // Alt+Enter 로 최대화하면 분할 화면에서도 활성 칸 하나만 보인다(나머지 칸은 가린 채 마운트해 둔다).
  const maximizedNow = maximized && !isMobile && layout > 1
  /** 지금 눈에 보이는 칸의 종목들. */
  const shownSymbols = isMobile || maximizedNow ? [activeSymbol] : cells.slice(0, layout).map((c) => c.symbol)
  /** 실시간 틱을 받는 칸(가린 칸 포함)의 종목들. PiP 는 활성 종목이라 여기에 들어 있다. */
  const feedKey = (isMobile ? [activeSymbol] : cells.slice(0, layout).map((c) => c.symbol)).join(',')

  // 모의 선물거래 — 계좌는 동기화 코드로 기기끼리 공유한다(D1). 주문창·거래 패널·차트 선이 PaperContext 로 읽는다.
  const paperName = useCallback((s: string) => displaySymbol(s, symbols), [symbols])
  const paper = usePaperTrading({ code: sync.code, symbols, notify, toast: pushToast, displayName: paperName })
  /** 차트 우클릭 「여기에 지정가 주문」이 주문창에 채울 가격. nonce 가 바뀔 때마다 한 번 반영된다. */
  const [tradeDraft, setTradeDraft] = useState<OrderDraft | null>(null)

  // price alerts
  const handleTrigger = useCallback(
    (alert: PriceAlert, price: number) => {
      const custom = (alert as PriceAlert & { message?: string }).message
      const label = alert.condition === 'above' ? '이상' : '이하'
      const message = custom || `${alert.symbol} ${alert.price} ${label} 도달 (현재 ${price})`
      notify('가격 알림', message, `price-${alert.id}`)
      pushToast(message)
    },
    [notify, pushToast],
  )
  const {
    alerts,
    addAlert,
    removeAlert,
    checkPrice,
    markFired,
    setActive: setAlertActive,
  } = usePriceAlerts(handleTrigger)

  // indicator alerts (브라우저에서 지표 값을 계산해 판정한다)
  const handleIndicatorFire = useCallback(
    (alert: IndicatorAlert, value: number) => {
      const message =
        alert.message ||
        `${alert.symbol} ${alert.interval} ${describeIndicatorAlert(alert)} (현재 ${formatAlertValue(value)})`
      notify('지표 알림', message, `ind-${alert.id}`)
      pushToast(message)
    },
    [notify, pushToast],
  )
  const indicatorAlerts = useIndicatorAlerts(handleIndicatorFire)

  // 알림을 만드는 순간(사용자 조작)에 시스템 알림 권한을 묻는다 — 브라우저는 조작 밖의 권한 요청을 막는다.
  const askNotifyPermission = useCallback(() => {
    if (permission === 'default') void requestPermission()
  }, [permission, requestPermission])
  const createPriceAlert = useCallback(
    (symbol: string, condition: AlertCondition, price: number, message?: string) => {
      askNotifyPermission()
      addAlert(symbol, condition, price, message)
    },
    [askNotifyPermission, addAlert],
  )
  const createIndicatorAlert = useCallback(
    (alert: NewIndicatorAlert) => {
      askNotifyPermission()
      indicatorAlerts.addAlert(alert)
    },
    [askNotifyPermission, indicatorAlerts],
  )

  // line-cross alerts
  const handleCross = useCallback(
    (drawing: Drawing, price: number) => {
      const line = drawing.points[0]?.price
      const message = `${drawing.symbol} 수평선 ${line ?? ''} 통과 (현재 ${price})`
      notify('선 통과 알림', message, `line-${drawing.id}`)
      pushToast(message)
    },
    [notify, pushToast],
  )
  const {
    drawings,
    addDrawing,
    updateDrawing,
    removeDrawing,
    removeAll,
    restoreDrawings,
    reorderDrawing,
    checkPrice: checkDrawings,
    markFired: markLinesFired,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDrawings(handleCross)

  // 앱을 닫아도 울리게 서버(푸시 워커)가 지켜볼 수평선 알림. 그림을 끌 때마다 새 배열을 주지 않게 내용이 같으면 그대로 둔다.
  const lineWatchList = drawings.filter(
    (d) => d.kind === 'horizontal' && d.alert && !d.fired && Number.isFinite(d.points[0]?.price),
  )
  const lineWatchKey = lineWatchList.map((d) => `${d.id}|${d.symbol}|${d.points[0].price}`).join(',')
  const lineWatches = useMemo<LineWatch[]>(
    () => lineWatchList.map((d) => ({ id: d.id, symbol: d.symbol, price: d.points[0].price })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineWatchKey],
  )
  const push = usePushAlerts(sync.code, alerts, markFired, lineWatches, markLinesFired)

  const handlePrice = useCallback(
    (symbol: string, price: number) => {
      checkPrice(symbol, price)
      checkDrawings(symbol, price)
      if (symbol === activeSymbolRef.current) {
        setLive((prev) => (prev && prev.symbol === symbol && prev.price === price ? prev : { symbol, price }))
      }
    },
    [checkPrice, checkDrawings],
  )

  // 화면(칸·PiP)에 없는 종목의 가격 알림·수평선 알림도 울려야 한다 — 그 종목만 미니 티커로 따로 받아 같은 판정에 흘린다.
  // 칸에 있는 종목은 차트가 이미 틱을 준다(최대화로 가린 칸도 마운트돼 있어 계속 받는다).
  const alertOnlySymbols = useMemo(() => {
    const fed = new Set(feedKey.split(','))
    const out = new Set<string>()
    for (const a of alerts) if (a.active && !fed.has(a.symbol)) out.add(a.symbol)
    for (const d of lineWatchList) if (!fed.has(d.symbol)) out.add(d.symbol)
    return [...out]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, lineWatchKey, feedKey])
  useMiniTickers(alertOnlySymbols, (t) => handlePrice(t.symbol, t.lastPrice))

  // ── cell mutation helpers ─────────────────────────────────────────
  const setCellField = useCallback((index: number, field: Partial<CellConfig>) => {
    setLayoutState((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) => (i === index ? { ...c, ...field } : c)),
    }))
  }, [])

  /** 활성 칸의 종목을 바꾼다. 심볼 동기화가 켜져 있으면 숨은 칸까지 모두 같이 바꾼다. */
  const setCellSymbol = useCallback((symbol: string) => {
    setLayoutState((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) =>
        (prev.syncSymbol || i === prev.active) && c.symbol !== symbol ? { ...c, symbol } : c,
      ),
    }))
  }, [])

  // 동기화가 켜져 있으면 숨은 칸까지 모두 바꿔, 분할을 늘려도 같은 종류로 보이게 한다.
  const setChartType = useCallback((t: ChartType) => {
    setLayoutState((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) => (prev.syncChartType || i === prev.active ? { ...c, chartType: t } : c)),
    }))
  }, [])

  // 켜는 순간 활성 칸 값으로 맞춘다 — 켰는데 칸마다 다르면 동기화가 된 건지 알 수 없다.
  const setLayoutSync = useCallback((key: LayoutSyncKey, on: boolean) => {
    setLayoutState((prev) => {
      const src = prev.cells[prev.active]
      if (key === 'crosshair') return { ...prev, syncCrosshair: on }
      if (key === 'symbol') {
        return {
          ...prev,
          syncSymbol: on,
          cells: on && src ? prev.cells.map((c) => (c.symbol === src.symbol ? c : { ...c, symbol: src.symbol })) : prev.cells,
        }
      }
      return {
        ...prev,
        syncChartType: on,
        cells: on && src ? prev.cells.map((c) => ({ ...c, chartType: src.chartType })) : prev.cells,
      }
    })
  }, [])

  /** 비교 심볼을 바꾼다. 비교선이 있으면 차트가 % 눈금으로 그리므로 눈금 설정도 %로 맞춰 버튼 표시를 실제와 같게 한다. */
  const setCompare = useCallback(
    (index: number, compare: string[]) => {
      setCellField(index, compare.length > 0 ? { compare, scaleMode: 'percent' } : { compare })
    },
    [setCellField],
  )

  const setScaleMode = (index: number, mode: ScaleMode) => {
    const cell = cells[index]
    if (!cell) return
    if (cell.compare.length > 0 && mode !== 'percent') {
      pushToast(COMPARE_SCALE_MSG)
      return
    }
    setCellField(index, { scaleMode: mode })
  }

  // Alt+L / Alt+P: 같은 눈금을 다시 누르면 일반으로 돌아간다.
  const toggleScaleMode = (index: number, mode: ScaleMode) => {
    const cell = cells[index]
    if (cell) setScaleMode(index, cell.scaleMode === mode ? 'normal' : mode)
  }

  const toggleInvert = useCallback((index: number) => {
    setLayoutState((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) => (i === index ? { ...c, invertScale: !c.invertScale } : c)),
    }))
  }, [])

  const setActive = useCallback((index: number) => {
    setLayoutState((prev) => (prev.active === index ? prev : { ...prev, active: index }))
  }, [])

  const setLayout = useCallback((mode: LayoutMode) => {
    setMaximized(false)
    // 리플레이하던 칸이 사라지면 리플레이도 끝난다.
    setReplayCell((c) => (c !== null && c >= mode ? null : c))
    setLayoutState((prev) => ({ ...prev, layout: mode, active: Math.min(prev.active, mode - 1) }))
  }, [])

  // 폰은 활성 칸 하나만 보이므로 버튼은 그 칸의 리플레이를 켜고 끈다.
  const replayOn = isMobile ? replayCell === active : replayCell !== null
  const toggleReplay = () => setReplayCell(replayOn ? null : active)

  // ── drawings / indicators (삭제는 '되돌리기' 토스트를 띄운다) ────────
  /** 새 그림. 모든 그림을 숨긴 채 그리면 숨김을 푼다(TradingView) — 안 그러면 놓는 순간 사라져 실패한 줄 안다. */
  const createDrawing = useCallback(
    (d: NewDrawing): string => {
      if (prefs.drawingsHidden) patchPrefs({ drawingsHidden: false })
      return addDrawing(d)
    },
    [prefs.drawingsHidden, patchPrefs, addDrawing],
  )

  const removeDrawingsOf = useCallback(
    (symbol: string) => {
      const removed = removeAll(symbol)
      if (removed.length === 0) return
      pushToast(`그림 ${removed.length}개를 삭제했습니다`, { label: '되돌리기', run: () => restoreDrawings(removed) })
    },
    [removeAll, restoreDrawings, pushToast],
  )

  // 되돌리기 이력은 종목 구분 없이 하나다 — 화면에 없는 종목의 그림만 바뀌었으면 알린다(안 알리면 아무 일도 없던 줄 안다).
  const reportHistory = (changed: string[], verb: string) => {
    if (changed.length === 0 || changed.some((s) => shownSymbols.includes(s))) return
    pushToast(`${changed.map((s) => displaySymbol(s, symbols)).join(', ')} 그림 ${verb}`)
  }
  const undoDrawing = () => reportHistory(undo(), '되돌림')
  const redoDrawing = () => reportHistory(redo(), '다시 실행')

  // 지표는 모든 칸이 함께 쓴다 — 지우면 모든 차트에서 한꺼번에 사라지므로 되돌릴 길을 준다.
  const indicatorsRef = useRef(indicators)
  indicatorsRef.current = indicators
  /** 지표 목록을 바꾼다. 지워진 것이 있으면 '되돌리기' 토스트를 띄운다. */
  const changeIndicators = useCallback(
    (next: IndicatorInstance[]) => {
      const prev = indicatorsRef.current
      indicatorsRef.current = next
      setIndicators(next)
      const kept = new Set(next.map((i) => i.id))
      const removed = prev.filter((i) => !kept.has(i.id))
      if (removed.length === 0) return
      pushToast(`지표 ${removed.length}개를 삭제했습니다`, {
        label: '되돌리기',
        run: () => setIndicators((cur) => restoreIndicators(cur, prev, removed)),
      })
    },
    [pushToast],
  )
  const applyIndicatorTemplate = useCallback(
    (next: IndicatorInstance[]) => {
      const prev = indicatorsRef.current
      indicatorsRef.current = next
      setIndicators(next)
      pushToast('지표 템플릿을 적용했습니다', { label: '되돌리기', run: () => setIndicators(prev) })
    },
    [pushToast],
  )
  /** 빠른 검색에서 지표 추가 — 지표 창과 같은 방식으로 만든다. */
  const addIndicator = useCallback(
    (kind: IndicatorKind) => {
      const cur = indicatorsRef.current
      changeIndicators([...cur, createIndicator(kind, cur)])
    },
    [changeIndicators],
  )

  const resetSplit = useCallback(() => {
    setLayoutState((prev) => ({ ...prev, splitCol: 0.5, splitRow: 0.5 }))
  }, [])

  const applyMtf = useCallback((intervals: Interval[]) => {
    setLayoutState((prev) => {
      const symbol = prev.cells[prev.active]?.symbol ?? DEFAULT_LAYOUT.cells[0].symbol
      return {
        ...prev,
        layout: 4,
        active: 0,
        cells: prev.cells.map((c, i) => (intervals[i] ? { ...c, symbol, interval: intervals[i] } : c)),
      }
    })
  }, [])

  // ── split drag ────────────────────────────────────────────────────
  const gridRef = useRef<HTMLElement>(null)
  const startSplitDrag = useCallback(
    (axis: 'col' | 'row') => (e: React.PointerEvent) => {
      e.preventDefault()
      const grid = gridRef.current
      if (!grid) return
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
      grid.classList.add('resizing')
      const move = (ev: PointerEvent) => {
        const r = grid.getBoundingClientRect()
        const ratio = axis === 'col' ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height
        setLayoutState((prev) => ({
          ...prev,
          [axis === 'col' ? 'splitCol' : 'splitRow']: clampSplit(ratio),
        }))
      }
      const up = () => {
        grid.classList.remove('resizing')
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
    },
    [],
  )

  // ── snapshot ──────────────────────────────────────────────────────
  const snapshotName = `${activeSymbol}_${cells[active]?.interval ?? ''}.png`
  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const snapshotDownload = () => {
    getChart(active)?.takeSnapshot().toBlob((blob) => {
      if (blob) downloadBlob(blob, snapshotName)
    })
  }

  // 폰: 공유 시트(카톡·사진 저장 등)로 보내고, 공유가 안 되는 브라우저는 파일로 받는다.
  const snapshotShare = () => {
    getChart(active)?.takeSnapshot().toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], snapshotName, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file], title: snapshotName }).catch(() => {
          /* 사용자가 취소 */
        })
        return
      }
      downloadBlob(blob, snapshotName)
    })
  }

  const snapshotCopy = useCallback(() => {
    const canvas = getChart(active)?.takeSnapshot()
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      navigator.clipboard
        .write([new ClipboardItem({ 'image/png': blob })])
        .then(() => pushToast('클립보드에 복사됨'))
        .catch(() => pushToast('클립보드 복사 실패'))
    })
  }, [active, pushToast])

  // ── save / sync ───────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!sync.code) {
      if (isMobile) setMobileSheet('sync')
      else setWidgetOpen('sync')
      return
    }
    // 서버 충돌 검사를 지키는 저장 — 다른 기기가 먼저 바꿨으면 덮어쓰지 않고 이유를 알린다.
    void sync.save().then((r) => {
      if (!r.ok) {
        pushToast(r.message)
        return
      }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    })
  }, [sync, isMobile, pushToast])

  const createSyncCode = useCallback(() => {
    const code = sync.createCode()
    pushToast(`동기화 코드 ${code} 를 만들었습니다`)
    return code
  }, [sync, pushToast])

  /** 알림을 눌러 들어온 종목(알림 목록·푸시 알림·주소 ?symbol=)을 활성 칸에 연다. 폰은 차트 탭으로 간다. */
  const showSymbol = useCallback(
    (symbol: string) => {
      setCellSymbol(symbol)
      if (isMobile) {
        setMobileSheet(null)
        setMobileTab('chart')
      }
    },
    [isMobile, setCellSymbol],
  )

  // 푸시 알림을 눌러 앱이 새로 열리면 주소에 ?symbol= 이 붙어 온다. 주소에서는 바로 지운다(새로고침·공유에 남지 않게).
  const [urlSymbol, setUrlSymbol] = useState(() => {
    const s = new URLSearchParams(window.location.search).get('symbol')?.toUpperCase() ?? ''
    return SYMBOL_RE.test(s) ? s : null
  })
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('symbol')) return
    url.searchParams.delete('symbol')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])
  // 종목 목록을 받은 뒤 확인한다 — 캐시가 없으면 처음에는 기본 한 종목뿐이다.
  useEffect(() => {
    if (!urlSymbol) return
    const known = symbols.some((i) => i.symbol === urlSymbol)
    if (!known && symbols.length <= 1) return
    setUrlSymbol(null)
    if (known) showSymbol(urlSymbol)
  }, [urlSymbol, symbols, showSymbol])

  // 앱이 열려 있을 때 푸시 알림을 누르면 서비스워커가 이 창에 종목을 보낸다.
  const symbolsRef = useRef(symbols)
  symbolsRef.current = symbols
  useEffect(() => {
    const sw = navigator.serviceWorker
    if (!sw) return
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown; symbol?: unknown } | null
      if (data?.type !== 'open-symbol' || typeof data.symbol !== 'string') return
      const symbol = data.symbol.toUpperCase()
      if (!SYMBOL_RE.test(symbol)) return
      const list = symbolsRef.current
      if (list.length > 1 && !list.some((i) => i.symbol === symbol)) return
      showSymbol(symbol)
    }
    sw.addEventListener('message', onMessage)
    return () => sw.removeEventListener('message', onMessage)
  }, [showSymbol])

  // 새 배포가 준비되면(main.tsx) 보던 화면을 갑자기 새로고침하지 않고 사용자가 고르게 한다.
  useEffect(() => {
    const onReady = () =>
      pushToast('새 버전이 준비됐습니다', { label: '새로고침', run: () => window.location.reload() }, 0)
    window.addEventListener('app-update-ready', onReady)
    return () => window.removeEventListener('app-update-ready', onReady)
  }, [pushToast])

  // 폰: 차트가 아닌 탭에서 뒤로가기를 누르면 앱을 나가지 않고 차트 탭으로 돌아온다.
  useBackClose(isMobile && mobileTab !== 'chart', () => setMobileTab('chart'))

  // ── date range ────────────────────────────────────────────────────
  const applyDateRange = useCallback(
    (interval: Interval, from: number, to: number) => {
      setCellField(active, { interval })
      // Data reloads on interval change; apply the range once bars are in.
      window.setTimeout(() => getChart(active)?.setVisibleRange(from, to), 500)
    },
    [active, setCellField],
  )

  // ── symbol search open helpers ────────────────────────────────────
  const openSymbolSearch = useCallback((query = '') => {
    setSymbolSearchMode('search')
    setSymbolSearchQuery(query)
    setSymbolSearchOpen(true)
  }, [])
  const openCompare = useCallback(() => {
    setSymbolSearchMode('compare')
    setSymbolSearchQuery('')
    setSymbolSearchOpen(true)
  }, [])

  // ── context-menu / shortcut helpers ───────────────────────────────
  const addToWatchlist = (symbol: string) => {
    const name = displaySymbol(symbol, symbols)
    if (watchlist.symbols.includes(symbol)) {
      pushToast(`이미 관심 목록에 있음: ${name}`)
      return
    }
    watchlist.add(symbol)
    pushToast(`관심 목록에 추가: ${name}`)
  }

  const toggleMaximize = () => {
    if (isMobile || layout === 1) return
    setMaximized((v) => !v)
  }

  const openAlertAt = (price: number | null) => {
    setAlertPrice(price)
    setAlertIndicatorId(null)
    setAlertOpen(true)
  }

  const openIndicatorAlert = (instanceId: string) => {
    setAlertPrice(null)
    setAlertIndicatorId(instanceId)
    setAlertOpen(true)
  }

  const copyText = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => pushToast(`복사됨: ${text}`))
      .catch(() => pushToast('클립보드 복사 실패'))
  }

  // ── shortcuts (사용자가 키를 바꿀 수 있다: 메뉴 → 키보드 단축키) ─────────
  const runShortcut = (id: ShortcutId) => {
    const drawingTool = TOOL_SHORTCUTS[id]
    if (drawingTool) {
      setTool(drawingTool)
      return
    }
    switch (id) {
      case 'resetView':
        return getChart(active)?.resetView()
      case 'createAlert':
        return openAlertAt(null)
      case 'snapshot':
        return snapshotDownload()
      case 'goToDate':
        return setGoToOpen(true)
      case 'invertScale':
        return toggleInvert(active)
      case 'toggleLog':
        return toggleScaleMode(active, 'log')
      case 'togglePercent':
        return toggleScaleMode(active, 'percent')
      case 'addToWatchlist':
        return addToWatchlist(activeSymbol)
      case 'toggleMaximize':
        return toggleMaximize()
      case 'quickSearch':
        return setQuickOpen(true)
      case 'openIndicators':
        return setIndicatorsOpen(true)
      case 'save':
        return handleSave()
      case 'undo':
        return undoDrawing()
      case 'redo':
        return redoDrawing()
      case 'zoomIn':
        return getChart(active)?.zoom(1)
      case 'zoomOut':
        return getChart(active)?.zoom(-1)
      case 'fullscreen':
        return void fullscreen.toggle()
      case 'toggleDrawingsHidden':
        return patchPrefs({ drawingsHidden: !prefs.drawingsHidden })
    }
  }
  useShortcuts(
    {
      run: runShortcut,
      onEscape: () => {
        setTool('cross')
        setQuickOpen(false)
        setMenuOpen(false)
        setIvSeed(null)
      },
      onSymbolChar: (ch) => openSymbolSearch(ch),
      onIntervalChar: (ch) => setIvSeed(ch),
      onScroll: (direction, far) => getChart(active)?.scrollBars(direction, far),
    },
    shortcutKeys.byCombo,
  )
  // 도구 단축키 → 왼쪽 툴바 표시용 라벨.
  const toolShortcuts: Partial<Record<DrawingTool, string>> = {}
  for (const [id, drawingTool] of Object.entries(TOOL_SHORTCUTS) as [ShortcutId, DrawingTool][]) {
    const label = shortcutKeys.label(id)
    if (label) toolShortcuts[drawingTool] = label
  }

  // ── widget bar tabs (desktop) ─────────────────────────────────────
  const toggleWidget = useCallback((id: WidgetId) => {
    setWidgetOpen((prev) => (prev === id ? null : id))
  }, [])

  const openWidgetFromMenu = useCallback(
    (id: WidgetId) => {
      if (!isMobile) {
        setWidgetOpen(id)
        return
      }
      // 폰: 관심 목록·알림·탐색은 탭, 나머지는 아래 시트. 멀티 타임프레임은 분할 화면용이라 폰에는 없다.
      if (id === 'watchlist') setMobileTab('watchlist')
      else if (id === 'alerts') setMobileTab('alerts')
      else if (id === 'discover') setMobileTab('explore')
      else if (id === 'objectTree' || id === 'pins' || id === 'sync' || id === 'trade') setMobileSheet(id)
    },
    [isMobile],
  )

  /** 우클릭한 칸을 활성으로 두고 주문창을 연다 — 그 칸 종목·가격을 지정가로 채운다. */
  const openTradeAt = useCallback(
    (index: number, symbol: string, price: number) => {
      setActive(index)
      setTradeDraft({ symbol, price, type: 'limit', nonce: Date.now() })
      if (isMobile) setMobileSheet('trade')
      else setWidgetOpen('trade')
    },
    [isMobile, setActive],
  )

  // ── right-click menus: 차트 영역 · 그림 · 가격축 · 시간축 (TradingView 항목 순서) ─
  const closeChartMenu = useCallback(() => setChartMenu(null), [])
  const chartMenuEntries = (menu: ChartMenuRequest & { cellIndex: number }): MenuEntry[] => {
    const index = menu.cellIndex
    const cell = cells[index]
    if (!cell) return []
    const handle = getChart(index)
    const target = menu.target
    const divider: MenuEntry = { type: 'divider' }
    const icon = (name: IconName) => <Icon name={name} size={18} />
    const key = shortcutKeys.label
    const item = (
      label: string,
      onSelect: () => void,
      extra: { icon?: React.ReactNode; shortcut?: string; checked?: boolean; disabled?: boolean } = {},
    ): MenuEntry => ({ type: 'item', label, onSelect, ...extra })

    switch (target.kind) {
      case 'priceScale':
        return [
          item('가격 축 초기화', () => setCellField(index, { autoScale: true }), { icon: icon('refresh') }),
          divider,
          item('자동 (화면에 맞춤)', () => setCellField(index, { autoScale: !cell.autoScale }), { checked: cell.autoScale }),
          item('눈금 반전', () => toggleInvert(index), { checked: cell.invertScale, shortcut: key('invertScale') }),
          divider,
          ...SCALE_MODES.map((m) =>
            item(`${m.label} 눈금`, () => setScaleMode(index, m.id), {
              checked: cell.scaleMode === m.id,
              shortcut: m.id === 'log' ? key('toggleLog') : m.id === 'percent' ? key('togglePercent') : undefined,
            }),
          ),
        ]
      case 'timeScale':
        return [
          item('시간 축 초기화', () => handle?.resetTimeScale(), { icon: icon('refresh') }),
          item('실시간으로 이동', () => handle?.scrollToRealtime(), { icon: icon('chevronRight') }),
          item('날짜로 이동…', () => setGoToOpen(true), { icon: icon('calendar'), shortcut: key('goToDate') }),
        ]
      case 'drawing': {
        const d = drawings.find((x) => x.id === target.drawingId)
        if (!d) return []
        // 잠근 그림(하나·전체 잠금)은 "실수로 지워지지 않게" 약속한 것이다 — 우클릭으로도 지우지 않는다.
        const lockedNow = d.locked || prefs.drawingsLocked
        return [
          ...(d.kind === 'horizontal'
            ? [
                item(
                  d.alert ? '알림 끄기' : '알림 켜기',
                  () => updateDrawing(d.id, d.alert ? { alert: false } : { alert: true, fired: false }),
                  { icon: icon(d.alert ? 'bellOff' : 'bell') },
                ),
              ]
            : []),
          item(
            '복제',
            () =>
              createDrawing({
                symbol: d.symbol,
                kind: d.kind,
                points: cloneOffset(d.points, cell.interval),
                style: { ...d.style },
                alert: false,
              }),
            { icon: <ToolIcon name="clone" size={18} /> },
          ),
          item('복사', () => copyDrawing(d), { icon: icon('copy'), shortcut: 'Ctrl+C' }),
          divider,
          item('맨 앞으로 가져오기', () => reorderDrawing(d.id, 'front'), { icon: icon('arrowUp') }),
          item('맨 뒤로 보내기', () => reorderDrawing(d.id, 'back'), { icon: icon('arrowDown') }),
          divider,
          item(d.locked ? '잠금 해제' : '잠금', () => updateDrawing(d.id, { locked: !d.locked }), {
            icon: icon(d.locked ? 'unlock' : 'lock'),
          }),
          item('숨기기', () => updateDrawing(d.id, { hidden: true }), { icon: icon('eyeOff') }),
          item('삭제', () => removeDrawing(d.id), {
            icon: icon('trash'),
            shortcut: lockedNow ? undefined : 'Delete',
            disabled: lockedNow,
          }),
        ]
      }
      case 'chart': {
        const dec = priceDecimals(cell.symbol, symbols)
        const name = displaySymbol(cell.symbol, symbols)
        const price = target.price !== null && Number.isFinite(target.price) ? Number(target.price.toFixed(dec)) : null
        const priceText = price !== null ? formatPrice(price, dec) : ''
        const lockedTime = cursorLocks[index] ?? null
        const drawingCount = drawings.filter((d) => d.symbol === cell.symbol).length
        const inList = watchlist.symbols.includes(cell.symbol)
        const time = target.time
        return [
          item('차트 보기 초기화', () => handle?.resetView(), { icon: icon('refresh'), shortcut: key('resetView') }),
          ...(price !== null
            ? [item(`가격 복사 ${priceText}`, () => copyText(price.toFixed(dec)), { icon: icon('copy') })]
            : []),
          item(
            '붙여넣기',
            () => {
              const next = pasteDrawing(cell.symbol, cell.interval)
              if (next) createDrawing(next)
            },
            { icon: icon('clipboard'), shortcut: 'Ctrl+V', disabled: !hasCopiedDrawing() },
          ),
          divider,
          ...(price !== null
            ? [
                item(`${name} ${priceText}에 알림 추가…`, () => openAlertAt(price), {
                  icon: icon('alarm'),
                  shortcut: key('createAlert'),
                }),
                item(`${priceText}에 지정가 주문…`, () => openTradeAt(index, cell.symbol, price), { icon: icon('trade') }),
                item(
                  `${priceText}에 수평선 그리기`,
                  () =>
                    createDrawing({
                      symbol: cell.symbol,
                      kind: 'horizontal',
                      points: [{ time: time ?? Math.floor(Date.now() / 1000), price }],
                      style: defaultStyle('horizontal'),
                    }),
                  { icon: <ToolIcon name="horizontal" size={18} /> },
                ),
              ]
            : []),
          item(inList ? `${name} 관심 목록에 있음` : `${name} 관심 목록에 추가`, () => addToWatchlist(cell.symbol), {
            icon: icon('plus'),
            shortcut: key('addToWatchlist'),
            disabled: inList,
          }),
          ...(lockedTime !== null || time !== null
            ? [
                item(
                  lockedTime !== null ? '세로 커서 고정 해제' : '시간 기준 세로 커서 고정',
                  () => setCursorLocks((prev) => ({ ...prev, [index]: lockedTime !== null ? null : time })),
                  { icon: icon(lockedTime !== null ? 'unlock' : 'lock') },
                ),
              ]
            : []),
          divider,
          item('날짜로 이동…', () => setGoToOpen(true), { icon: icon('calendar'), shortcut: key('goToDate') }),
          ...(!isMobile && layout > 1
            ? [
                item(maximized ? '차트 복원' : '차트 최대화', toggleMaximize, {
                  icon: icon(maximized ? (layout === 2 ? 'layout2' : 'layout4') : 'layout1'),
                  shortcut: key('toggleMaximize'),
                }),
              ]
            : []),
          item('객체 트리', () => openWidgetFromMenu('objectTree'), { icon: icon('objectTree') }),
          divider,
          item(
            prefs.drawingsHidden ? '그림 보이기' : '그림 숨기기',
            () => patchPrefs({ drawingsHidden: !prefs.drawingsHidden }),
            { icon: icon(prefs.drawingsHidden ? 'eye' : 'eyeOff'), shortcut: key('toggleDrawingsHidden') },
          ),
          item(`그림 ${drawingCount}개 삭제`, () => removeDrawingsOf(cell.symbol), {
            icon: icon('trash'),
            disabled: drawingCount === 0,
          }),
          item(`지표 ${indicators.length}개 삭제`, () => changeIndicators([]), {
            icon: icon('trash'),
            disabled: indicators.length === 0,
          }),
          divider,
          item('설정…', () => setSettingsOpen(true), { icon: icon('settings') }),
        ]
      }
    }
  }

  // 울린 수평선 알림은 목록에 '다시 켜기'로 남지만 배지에는 세지 않는다(가격·지표 알림과 같게).
  const alertBadge =
    alerts.filter((a) => a.active).length +
    lineWatchList.length +
    indicatorAlerts.alerts.filter((a) => a.active).length

  // Indicators mapped for the object tree.
  const indicatorRows = useMemo(
    () => indicators.map((i) => ({ id: i.id, name: indicatorTitle(i), visible: i.visible })),
    [indicators],
  )

  // ── per-cell chart renderer ───────────────────────────────────────
  const renderCell = (cell: CellConfig, index: number, gridStyle?: React.CSSProperties) => {
    const isActive = index === active
    const cellPins = pinsFor(cell.symbol, cell.interval)
    return (
      <ErrorBoundary
        key={index}
        label="차트"
        style={gridStyle}
        resetKey={`${cell.symbol}|${cell.interval}|${cell.chartType}|${cell.scaleMode}`}
      >
      <ChartCell
        cellIndex={index}
        gridStyle={gridStyle}
        symbol={cell.symbol}
        description={describeSymbol(cell.symbol, symbols)}
        pricePrecision={priceDecimals(cell.symbol, symbols)}
        interval={cell.interval}
        chartType={cell.chartType}
        scaleMode={cell.scaleMode}
        autoScale={cell.autoScale}
        onAutoScaleChange={(v) => setCellField(index, { autoScale: v })}
        invertScale={cell.invertScale}
        lockedTime={cursorLocks[index] ?? null}
        compare={cell.compare}
        onCompareChange={(next) => setCompare(index, next)}
        indicators={indicators}
        onIndicatorsChange={changeIndicators}
        settings={settings}
        alerts={alerts}
        drawings={drawings}
        drawingTool={tool}
        magnet={prefs.magnet}
        stayInDrawingMode={prefs.stayInDrawingMode}
        drawingsLocked={prefs.drawingsLocked}
        drawingsHidden={prefs.drawingsHidden}
        onCreateDrawing={createDrawing}
        onUpdateDrawing={updateDrawing}
        onRemoveDrawing={removeDrawing}
        onToolDone={() => setTool('cross')}
        pinMode={pinMode && isActive}
        pins={cellPins}
        onAddPin={({ time, price, features }) =>
          pinStore.add({ symbol: cell.symbol, interval: cell.interval, time, price, side: pinSide, features })
        }
        onPinFail={pushToast}
        onLiveFeatures={isActive ? setLiveFeatures : undefined}
        replay={replayCell === index}
        onReplayExit={() => setReplayCell((c) => (c === index ? null : c))}
        active={isActive}
        highlightActive={!isMobile && layout > 1}
        onActivate={() => setActive(index)}
        onPrice={handlePrice}
        onContextMenu={(req) => setChartMenu({ ...req, cellIndex: index })}
        onIndicatorAlert={openIndicatorAlert}
        onEditIndicator={setEditIndicatorId}
        onScaleMenu={isMobile ? () => setMobileSheet('scale') : undefined}
        onNotice={pushToast}
        syncCrosshair={!isMobile && layoutState.syncCrosshair}
        drawingSelectRequest={drawingSelect?.cell === index ? drawingSelect.req : null}
      />
      </ErrorBoundary>
    )
  }

  // ── widget content ────────────────────────────────────────────────
  const renderWidget = (id: WidgetId, variant: 'panel' | 'page'): React.ReactNode => {
    const page = variant === 'page'
    switch (id) {
      case 'watchlist':
        return (
          <>
            <WatchlistWidget
              symbols={watchlist.symbols}
              rows={watchlist.rows}
              infos={symbols}
              current={activeSymbol}
              onPick={(s) => {
                setCellSymbol(s)
                // 폰: TradingView 앱처럼 종목을 누르면 그 차트로 간다.
                if (page) setMobileTab('chart')
              }}
              onAdd={watchlist.add}
              onRemove={watchlist.remove}
              onReorder={watchlist.reorder}
              variant={variant}
            />
            {!page && <SymbolDetails symbol={activeSymbol} infos={symbols} />}
          </>
        )
      case 'alerts':
        return (
          <AlertsWidget
            symbol={activeSymbol}
            livePrice={livePrice}
            alerts={alerts}
            lineAlerts={drawings.filter((d) => d.alert)}
            symbols={symbols}
            onAdd={createPriceAlert}
            onRemove={removeAlert}
            onDisableLineAlert={(lineId) => updateDrawing(lineId, { alert: false })}
            onPickSymbol={showSymbol}
            onReactivateAlert={(alertId) => setAlertActive(alertId, true)}
            onReactivateLine={(lineId) => updateDrawing(lineId, { alert: true, fired: false })}
            indicatorAlerts={indicatorAlerts.alerts}
            onRemoveIndicatorAlert={indicatorAlerts.removeAlert}
            interval={activeCell.interval}
            indicators={indicators}
            onAddIndicatorAlert={createIndicatorAlert}
            permission={permission}
            onRequestPermission={() => void requestPermission()}
            push={push}
            hasSyncCode={Boolean(sync.code)}
            onCreateSyncCode={createSyncCode}
            variant={variant}
          />
        )
      case 'objectTree':
        return (
          <ObjectTree
            symbol={activeSymbol}
            drawings={drawings}
            indicators={indicatorRows}
            onUpdateDrawing={updateDrawing}
            onRemoveDrawing={removeDrawing}
            onSelectDrawing={(drawingId) => {
              setDrawingSelect({ cell: active, req: { id: drawingId, nonce: Date.now() } })
              // 폰: 시트를 닫아 차트에서 고른 그림이 보이게 한다.
              if (page) setMobileSheet(null)
            }}
            timezone={settings.timezone}
            pricePrecision={priceDecimals(activeSymbol, symbols)}
            locked={prefs.drawingsLocked}
            onToggleIndicator={(indId) =>
              setIndicators((prev) => prev.map((i) => (i.id === indId ? { ...i, visible: !i.visible } : i)))
            }
            onRemoveIndicator={(indId) => changeIndicators(indicatorsRef.current.filter((i) => i.id !== indId))}
            onEditIndicator={setEditIndicatorId}
          />
        )
      case 'mtf':
        return (
          <MtfPanel
            symbol={activeSymbol}
            current={cells.slice(0, 4).map((c) => c.interval)}
            onApply={applyMtf}
          />
        )
      case 'pins':
        return (
          <PinPanel
            pins={pinStore.pins}
            pinMode={pinMode}
            pinSide={pinSide}
            onPinModeChange={(on) => {
              setPinMode(on)
              // 폰: 핀 찍기를 켜면 시트를 닫고 차트 탭으로 가서 바로 누를 수 있게 한다(메뉴 탭에서 켰어도).
              if (on && page) {
                setMobileSheet(null)
                setMobileTab('chart')
              }
            }}
            onPinSideChange={setPinSide}
            onRemove={pinStore.remove}
            onClear={pinStore.clear}
            liveFeatures={liveFeatures}
            symbol={activeSymbol}
            timezone={settings.timezone}
          />
        )
      case 'discover':
        return (
          <DiscoverPanel
            symbol={activeSymbol}
            interval={activeCell.interval}
            liveFeatures={liveFeatures}
            timezone={settings.timezone}
          />
        )
      case 'trade':
        return (
          <OrderPanel
            symbol={activeSymbol}
            symbols={symbols}
            compact={page}
            draft={tradeDraft}
            onDraftApplied={() => setTradeDraft(null)}
          />
        )
      case 'sync':
        return (
          <SyncPanel
            code={sync.code}
            status={sync.status}
            message={sync.message}
            onSetCode={sync.setCode}
            onPull={sync.pull}
            onPush={sync.push}
          />
        )
    }
  }

  // shared toolbar props
  const toolbarProps = {
    displaySymbol: displaySymbol(activeSymbol, symbols),
    onOpenSymbolSearch: () => openSymbolSearch(),
    onOpenCompare: openCompare,
    interval: activeCell.interval,
    favorites: prefs.favoriteIntervals,
    onIntervalChange: (iv: Interval) => setCellField(active, { interval: iv }),
    onToggleFavorite: toggleFavorite,
    chartType: activeCell.chartType,
    onChartTypeChange: setChartType,
    onOpenIndicators: () => setIndicatorsOpen(true),
    indicators,
    onIndicatorsChange: applyIndicatorTemplate,
    onOpenAlert: () => openAlertAt(null),
    replay: replayOn,
    onToggleReplay: toggleReplay,
    canUndo,
    canRedo,
    onUndo: undoDrawing,
    onRedo: redoDrawing,
    layout,
    onLayoutChange: setLayout,
    onEqualize: resetSplit,
    layoutSync: layoutSync(layoutState),
    onLayoutSyncChange: setLayoutSync,
    onSave: handleSave,
    saved,
    onQuickSearch: () => setQuickOpen(true),
    onSettings: () => setSettingsOpen(true),
    legend: legendShown(settings),
    onToggleLegend: () => setSettings(toggleLegend),
    fullscreen: fullscreen.active,
    onFullscreen: () => void fullscreen.toggle(),
    onSnapshotDownload: snapshotDownload,
    onSnapshotCopy: snapshotCopy,
    pipSupported: pip.supported,
    pipOpen: pip.open,
    onTogglePip: () => void pip.toggle(),
    shortcut: shortcutKeys.label,
  }

  const drawingToolbarProps = {
    tool,
    onToolChange: setTool,
    magnet: prefs.magnet,
    onMagnetChange: (m: MagnetMode) => patchPrefs({ magnet: m }),
    stayInDrawingMode: prefs.stayInDrawingMode,
    onStayChange: (v: boolean) => patchPrefs({ stayInDrawingMode: v }),
    locked: prefs.drawingsLocked,
    onLockedChange: (v: boolean) => patchPrefs({ drawingsLocked: v }),
    hidden: prefs.drawingsHidden,
    onHiddenChange: (v: boolean) => patchPrefs({ drawingsHidden: v }),
    onRemoveDrawings: () => removeDrawingsOf(activeSymbol),
    onRemoveIndicators: () => changeIndicators([]),
    toolShortcuts,
  }

  const effectiveLayout: LayoutMode = maximizedNow ? 1 : layout

  // ── dialogs & overlays (shared between desktop/mobile) ─────────────
  const dialogs = (
    <>
      <SymbolSearchDialog
        open={symbolSearchOpen}
        onClose={() => setSymbolSearchOpen(false)}
        title={symbolSearchMode === 'compare' ? '심볼 비교' : '심볼 검색'}
        symbols={symbols}
        initialQuery={symbolSearchQuery}
        selected={symbolSearchMode === 'compare' ? activeCell.compare : undefined}
        keepOpen={symbolSearchMode === 'compare'}
        onSelect={(sym) => {
          if (symbolSearchMode === 'compare') {
            const cur = activeCell.compare
            setCompare(active, cur.includes(sym) ? cur.filter((s) => s !== sym) : [...cur, sym])
          } else {
            setCellSymbol(sym)
            setSymbolSearchOpen(false)
          }
        }}
      />

      <IndicatorsDialog
        open={indicatorsOpen}
        onClose={() => setIndicatorsOpen(false)}
        indicators={indicators}
        onChange={changeIndicators}
      />

      <CreateAlertDialog
        open={alertOpen}
        onClose={() => {
          setAlertOpen(false)
          setAlertPrice(null)
          setAlertIndicatorId(null)
        }}
        symbol={activeSymbol}
        livePrice={livePrice}
        initialPrice={alertPrice}
        interval={activeCell.interval}
        indicators={indicators}
        initialIndicatorId={alertIndicatorId}
        onCreateIndicatorAlert={createIndicatorAlert}
        onCreate={createPriceAlert}
      />

      <GoToDateDialog
        open={goToOpen}
        onClose={() => setGoToOpen(false)}
        timezone={settings.timezone}
        intraday={INTERVAL_SECONDS[activeCell.interval] < 86400}
        onGo={(time) => getChart(active)?.goToTime(time)}
      />

      <ContextMenu at={chartMenu} entries={chartMenu ? chartMenuEntries(chartMenu) : []} onClose={closeChartMenu} />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onChange={setSettings} />

      <IndicatorSettingsDialog
        instance={editIndicatorId ? indicators.find((i) => i.id === editIndicatorId) ?? null : null}
        onChange={(next) => setIndicators((prev) => prev.map((i) => (i.id === next.id ? next : i)))}
        onClose={() => setEditIndicatorId(null)}
      />

      <QuickSearchDialog
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onTool={setTool}
        onChartType={setChartType}
        onInterval={(iv) => setCellField(active, { interval: iv })}
        onOpenIndicators={() => setIndicatorsOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onSnapshot={snapshotDownload}
        onFullscreen={() => void fullscreen.toggle()}
        onLayout={setLayout}
        onTheme={(theme) => setSettings((prev) => ({ ...prev, theme }))}
        symbols={symbols}
        onPickSymbol={showSymbol}
        onAddIndicator={addIndicator}
      />

      <QuickIntervalBox seed={ivSeed} onApply={(iv) => setCellField(active, { interval: iv })} onClose={() => setIvSeed(null)} />

      <MainMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenWidget={openWidgetFromMenu}
        theme={settings.theme}
        onThemeChange={(theme) => setSettings((prev) => ({ ...prev, theme }))}
        onShortcuts={() => setShortcutsOpen(true)}
        install={{ canShow: install.canShow, ios: install.ios, installable: install.installable, install: () => void install.install() }}
      />

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} keys={shortcutKeys} />

      <Toasts toasts={toasts} onDismiss={dismissToast} />
      <TooltipLayer />

      {pip.container &&
        createPortal(
          <ChartCell
            key={`pip-${activeCell.symbol}-${activeCell.interval}`}
            cellIndex={null}
            symbol={activeCell.symbol}
            description={describeSymbol(activeCell.symbol, symbols)}
            pricePrecision={priceDecimals(activeCell.symbol, symbols)}
            interval={activeCell.interval}
            chartType={activeCell.chartType}
            scaleMode={activeCell.scaleMode}
            autoScale={activeCell.autoScale}
            onAutoScaleChange={(v) => setCellField(active, { autoScale: v })}
            invertScale={activeCell.invertScale}
            lockedTime={null}
            compare={activeCell.compare}
            onCompareChange={(next) => setCompare(active, next)}
            indicators={indicators}
            onIndicatorsChange={changeIndicators}
            settings={settings}
            alerts={alerts}
            drawings={drawings}
            drawingTool="cross"
            magnet={prefs.magnet}
            stayInDrawingMode={false}
            drawingsLocked={prefs.drawingsLocked}
            drawingsHidden={prefs.drawingsHidden}
            onCreateDrawing={createDrawing}
            onUpdateDrawing={updateDrawing}
            onRemoveDrawing={removeDrawing}
            onToolDone={() => setTool('cross')}
            pinMode={false}
            pins={pinsFor(activeCell.symbol, activeCell.interval)}
            onAddPin={() => {}}
            onPinFail={() => {}}
            replay={false}
            onReplayExit={() => {}}
            onNotice={pushToast}
            active={false}
            highlightActive={false}
            onActivate={() => {}}
            onPrice={handlePrice}
          />,
          pip.container,
        )}
    </>
  )

  // ── mobile app (TradingView 앱 구조: 아래 탭 + 차트 도구 줄 + 아래 시트) ──
  if (isMobile) {
    const toggleSetting = (key: 'showCountdown' | 'showPriceLine' | 'showLastPriceLabel') => () =>
      setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
    const scaleEntries: MenuEntry[] = [
      ...chartMenuEntries({ x: 0, y: 0, target: { kind: 'priceScale' }, cellIndex: active }),
      { type: 'divider' },
      { type: 'item', label: '봉 마감 카운트다운', checked: settings.showCountdown, onSelect: toggleSetting('showCountdown') },
      { type: 'item', label: '현재가 선', checked: settings.showPriceLine, onSelect: toggleSetting('showPriceLine') },
      { type: 'item', label: '현재가 라벨', checked: settings.showLastPriceLabel, onSelect: toggleSetting('showLastPriceLabel') },
      { type: 'divider' },
      { type: 'item', label: '범례 (심볼 · 지표 이름)', checked: legendShown(settings), onSelect: () => setSettings(toggleLegend) },
    ]
    return (
      <PaperContext.Provider value={paper}>
        <MobileShell
          tab={mobileTab}
          onTabChange={(next) => {
            setMobileSheet(null)
            setMobileTab(next)
          }}
          sheet={mobileSheet}
          onSheetChange={setMobileSheet}
          alertCount={alertBadge}
          chart={renderCell(activeCell, active)}
          pages={{
            watchlist: renderWidget('watchlist', 'page'),
            alerts: renderWidget('alerts', 'page'),
            explore: renderWidget('discover', 'page'),
            menu: (
              <MobileMenuPage
                theme={settings.theme}
                onThemeChange={(theme) => setSettings((prev) => ({ ...prev, theme }))}
                rows={[
                  { key: 'settings', icon: 'settings', label: '차트 설정', onSelect: () => setSettingsOpen(true) },
                  { key: 'templates', icon: 'template', label: '지표 템플릿', onSelect: () => setMobileSheet('templates') },
                  { key: 'objectTree', icon: 'objectTree', label: '객체 트리', onSelect: () => setMobileSheet('objectTree') },
                  { key: 'pins', icon: 'pin', label: '핀', onSelect: () => setMobileSheet('pins') },
                  { key: 'sync', icon: 'sync', label: '동기화 · 저장', onSelect: () => setMobileSheet('sync') },
                ]}
                install={{ canShow: install.canShow, ios: install.ios, install: () => void install.install() }}
              />
            ),
          }}
          panels={{
            templates: (
              <IndicatorTemplatesMenu
                indicators={indicators}
                onApply={applyIndicatorTemplate}
                onClose={() => setMobileSheet(null)}
              />
            ),
            symbolInfo: <SymbolDetails symbol={activeSymbol} infos={symbols} />,
            objectTree: renderWidget('objectTree', 'page'),
            pins: renderWidget('pins', 'page'),
            sync: renderWidget('sync', 'page'),
            trade: (
              <MobileTrade
                symbol={activeSymbol}
                symbols={symbols}
                onSelectSymbol={setCellSymbol}
                draft={tradeDraft}
                onDraftApplied={() => setTradeDraft(null)}
              />
            ),
          }}
          symbolLabel={displaySymbol(activeSymbol, symbols)}
          base={symbols.find((i) => i.symbol === activeSymbol)?.baseAsset ?? activeSymbol.replace(/USDT.*/, '')}
          interval={activeCell.interval}
          onIntervalChange={(iv) => setCellField(active, { interval: iv })}
          onOpenSymbolSearch={() => openSymbolSearch()}
          onOpenIndicators={() => setIndicatorsOpen(true)}
          onOpenAlert={() => openAlertAt(null)}
          onOpenCompare={openCompare}
          onSnapshot={snapshotShare}
          chartType={activeCell.chartType}
          onChartTypeChange={setChartType}
          replay={replayOn}
          onToggleReplay={toggleReplay}
          onOpenSettings={() => setSettingsOpen(true)}
          onGoToDate={() => setGoToOpen(true)}
          onApplyRange={applyDateRange}
          timezone={settings.timezone}
          scaleEntries={scaleEntries}
          drawing={{
            ...drawingToolbarProps,
            drawingCount: drawings.filter((d) => d.symbol === activeSymbol).length,
            indicatorCount: indicators.length,
            canUndo,
            canRedo,
            onUndo: undoDrawing,
            onRedo: redoDrawing,
          }}
        />
        {dialogs}
      </PaperContext.Provider>
    )
  }

  // ── desktop layout ────────────────────────────────────────────────
  return (
    <PaperContext.Provider value={paper}>
    <div className={`tv-app${widgetOpen ? ' widget-open' : ''}`}>
      <div className="tv-hamburger-cell">
        <button
          type="button"
          className="tv-tb-btn"
          aria-label="메뉴"
          {...tip('메뉴', '위젯 목록, 다크 테마, 키보드 단축키, 앱 설치')}
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" size={22} />
        </button>
      </div>

      <div className="tv-toolbar-cell">
        <TopToolbar {...toolbarProps} />
      </div>

      <div className="tv-left-cell">
        <DrawingToolbar {...drawingToolbarProps} />
      </div>

      <div className="tv-center-cell">
        <main
          ref={gridRef}
          className={`tv-chart-grid grid-${effectiveLayout}`}
          style={
            effectiveLayout === 1
              ? undefined
              : {
                  gridTemplateColumns: `${splitCol}fr 4px ${1 - splitCol}fr`,
                  ...(layout === 4 ? { gridTemplateRows: `${splitRow}fr 4px ${1 - splitRow}fr` } : {}),
                }
          }
        >
          {cells.slice(0, layout).map((cell, i) =>
            renderCell(
              cell,
              i,
              maximizedNow
                ? i === active
                  ? undefined
                  : HIDDEN_CELL
                : effectiveLayout === 1
                  ? undefined
                  : effectiveLayout === 2
                    ? { gridColumn: i === 0 ? 1 : 3, gridRow: 1 }
                    : { gridColumn: i % 2 === 0 ? 1 : 3, gridRow: i < 2 ? 1 : 3 },
            ),
          )}

          {effectiveLayout > 1 && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div
              className="tv-split-bar col"
              style={{ gridColumn: 2, gridRow: effectiveLayout === 4 ? '1 / -1' : 1 }}
              onPointerDown={startSplitDrag('col')}
              onDoubleClick={resetSplit}
            />
          )}
          {effectiveLayout === 4 && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div
              className="tv-split-bar row"
              style={{ gridColumn: '1 / -1', gridRow: 2 }}
              onPointerDown={startSplitDrag('row')}
              onDoubleClick={resetSplit}
            />
          )}
        </main>
      </div>

      <div className="tv-bottom-cell">
        <BottomBar
          interval={activeCell.interval}
          onApplyRange={applyDateRange}
          timezone={settings.timezone}
          onTimezoneChange={(id) => setSettings((prev) => ({ ...prev, timezone: id }))}
          scaleMode={activeCell.scaleMode}
          onScaleModeChange={(mode) => setScaleMode(active, mode)}
          autoScale={activeCell.autoScale}
          onAutoScaleChange={(v) => setCellField(active, { autoScale: v })}
          shortcut={shortcutKeys.label}
        />
      </div>

      <div className="tv-trade-cell">
        <TradingPanel
          symbols={symbols}
          activeSymbol={activeSymbol}
          onSelectSymbol={setCellSymbol}
          variant="desktop"
          collapsed={!prefs.tradePanelOpen}
          onCollapsedChange={(v) => patchPrefs({ tradePanelOpen: !v })}
          height={prefs.tradePanelHeight}
          onHeightChange={(h) => patchPrefs({ tradePanelHeight: h })}
        />
      </div>

      <div className="tv-right-cell">
        <WidgetBar open={widgetOpen} onToggle={toggleWidget} alertCount={alertBadge}>
          {widgetOpen && <div className="tv-widget-scroll">{renderWidget(widgetOpen, 'panel')}</div>}
        </WidgetBar>
      </div>

      {dialogs}
    </div>
    </PaperContext.Provider>
  )
}

export default App

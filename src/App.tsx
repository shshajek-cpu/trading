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
import { QuickSearchDialog } from './components/QuickSearchDialog'
import { QuickIntervalBox } from './components/QuickIntervalBox'
import { Toasts, type Toast } from './components/Toasts'
import { Icon, type IconName } from './components/Icon'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { ContextMenu, type MenuEntry } from './components/ContextMenu'
import { GoToDateDialog } from './components/GoToDateDialog'
import { ToolIcon } from './chart/drawing/toolIcons'
import { buildPoints, cloneOffset } from './chart/drawing/builders'
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
import { usePushAlerts } from './hooks/usePushAlerts'
import { useWatchlist } from './hooks/useWatchlist'
import { usePins } from './hooks/usePins'
import { useUiPrefs } from './hooks/useUiPrefs'
import { useFullscreen } from './hooks/useFullscreen'
import { useShortcuts } from './hooks/useShortcuts'
import { useShortcutBindings } from './hooks/useShortcutBindings'

import {
  clampSplit,
  DEFAULT_LAYOUT,
  loadLayout,
  saveLayout,
  type CellConfig,
  type LayoutMode,
  type LayoutState,
} from './lib/layoutConfig'
import {
  loadIndicators,
  saveIndicators,
  indicatorTitle,
  type IndicatorInstance,
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
import { randomCode } from './lib/syncCode'
import { getChart } from './lib/chartRegistry'
import { SCALE_MODES, type ChartType, type ScaleMode } from './lib/chartTypes'
import type { Interval } from './lib/binance'
import type { ChartMenuRequest } from './lib/chartMenu'
import { INTERVAL_SECONDS } from './lib/intervals'
import { TOOL_SHORTCUTS, type ShortcutId } from './lib/shortcuts'

const TOAST_MS = 6000

function App() {
  // ── persisted core state ──────────────────────────────────────────
  const [layoutState, setLayoutState] = useState<LayoutState>(loadLayout)
  const [indicators, setIndicators] = useState<IndicatorInstance[]>(loadIndicators)
  const [settings, setSettings] = useState<ChartSettings>(loadChartSettings)
  const { prefs, patch: patchPrefs, toggleFavorite } = useUiPrefs()
  const shortcutKeys = useShortcutBindings()

  useEffect(() => saveLayout(layoutState), [layoutState])
  useEffect(() => saveIndicators(indicators), [indicators])
  useEffect(() => {
    saveChartSettings(settings)
    document.documentElement.dataset.theme = settings.theme
  }, [settings])

  // ── transient shell state ─────────────────────────────────────────
  const [tool, setTool] = useState<DrawingTool>('cross')
  const [replay, setReplay] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [livePrice, setLivePrice] = useState<number | null>(null)
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
  const sync = useSync()

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

  // toasts
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])
  const pushToast = useCallback(
    (message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((prev) => [...prev, { id, message }])
      window.setTimeout(() => dismissToast(id), TOAST_MS)
    },
    [dismissToast],
  )

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
  const { alerts, addAlert, removeAlert, checkPrice, markFired } = usePriceAlerts(handleTrigger)

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
    reorderDrawing,
    checkPrice: checkDrawings,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDrawings(handleCross)

  const push = usePushAlerts(sync.code, alerts, markFired)

  const handlePrice = useCallback(
    (symbol: string, price: number) => {
      checkPrice(symbol, price)
      checkDrawings(symbol, price)
      if (symbol === activeSymbolRef.current) setLivePrice(price)
    },
    [checkPrice, checkDrawings],
  )

  // ── cell mutation helpers ─────────────────────────────────────────
  const setCellField = useCallback((index: number, field: Partial<CellConfig>) => {
    setLayoutState((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) => (i === index ? { ...c, ...field } : c)),
    }))
  }, [])

  // 동기화가 켜져 있으면 숨은 칸까지 모두 바꿔, 분할을 늘려도 같은 종류로 보이게 한다.
  const setChartType = useCallback((t: ChartType) => {
    setLayoutState((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) => (prev.syncChartType || i === prev.active ? { ...c, chartType: t } : c)),
    }))
  }, [])

  // 켜는 순간 활성 칸의 종류로 맞춘다 — 켰는데 칸마다 다르면 동기화가 된 건지 알 수 없다.
  const setSyncChartType = useCallback((on: boolean) => {
    setLayoutState((prev) => {
      const t = prev.cells[prev.active]?.chartType
      return {
        ...prev,
        syncChartType: on,
        cells: on && t ? prev.cells.map((c) => ({ ...c, chartType: t })) : prev.cells,
      }
    })
  }, [])

  // Alt+L / Alt+P: 같은 눈금을 다시 누르면 일반으로 돌아간다.
  const toggleScaleMode = useCallback((index: number, mode: ScaleMode) => {
    setLayoutState((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) => (i === index ? { ...c, scaleMode: c.scaleMode === mode ? 'normal' : mode } : c)),
    }))
  }, [])

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
    setLayoutState((prev) => ({ ...prev, layout: mode, active: Math.min(prev.active, mode - 1) }))
  }, [])

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
    if (sync.code) {
      void sync.push(sync.code)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    } else {
      if (isMobile) setMobileSheet('sync')
      else setWidgetOpen('sync')
    }
  }, [sync, isMobile])

  const createSyncCode = useCallback(() => {
    const code = randomCode()
    sync.setCode(code)
    return code
  }, [sync])

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
        return undo()
      case 'redo':
        return redo()
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
      else if (id === 'objectTree' || id === 'pins' || id === 'sync') setMobileSheet(id)
    },
    [isMobile],
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
            item(`${m.label} 눈금`, () => setCellField(index, { scaleMode: m.id }), {
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
              addDrawing({
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
          item('삭제', () => removeDrawing(d.id), { icon: icon('trash'), shortcut: 'Delete' }),
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
              if (next) addDrawing(next)
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
                item(
                  `${priceText}에 수평선 그리기`,
                  () =>
                    addDrawing({
                      symbol: cell.symbol,
                      kind: 'horizontal',
                      points: buildPoints('horizontal', [{ time: time ?? Math.floor(Date.now() / 1000), price }], cell.interval),
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
          item(`그림 ${drawingCount}개 삭제`, () => removeAll(cell.symbol), {
            icon: icon('trash'),
            disabled: drawingCount === 0,
          }),
          item(`지표 ${indicators.length}개 삭제`, () => setIndicators([]), {
            icon: icon('trash'),
            disabled: indicators.length === 0,
          }),
          divider,
          item('설정…', () => setSettingsOpen(true), { icon: icon('settings') }),
        ]
      }
    }
  }

  const alertBadge =
    alerts.filter((a) => a.active).length +
    drawings.filter((d) => d.alert).length +
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
        onCompareChange={(next) => setCellField(index, { compare: next })}
        indicators={indicators}
        onIndicatorsChange={setIndicators}
        settings={settings}
        alerts={alerts}
        drawings={drawings}
        drawingTool={tool}
        magnet={prefs.magnet}
        stayInDrawingMode={prefs.stayInDrawingMode}
        drawingsLocked={prefs.drawingsLocked}
        drawingsHidden={prefs.drawingsHidden}
        onCreateDrawing={(d: NewDrawing) => addDrawing(d)}
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
        replay={replay && isActive}
        onReplayExit={() => setReplay(false)}
        active={isActive}
        highlightActive={!isMobile && layout > 1}
        onActivate={() => setActive(index)}
        onPrice={handlePrice}
        onContextMenu={(req) => setChartMenu({ ...req, cellIndex: index })}
        onIndicatorAlert={openIndicatorAlert}
        onEditIndicator={setEditIndicatorId}
        onScaleMenu={isMobile ? () => setMobileSheet('scale') : undefined}
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
                setCellField(active, { symbol: s })
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
            onToggleIndicator={(indId) =>
              setIndicators((prev) => prev.map((i) => (i.id === indId ? { ...i, visible: !i.visible } : i)))
            }
            onRemoveIndicator={(indId) => setIndicators((prev) => prev.filter((i) => i.id !== indId))}
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
              // 폰: 핀 찍기를 켜면 시트를 닫고 차트를 누를 수 있게 한다.
              if (on && page) setMobileSheet(null)
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
    onIndicatorsChange: setIndicators,
    onOpenAlert: () => openAlertAt(null),
    replay,
    onToggleReplay: () => setReplay((v) => !v),
    canUndo,
    canRedo,
    onUndo: undo,
    onRedo: redo,
    layout,
    onLayoutChange: setLayout,
    onEqualize: resetSplit,
    syncChartType: layoutState.syncChartType,
    onSyncChartTypeChange: setSyncChartType,
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
    onRemoveDrawings: () => removeAll(activeSymbol),
    onRemoveIndicators: () => setIndicators([]),
    toolShortcuts,
  }

  // Alt+Enter 로 최대화하면 분할 화면에서도 활성 칸 하나만 크게 보인다.
  const maximizedNow = maximized && !isMobile && layout > 1
  const visibleCells = isMobile || maximizedNow ? [activeCell] : cells.slice(0, layout)
  const effectiveLayout: LayoutMode = isMobile || maximizedNow ? 1 : layout

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
            const next = cur.includes(sym) ? cur.filter((s) => s !== sym) : [...cur, sym]
            setCellField(active, { compare: next })
          } else {
            setCellField(active, { symbol: sym })
            setSymbolSearchOpen(false)
          }
        }}
      />

      <IndicatorsDialog
        open={indicatorsOpen}
        onClose={() => setIndicatorsOpen(false)}
        indicators={indicators}
        onChange={setIndicators}
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
            onCompareChange={(next) => setCellField(active, { compare: next })}
            indicators={indicators}
            onIndicatorsChange={setIndicators}
            settings={settings}
            alerts={alerts}
            drawings={drawings}
            drawingTool="cross"
            magnet={prefs.magnet}
            stayInDrawingMode={false}
            drawingsLocked={prefs.drawingsLocked}
            drawingsHidden={prefs.drawingsHidden}
            onCreateDrawing={(d: NewDrawing) => addDrawing(d)}
            onUpdateDrawing={updateDrawing}
            onRemoveDrawing={removeDrawing}
            onToolDone={() => setTool('cross')}
            pinMode={false}
            pins={pinsFor(activeCell.symbol, activeCell.interval)}
            onAddPin={() => {}}
            onPinFail={() => {}}
            replay={false}
            onReplayExit={() => setReplay(false)}
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
      <>
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
                onApply={setIndicators}
                onClose={() => setMobileSheet(null)}
              />
            ),
            symbolInfo: <SymbolDetails symbol={activeSymbol} infos={symbols} />,
            objectTree: renderWidget('objectTree', 'page'),
            pins: renderWidget('pins', 'page'),
            sync: renderWidget('sync', 'page'),
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
          replay={replay}
          onToggleReplay={() => setReplay((v) => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
          onGoToDate={() => setGoToOpen(true)}
          onApplyRange={applyDateRange}
          timezone={settings.timezone}
          scaleEntries={scaleEntries}
          drawing={{ ...drawingToolbarProps, canUndo, canRedo, onUndo: undo, onRedo: redo }}
        />
        {dialogs}
      </>
    )
  }

  // ── desktop layout ────────────────────────────────────────────────
  return (
    <div className={`tv-app${widgetOpen ? ' widget-open' : ''}`}>
      <div className="tv-hamburger-cell">
        <button type="button" className="tv-tb-btn" aria-label="메뉴" onClick={() => setMenuOpen(true)}>
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
          {visibleCells.map((cell, i) =>
            renderCell(
              cell,
              maximizedNow ? active : i,
              effectiveLayout === 1
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
          onScaleModeChange={(mode) => setCellField(active, { scaleMode: mode })}
          autoScale={activeCell.autoScale}
          onAutoScaleChange={(v) => setCellField(active, { autoScale: v })}
        />
      </div>

      <div className="tv-right-cell">
        <WidgetBar open={widgetOpen} onToggle={toggleWidget} alertCount={alertBadge}>
          {widgetOpen && <div className="tv-widget-scroll">{renderWidget(widgetOpen, 'panel')}</div>}
        </WidgetBar>
      </div>

      {dialogs}
    </div>
  )
}

export default App

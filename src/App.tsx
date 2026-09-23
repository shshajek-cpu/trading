import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'

import { ChartCell } from './components/ChartCell'
import { TopToolbar } from './components/TopToolbar'
import { BottomBar } from './components/BottomBar'
import { WidgetBar } from './components/WidgetBar'
import { WIDGET_TABS, type WidgetId } from './lib/widgets'
import { MainMenuDrawer } from './components/MainMenuDrawer'
import { SettingsDialog } from './components/SettingsDialog'
import { QuickSearchDialog } from './components/QuickSearchDialog'
import { QuickIntervalBox } from './components/QuickIntervalBox'
import { Toasts, type Toast } from './components/Toasts'
import { Icon } from './components/Icon'
import { Dialog } from './components/ui/Dialog'

import { DrawingToolbar } from './components/DrawingToolbar'
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
import { useBackClose } from './hooks/useBackClose'

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
import { loadChartSettings, saveChartSettings, type ChartSettings } from './lib/chartSettings'
import { describeSymbol, displaySymbol, priceDecimals } from './lib/symbols'
import type { Drawing, DrawingTool, MagnetMode, NewDrawing } from './lib/drawings'
import type { PinSide } from './lib/pins'
import type { FeatureSet } from './lib/features'
import { randomCode } from './lib/syncCode'
import { getChart } from './lib/chartRegistry'
import type { ChartType } from './lib/chartTypes'
import type { Interval } from './lib/binance'

const TOAST_MS = 6000

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Alt+T', label: '추세선' },
  { keys: 'Alt+H', label: '수평선' },
  { keys: 'Alt+J', label: '수평 광선' },
  { keys: 'Alt+V', label: '수직선' },
  { keys: 'Alt+C', label: '크로스라인' },
  { keys: 'Alt+F', label: '피보나치' },
  { keys: 'Alt+Shift+R', label: '사각형' },
  { keys: 'Esc', label: '십자선으로 · 메뉴 닫기' },
  { keys: 'Ctrl+Z / Ctrl+Y', label: '실행 취소 / 다시 실행' },
  { keys: 'Alt+R', label: '차트 보기 초기화' },
  { keys: 'Alt+A', label: '알림 만들기' },
  { keys: 'Alt+S', label: '스냅샷' },
  { keys: 'Ctrl+K', label: '빠른 검색' },
  { keys: 'Shift+F', label: '전체 화면' },
  { keys: '글자', label: '심볼 검색' },
  { keys: '숫자', label: '주기 변경' },
]

function App() {
  // ── persisted core state ──────────────────────────────────────────
  const [layoutState, setLayoutState] = useState<LayoutState>(loadLayout)
  const [indicators, setIndicators] = useState<IndicatorInstance[]>(loadIndicators)
  const [settings, setSettings] = useState<ChartSettings>(loadChartSettings)
  const { prefs, patch: patchPrefs, toggleFavorite } = useUiPrefs()

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
  const [menuOpen, setMenuOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [widgetOpen, setWidgetOpen] = useState<WidgetId | null>('watchlist')
  const [mobileWidget, setMobileWidget] = useState<WidgetId | null>(null)
  const [drawingPanel, setDrawingPanel] = useState(true)
  const [saved, setSaved] = useState(false)

  // ── data hooks ────────────────────────────────────────────────────
  const symbols = useSymbols()
  const { notify, permission } = useNotifications()
  const isMobile = useIsMobile()
  const fullscreen = useFullscreen()
  const pip = usePipWindow()
  const install = useInstallPrompt()
  const watchlist = useWatchlist()
  const pinStore = usePins()
  const sync = useSync()

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
      notify('가격 알림', message)
      pushToast(message)
    },
    [notify, pushToast],
  )
  const { alerts, addAlert, removeAlert, checkPrice } = usePriceAlerts(handleTrigger)

  // line-cross alerts
  const handleCross = useCallback(
    (drawing: Drawing, price: number) => {
      const line = drawing.points[0]?.price
      const message = `${drawing.symbol} 수평선 ${line ?? ''} 통과 (현재 ${price})`
      notify('선 통과 알림', message)
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
    checkPrice: checkDrawings,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDrawings(handleCross)

  const push = usePushAlerts(sync.code, alerts)

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

  const setActive = useCallback((index: number) => {
    setLayoutState((prev) => (prev.active === index ? prev : { ...prev, active: index }))
  }, [])

  const setLayout = useCallback((mode: LayoutMode) => {
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
  const snapshotDownload = useCallback(() => {
    const canvas = getChart(active)?.takeSnapshot()
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activeSymbol}_${cells[active]?.interval ?? ''}.png`
      a.click()
      URL.revokeObjectURL(url)
    })
  }, [active, activeSymbol, cells])

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
      setWidgetOpen('sync')
      if (isMobile) setMobileWidget('sync')
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

  // ── shortcuts ─────────────────────────────────────────────────────
  useShortcuts({
    onTool: setTool,
    onEscape: () => {
      setTool('cross')
      setQuickOpen(false)
      setMenuOpen(false)
      setIvSeed(null)
    },
    onUndo: undo,
    onRedo: redo,
    onResetView: () => getChart(active)?.resetView(),
    onCreateAlert: () => setAlertOpen(true),
    onSnapshot: snapshotDownload,
    onQuickSearch: () => setQuickOpen(true),
    onFullscreen: () => void fullscreen.toggle(),
    onSymbolChar: (ch) => openSymbolSearch(ch),
    onIntervalChar: (ch) => setIvSeed(ch),
  })

  // ── widget bar tabs (desktop) ─────────────────────────────────────
  const toggleWidget = useCallback((id: WidgetId) => {
    setWidgetOpen((prev) => (prev === id ? null : id))
  }, [])

  const openWidgetFromMenu = useCallback(
    (id: WidgetId) => {
      if (isMobile) setMobileWidget(id)
      else setWidgetOpen(id)
    },
    [isMobile],
  )

  const alertBadge = alerts.filter((a) => a.active).length + drawings.filter((d) => d.alert).length

  // Indicators mapped for the object tree.
  const indicatorRows = useMemo(
    () => indicators.map((i) => ({ id: i.id, name: indicatorTitle(i), visible: i.visible })),
    [indicators],
  )

  // ── per-cell chart renderer ───────────────────────────────────────
  const renderCell = (cell: CellConfig, index: number, gridStyle?: React.CSSProperties) => {
    const isActive = index === active
    const cellPins = pinStore.pins.filter((p) => p.symbol === cell.symbol && p.interval === cell.interval)
    return (
      <ChartCell
        key={index}
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
      />
    )
  }

  // ── widget content ────────────────────────────────────────────────
  const renderWidget = (id: WidgetId, fullscreen: boolean): React.ReactNode => {
    const closeMobile = () => setMobileWidget(null)
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
                if (fullscreen) closeMobile()
              }}
              onAdd={watchlist.add}
              onRemove={watchlist.remove}
              onReorder={watchlist.reorder}
              variant={fullscreen ? 'fullscreen' : 'panel'}
              onClose={fullscreen ? closeMobile : undefined}
            />
            {!fullscreen && <SymbolDetails symbol={activeSymbol} infos={symbols} />}
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
            onAdd={(symbol, condition, price, message) => addAlert(symbol, condition, price, message)}
            onRemove={removeAlert}
            onDisableLineAlert={(lineId) => updateDrawing(lineId, { alert: false })}
            permission={permission}
            push={push}
            hasSyncCode={Boolean(sync.code)}
            onCreateSyncCode={createSyncCode}
            variant={fullscreen ? 'fullscreen' : 'panel'}
            onClose={fullscreen ? closeMobile : undefined}
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
          />
        )
      case 'mtf':
        return (
          <MtfPanel
            symbol={activeSymbol}
            current={cells.slice(0, 4).map((c) => c.interval)}
            onApply={(ivs) => {
              applyMtf(ivs)
              if (fullscreen) closeMobile()
            }}
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
              if (on && fullscreen) closeMobile()
            }}
            onPinSideChange={setPinSide}
            onRemove={pinStore.remove}
            onClear={pinStore.clear}
            liveFeatures={liveFeatures}
            symbol={activeSymbol}
          />
        )
      case 'discover':
        return <DiscoverPanel symbol={activeSymbol} interval={activeCell.interval} liveFeatures={liveFeatures} />
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
    onChartTypeChange: (t: ChartType) => setCellField(active, { chartType: t }),
    onOpenIndicators: () => setIndicatorsOpen(true),
    indicators,
    onIndicatorsChange: setIndicators,
    onOpenAlert: () => setAlertOpen(true),
    replay,
    onToggleReplay: () => setReplay((v) => !v),
    canUndo,
    canRedo,
    onUndo: undo,
    onRedo: redo,
    layout,
    onLayoutChange: setLayout,
    onEqualize: resetSplit,
    onSave: handleSave,
    saved,
    onQuickSearch: () => setQuickOpen(true),
    onSettings: () => setSettingsOpen(true),
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
  }

  const visibleCells = isMobile ? [activeCell] : cells.slice(0, layout)
  const effectiveLayout: LayoutMode = isMobile ? 1 : layout

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
        onClose={() => setAlertOpen(false)}
        symbol={activeSymbol}
        livePrice={livePrice}
        onCreate={(symbol: string, condition: AlertCondition, price: number, message?: string) =>
          addAlert(symbol, condition, price, message)
        }
      />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onChange={setSettings} />

      <QuickSearchDialog
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onTool={setTool}
        onChartType={(t) => setCellField(active, { chartType: t })}
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
        drawingPanel={drawingPanel}
        onDrawingPanelChange={setDrawingPanel}
        onShortcuts={() => setShortcutsOpen(true)}
        install={{ canShow: install.canShow, ios: install.ios, installable: install.installable, install: () => void install.install() }}
      />

      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="키보드 단축키" width={420}>
        <ul className="tv-shortcuts-list">
          {SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </Dialog>

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
            pins={pinStore.pins.filter((p) => p.symbol === activeCell.symbol && p.interval === activeCell.interval)}
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

  // ── mobile full-screen widget overlay ─────────────────────────────
  const mobileWidgetOverlay = <MobileWidgetOverlay id={mobileWidget} onClose={() => setMobileWidget(null)} render={renderWidget} />

  // ── mobile layout ─────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="tv-app mobile">
        <div className="tv-toolbar-cell">
          <TopToolbar variant="mobile" onMenu={() => setMenuOpen(true)} {...toolbarProps} />
        </div>
        <div className="tv-mobile-body">
          {drawingPanel && (
            <div className="tv-left-cell">
              <DrawingToolbar variant="mobile" {...drawingToolbarProps} />
            </div>
          )}
          <main ref={gridRef} className="tv-chart-grid grid-1">
            {renderCell(activeCell, active)}
          </main>
        </div>
        <div className="tv-bottom-cell">
          <BottomBar
            variant="mobile"
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
        {mobileWidgetOverlay}
        {dialogs}
      </div>
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
        <TopToolbar variant="desktop" onMenu={() => setMenuOpen(true)} {...toolbarProps} />
      </div>

      <div className="tv-left-cell">
        <DrawingToolbar variant="desktop" {...drawingToolbarProps} />
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
              i,
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
          {widgetOpen && <div className="tv-widget-scroll">{renderWidget(widgetOpen, false)}</div>}
        </WidgetBar>
      </div>

      {dialogs}
    </div>
  )
}

/** Full-screen widget host for phones; watchlist/alerts render their own header. */
function MobileWidgetOverlay({
  id,
  onClose,
  render,
}: {
  id: WidgetId | null
  onClose: () => void
  render: (id: WidgetId, fullscreen: boolean) => React.ReactNode
}) {
  useBackClose(id !== null, onClose)
  if (id === null) return null
  const ownsHeader = id === 'watchlist' || id === 'alerts'
  const label = WIDGET_TABS.find((t) => t.id === id)?.label ?? ''
  return (
    <div className="tv-mobile-widget">
      {ownsHeader ? (
        render(id, true)
      ) : (
        <>
          <header className="tv-mobile-widget-head">
            <span>{label}</span>
            <button type="button" className="tv-icon-btn" aria-label="닫기" onClick={onClose}>
              <Icon name="close" size={20} />
            </button>
          </header>
          <div className="tv-mobile-widget-body">{render(id, true)}</div>
        </>
      )}
    </div>
  )
}

export default App

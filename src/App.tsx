import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import { ChartCell } from './components/ChartCell'
import { Toolbar } from './components/Toolbar'
import { Icon } from './components/Icon'
import { PanelHost } from './components/PanelHost'
import { IndicatorPanel } from './components/IndicatorPanel'
import { AlertPanel } from './components/AlertPanel'
import { DrawingPanel } from './components/DrawingPanel'
import { Toasts, type Toast } from './components/Toasts'
import { usePriceAlerts, type PriceAlert } from './hooks/usePriceAlerts'
import { useNotifications } from './hooks/useNotifications'
import { useSymbols } from './hooks/useSymbols'
import { usePipWindow } from './hooks/usePipWindow'
import { useDrawings } from './hooks/useDrawings'
import { useIsMobile } from './hooks/useIsMobile'
import { useInstallPrompt } from './hooks/useInstallPrompt'
import { MobileApp } from './components/mobile/MobileApp'
import { AlertForm } from './components/mobile/AlertForm'
import { PushBox } from './components/PushBox'
import { useTicker24h } from './hooks/useTicker24h'
import type { MobilePage } from './lib/mobileNav'
import { useSync } from './hooks/useSync'
import { usePushAlerts } from './hooks/usePushAlerts'
import { useWatchlist } from './hooks/useWatchlist'
import { Watchlist } from './components/Watchlist'
import { MtfPanel } from './components/MtfPanel'
import { PinPanel } from './components/PinPanel'
import { DiscoverPanel } from './components/DiscoverPanel'
import { usePins } from './hooks/usePins'
import type { PinSide } from './lib/pins'
import { randomCode } from './lib/syncCode'
import type { FeatureSet } from './lib/features'
import { SyncPanel } from './components/SyncPanel'
import { DRAW_COLORS, type Drawing } from './lib/drawings'
import type { Interval } from './lib/binance'
import type { PanelId } from './lib/panels'
import {
  loadIndicators,
  saveIndicators,
  type IndicatorSettings,
} from './lib/indicatorConfig'
import {
  clampSplit,
  DEFAULT_LAYOUT,
  loadLayout,
  saveLayout,
  type LayoutMode,
  type LayoutState,
} from './lib/layoutConfig'

const TOAST_MS = 6000

function App() {
  const [layoutState, setLayoutState] = useState<LayoutState>(loadLayout)
  const [indicators, setIndicators] = useState<IndicatorSettings>(loadIndicators)
  const [toasts, setToasts] = useState<Toast[]>([])

  const symbols = useSymbols('BTCUSDT')
  const { notify, permission } = useNotifications()

  useEffect(() => {
    saveLayout(layoutState)
  }, [layoutState])

  useEffect(() => {
    saveIndicators(indicators)
  }, [indicators])

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

  const handleTrigger = useCallback(
    (alert: PriceAlert, price: number) => {
      const label = alert.condition === 'above' ? '이상' : '이하'
      const message = `${alert.symbol} ${alert.price} ${label} 도달 (현재 ${price})`
      notify('가격 알림', message)
      pushToast(message)
    },
    [notify, pushToast],
  )

  const { alerts, addAlert, removeAlert, checkPrice } = usePriceAlerts(handleTrigger)

  const handleCross = useCallback(
    (drawing: Drawing, price: number) => {
      const message = `${drawing.symbol} 수평선 ${drawing.price} 통과 (현재 ${price})`
      notify('선 통과 알림', message)
      pushToast(message)
    },
    [notify, pushToast],
  )

  const {
    drawings,
    addDrawing,
    removeDrawing,
    updateDrawing,
    clearSymbol,
    checkPrice: checkDrawings,
    undo,
    canUndo,
  } = useDrawings(handleCross)

  // 선을 옮기면 교차 판정을 처음부터 다시 한다 — 옴긴 자리에서 다시 울리게.
  const handleMoveDrawing = useCallback(
    (id: string, price: number) => {
      updateDrawing(id, { price, above: null, fired: false })
    },
    [updateDrawing],
  )

  /** 열려 있는 설정 묶음. 데스크톱은 오른쪽 서랍, 모바일은 아래 시트로 같은 값을 쓴다. */
  const [panel, setPanel] = useState<PanelId | null>(null)
  const openPanel = useCallback((id: PanelId) => setPanel(id), [])

  // 칸 경계 끌기 — 방향별로 비율을 고친다.
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
        const ratio =
          axis === 'col' ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height
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

  const resetSplit = useCallback(() => {
    setLayoutState((prev) => ({ ...prev, splitCol: 0.5, splitRow: 0.5 }))
  }, [])

  const [drawMode, setDrawMode] = useState(false)
  const [pinMode, setPinMode] = useState(false)
  const [pinSide, setPinSide] = useState<PinSide>('long')
  const [liveFeatures, setLiveFeatures] = useState<FeatureSet | null>(null)
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0])
  const [drawAlert, setDrawAlert] = useState(true)
  /** 폰 앱 헤더가 크게 보여줄 현재가. 차트에서 올려 준다. */
  const [mobilePrice, setMobilePrice] = useState<number | null>(null)

  // 알림과 수평선을 한 번에 검사한다.
  const handlePrice = useCallback(
    (symbol: string, price: number) => {
      checkPrice(symbol, price)
      checkDrawings(symbol, price)
    },
    [checkPrice, checkDrawings],
  )

  const { layout, active, cells, splitCol, splitRow } = layoutState
  const isMobile = useIsMobile()
  const sync = useSync()
  const push = usePushAlerts(sync.code, alerts)
  const watchlist = useWatchlist()
  const pinStore = usePins()

  const pip = usePipWindow()

  // 홈 화면에 추가하면 주소창이 사라지고 알림도 받을 수 있다 — 한 번만 알려 준다.
  const install = useInstallPrompt()

  const setLayout = useCallback((mode: LayoutMode) => {
    setLayoutState((prev) => ({
      ...prev,
      layout: mode,
      active: Math.min(prev.active, mode - 1),
    }))
  }, [])

  const setActive = useCallback((index: number) => {
    setLayoutState((prev) => (prev.active === index ? prev : { ...prev, active: index }))
  }, [])

  const setCellSymbol = useCallback((index: number, symbol: string) => {
    setLayoutState((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) => (i === index ? { ...c, symbol } : c)),
    }))
  }, [])

  /** 활성 칸의 종목을 4칸에 그대로 복사하고 주기만 다르게 건다. */
  const applyMtf = useCallback((intervals: Interval[]) => {
    setLayoutState((prev) => {
      const symbol = prev.cells[prev.active]?.symbol ?? DEFAULT_LAYOUT.cells[0].symbol
      return {
        ...prev,
        layout: 4,
        active: 0,
        cells: prev.cells.map((c, i) => (intervals[i] ? { symbol, interval: intervals[i] } : c)),
      }
    })
  }, [])

  const setCellInterval = useCallback((index: number, interval: Interval) => {
    setLayoutState((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) => (i === index ? { ...c, interval } : c)),
    }))
  }, [])

  // 모바일에선 분할을 쌓아봐야 각각이 너무 작다 — 활성 칸 하나만 보여준다.
  const effectiveLayout = isMobile ? 1 : layout
  const visibleCells = isMobile ? [cells[active] ?? cells[0]] : cells.slice(0, layout)
  const activeSymbol = cells[active]?.symbol ?? 'BTCUSDT'
  const alertBadge =
    alerts.filter((a) => a.active).length + drawings.filter((d) => d.alert).length

  /** 열린 묶음의 내용. 데스크톱 서랍과 모바일 시트가 이걸 그대로 나눠 쓴다. */
  const panelContent = useMemo(() => {
    switch (panel) {
      case 'discover':
        return (
          <DiscoverPanel
            symbol={activeSymbol}
            interval={cells[active]?.interval ?? '1m'}
            liveFeatures={liveFeatures}
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
              if (on) {
                setDrawMode(false)
                if (isMobile) setPanel(null)
              }
            }}
            onPinSideChange={setPinSide}
            onRemove={pinStore.remove}
            onClear={pinStore.clear}
            liveFeatures={liveFeatures}
            symbol={activeSymbol}
          />
        )
      case 'mtf':
        return (
          <MtfPanel
            symbol={activeSymbol}
            current={cells.slice(0, 4).map((c) => c.interval)}
            onApply={(ivs) => {
              applyMtf(ivs)
              setPanel(null)
            }}
          />
        )
      case 'watchlist':
        return (
          <Watchlist
            symbols={watchlist.symbols}
            rows={watchlist.rows}
            allSymbols={symbols}
            current={activeSymbol}
            onPick={(s) => {
              setCellSymbol(active, s)
              if (isMobile) setPanel(null)
            }}
            onAdd={watchlist.add}
            onRemove={watchlist.remove}
          />
        )
      case 'indicators':
        return <IndicatorPanel settings={indicators} onChange={setIndicators} />
      case 'drawings':
        return (
          <DrawingPanel
            symbol={activeSymbol}
            drawings={drawings}
            drawMode={drawMode}
            drawColor={drawColor}
            drawAlert={drawAlert}
            onToggleMode={() => setDrawMode((v) => !v)}
            onColorChange={setDrawColor}
            onAlertChange={setDrawAlert}
            onAdd={(price) => addDrawing(activeSymbol, price, drawColor, drawAlert)}
            onRemove={removeDrawing}
            onUpdate={updateDrawing}
            onClear={() => clearSymbol(activeSymbol)}
          />
        )
      case 'alerts':
        return (
          <AlertPanel
            symbol={activeSymbol}
            alerts={alerts}
            permission={permission}
            onAdd={addAlert}
            onRemove={removeAlert}
            push={push}
            hasSyncCode={Boolean(sync.code)}
            onCreateSyncCode={() => {
              const code = randomCode()
              sync.setCode(code)
              return code
            }}
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
      default:
        return null
    }
  }, [
    panel,
    activeSymbol,
    cells,
    active,
    liveFeatures,
    pinStore,
    pinMode,
    pinSide,
    isMobile,
    applyMtf,
    watchlist,
    symbols,
    setCellSymbol,
    indicators,
    drawings,
    drawMode,
    drawColor,
    drawAlert,
    addDrawing,
    removeDrawing,
    updateDrawing,
    clearSymbol,
    alerts,
    permission,
    addAlert,
    removeAlert,
    push,
    sync,
  ])

  // ── 폰 앱 ──────────────────────────────────────────────────────────
  // 데스크톱과 상태는 그대로 나눠 쓰고 화면 구조만 다르게 간다.
  const mobileTicker = useTicker24h(activeSymbol)

  /** 더보기에서 여는 상세 페이지의 내용. 기존 패널을 그대로 재사용한다. */
  const renderMobilePage = useCallback(
    (page: MobilePage) => {
      switch (page) {
        case 'indicators':
          return <IndicatorPanel settings={indicators} onChange={setIndicators} />
        case 'drawings':
          return (
            <DrawingPanel
              symbol={activeSymbol}
              drawings={drawings}
              drawMode={drawMode}
              drawColor={drawColor}
              drawAlert={drawAlert}
              onToggleMode={() => setDrawMode((v) => !v)}
              onColorChange={setDrawColor}
              onAlertChange={setDrawAlert}
              onAdd={(price) => addDrawing(activeSymbol, price, drawColor, drawAlert)}
              onRemove={removeDrawing}
              onUpdate={updateDrawing}
              onClear={() => clearSymbol(activeSymbol)}
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
                if (on) setDrawMode(false)
              }}
              onPinSideChange={setPinSide}
              onRemove={pinStore.remove}
              onClear={pinStore.clear}
              liveFeatures={liveFeatures}
              symbol={activeSymbol}
            />
          )
        case 'discover':
          return (
            <DiscoverPanel
              symbol={activeSymbol}
              interval={cells[active]?.interval ?? '1m'}
              liveFeatures={liveFeatures}
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
    },
    [
      indicators,
      activeSymbol,
      drawings,
      drawMode,
      drawColor,
      drawAlert,
      addDrawing,
      removeDrawing,
      updateDrawing,
      clearSymbol,
      cells,
      active,
      applyMtf,
      pinStore,
      pinMode,
      pinSide,
      liveFeatures,
      sync,
    ],
  )

  if (isMobile) {
    const cell = cells[active] ?? cells[0]
    return (
      <>
        <MobileApp
          symbol={cell.symbol}
          interval={cell.interval}
          onIntervalChange={(iv) => setCellInterval(active, iv)}
          onSymbolChange={(s) => setCellSymbol(active, s)}
          ticker={mobileTicker}
          livePrice={mobilePrice}
          favorites={watchlist.symbols}
          watchRows={watchlist.rows}
          allSymbols={symbols}
          onToggleFavorite={watchlist.toggle}
          alerts={alerts}
          drawings={drawings}
          onRemoveAlert={removeAlert}
          onRemoveDrawing={removeDrawing}
          onToggleDrawingAlert={(id, on) => updateDrawing(id, { alert: on, fired: false })}
          alertCount={alertBadge}
          drawMode={drawMode}
          onToggleDraw={() => setDrawMode((v) => !v)}
          canUndo={canUndo}
          onUndo={undo}
          install={{
            canShow: install.canShow,
            ios: install.ios,
            installable: install.installable,
            install: () => void install.install(),
          }}
          alertsHeader={
            <PushBox
              push={push}
              hasSyncCode={Boolean(sync.code)}
              onCreateSyncCode={() => {
                const code = randomCode()
                sync.setCode(code)
                return code
              }}
            />
          }
          renderAlertForm={(done) => (
            <AlertForm
              symbol={cell.symbol}
              livePrice={mobilePrice}
              onAdd={addAlert}
              onDone={done}
            />
          )}
          renderPage={renderMobilePage}
          chart={
            <ChartCell
              key={`m-${cell.symbol}-${cell.interval}`}
              symbol={cell.symbol}
              interval={cell.interval}
              symbols={symbols}
              indicators={indicators}
              alerts={alerts}
              drawings={drawings}
              drawMode={drawMode}
              onDrawPrice={(price) => {
                addDrawing(cell.symbol, price, drawColor, drawAlert)
                setDrawMode(false)
              }}
              pinMode={pinMode}
              pins={pinStore.pins.filter(
                (pn) => pn.symbol === cell.symbol && pn.interval === cell.interval,
              )}
              onAddPin={({ time, price, features }) => {
                pinStore.add({
                  symbol: cell.symbol,
                  interval: cell.interval,
                  time,
                  price,
                  side: pinSide,
                  features,
                })
              }}
              onPinFail={(reason) => pushToast(reason)}
              onLiveFeatures={setLiveFeatures}
              onMoveDrawing={handleMoveDrawing}
              active={false}
              showMiniBar={false}
              bare
              onLivePrice={setMobilePrice}
              onActivate={() => {}}
              onSymbolChange={(s) => setCellSymbol(active, s)}
              onIntervalChange={(iv) => setCellInterval(active, iv)}
              onPrice={handlePrice}
              onToggleIndicator={(which) =>
                setIndicators((prev) => ({
                  ...prev,
                  [which]: { ...prev[which], enabled: !prev[which].enabled },
                }))
              }
            />
          }
        />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </>
    )
  }

  return (
    <div className={`app${panel ? ' panel-open' : ''}`}>
      <Toolbar
        layout={layout}
        onLayoutChange={setLayout}
        pipSupported={pip.supported}
        pipOpen={pip.open}
        onTogglePip={() => void pip.toggle()}
      />

      <div className="body">
        {/* 좌측 도구 레일 — 그리기 도구만 남긴다(데스크톱 전용). */}
        <nav className="tool-rail" aria-label="그리기 도구">
          <button
            type="button"
            className={`icon-btn${drawMode ? ' active' : ''}`}
            title="수평선 그리기"
            aria-label="수평선 그리기"
            aria-pressed={drawMode}
            onClick={() => setDrawMode((v) => !v)}
          >
            <Icon name="pen" size={17} />
          </button>

          <div className="rail-sep" />

          <div className="rail-swatches">
            {DRAW_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${c === drawColor ? ' active' : ''}`}
                style={{ '--swatch': c } as React.CSSProperties}
                title={`선 색상 ${c}`}
                aria-label={`선 색상 ${c}`}
                aria-pressed={c === drawColor}
                onClick={() => setDrawColor(c)}
              />
            ))}
          </div>

          <div className="rail-sep" />

          <button
            type="button"
            className="icon-btn"
            disabled={!canUndo}
            title="실행취소"
            aria-label="실행취소"
            onClick={undo}
          >
            <Icon name="undo" size={17} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title={`${activeSymbol} 선 모두 지우기`}
            aria-label={`${activeSymbol} 선 모두 지우기`}
            onClick={() => clearSymbol(activeSymbol)}
          >
            <Icon name="trash" size={17} />
          </button>

          <div className="rail-gap" />

          {layout > 1 && (
            <button
              type="button"
              className="icon-btn"
              title="칸 크기 균등하게"
              aria-label="칸 크기 균등하게"
              onClick={resetSplit}
            >
              <Icon name="equalize" size={17} />
            </button>
          )}
        </nav>

        <main
          ref={gridRef}
          className={`chart-grid grid-${effectiveLayout}`}
          style={
            effectiveLayout === 1
              ? undefined
              : {
                  gridTemplateColumns: `${splitCol}fr 1px ${1 - splitCol}fr`,
                  ...(layout === 4
                    ? { gridTemplateRows: `${splitRow}fr 1px ${1 - splitRow}fr` }
                    : {}),
                }
          }
        >
          {visibleCells.map((cell, i) => (
            <ChartCell
              key={i}
              gridStyle={
                effectiveLayout === 1
                  ? undefined
                  : effectiveLayout === 2
                    ? { gridColumn: i === 0 ? 1 : 3, gridRow: 1 }
                    : { gridColumn: i % 2 === 0 ? 1 : 3, gridRow: i < 2 ? 1 : 3 }
              }
              symbol={cell.symbol}
              interval={cell.interval}
              symbols={symbols}
              indicators={indicators}
              alerts={alerts}
              drawings={drawings}
              drawMode={drawMode && i === active}
              onDrawPrice={(price) => {
                addDrawing(cell.symbol, price, drawColor, drawAlert)
                setDrawMode(false)
              }}
              pinMode={pinMode && i === active}
              pins={pinStore.pins.filter(
                (pn) => pn.symbol === cell.symbol && pn.interval === cell.interval,
              )}
              onAddPin={({ time, price, features }) => {
                pinStore.add({
                  symbol: cell.symbol,
                  interval: cell.interval,
                  time,
                  price,
                  side: pinSide,
                  features,
                })
              }}
              onPinFail={(reason) => pushToast(reason)}
              onLiveFeatures={i === active ? setLiveFeatures : undefined}
              onMoveDrawing={handleMoveDrawing}
              active={effectiveLayout > 1 && i === active}
              showMiniBar
              onActivate={() => setActive(isMobile ? active : i)}
              onSymbolChange={(s) => setCellSymbol(isMobile ? active : i, s)}
              onIntervalChange={(iv) => setCellInterval(isMobile ? active : i, iv)}
              onPrice={handlePrice}
              onToggleIndicator={(which) =>
                setIndicators((prev) => ({
                  ...prev,
                  [which]: { ...prev[which], enabled: !prev[which].enabled },
                }))
              }
              onOpenIndicatorSettings={() => openPanel('indicators')}
            />
          ))}

          {/* 칸 사이 경계 — 끌어서 크기를 바꿄다. */}
          {effectiveLayout > 1 && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div
              className="split-bar split-col"
              style={{ gridColumn: 2, gridRow: effectiveLayout === 4 ? '1 / -1' : 1 }}
              onPointerDown={startSplitDrag('col')}
              onDoubleClick={resetSplit}
            />
          )}
          {effectiveLayout === 4 && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div
              className="split-bar split-row"
              style={{ gridColumn: '1 / -1', gridRow: 2 }}
              onPointerDown={startSplitDrag('row')}
              onDoubleClick={resetSplit}
            />
          )}
        </main>

        <PanelHost
          open={panel}
          onOpenChange={setPanel}
          alertCount={alertBadge}
          mobile={isMobile}
        >
          {panelContent}
        </PanelHost>
      </div>

      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {/* PiP 미니창 — 활성 칸을 그대로 미러링(같은 컴포넌트를 포털로 렌더) */}
      {pip.container &&
        createPortal(
          <ChartCell
            key={`pip-${cells[active].symbol}-${cells[active].interval}`}
            symbol={cells[active].symbol}
            interval={cells[active].interval}
            symbols={symbols}
            indicators={indicators}
            alerts={alerts}
            drawings={drawings}
            drawMode={false}
            onDrawPrice={() => {}}
            onMoveDrawing={handleMoveDrawing}
            pinMode={false}
            pins={pinStore.pins.filter(
              (pn) =>
                pn.symbol === cells[active].symbol && pn.interval === cells[active].interval,
            )}
            onAddPin={() => {}}
            onPinFail={() => {}}
            active={false}
            showMiniBar
            onActivate={() => {}}
            onSymbolChange={(s) => setCellSymbol(active, s)}
            onIntervalChange={(iv) => setCellInterval(active, iv)}
            onPrice={handlePrice}
          />,
          pip.container,
        )}
    </div>
  )
}

export default App

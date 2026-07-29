import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import { ChartCell } from './components/ChartCell'
import { Toolbar } from './components/Toolbar'
import { IndicatorPanel } from './components/IndicatorPanel'
import { AlertPanel } from './components/AlertPanel'
import { DrawingPanel } from './components/DrawingPanel'
import { Toasts, type Toast } from './components/Toasts'
import { usePriceAlerts, type PriceAlert } from './hooks/usePriceAlerts'
import { useNotifications } from './hooks/useNotifications'
import { useSymbols } from './hooks/useSymbols'
import { usePipWindow } from './hooks/usePipWindow'
import { useDrawings } from './hooks/useDrawings'
import { DRAW_COLORS, type Drawing } from './lib/drawings'
import type { Interval } from './lib/binance'
import {
  loadIndicators,
  saveIndicators,
  type IndicatorSettings,
} from './lib/indicatorConfig'
import {
  clampSplit,
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

  // 모바일에서는 설정 패널을 기본으로 숨기고 시트로 올린다.
  const [sheetOpen, setSheetOpen] = useState(false)

  // 데스크톱: 우측 패널을 접어 차트를 넓힌다.
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem('trading.panelOpen') !== '0'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('trading.panelOpen', panelOpen ? '1' : '0')
    } catch {
      /* 저장 실패는 무시 */
    }
  }, [panelOpen])

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
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0])
  const [drawAlert, setDrawAlert] = useState(true)

  // 알림과 수평선을 한 번에 검사한다.
  const handlePrice = useCallback(
    (symbol: string, price: number) => {
      checkPrice(symbol, price)
      checkDrawings(symbol, price)
    },
    [checkPrice, checkDrawings],
  )

  const { layout, active, cells, splitCol, splitRow } = layoutState

  const pip = usePipWindow()

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

  const setCellInterval = useCallback((index: number, interval: Interval) => {
    setLayoutState((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) => (i === index ? { ...c, interval } : c)),
    }))
  }, [])

  const visibleCells = cells.slice(0, layout)
  const activeSymbol = cells[active]?.symbol ?? 'BTCUSDT'

  return (
    <div className="app">
      <Toolbar
        layout={layout}
        onLayoutChange={setLayout}
        pipSupported={pip.supported}
        pipOpen={pip.open}
        onTogglePip={() => void pip.toggle()}
      />

      <div className="body">
        {/* 좌측 도구 레일 — 자주 쓰는 것을 바로 닿게 한다(데스크톱 전용). */}
        <nav className="tool-rail">
          <button
            type="button"
            className={drawMode ? 'active' : undefined}
            title="수평선 그리기"
            onClick={() => setDrawMode((v) => !v)}
          >
            ─
          </button>
          <div className="rail-swatches">
            {DRAW_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${c === drawColor ? ' active' : ''}`}
                style={{ background: c }}
                title={`선 색상 ${c}`}
                onClick={() => setDrawColor(c)}
              />
            ))}
          </div>
          <button type="button" disabled={!canUndo} title="실행취소" onClick={undo}>
            ↩
          </button>
          <button
            type="button"
            title={`${activeSymbol} 선 모두 지우기`}
            onClick={() => clearSymbol(activeSymbol)}
          >
            🗑
          </button>
          <div className="rail-gap" />
          {layout > 1 && (
            <button type="button" title="칸 크기 균등하게" onClick={resetSplit}>
              ⧉
            </button>
          )}
          <button
            type="button"
            className={panelOpen ? 'active' : undefined}
            title={panelOpen ? '우측 패널 접기' : '우측 패널 열기'}
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen ? '›' : '‹'}
          </button>
        </nav>

        <main
          ref={gridRef}
          className={`chart-grid grid-${layout}`}
          style={
            layout === 1
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
                layout === 1
                  ? undefined
                  : layout === 2
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
              onMoveDrawing={handleMoveDrawing}
              active={layout > 1 && i === active}
              showMiniBar
              onActivate={() => setActive(i)}
              onSymbolChange={(s) => setCellSymbol(i, s)}
              onIntervalChange={(iv) => setCellInterval(i, iv)}
              onPrice={handlePrice}
              onToggleIndicator={(which) =>
                setIndicators((prev) => ({
                  ...prev,
                  [which]: { ...prev[which], enabled: !prev[which].enabled },
                }))
              }
              onOpenIndicatorSettings={() => setSheetOpen(true)}
            />
          ))}

          {/* 칸 사이 경계 — 끌어서 크기를 바꿄다. */}
          {layout > 1 && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div
              className="split-bar split-col"
              style={{ gridColumn: 2, gridRow: layout === 4 ? '1 / -1' : 1 }}
              onPointerDown={startSplitDrag('col')}
              onDoubleClick={resetSplit}
            />
          )}
          {layout === 4 && (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div
              className="split-bar split-row"
              style={{ gridColumn: '1 / -1', gridRow: 2 }}
              onPointerDown={startSplitDrag('row')}
              onDoubleClick={resetSplit}
            />
          )}
        </main>

        {/* 모바일: 시트가 열렸을 때 뒤배경을 눌러 닫는다 */}
        {sheetOpen && (
          <button
            type="button"
            className="sheet-backdrop"
            aria-label="설정 닫기"
            onClick={() => setSheetOpen(false)}
          />
        )}

        <aside
          className={`settings-panel${sheetOpen ? ' open' : ''}${panelOpen ? '' : ' collapsed'}`}
        >
          <button type="button" className="sheet-handle" onClick={() => setSheetOpen(false)}>
            <span />
          </button>
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
          <IndicatorPanel settings={indicators} onChange={setIndicators} />
          <AlertPanel
            symbol={activeSymbol}
            alerts={alerts}
            permission={permission}
            onAdd={addAlert}
            onRemove={removeAlert}
          />
        </aside>
      </div>

      {/* 모바일 전용 하단 버튼 — 데스크톱에서는 CSS 로 숨긴다 */}
      <div className="mobile-bar">
        <button
          type="button"
          className={drawMode ? 'active' : undefined}
          onClick={() => {
            setDrawMode((v) => !v)
            setSheetOpen(false)
          }}
        >
          {drawMode ? '✓ 차트 탭' : '─ 수평선'}
        </button>
        <button type="button" onClick={() => setSheetOpen((v) => !v)}>
          〰 지표
        </button>
        <button type="button" disabled={!canUndo} onClick={undo} title="실행취소">
          ↩
        </button>
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

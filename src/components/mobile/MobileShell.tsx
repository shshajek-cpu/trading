import { useState, type ReactNode } from 'react'
import type { Interval } from '../../lib/market/types'
import { INTERVALS, INTERVAL_GROUPS, INTERVAL_INFO } from '../../lib/intervals'
import { supportsInterval } from '../../lib/market/ids'
import { UNSUPPORTED_INTERVAL } from '../menus/IntervalMenu'
import { CHART_TYPES, type ChartType } from '../../lib/chartTypes'
import { CHART_TYPE_ICON } from '../../lib/chartTypeIcons'
import { cellCount, LAYOUT_SYNC_ITEMS, SINGLE_SHAPE, type GridShape, type LayoutControls } from '../../lib/layoutConfig'
import { LayoutEditor, LayoutPresetPicker, SavedLayoutList } from '../menus/LayoutMenu'
import { DATE_RANGES, rangeBounds } from '../../lib/dateRanges'
import { DRAWING_LABELS, TOOL_GROUPS, type DrawingTool, type MagnetMode } from '../../lib/drawings'
import { ToolIcon, type IconName as ToolIconName } from '../../chart/drawing/toolIcons'
import { Icon, LayoutIcon, type IconName } from '../Icon'
import type { MenuEntry } from '../ContextMenu'
import { BottomSheet, SheetList, SheetSection, SheetTiles } from './BottomSheet'
import { MobileChartBar, MobileTabBar, type MobileTab } from './MobileBars'
import './mobile.css'

export type MobileSheet =
  | 'interval'
  | 'add'
  | 'more'
  | 'draw'
  | 'scale'
  | 'chartType'
  | 'range'
  | 'templates'
  | 'symbolInfo'
  | 'objectTree'
  | 'pins'
  | 'sync'
  | 'trade'
  | 'layout'

export interface MobileDrawingControls {
  tool: DrawingTool
  onToolChange: (t: DrawingTool) => void
  magnet: MagnetMode
  onMagnetChange: (m: MagnetMode) => void
  stayInDrawingMode: boolean
  onStayChange: (v: boolean) => void
  locked: boolean
  onLockedChange: (v: boolean) => void
  hidden: boolean
  onHiddenChange: (v: boolean) => void
  onRemoveDrawings: () => void
  onRemoveIndicators: () => void
  /** 지금 종목의 그림 수 · 모든 차트가 함께 쓰는 지표 수 — 지울 것이 없으면 삭제 타일을 끈다. */
  drawingCount: number
  indicatorCount: number
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export interface MobileShellProps {
  tab: MobileTab
  onTabChange: (tab: MobileTab) => void
  sheet: MobileSheet | null
  onSheetChange: (sheet: MobileSheet | null) => void
  alertCount: number
  /** 차트 탭 — 다른 탭에 있어도 계속 떠 있어 돌아와도 다시 불러오지 않는다. */
  chart: ReactNode
  pages: { watchlist: ReactNode; alerts: ReactNode; explore: ReactNode; menu: ReactNode }
  /** 시트에 넣을 위젯들. */
  panels: { templates: ReactNode; symbolInfo: ReactNode; objectTree: ReactNode; pins: ReactNode; sync: ReactNode; trade: ReactNode }
  symbolLabel: string
  /** 아이콘을 고를 활성 칸의 심볼 id. */
  iconSymbol: string
  interval: Interval
  onIntervalChange: (iv: Interval) => void
  onOpenSymbolSearch: () => void
  onOpenIndicators: () => void
  onOpenAlert: () => void
  onOpenCompare: () => void
  onSnapshot: () => void
  chartType: ChartType
  onChartTypeChange: (t: ChartType) => void
  replay: boolean
  onToggleReplay: () => void
  onOpenSettings: () => void
  onGoToDate: () => void
  onApplyRange: (interval: Interval, from: number, to: number) => void
  /** 차트 시간대 — YTD 의 1월 1일을 이 시간대로 센다. */
  timezone: string
  /** ⚙ 가격축 시트 항목(데스크톱 가격축 우클릭 메뉴와 같다). */
  scaleEntries: MenuEntry[]
  drawing: MobileDrawingControls
  /** 분할 레이아웃 — 데스크톱과 같은 레이아웃(동기화)을 쓴다. */
  layout: LayoutControls
  /** 칸 경계 손잡이를 띄워 칸 크기를 조절한다(시트를 닫고 차트 위에서). */
  onResizeCells: () => void
  /** 분할 중 활성 칸 하나만 크게 보기. */
  maximized: boolean
  onToggleMaximize: () => void
  /** 차트 오른쪽 가격 축 표시(폰 전용 설정). 분할 칸이 좁을 때 끄면 차트가 넓어진다. */
  priceAxis: boolean
  onPriceAxisChange: (on: boolean) => void
}

const CURSOR_TOOLS: Partial<Record<DrawingTool, string>> = { cross: '십자선', dot: '점', arrow: '화살표' }
const MAGNET_LABELS: Record<MagnetMode, string> = { off: '끄기', weak: '약하게', strong: '강하게' }

const tileIcon = (name: IconName) => <Icon name={name} size={24} />

interface LayoutSheetBodyProps {
  layout: LayoutControls
  maximized: boolean
  onToggleMaximize: () => void
  onResizeCells: () => void
  priceAxis: boolean
  onPriceAxisChange: (on: boolean) => void
  /** 시트 닫기. */
  onDone: () => void
}

/** 레이아웃 시트 내용. 시트가 열릴 때마다 새로 마운트돼 「직접 만들기」에서 닫았어도 다음에는 처음 화면으로 연다. */
function LayoutSheetBody({ layout, maximized, onToggleMaximize, onResizeCells, priceAxis, onPriceAxisChange, onDone }: LayoutSheetBodyProps) {
  const [editing, setEditing] = useState(false)
  const count = cellCount(layout.grid)
  const pickShape = (shape: GridShape) => {
    onDone()
    layout.onShapeChange(shape)
  }
  const done = (fn: () => void) => () => {
    onDone()
    fn()
  }

  if (editing) {
    return (
      <SheetSection title="직접 만들기">
        <LayoutEditor
          variant="sheet"
          initial={layout.grid}
          onCancel={() => setEditing(false)}
          onApply={pickShape}
        />
      </SheetSection>
    )
  }

  return (
    <>
      <SheetSection title="격자">
        <LayoutPresetPicker variant="sheet" current={layout.grid} onPick={pickShape} />
      </SheetSection>
      <SheetSection title="보기">
        <SheetTiles
          columns={3}
          tiles={[
            { key: 'custom', label: '직접 만들기', icon: tileIcon('pencil'), onSelect: () => setEditing(true) },
            {
              key: 'resize',
              label: '칸 크기 조절',
              icon: <LayoutIcon shape={layout.grid} size={24} />,
              disabled: count === 1 || maximized,
              onSelect: done(onResizeCells),
            },
            { key: 'equalize', label: '균등 분할', icon: tileIcon('equalize'), disabled: count === 1, onSelect: done(layout.onEqualize) },
            ...(count > 1
              ? [
                  {
                    key: 'maximize',
                    label: maximized ? '분할로 돌아가기' : '이 칸 크게 보기',
                    icon: <LayoutIcon shape={maximized ? layout.grid : SINGLE_SHAPE} size={24} />,
                    active: maximized,
                    onSelect: done(onToggleMaximize),
                  },
                ]
              : []),
          ]}
        />
        <label className="m-setting">
          <span>가격 축 표시</span>
          <input className="tv-switch" type="checkbox" checked={priceAxis} onChange={(e) => onPriceAxisChange(e.target.checked)} />
        </label>
      </SheetSection>
      <SheetSection title="내 레이아웃">
        <SavedLayoutList variant="sheet" controls={layout} onApplied={onDone} />
      </SheetSection>
      {count > 1 && (
        <SheetSection title="모든 칸에 같이 적용">
          {LAYOUT_SYNC_ITEMS.map((s) => (
            <label key={s.key} className="m-setting">
              <span>{s.label}</span>
              <input
                className="tv-switch"
                type="checkbox"
                checked={layout.sync[s.key]}
                onChange={(e) => layout.onSyncChange(s.key, e.target.checked)}
              />
            </label>
          ))}
        </SheetSection>
      )}
    </>
  )
}

function toolLabel(tool: DrawingTool): string {
  if (tool === 'eraser') return '지우개'
  if (tool === 'measure') return '측정'
  if (tool === 'zoom') return '확대'
  return DRAWING_LABELS[tool as keyof typeof DRAWING_LABELS] ?? CURSOR_TOOLS[tool] ?? tool
}

/**
 * 폰 전용 앱 화면(TradingView 앱 구조): 맨 아래 탭 막대, 차트 탭의 아래 도구 줄,
 * 그리고 그 버튼들이 여는 아래 시트들. 데스크톱 화면을 줄인 것이 아니다.
 */
export function MobileShell(props: MobileShellProps) {
  const { tab, onTabChange, sheet, onSheetChange, drawing } = props
  const close = () => onSheetChange(null)
  const open = (s: MobileSheet) => onSheetChange(s)
  // 시트에서 다른 창(대화상자·다른 시트)을 여는 동작은 이 시트를 닫고 연다.
  const then = (fn: () => void) => () => {
    close()
    fn()
  }
  const drawingActive = !CURSOR_TOOLS[drawing.tool]

  return (
    <div className="m-app">
      <main className="m-main">
        <div className="m-chart">{props.chart}</div>

        {tab === 'chart' && drawingActive && (
          <div className="m-tool-chip" role="status">
            <ToolIcon name={drawing.tool as ToolIconName} size={20} />
            <span>{toolLabel(drawing.tool)}</span>
            <button type="button" aria-label="그리기 끝내기" onClick={() => drawing.onToolChange('cross')}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {tab !== 'chart' && (
          <div className="m-page">
            {tab === 'watchlist' && props.pages.watchlist}
            {tab === 'alerts' && props.pages.alerts}
            {tab === 'explore' && (
              <>
                <header className="m-page-head">
                  <h1 className="m-page-title">탐색</h1>
                </header>
                <div className="m-page-body">{props.pages.explore}</div>
              </>
            )}
            {tab === 'menu' && props.pages.menu}
          </div>
        )}
      </main>

      {tab === 'chart' && (
        <MobileChartBar
          symbolLabel={props.symbolLabel}
          iconSymbol={props.iconSymbol}
          intervalLabel={INTERVAL_INFO[props.interval].short}
          drawing={drawingActive}
          onSymbol={props.onOpenSymbolSearch}
          onInterval={() => open('interval')}
          onTrade={() => open('trade')}
          onAdd={() => open('add')}
          onDraw={() => open('draw')}
          onMore={() => open('more')}
        />
      )}

      <MobileTabBar tab={tab} onChange={onTabChange} alertCount={props.alertCount} />

      <BottomSheet open={sheet === 'interval'} onClose={close} title="시간 간격">
        {INTERVAL_GROUPS.map((g) => (
          <SheetSection key={g.id} title={g.label}>
            <div className="m-chips">
              {INTERVALS.filter((iv) => iv.group === g.id).map((iv) => {
                const off = !supportsInterval(props.iconSymbol, iv.id)
                return (
                  <button
                    key={iv.id}
                    type="button"
                    className={`m-chip${iv.id === props.interval ? ' active' : ''}`}
                    disabled={off}
                    title={off ? UNSUPPORTED_INTERVAL : undefined}
                    aria-label={off ? `${iv.label} — ${UNSUPPORTED_INTERVAL}` : undefined}
                    onClick={then(() => props.onIntervalChange(iv.id))}
                  >
                    {iv.label}
                    {off && ' · 미지원'}
                  </button>
                )
              })}
            </div>
          </SheetSection>
        ))}
      </BottomSheet>

      <BottomSheet open={sheet === 'add'} onClose={close} title="추가">
        <SheetTiles
          tiles={[
            { key: 'draw', label: '그리기', icon: tileIcon('pencil'), onSelect: () => open('draw') },
            { key: 'indicators', label: '지표', icon: tileIcon('indicator'), onSelect: then(props.onOpenIndicators) },
            { key: 'alert', label: '알림', icon: tileIcon('alarm'), onSelect: then(props.onOpenAlert) },
            { key: 'compare', label: '비교', icon: tileIcon('compare'), onSelect: then(props.onOpenCompare) },
            { key: 'templates', label: '지표 템플릿', icon: tileIcon('template'), onSelect: () => open('templates') },
            { key: 'snapshot', label: '차트 사진 저장', icon: tileIcon('share'), onSelect: then(props.onSnapshot) },
          ]}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'more'} onClose={close} title="더보기">
        <SheetTiles
          tiles={[
            { key: 'symbolInfo', label: '심볼 정보', icon: tileIcon('info'), onSelect: () => open('symbolInfo') },
            { key: 'layout', label: '레이아웃', icon: <LayoutIcon shape={props.layout.grid} size={24} />, onSelect: () => open('layout') },
            { key: 'chartType', label: '차트 유형', icon: tileIcon(CHART_TYPE_ICON[props.chartType]), onSelect: () => open('chartType') },
            { key: 'alerts', label: '알림 관리', icon: tileIcon('bell'), onSelect: then(() => onTabChange('alerts')) },
            { key: 'range', label: '기간', icon: tileIcon('calendar'), onSelect: () => open('range') },
            { key: 'goto', label: '날짜로 이동', icon: tileIcon('clock'), onSelect: then(props.onGoToDate) },
            { key: 'replay', label: props.replay ? '리플레이 끝내기' : '바 리플레이', icon: tileIcon('replay'), active: props.replay, onSelect: then(props.onToggleReplay) },
            { key: 'objectTree', label: '객체 트리', icon: tileIcon('objectTree'), onSelect: () => open('objectTree') },
            { key: 'settings', label: '차트 설정', icon: tileIcon('settings'), onSelect: then(props.onOpenSettings) },
            { key: 'pins', label: '핀', icon: tileIcon('pin'), onSelect: () => open('pins') },
            { key: 'sync', label: '동기화 · 저장', icon: tileIcon('sync'), onSelect: () => open('sync') },
          ]}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'chartType'} onClose={close} title="차트 유형">
        <SheetTiles
          columns={3}
          tiles={CHART_TYPES.map((t) => ({
            key: t.id,
            label: t.label,
            icon: <Icon name={CHART_TYPE_ICON[t.id]} size={26} />,
            active: t.id === props.chartType,
            onSelect: then(() => props.onChartTypeChange(t.id)),
          }))}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'layout'} onClose={close} title="레이아웃">
        <LayoutSheetBody
          layout={props.layout}
          maximized={props.maximized}
          onToggleMaximize={props.onToggleMaximize}
          onResizeCells={props.onResizeCells}
          priceAxis={props.priceAxis}
          onPriceAxisChange={props.onPriceAxisChange}
          onDone={close}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'range'} onClose={close} title="기간">
        <SheetTiles
          columns={3}
          tiles={DATE_RANGES.map((r) => ({
            key: r.id,
            label: r.label,
            icon: <span className="m-tile-text">{INTERVAL_INFO[r.interval].short}</span>,
            onSelect: then(() => {
              const { from, to } = rangeBounds(r, props.timezone)
              props.onApplyRange(r.interval, from, to)
            }),
          }))}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'scale'} onClose={close} title="가격 축">
        <SheetList entries={props.scaleEntries} onDone={close} />
      </BottomSheet>

      <BottomSheet open={sheet === 'draw'} onClose={close} title="그리기">
        {TOOL_GROUPS.map((g) =>
          g.sections.map((sec, i) => (
            <SheetSection key={`${g.id}-${i}`} title={sec.title ?? (i === 0 ? g.label : undefined)}>
              <SheetTiles
                columns={4}
                tiles={sec.items.map((item) => ({
                  key: item.tool,
                  label: item.label,
                  icon: <ToolIcon name={item.tool as ToolIconName} size={26} />,
                  active: drawing.tool === item.tool,
                  // 켜 둔 도구를 다시 누르면 끈다(데스크톱 왼쪽 툴바와 같다). 기본 커서는 끌 것이 없다.
                  onSelect: then(() =>
                    drawing.onToolChange(
                      drawing.tool === item.tool && item.tool !== 'cross' && item.tool !== 'dot' && item.tool !== 'arrow'
                        ? 'cross'
                        : item.tool,
                    ),
                  ),
                }))}
              />
            </SheetSection>
          )),
        )}
        <SheetSection title="측정">
          <SheetTiles
            columns={4}
            tiles={(['measure', 'zoom'] as const).map((t) => ({
              key: t,
              label: toolLabel(t),
              icon: <ToolIcon name={t} size={26} />,
              active: drawing.tool === t,
              onSelect: then(() => drawing.onToolChange(drawing.tool === t ? 'cross' : t)),
            }))}
          />
        </SheetSection>
        <SheetSection title="설정">
          <div className="m-setting">
            <span>자석</span>
            <div className="m-segmented" role="radiogroup" aria-label="자석">
              {(['off', 'weak', 'strong'] as MagnetMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={drawing.magnet === m}
                  className={drawing.magnet === m ? 'active' : undefined}
                  onClick={() => drawing.onMagnetChange(m)}
                >
                  {MAGNET_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
          {(
            [
              ['그리기 모드 유지', drawing.stayInDrawingMode, drawing.onStayChange],
              ['모든 그림 잠금', drawing.locked, drawing.onLockedChange],
              ['모든 그림 숨기기', drawing.hidden, drawing.onHiddenChange],
            ] as const
          ).map(([label, value, onChange]) => (
            <label key={label} className="m-setting">
              <span>{label}</span>
              <input className="tv-switch" type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
            </label>
          ))}
        </SheetSection>
        <SheetSection title="편집">
          <SheetTiles
            columns={4}
            tiles={[
              { key: 'undo', label: '실행 취소', icon: tileIcon('undo'), disabled: !drawing.canUndo, onSelect: drawing.onUndo },
              { key: 'redo', label: '다시 실행', icon: tileIcon('redo'), disabled: !drawing.canRedo, onSelect: drawing.onRedo },
              {
                key: 'rmDraw',
                label: `그림 ${drawing.drawingCount}개 삭제`,
                icon: tileIcon('trash'),
                disabled: drawing.drawingCount === 0,
                onSelect: then(drawing.onRemoveDrawings),
              },
              {
                key: 'rmInd',
                label: `지표 ${drawing.indicatorCount}개 삭제`,
                icon: tileIcon('trash'),
                disabled: drawing.indicatorCount === 0,
                onSelect: then(drawing.onRemoveIndicators),
              },
            ]}
          />
        </SheetSection>
      </BottomSheet>

      <BottomSheet open={sheet === 'templates'} onClose={close} title="지표 템플릿">
        {props.panels.templates}
      </BottomSheet>
      <BottomSheet open={sheet === 'symbolInfo'} onClose={close} title="심볼 정보">
        {props.panels.symbolInfo}
      </BottomSheet>
      <BottomSheet open={sheet === 'objectTree'} onClose={close} title="객체 트리">
        {props.panels.objectTree}
      </BottomSheet>
      <BottomSheet open={sheet === 'pins'} onClose={close} title="핀">
        {props.panels.pins}
      </BottomSheet>
      <BottomSheet open={sheet === 'sync'} onClose={close} title="동기화 · 저장">
        {props.panels.sync}
      </BottomSheet>
      <BottomSheet open={sheet === 'trade'} onClose={close} title="거래">
        {props.panels.trade}
      </BottomSheet>
    </div>
  )
}

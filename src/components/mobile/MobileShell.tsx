import type { ReactNode } from 'react'
import type { Interval } from '../../lib/binance'
import { INTERVALS, INTERVAL_GROUPS, INTERVAL_INFO } from '../../lib/intervals'
import { CHART_TYPES, type ChartType } from '../../lib/chartTypes'
import { CHART_TYPE_ICON } from '../../lib/chartTypeIcons'
import { DATE_RANGES, rangeBounds } from '../../lib/dateRanges'
import { DRAWING_LABELS, TOOL_GROUPS, type DrawingTool, type MagnetMode } from '../../lib/drawings'
import { ToolIcon, type IconName as ToolIconName } from '../../chart/drawing/toolIcons'
import { Icon, type IconName } from '../Icon'
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
  panels: { templates: ReactNode; symbolInfo: ReactNode; objectTree: ReactNode; pins: ReactNode; sync: ReactNode }
  symbolLabel: string
  base: string
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
}

const CURSOR_TOOLS: Partial<Record<DrawingTool, string>> = { cross: '십자선', dot: '점', arrow: '화살표' }
const MAGNET_LABELS: Record<MagnetMode, string> = { off: '끄기', weak: '약하게', strong: '강하게' }

const tileIcon = (name: IconName) => <Icon name={name} size={24} />

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
          base={props.base}
          intervalLabel={INTERVAL_INFO[props.interval].short}
          drawing={drawingActive}
          onSymbol={props.onOpenSymbolSearch}
          onInterval={() => open('interval')}
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
              {INTERVALS.filter((iv) => iv.group === g.id).map((iv) => (
                <button
                  key={iv.id}
                  type="button"
                  className={`m-chip${iv.id === props.interval ? ' active' : ''}`}
                  onClick={then(() => props.onIntervalChange(iv.id))}
                >
                  {iv.label}
                </button>
              ))}
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
                  onSelect: then(() => drawing.onToolChange(item.tool)),
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
              onSelect: then(() => drawing.onToolChange(t)),
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
              { key: 'rmDraw', label: '그림 삭제', icon: tileIcon('trash'), onSelect: then(drawing.onRemoveDrawings) },
              { key: 'rmInd', label: '지표 삭제', icon: tileIcon('trash'), onSelect: then(drawing.onRemoveIndicators) },
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
    </div>
  )
}

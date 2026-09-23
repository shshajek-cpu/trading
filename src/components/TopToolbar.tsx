import { useRef, useState } from 'react'
import type { Interval } from '../lib/binance'
import type { ChartType } from '../lib/chartTypes'
import { INTERVAL_INFO } from '../lib/intervals'
import type { LayoutMode } from '../lib/layoutConfig'
import type { IndicatorInstance } from '../lib/indicatorConfig'
import { IndicatorTemplatesMenu } from './IndicatorTemplatesMenu'
import { ChartTypeMenu } from './menus/ChartTypeMenu'
import { CHART_TYPE_ICON } from '../lib/chartTypeIcons'
import { IntervalMenu } from './menus/IntervalMenu'
import { LayoutMenu } from './menus/LayoutMenu'
import { SnapshotMenu } from './menus/SnapshotMenu'
import { Popover } from './ui/Popover'
import { Icon } from './Icon'

export interface TopToolbarProps {
  displaySymbol: string
  onOpenSymbolSearch: () => void
  onOpenCompare: () => void
  interval: Interval
  favorites: Interval[]
  onIntervalChange: (iv: Interval) => void
  onToggleFavorite: (iv: Interval) => void
  chartType: ChartType
  onChartTypeChange: (t: ChartType) => void
  onOpenIndicators: () => void
  indicators: IndicatorInstance[]
  onIndicatorsChange: (next: IndicatorInstance[]) => void
  onOpenAlert: () => void
  replay: boolean
  onToggleReplay: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  layout: LayoutMode
  onLayoutChange: (mode: LayoutMode) => void
  onEqualize: () => void
  syncChartType: boolean
  onSyncChartTypeChange: (on: boolean) => void
  onSave: () => void
  saved: boolean
  onQuickSearch: () => void
  onSettings: () => void
  /** 왼쪽 위 심볼 이름·시고저종 줄(상태 줄)을 보이는지. */
  statusLine: boolean
  onToggleStatusLine: () => void
  fullscreen: boolean
  onFullscreen: () => void
  onSnapshotDownload: () => void
  onSnapshotCopy: () => void
  pipSupported: boolean
  pipOpen: boolean
  onTogglePip: () => void
}

export function TopToolbar(props: TopToolbarProps) {
  const {
    displaySymbol,
    onOpenSymbolSearch,
    onOpenCompare,
    interval,
    favorites,
    onIntervalChange,
    onToggleFavorite,
    chartType,
    onChartTypeChange,
    onOpenIndicators,
    indicators,
    onIndicatorsChange,
    onOpenAlert,
    replay,
    onToggleReplay,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    layout,
    onLayoutChange,
    onEqualize,
    syncChartType,
    onSyncChartTypeChange,
    onSave,
    saved,
    onQuickSearch,
    onSettings,
    statusLine,
    onToggleStatusLine,
    fullscreen,
    onFullscreen,
    onSnapshotDownload,
    onSnapshotCopy,
    pipSupported,
    pipOpen,
    onTogglePip,
  } = props

  const [ivOpen, setIvOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [snapOpen, setSnapOpen] = useState(false)

  const ivRef = useRef<HTMLButtonElement>(null)
  const typeRef = useRef<HTMLButtonElement>(null)
  const tplRef = useRef<HTMLButtonElement>(null)
  const layoutRef = useRef<HTMLButtonElement>(null)
  const snapRef = useRef<HTMLButtonElement>(null)
  const shownFavorites = favorites.includes(interval) ? favorites : [interval, ...favorites]

  const div = <span className="tv-tb-divider" />

  return (
    <div className="tv-toolbar">
      <button type="button" className="tv-symbol-pill" title="심볼 검색" onClick={onOpenSymbolSearch}>
        {displaySymbol}
      </button>

      <button type="button" className="tv-tb-btn" title="심볼 비교" aria-label="심볼 비교" onClick={onOpenCompare}>
        <Icon name="compare" size={22} />
      </button>

      {div}

      <div className="tv-interval-group">
        {shownFavorites.map((iv) => (
          <button
            key={iv}
            type="button"
            className={`tv-interval-btn${iv === interval ? ' active' : ''}`}
            onClick={() => onIntervalChange(iv)}
          >
            {INTERVAL_INFO[iv].short}
          </button>
        ))}
        <button
          ref={ivRef}
          type="button"
          className="tv-tb-btn tv-interval-menu-btn"
          title="시간 간격"
          aria-label="시간 간격"
          onClick={() => setIvOpen((v) => !v)}
        >
          <Icon name="chevron" size={16} />
        </button>
      </div>
      <IntervalMenu
        anchor={ivRef.current}
        open={ivOpen}
        onClose={() => setIvOpen(false)}
        value={interval}
        favorites={favorites}
        onChange={onIntervalChange}
        onToggleFavorite={onToggleFavorite}
      />

      {div}

      <button
        ref={typeRef}
        type="button"
        className="tv-tb-btn"
        title="차트 유형"
        aria-label="차트 유형"
        onClick={() => setTypeOpen((v) => !v)}
      >
        <Icon name={CHART_TYPE_ICON[chartType]} size={22} />
      </button>
      <ChartTypeMenu
        anchor={typeRef.current}
        open={typeOpen}
        onClose={() => setTypeOpen(false)}
        value={chartType}
        onChange={onChartTypeChange}
      />

      {div}

      <button type="button" className="tv-tb-btn wide" title="지표" aria-label="지표" onClick={onOpenIndicators}>
        <Icon name="indicator" size={22} />
        <span className="tv-tb-label">지표</span>
      </button>

      <button
        ref={tplRef}
        type="button"
        className="tv-tb-btn"
        title="지표 템플릿"
        aria-label="지표 템플릿"
        onClick={() => setTplOpen((v) => !v)}
      >
        <Icon name="template" size={22} />
      </button>
      <Popover anchor={tplRef.current} open={tplOpen} onClose={() => setTplOpen(false)} placement="bottom-start">
        <IndicatorTemplatesMenu
          indicators={indicators}
          onApply={onIndicatorsChange}
          onClose={() => setTplOpen(false)}
        />
      </Popover>

      <button type="button" className="tv-tb-btn wide" title="알림" aria-label="알림 만들기" onClick={onOpenAlert}>
        <Icon name="alarm" size={22} />
        <span className="tv-tb-label">알림</span>
      </button>

      <button
        type="button"
        className={`tv-tb-btn wide${replay ? ' active' : ''}`}
        title="리플레이"
        aria-label="리플레이"
        aria-pressed={replay}
        onClick={onToggleReplay}
      >
        <Icon name="replay" size={22} />
        <span className="tv-tb-label">리플레이</span>
      </button>

      {div}

      <button type="button" className="tv-tb-btn" title="실행 취소 (Ctrl+Z)" aria-label="실행 취소" disabled={!canUndo} onClick={onUndo}>
        <Icon name="undo" size={22} />
      </button>
      <button type="button" className="tv-tb-btn" title="다시 실행 (Ctrl+Y)" aria-label="다시 실행" disabled={!canRedo} onClick={onRedo}>
        <Icon name="redo" size={22} />
      </button>

      <span className="tv-tb-gap" />

      <button
        ref={layoutRef}
        type="button"
        className="tv-tb-btn"
        title="레이아웃"
        aria-label="레이아웃"
        onClick={() => setLayoutOpen((v) => !v)}
      >
        <Icon name={layout === 1 ? 'layout1' : layout === 2 ? 'layout2' : 'layout4'} size={22} />
      </button>
      <LayoutMenu
        anchor={layoutRef.current}
        open={layoutOpen}
        onClose={() => setLayoutOpen(false)}
        value={layout}
        onChange={onLayoutChange}
        onEqualize={onEqualize}
        syncChartType={syncChartType}
        onSyncChartTypeChange={onSyncChartTypeChange}
      />

      <button type="button" className={`tv-tb-btn wide${saved ? ' saved' : ''}`} title="저장" onClick={onSave}>
        <Icon name="save" size={22} />
        <span className="tv-tb-label">{saved ? '저장됨' : '저장'}</span>
      </button>

      <button type="button" className="tv-tb-btn" title="빠른 검색 (Ctrl+K)" aria-label="빠른 검색" onClick={onQuickSearch}>
        <Icon name="search" size={22} />
      </button>

      <button
        type="button"
        className={`tv-tb-btn${statusLine ? ' active' : ''}`}
        title={statusLine ? '심볼 이름·시고저종 줄 숨기기' : '심볼 이름·시고저종 줄 보이기'}
        aria-label="심볼 이름·시고저종 줄"
        aria-pressed={statusLine}
        onClick={onToggleStatusLine}
      >
        <Icon name="statusLine" size={22} />
      </button>

      <button type="button" className="tv-tb-btn" title="설정" aria-label="설정" onClick={onSettings}>
        <Icon name="settings" size={22} />
      </button>

      <button
        type="button"
        className={`tv-tb-btn${fullscreen ? ' active' : ''}`}
        title="전체 화면 (Shift+F)"
        aria-label="전체 화면"
        onClick={onFullscreen}
      >
        <Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} size={22} />
      </button>

      <button
        ref={snapRef}
        type="button"
        className="tv-tb-btn"
        title="스냅샷"
        aria-label="스냅샷"
        onClick={() => setSnapOpen((v) => !v)}
      >
        <Icon name="camera" size={22} />
      </button>
      <SnapshotMenu
        anchor={snapRef.current}
        open={snapOpen}
        onClose={() => setSnapOpen(false)}
        onDownload={onSnapshotDownload}
        onCopy={onSnapshotCopy}
      />

      {pipSupported && (
        <button
          type="button"
          className={`tv-tb-btn${pipOpen ? ' active' : ''}`}
          title="미니창"
          aria-label="미니창"
          aria-pressed={pipOpen}
          onClick={onTogglePip}
        >
          <Icon name="pip" size={22} />
        </button>
      )}
    </div>
  )
}

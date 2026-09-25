import { useRef, useState } from 'react'
import type { Interval } from '../lib/binance'
import type { ChartType } from '../lib/chartTypes'
import { INTERVAL_INFO, INTERVALS } from '../lib/intervals'
import type { LayoutMode, LayoutSync, LayoutSyncKey } from '../lib/layoutConfig'
import type { IndicatorInstance } from '../lib/indicatorConfig'
import { IndicatorTemplatesMenu } from './IndicatorTemplatesMenu'
import { ChartTypeMenu } from './menus/ChartTypeMenu'
import { CHART_TYPE_ICON, LAYOUT_ICON } from '../lib/chartTypeIcons'
import { IntervalMenu } from './menus/IntervalMenu'
import { LayoutMenu } from './menus/LayoutMenu'
import { SnapshotMenu } from './menus/SnapshotMenu'
import { Popover } from './ui/Popover'
import { Icon } from './Icon'
import { tip } from '../lib/tooltip'
import type { ShortcutId } from '../lib/shortcuts'

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
  /** 레이아웃 메뉴 "모든 칸에 같이 적용"(심볼·차트 종류·십자선). */
  layoutSync: LayoutSync
  onLayoutSyncChange: (key: LayoutSyncKey, on: boolean) => void
  onSave: () => void
  saved: boolean
  onQuickSearch: () => void
  onSettings: () => void
  /** 왼쪽 위 범례(심볼 이름·시고저종 줄, 지표 이름 줄)가 보이는지. */
  legend: boolean
  onToggleLegend: () => void
  fullscreen: boolean
  onFullscreen: () => void
  onSnapshotDownload: () => void
  onSnapshotCopy: () => void
  pipSupported: boolean
  pipOpen: boolean
  onTogglePip: () => void
  /** 툴팁에 보일 단축키(사용자가 바꾼 키 반영). 없으면 undefined. */
  shortcut: (id: ShortcutId) => string | undefined
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
    layoutSync,
    onLayoutSyncChange,
    onSave,
    saved,
    onQuickSearch,
    onSettings,
    legend,
    onToggleLegend,
    fullscreen,
    onFullscreen,
    onSnapshotDownload,
    onSnapshotCopy,
    pipSupported,
    pipOpen,
    onTogglePip,
    shortcut,
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
  // 즐겨찾기 주기는 고른 순서가 아니라 시간순(1m, 3m, 5m, 15m … D, W, M)으로 보인다. 지금 주기도 제자리에 끼운다.
  const shownFavorites = INTERVALS.map((i) => i.id).filter((iv) => iv === interval || favorites.includes(iv))

  const div = <span className="tv-tb-divider" />

  return (
    <div className="tv-toolbar">
      <button
        type="button"
        className="tv-symbol-pill"
        {...tip('심볼 검색', '다른 종목으로 바꿉니다. 차트에서 영문 글자를 바로 쳐도 열립니다.')}
        onClick={onOpenSymbolSearch}
      >
        {displaySymbol}
      </button>

      <button
        type="button"
        className="tv-tb-btn"
        {...tip('심볼 비교', '다른 종목을 같은 차트에 % 변화 선으로 겹쳐 봅니다.')}
        aria-label="심볼 비교"
        onClick={onOpenCompare}
      >
        <Icon name="compare" size={22} />
      </button>

      {div}

      <div className="tv-interval-group">
        {shownFavorites.map((iv) => (
          <button
            key={iv}
            type="button"
            className={`tv-interval-btn${iv === interval ? ' active' : ''}`}
            {...tip(`${INTERVAL_INFO[iv].label} 봉`)}
            onClick={() => onIntervalChange(iv)}
          >
            {INTERVAL_INFO[iv].short}
          </button>
        ))}
        <button
          ref={ivRef}
          type="button"
          className="tv-tb-btn tv-interval-menu-btn"
          {...tip('시간 간격', '모든 봉 주기 목록입니다. ☆ 를 누르면 상단 바에 고정됩니다. 차트에서 숫자를 쳐도 바꿀 수 있습니다.')}
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
        {...tip('차트 유형', '캔들·바·라인·에어리어·하이킨 아시 등 봉을 그리는 방식을 고릅니다.')}
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

      <button
        type="button"
        className="tv-tb-btn wide"
        {...tip('지표', '이동평균·RSI·MACD 같은 지표를 찾아 차트에 넣습니다.', shortcut('openIndicators'))}
        aria-label="지표"
        onClick={onOpenIndicators}
      >
        <Icon name="indicator" size={22} />
        <span className="tv-tb-label">지표</span>
      </button>

      <button
        ref={tplRef}
        type="button"
        className="tv-tb-btn"
        {...tip('지표 템플릿', '지금 넣은 지표 묶음을 이름 붙여 저장해 두고, 나중에 한 번에 불러옵니다.')}
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

      <button
        type="button"
        className="tv-tb-btn wide"
        {...tip('알림 만들기', '가격이나 지표 값이 정한 조건에 닿으면 알려 줍니다.', shortcut('createAlert'))}
        aria-label="알림 만들기"
        onClick={onOpenAlert}
      >
        <Icon name="alarm" size={22} />
        <span className="tv-tb-label">알림</span>
      </button>

      <button
        type="button"
        className={`tv-tb-btn wide${replay ? ' active' : ''}`}
        {...tip('바 리플레이', '과거의 한 시점을 골라 그때부터 봉을 하나씩 다시 재생합니다. 복기·연습용입니다.')}
        aria-label="리플레이"
        aria-pressed={replay}
        onClick={onToggleReplay}
      >
        <Icon name="replay" size={22} />
        <span className="tv-tb-label">리플레이</span>
      </button>

      {div}

      <button
        type="button"
        className="tv-tb-btn"
        {...tip('실행 취소', '마지막 그리기 변경을 되돌립니다.', shortcut('undo'))}
        aria-label="실행 취소"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Icon name="undo" size={22} />
      </button>
      <button
        type="button"
        className="tv-tb-btn"
        {...tip('다시 실행', '되돌린 그리기 변경을 다시 적용합니다.', shortcut('redo'))}
        aria-label="다시 실행"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Icon name="redo" size={22} />
      </button>

      <span className="tv-tb-gap" />

      <button
        ref={layoutRef}
        type="button"
        className="tv-tb-btn"
        {...tip('레이아웃', '차트를 1·2·4 칸으로 나눠 여러 종목·주기를 함께 봅니다.')}
        aria-label="레이아웃"
        onClick={() => setLayoutOpen((v) => !v)}
      >
        <Icon name={LAYOUT_ICON[layout]} size={22} />
      </button>
      <LayoutMenu
        anchor={layoutRef.current}
        open={layoutOpen}
        onClose={() => setLayoutOpen(false)}
        value={layout}
        onChange={onLayoutChange}
        onEqualize={onEqualize}
        sync={layoutSync}
        onSyncChange={onLayoutSyncChange}
      />

      <button
        type="button"
        className={`tv-tb-btn wide${saved ? ' saved' : ''}`}
        {...tip(
          '저장',
          '지금 설정(레이아웃·지표·그림·알림)을 동기화 서버에 올립니다. 동기화 코드가 없으면 동기화 창을 엽니다.',
          shortcut('save'),
        )}
        onClick={onSave}
      >
        <Icon name="save" size={22} />
        <span className="tv-tb-label">{saved ? '저장됨' : '저장'}</span>
      </button>

      <button
        type="button"
        className="tv-tb-btn"
        {...tip('빠른 검색', '기능이나 종목 이름을 쳐서 바로 실행합니다.', shortcut('quickSearch'))}
        aria-label="빠른 검색"
        onClick={onQuickSearch}
      >
        <Icon name="search" size={22} />
      </button>

      <button
        type="button"
        className={`tv-tb-btn${legend ? ' active' : ''}`}
        {...tip(
          legend ? '범례 숨기기' : '범례 보이기',
          '왼쪽 위 심볼 이름·시고저종 줄과 지표 이름 줄을 한꺼번에 숨기거나 보입니다.',
        )}
        aria-label="범례"
        aria-pressed={legend}
        onClick={onToggleLegend}
      >
        <Icon name="legend" size={22} />
      </button>

      <button
        type="button"
        className="tv-tb-btn"
        {...tip('차트 설정', '캔들 색, 상태 줄, 가격 축, 격자, 시간대를 바꿉니다.')}
        aria-label="설정"
        onClick={onSettings}
      >
        <Icon name="settings" size={22} />
      </button>

      <button
        type="button"
        className={`tv-tb-btn${fullscreen ? ' active' : ''}`}
        {...tip('전체 화면', '브라우저 테두리 없이 화면 전체로 봅니다.', shortcut('fullscreen'))}
        aria-label="전체 화면"
        onClick={onFullscreen}
      >
        <Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} size={22} />
      </button>

      <button
        ref={snapRef}
        type="button"
        className="tv-tb-btn"
        {...tip('스냅샷', '지금 차트를 그림(PNG)으로 내려받거나 클립보드에 복사합니다.', shortcut('snapshot'))}
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
          {...tip('미니창', '차트를 다른 프로그램 위에 떠 있는 작은 창으로 띄웁니다. 보기 전용입니다.')}
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

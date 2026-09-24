import { CoinIcon } from '../CoinIcon'
import { Icon, type IconName } from '../Icon'
import './mobile.css'

export type MobileTab = 'watchlist' | 'chart' | 'alerts' | 'explore' | 'menu'

const TABS: { id: MobileTab; label: string; icon: IconName }[] = [
  { id: 'watchlist', label: '관심 목록', icon: 'star' },
  { id: 'chart', label: '차트', icon: 'chart' },
  { id: 'alerts', label: '알림', icon: 'bell' },
  { id: 'explore', label: '탐색', icon: 'discover' },
  { id: 'menu', label: '메뉴', icon: 'menu' },
]

/** 화면 맨 아래 탭 막대(TradingView 앱: 관심 목록 · 차트 · … · 메뉴). */
export function MobileTabBar({
  tab,
  onChange,
  alertCount,
}: {
  tab: MobileTab
  onChange: (tab: MobileTab) => void
  alertCount: number
}) {
  return (
    <nav className="m-tabbar" aria-label="화면">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`m-tab${tab === t.id ? ' active' : ''}`}
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <span className="m-tab-icon">
            <Icon name={tab === t.id && t.id === 'watchlist' ? 'starFill' : t.icon} size={24} />
            {t.id === 'alerts' && alertCount > 0 && <span className="m-tab-badge">{alertCount}</span>}
          </span>
          <span className="m-tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

/**
 * 차트 탭 아래 도구 줄(TradingView 앱): 심볼 · 주기 | + · ✎ · ⋯.
 * 심볼을 누르면 검색, 주기를 누르면 주기 시트, +는 추가 시트, ✎는 그리기 시트, ⋯는 더보기 시트.
 */
export function MobileChartBar({
  symbolLabel,
  base,
  intervalLabel,
  drawing,
  onSymbol,
  onInterval,
  onTrade,
  onAdd,
  onDraw,
  onMore,
}: {
  symbolLabel: string
  base: string
  intervalLabel: string
  drawing: boolean
  onSymbol: () => void
  onInterval: () => void
  onTrade: () => void
  onAdd: () => void
  onDraw: () => void
  onMore: () => void
}) {
  return (
    <div className="m-chartbar">
      <button type="button" className="m-chartbar-symbol" onClick={onSymbol} aria-label="심볼 검색">
        <CoinIcon base={base} size={22} />
        <span>{symbolLabel}</span>
      </button>
      <button type="button" className="m-chartbar-interval" onClick={onInterval} aria-label="시간 간격">
        {intervalLabel}
      </button>
      <span className="m-chartbar-gap" />
      <button type="button" className="m-chartbar-btn" onClick={onTrade} aria-label="거래">
        <Icon name="trade" size={26} />
      </button>
      <button type="button" className="m-chartbar-btn" onClick={onAdd} aria-label="추가">
        <Icon name="plus" size={26} />
      </button>
      <button
        type="button"
        className={`m-chartbar-btn${drawing ? ' active' : ''}`}
        onClick={onDraw}
        aria-label="그리기"
        aria-pressed={drawing}
      >
        <Icon name="pencil" size={26} />
      </button>
      <button type="button" className="m-chartbar-btn" onClick={onMore} aria-label="더보기">
        <Icon name="more" size={26} />
      </button>
    </div>
  )
}

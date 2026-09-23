import { Icon } from '../Icon'
import type { Interval } from '../../lib/binance'
import type { Ticker24h } from '../../lib/binance'

const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d']

const INTERVAL_LABELS: Record<Interval, string> = {
  '1m': '1분',
  '3m': '3분',
  '5m': '5분',
  '15m': '15분',
  '30m': '30분',
  '1h': '1시간',
  '2h': '2시간',
  '4h': '4시간',
  '6h': '6시간',
  '8h': '8시간',
  '12h': '12시간',
  '1d': '1일',
  '3d': '3일',
  '1w': '1주',
  '1M': '1개월',
}

interface ChartScreenProps {
  symbol: string
  interval: Interval
  onIntervalChange: (iv: Interval) => void
  /** 종목 이름을 누르면 시세 탭으로 넘어간다. */
  onPickSymbol: () => void
  ticker: Ticker24h | null
  livePrice: number | null
  favorite: boolean
  onToggleFavorite: () => void
  /** 차트 위에 떠 있는 도구 버튼들. */
  drawMode: boolean
  onToggleDraw: () => void
  canUndo: boolean
  onUndo: () => void
  onOpenIndicators: () => void
  children: React.ReactNode
}

function fmtPrice(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : 6
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/**
 * 차트 화면.
 *
 * 참고 화면처럼 종목 바, 주기 바, 차트, 고정 도구 막대를 위에서 아래로 쌓는다.
 * 조작은 차트 밖의 고정 자리에 두어 캔들과 가격 눈금을 가리지 않는다.
 */
export function ChartScreen({
  symbol,
  interval,
  onIntervalChange,
  onPickSymbol,
  ticker,
  livePrice,
  favorite,
  onToggleFavorite,
  drawMode,
  onToggleDraw,
  canUndo,
  onUndo,
  onOpenIndicators,
  children,
}: ChartScreenProps) {
  const change = ticker?.priceChangePercent ?? null
  const up = (change ?? 0) >= 0
  const base = symbol.replace('USDT', '')

  return (
    <div className="screen chart-screen">
      <header className="quote-head">
        <button type="button" className="quote-sym" onClick={onPickSymbol}>
          <span className="asset-mark" aria-hidden="true">
            {base.charAt(0)}
          </span>
          <span className="quote-copy">
            <span className="quote-name">
              {base} <em>/ USDT</em>
            </span>
            <span className="quote-market">무기한 선물 · 실시간</span>
          </span>
          <Icon name="chevron" size={14} />
        </button>

        <div className="quote-price">
          <b className={up ? 'up' : 'down'}>{livePrice === null ? '—' : fmtPrice(livePrice)}</b>
          {change !== null && (
            <span className={`quote-chg ${up ? 'up' : 'down'}`}>
              {up ? '+' : ''}
              {change.toFixed(2)}%
            </span>
          )}
        </div>

        <button
          type="button"
          className={`icon-btn fav-btn${favorite ? ' on' : ''}`}
          aria-label={favorite ? '즐겨찾기 해제' : '즐겨찾기'}
          aria-pressed={favorite}
          onClick={onToggleFavorite}
        >
          <Icon name={favorite ? 'starFill' : 'star'} size={18} />
        </button>
      </header>

      <div className="chart-commandbar">
        <div className="iv-chips" role="group" aria-label="차트 주기">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              className={iv === interval ? 'active' : undefined}
              aria-pressed={iv === interval}
              onClick={() => onIntervalChange(iv)}
            >
              {INTERVAL_LABELS[iv]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="command-btn"
          aria-label="지표 설정"
          onClick={onOpenIndicators}
        >
          <Icon name="indicator" size={19} />
        </button>
      </div>

      <div className="chart-area">
        {children}
        {drawMode && <p className="draw-tip">차트를 눌러 선을 놓으세요</p>}
      </div>

      <div className="chart-toolstrip" role="toolbar" aria-label="차트 도구">
        <span className="toolstrip-symbol">{symbol}</span>
        <span className="toolstrip-interval">{INTERVAL_LABELS[interval]}</span>
        <span className="toolstrip-spacer" />
        <button
          type="button"
          className={`toolstrip-btn${drawMode ? ' active' : ''}`}
          aria-label="수평선 그리기"
          aria-pressed={drawMode}
          onClick={onToggleDraw}
        >
          <Icon name={drawMode ? 'check' : 'pen'} size={22} />
        </button>
        <button
          type="button"
          className="toolstrip-btn"
          aria-label="지표 설정"
          onClick={onOpenIndicators}
        >
          <Icon name="indicator" size={22} />
        </button>
        <button
          type="button"
          className="toolstrip-btn"
          aria-label="실행취소"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Icon name="undo" size={21} />
        </button>
      </div>
    </div>
  )
}

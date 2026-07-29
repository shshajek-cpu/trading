import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from './Chart'
import { SymbolPicker } from './SymbolPicker'
import { useBinanceKlines } from '../hooks/useBinanceKlines'
import { useBinanceWebSocket } from '../hooks/useBinanceWebSocket'
import { useTicker24h } from '../hooks/useTicker24h'
import type { Candle, Interval } from '../lib/binance'
import type { IndicatorSettings } from '../lib/indicatorConfig'
import type { PriceAlert } from '../hooks/usePriceAlerts'
import type { Drawing } from '../lib/drawings'
import { COLORS } from '../lib/theme'

const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d']
/** 웹소켓 틱이 이보다 오래 없으면 REST 재조회로 차트를 따라잡는다. */
const STALE_MS = 15000

interface ChartCellProps {
  symbol: string
  interval: Interval
  symbols: string[]
  indicators: IndicatorSettings
  alerts: PriceAlert[]
  drawings: Drawing[]
  drawMode: boolean
  onDrawPrice: (price: number) => void
  onMoveDrawing: (id: string, price: number) => void
  active: boolean
  showMiniBar: boolean
  onActivate: () => void
  onSymbolChange: (symbol: string) => void
  onIntervalChange: (interval: Interval) => void
  onPrice: (symbol: string, price: number) => void
  /** 모바일 패널 컨트롤 — 지표를 접거나 그 지표 설정을 열때. */
  onToggleIndicator?: (which: 'rsi' | 'macd') => void
  onOpenIndicatorSettings?: () => void
  /** 분할 그리드에서 이 칸이 차지할 자리. */
  gridStyle?: React.CSSProperties
}

function formatPrice(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : 6
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function ChartCell({
  symbol,
  interval,
  symbols,
  indicators,
  alerts,
  drawings,
  drawMode,
  onDrawPrice,
  onMoveDrawing,
  active,
  showMiniBar,
  onActivate,
  onSymbolChange,
  onIntervalChange,
  onPrice,
  onToggleIndicator,
  onOpenIndicatorSettings,
  gridStyle,
}: ChartCellProps) {
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null)
  const [intervalOpen, setIntervalOpen] = useState(false)
  const ticker = useTicker24h(symbol)
  const { candles, loading, error, reload } = useBinanceKlines(symbol, interval)

  const lastTickRef = useRef(0)
  const onPriceRef = useRef(onPrice)
  onPriceRef.current = onPrice

  const handleCandle = useCallback(
    (candle: Candle) => {
      lastTickRef.current = Date.now()
      setLiveCandle(candle)
      onPriceRef.current(symbol, candle.close)
    },
    [symbol],
  )

  const handleReconnect = useCallback(() => {
    void reload()
  }, [reload])

  const status = useBinanceWebSocket(symbol, interval, {
    onCandle: handleCandle,
    onReconnect: handleReconnect,
  })

  // 폴링 시세로도 알림을 검사한다(웹소켓 데이터가 막힌 환경 대비).
  useEffect(() => {
    if (ticker) onPriceRef.current(ticker.symbol, ticker.lastPrice)
  }, [ticker])

  // 틱이 끊긴 동안 REST 재조회로 따라잡는다.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() - lastTickRef.current > STALE_MS && !loading) void reload()
    }, STALE_MS)
    return () => window.clearInterval(timer)
  }, [reload, loading])

  // 심볼/인터벌 변경 시 이전 실시간 봉 폐기
  const seriesKey = `${symbol}-${interval}`
  const seriesKeyRef = useRef(seriesKey)
  if (seriesKeyRef.current !== seriesKey) {
    seriesKeyRef.current = seriesKey
    if (liveCandle !== null) setLiveCandle(null)
  }

  const mergedCandles = useMemo(() => {
    if (candles.length === 0 || !liveCandle) return candles
    const last = candles[candles.length - 1]
    if (liveCandle.time < last.time) return candles
    if (liveCandle.time === last.time) return [...candles.slice(0, -1), liveCandle]
    return [...candles, liveCandle]
  }, [candles, liveCandle])

  const livePrice = mergedCandles.length > 0 ? mergedCandles[mergedCandles.length - 1].close : null
  const changePercent = ticker?.priceChangePercent ?? null
  const positive = (changePercent ?? 0) >= 0
  const symbolAlerts = useMemo(
    () => alerts.filter((a) => a.symbol === symbol && a.active),
    [alerts, symbol],
  )
  const symbolDrawings = useMemo(
    () => drawings.filter((d) => d.symbol === symbol),
    [drawings, symbol],
  )

  // 세로 스와이프로 종목 전환 — 손가락 하나로 옆 코인으로 넘어간다.
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      swipeRef.current = null
      return
    }
    const t = e.touches[0]
    swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = swipeRef.current
      swipeRef.current = null
      if (!start || symbols.length === 0) return

      const t = e.changedTouches[0]
      const dy = t.clientY - start.y
      const dx = t.clientX - start.x
      // 빠르고, 충분히 수직이고, 가로로 거의 안 움직였을 때만 인정한다.
      if (Date.now() - start.t > 600) return
      if (Math.abs(dy) < 70 || Math.abs(dx) > Math.abs(dy) * 0.6) return

      // 만기 있는 계약(BTCUSDT_260925 등)은 건너뛴다 — 쒸데없이 수십 개가 끼어든다.
      const list = symbols.filter((s) => !s.includes('_'))
      const i = list.indexOf(symbol)
      if (i === -1) return
      // 아래로 끌면 이전 종목, 위로 끌면 다음 종목.
      const next = dy > 0 ? i - 1 : i + 1
      if (next < 0 || next >= list.length) return
      onSymbolChange(list[next])
    },
    [symbols, symbol, onSymbolChange],
  )

  return (
    // 칸 어디를 눌러도 활성 칸이 되도록 하는 래퍼. 키보드 조작 대상이 아니라 온클릭만 둔다.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <section
      className={`chart-cell${active ? ' active' : ''}`}
      style={gridStyle}
      onMouseDownCapture={onActivate}
    >
      {showMiniBar && (
        <div className="cell-bar">
          <SymbolPicker symbol={symbol} symbols={symbols} onChange={onSymbolChange} />
          <div className="intervals">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                type="button"
                className={iv === interval ? 'active' : undefined}
                onClick={() => onIntervalChange(iv)}
              >
                {iv}
              </button>
            ))}
          </div>

          {/* 모바일: 분봉을 나열하지 않고 현재값 하나만 보이는 드롭다운으로. */}
          <div className="interval-select">
            <button
              type="button"
              className="interval-current"
              onClick={() => setIntervalOpen((v) => !v)}
            >
              {interval} ⌄
            </button>
            {intervalOpen && (
              <>
                <button
                  type="button"
                  className="interval-backdrop"
                  aria-label="닫기"
                  onClick={() => setIntervalOpen(false)}
                />
                <div className="interval-menu">
                  {INTERVALS.map((iv) => (
                    <button
                      key={iv}
                      type="button"
                      className={iv === interval ? 'active' : undefined}
                      onClick={() => {
                        onIntervalChange(iv)
                        setIntervalOpen(false)
                      }}
                    >
                      {iv}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="price-block">
            <span
              className="last-price"
              style={{
                color: livePrice === null ? COLORS.text : positive ? COLORS.up : COLORS.down,
              }}
            >
              {livePrice === null ? '—' : formatPrice(livePrice)}
            </span>
            {changePercent !== null && (
              <span className="change" style={{ color: positive ? COLORS.up : COLORS.down }}>
                {positive ? '+' : ''}
                {changePercent.toFixed(2)}%
              </span>
            )}
            <span className={`ws-status ws-${status}`} title={`WebSocket: ${status}`}>
              ●
            </span>
          </div>
        </div>
      )}

      <div className="cell-chart" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Chart
          key={seriesKey}
          candles={mergedCandles}
          interval={interval}
          indicators={indicators}
          alerts={symbolAlerts}
          drawings={symbolDrawings}
          drawMode={drawMode}
          onDrawPrice={onDrawPrice}
          onMoveDrawing={onMoveDrawing}
        />
        {/* 모바일: 지표 패널마다 접기/설정 — 트레이딩뷰처럼 차트 위에 얹는다. */}
        {onToggleIndicator && (indicators.rsi.enabled || indicators.macd.enabled) && (
          <div className="pane-controls">
            {indicators.rsi.enabled && (
              <div className="pane-ctl" data-pane="rsi">
                <button type="button" title="RSI 접기" onClick={() => onToggleIndicator('rsi')}>
                  ⌄
                </button>
                <button type="button" title="RSI 설정" onClick={onOpenIndicatorSettings}>
                  ⛭
                </button>
              </div>
            )}
            {indicators.macd.enabled && (
              <div className="pane-ctl" data-pane="macd">
                <button type="button" title="MACD 접기" onClick={() => onToggleIndicator('macd')}>
                  ⌄
                </button>
                <button type="button" title="MACD 설정" onClick={onOpenIndicatorSettings}>
                  ⛭
                </button>
              </div>
            )}
          </div>
        )}

        {loading && mergedCandles.length === 0 && <div className="overlay">불러오는 중…</div>}
        {error && (
          <div className="overlay error">
            데이터를 불러오지 못했습니다: {error.message}
            <button type="button" onClick={() => void reload()}>
              다시 시도
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

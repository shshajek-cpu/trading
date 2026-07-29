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
}: ChartCellProps) {
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null)
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

  return (
    // 칸 어디를 눌러도 활성 칸이 되도록 하는 래퍼. 키보드 조작 대상이 아니라 온클릭만 둔다.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <section
      className={`chart-cell${active ? ' active' : ''}`}
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

      <div className="cell-chart">
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

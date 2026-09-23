import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from './Chart'
import { SymbolPicker } from './SymbolPicker'
import { Icon } from './Icon'
import { useBinanceKlines } from '../hooks/useBinanceKlines'
import { useBinanceWebSocket } from '../hooks/useBinanceWebSocket'
import { useTicker24h } from '../hooks/useTicker24h'
import type { Candle, Interval } from '../lib/binance'
import type { IndicatorSettings } from '../lib/indicatorConfig'
import type { PriceAlert } from '../hooks/usePriceAlerts'
import type { Drawing } from '../lib/drawings'
import type { Pin } from '../lib/pins'
import { computeFeatures, MIN_HISTORY, type FeatureSet } from '../lib/features'
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
  /** 핀 모드와 이 칸에 찍힌 핀들. */
  pinMode: boolean
  pins: Pin[]
  onAddPin: (input: { time: number; price: number; features: FeatureSet }) => void
  onPinFail: (reason: string) => void
  /** 이 칸이 활성일 때, 맨 끝 시점의 지표를 위로 올려준다. */
  onLiveFeatures?: (f: FeatureSet | null) => void
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
  /**
   * 폰 앱 모드.
   * 종목·시세·주기를 앱 헤더가 이미 보여주므로 칸 안의 머리띠를 접고 차트만 그린다.
   * 현재가는 부모에게 올려 헤더가 쓰게 한다.
   */
  bare?: boolean
  onLivePrice?: (price: number | null) => void
}

/** 거래량은 자리수가 커서 그대로 쓰면 정보바가 밀린다. */
function formatVolume(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`
  return value.toFixed(2)
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
  pinMode,
  pins,
  onAddPin,
  onPinFail,
  onLiveFeatures,
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
  bare = false,
  onLivePrice,
}: ChartCellProps) {
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null)
  const [intervalOpen, setIntervalOpen] = useState(false)
  // 크로스헤어를 올린 봉. 안 올렸으면 마지막 봉을 보여준다(트레이딩뷰와 같은 동작).
  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null)
  /** 지표 패널이 실제로 시작하는 y 좌표와 가격축 너비. 조작 버튼을 정확히 그 자리에 놓는다. */
  const [paneLayout, setPaneLayout] = useState<{
    rsi: number | null
    macd: number | null
    axisWidth: number
  }>({ rsi: null, macd: null, axisWidth: 64 })

  // 값이 그대로면 다시 그리지 않는다 — 차트가 0.5초마다 알려 주기 때문.
  const handlePaneLayout = useCallback(
    (next: { rsi: number | null; macd: number | null; axisWidth: number }) => {
      setPaneLayout((prev) =>
        prev.rsi === next.rsi && prev.macd === next.macd && prev.axisWidth === next.axisWidth
          ? prev
          : next,
      )
    },
    [],
  )
  const ticker = useTicker24h(symbol)
  const { candles, loading, error, reload, loadOlder, loadingOlder } = useBinanceKlines(
    symbol,
    interval,
  )

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

  // 정보바에 쓸 봉 — 크로스헤어를 올렸으면 그 봉, 아니면 맨 끝.
  const legendCandle = hoverCandle ?? mergedCandles[mergedCandles.length - 1] ?? null
  const legendUp = legendCandle ? legendCandle.close >= legendCandle.open : true
  const legendChange =
    legendCandle && legendCandle.open > 0
      ? ((legendCandle.close - legendCandle.open) / legendCandle.open) * 100
      : 0

  // 핀을 찍은 캔들의 지표를 그 시점 기준으로 계산한다.
  const handlePinPoint = useCallback(
    (time: number, price: number) => {
      const index = mergedCandles.findIndex((c) => c.time === time)
      if (index < 0) {
        onPinFail('캔들을 찾지 못했습니다.')
        return
      }
      if (index < MIN_HISTORY) {
        onPinFail(`지표를 계산하려면 앞쪽 캔들이 ${MIN_HISTORY}개 이상 필요합니다. 왼쪽으로 밀어 과거를 더 불러오세요.`)
        return
      }
      const features = computeFeatures(mergedCandles, index)
      if (!features) {
        onPinFail('이 지점은 지표를 계산할 수 없습니다.')
        return
      }
      onAddPin({ time, price, features })
    },
    [mergedCandles, onAddPin, onPinFail],
  )

  // 맨 끝 캔들 기준 지표. 매 틱마다 돌리면 무거우니 캔들 수가 바뀔 때만 계산한다.
  const candleCount = mergedCandles.length
  useEffect(() => {
    if (!onLiveFeatures) return
    if (candleCount <= MIN_HISTORY) {
      onLiveFeatures(null)
      return
    }
    onLiveFeatures(computeFeatures(mergedCandles, candleCount - 1))
    // mergedCandles 는 틱마다 새 배열이 된다 — 길이로만 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candleCount, symbol, interval, onLiveFeatures])

  const livePrice = mergedCandles.length > 0 ? mergedCandles[mergedCandles.length - 1].close : null
  const changePercent = ticker?.priceChangePercent ?? null
  const positive = (changePercent ?? 0) >= 0

  // 폰 앱 헤더가 현재가를 크게 보여준다 — 값이 바뀔 때만 올린다.
  const onLivePriceRef = useRef(onLivePrice)
  onLivePriceRef.current = onLivePrice
  useEffect(() => {
    onLivePriceRef.current?.(livePrice)
  }, [livePrice])

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
      className={`chart-cell${active ? ' active' : ''}${bare ? ' bare' : ''}`}
      style={gridStyle}
      onMouseDownCapture={onActivate}
    >
      {showMiniBar && !bare && (
        <div className="cell-bar">
          <SymbolPicker symbol={symbol} symbols={symbols} onChange={onSymbolChange} />
          <div className="seg intervals" role="group" aria-label="주기">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                type="button"
                aria-pressed={iv === interval}
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
              aria-label={`주기 ${interval}, 눌러서 변경`}
              aria-expanded={intervalOpen}
              onClick={() => setIntervalOpen((v) => !v)}
            >
              <span>{interval}</span>
              <Icon name="chevron" size={13} />
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
              <span
                className={`change ${positive ? 'up' : 'down'}`}
                style={{ color: positive ? COLORS.up : COLORS.down }}
              >
                {positive ? '+' : ''}
                {changePercent.toFixed(2)}%
              </span>
            )}
            <span
              className={`ws-status ws-${status}`}
              title={
                status === 'open'
                  ? '실시간 연결됨'
                  : status === 'connecting'
                    ? '연결하는 중'
                    : '연결 끊김'
              }
            >
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
          pinMode={pinMode}
          pins={pins}
          onPinPoint={handlePinPoint}
          onDrawPrice={onDrawPrice}
          onMoveDrawing={onMoveDrawing}
          onReachStart={() => void loadOlder()}
          onHoverCandle={setHoverCandle}
          onPaneLayout={onToggleIndicator ? handlePaneLayout : undefined}
        />
        {/* 트레이딩뷰식 OHLC 정보바 — 크로스헤어를 올린 봉, 안 올렸으면 마지막 봉. */}
        {legendCandle && (
          <div className="ohlc-legend">
            <span className="ohlc-sym">
              {symbol.replace('USDT', '')}
              <em>{interval}</em>
            </span>
            <span className="ohlc-values" style={{ color: legendUp ? COLORS.up : COLORS.down }}>
              {([
                ['시', legendCandle.open],
                ['고', legendCandle.high],
                ['저', legendCandle.low],
                ['종', legendCandle.close],
              ] as const).map(([label, value]) => (
                <span key={label}>
                  <em>{label}</em>
                  {formatPrice(value)}
                </span>
              ))}
              <span className="ohlc-chg">
                {legendUp ? '+' : ''}
                {legendChange.toFixed(2)}%
              </span>
            </span>
            <span className="ohlc-vol">
              <em>거래량</em>
              {formatVolume(legendCandle.volume)}
            </span>
          </div>
        )}
        {loadingOlder && (
          <div className="loading-older">
            <span className="spinner" />
            과거 불러오는 중
          </div>
        )}
        {/* 지표 패널 이름표 + 조작 — 패널이 실제로 시작하는 자리(왼쪽 위)에 붙인다.
            가격축은 오른쪽이므로 왼쪽 위가 눈금·값과 가장 덜 겹친다. */}
        {onToggleIndicator && (indicators.rsi.enabled || indicators.macd.enabled) && (
          <div className="pane-controls">
            {(['rsi', 'macd'] as const)
              .filter((which) => indicators[which].enabled && paneLayout[which] !== null)
              .map((which) => (
                <div
                  key={which}
                  className="pane-ctl"
                  style={{ top: `${(paneLayout[which] ?? 0) + 5}px` }}
                >
                  <span className="pane-name">{which.toUpperCase()}</span>
                  <button
                    type="button"
                    title={`${which.toUpperCase()} 설정`}
                    aria-label={`${which.toUpperCase()} 설정`}
                    onClick={onOpenIndicatorSettings}
                  >
                    <Icon name="settings" size={15} />
                  </button>
                  <button
                    type="button"
                    title={`${which.toUpperCase()} 닫기`}
                    aria-label={`${which.toUpperCase()} 닫기`}
                    onClick={() => onToggleIndicator(which)}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
              ))}
          </div>
        )}

        {loading && mergedCandles.length === 0 && (
          <div className="overlay">
            <span className="spinner lg" />
            불러오는 중
          </div>
        )}
        {/* 캐시된 추세가 이미 보이면 오류로 덮지 않는다 — 뒤에서 알아서 다시 받는다. */}
        {error && mergedCandles.length === 0 && (
          <div className="overlay error">
            <p>
              {error.message === 'Failed to fetch'
                ? '연결이 끊겼습니다. 네트워크를 확인해 주세요.'
                : `데이터를 불러오지 못했습니다: ${error.message}`}
            </p>
            <button type="button" className="cta" onClick={() => void reload()}>
              <Icon name="refresh" size={16} />
              다시 시도
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

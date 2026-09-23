import { useEffect, useMemo, useRef, useState } from 'react'
import { CoinIcon } from '../CoinIcon'
import { fetch24hTicker, fetchKlines, rateLimitedUntil, type Candle, type Ticker24h } from '../../lib/binance'
import {
  describeSymbol,
  displaySymbol,
  isQuarterly,
  priceDecimals,
  type SymbolInfo,
} from '../../lib/symbols'
import './widgets.css'

interface SymbolDetailsProps {
  symbol: string
  infos: SymbolInfo[]
}

const TICKER_REFRESH_MS = 5000
const KLINE_TTL_MS = 10 * 60 * 1000

interface KlineCacheEntry {
  at: number
  candles: Candle[]
}
const klineCache: Record<string, KlineCacheEntry> = {}

async function loadDailyCloses(symbol: string, signal: AbortSignal): Promise<Candle[]> {
  const cached = klineCache[symbol]
  if (cached && Date.now() - cached.at < KLINE_TTL_MS) return cached.candles
  const candles = await fetchKlines(symbol, '1d', 400, signal)
  klineCache[symbol] = { at: Date.now(), candles }
  return candles
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`
  return n.toFixed(2)
}

function fmtPrice(n: number, decimals: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

interface PerfCell {
  label: string
  pct: number | null
}

/** 일봉 종가 배열에서 기간별 수익률(%)을 계산. */
function computePerformance(candles: Candle[]): PerfCell[] {
  const closes = candles.map((c) => c.close)
  const n = closes.length
  const last = closes[n - 1]
  const backPct = (days: number): number | null => {
    const idx = n - 1 - days
    if (idx < 0 || last == null) return null
    const past = closes[idx]
    if (!past) return null
    return ((last - past) / past) * 100
  }
  let ytd: number | null = null
  if (last != null) {
    const jan1 = Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000
    const first = candles.find((c) => c.time >= jan1)
    if (first && first.close) ytd = ((last - first.close) / first.close) * 100
  }
  return [
    { label: '1주', pct: backPct(7) },
    { label: '1개월', pct: backPct(30) },
    { label: '3개월', pct: backPct(90) },
    { label: '6개월', pct: backPct(180) },
    { label: 'YTD', pct: ytd },
    { label: '1년', pct: backPct(365) },
  ]
}

export function SymbolDetails({ symbol, infos }: SymbolDetailsProps) {
  const [ticker, setTicker] = useState<Ticker24h | null>(null)
  const [perf, setPerf] = useState<PerfCell[] | null>(null)
  const symbolRef = useRef(symbol)
  symbolRef.current = symbol

  useEffect(() => {
    setTicker(null)
    const controller = new AbortController()
    // 숨은 탭·한도 초과 중엔 조회를 건너뛴다 — 차단이 길어지지 않게. 기존 값은 유지한다.
    const load = () => {
      if (document.hidden || rateLimitedUntil() > Date.now()) return
      fetch24hTicker(symbol, controller.signal)
        .then((t) => {
          if (!controller.signal.aborted) setTicker(t)
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, TICKER_REFRESH_MS)
    document.addEventListener('visibilitychange', load)
    return () => {
      controller.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
    }
  }, [symbol])

  useEffect(() => {
    setPerf(null)
    const controller = new AbortController()
    loadDailyCloses(symbol, controller.signal)
      .then((candles) => {
        if (!controller.signal.aborted) setPerf(computePerformance(candles))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [symbol])

  const info = useMemo(() => infos.find((i) => i.symbol === symbol), [infos, symbol])
  const contractLabel = info && isQuarterly(info) ? '분기물' : '무기한'

  const dec = priceDecimals(symbol, infos)
  const price = ticker?.lastPrice ?? 0
  const priceStr = fmtPrice(price, dec)
  const head = priceStr.length > 2 ? priceStr.slice(0, -2) : priceStr
  const tail = priceStr.length > 2 ? priceStr.slice(-2) : ''
  const up = (ticker?.priceChangePercent ?? 0) >= 0
  const color = up ? 'var(--tv-up)' : 'var(--tv-down)'

  return (
    <section className="sd">
      <div className="sd-id">
        <CoinIcon base={info?.baseAsset ?? symbol.replace(/USDT.*/, '')} size={32} />
        <div className="sd-id-main">
          <span className="sd-sym">{displaySymbol(symbol, infos)}</span>
          <span className="sd-desc">{describeSymbol(symbol, infos)}</span>
        </div>
      </div>
      <p className="sd-exch">Binance · {contractLabel}</p>

      <div className="sd-price-row">
        <span className="sd-price">
          {head}
          {tail && <span className="sd-price-tail">{tail}</span>}
        </span>
        <span className="sd-change" style={{ color }}>
          {ticker ? `${ticker.priceChange >= 0 ? '+' : ''}${fmtPrice(ticker.priceChange, dec)}` : '—'}
          {ticker ? ` (${ticker.priceChangePercent >= 0 ? '+' : ''}${ticker.priceChangePercent.toFixed(2)}%)` : ''}
        </span>
      </div>

      <p className="sd-market">
        <span className="sd-dot" /> 시장 열림
      </p>

      <div className="sd-stats">
        <div className="sd-stat">
          <span className="sd-stat-label">24시간 거래량</span>
          <span className="sd-stat-value">{ticker ? fmtCompact(ticker.volume) : '—'}</span>
        </div>
        <div className="sd-stat">
          <span className="sd-stat-label">거래대금</span>
          <span className="sd-stat-value">{ticker ? fmtCompact(ticker.quoteVolume) : '—'}</span>
        </div>
        <div className="sd-stat">
          <span className="sd-stat-label">24시간 고가</span>
          <span className="sd-stat-value">{ticker ? fmtPrice(ticker.highPrice, dec) : '—'}</span>
        </div>
        <div className="sd-stat">
          <span className="sd-stat-label">24시간 저가</span>
          <span className="sd-stat-value">{ticker ? fmtPrice(ticker.lowPrice, dec) : '—'}</span>
        </div>
      </div>

      <div className="sd-perf">
        {(perf ?? computePerformance([])).map((cell) => {
          const pos = (cell.pct ?? 0) >= 0
          const bg =
            cell.pct == null
              ? 'transparent'
              : pos
                ? 'rgb(8 153 129 / 15%)'
                : 'rgb(242 54 69 / 15%)'
          return (
            <div key={cell.label} className="sd-perf-cell" style={{ background: bg }}>
              <span className="sd-perf-label">{cell.label}</span>
              <span
                className="sd-perf-value"
                style={{ color: cell.pct == null ? 'var(--tv-text-dim)' : pos ? 'var(--tv-up)' : 'var(--tv-down)' }}
              >
                {cell.pct == null ? '—' : `${pos ? '+' : ''}${cell.pct.toFixed(2)}%`}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

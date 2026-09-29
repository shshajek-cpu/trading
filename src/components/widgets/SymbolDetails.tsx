import { useEffect, useMemo, useState } from 'react'
import { CoinIcon } from '../CoinIcon'
import { fetchCandles } from '../../lib/market'
import { MARKET_LABEL, marketOf } from '../../lib/market/ids'
import type { Candle } from '../../lib/market/types'
import { useTicker24h } from '../../hooks/useTicker24h'
import {
  describeSymbol,
  displaySymbol,
  exchangeLabel,
  isQuarterly,
  priceDecimals,
  type SymbolInfo,
} from '../../lib/symbols'
import './widgets.css'

interface SymbolDetailsProps {
  symbol: string
  infos: SymbolInfo[]
}

const KLINE_TTL_MS = 10 * 60 * 1000

interface KlineCacheEntry {
  at: number
  candles: Candle[]
}
const klineCache: Record<string, KlineCacheEntry> = {}

async function loadDailyCloses(symbol: string, signal: AbortSignal): Promise<Candle[]> {
  const cached = klineCache[symbol]
  if (cached && Date.now() - cached.at < KLINE_TTL_MS) return cached.candles
  const candles = await fetchCandles(symbol, '1d', 400, signal)
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
  const ticker = useTicker24h(symbol)
  const [perf, setPerf] = useState<PerfCell[] | null>(null)

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
  const market = marketOf(symbol)
  // 헤더: 거래소 · 시장(선물은 무기한/분기물) · 야후는 통화와 지연.
  const headParts = [exchangeLabel(symbol, infos)]
  if (market === 'binance') headParts.push(`${MARKET_LABEL.binance} ${info && isQuarterly(info) ? '분기물' : '무기한'}`)
  else headParts.push(MARKET_LABEL[market])
  if (market === 'yahoo' && info?.quoteAsset) headParts.push(info.quoteAsset)
  if (market === 'yahoo' && info?.delay) headParts.push(`${info.delay}분 지연`)
  // 업비트·야후의 등락은 24시간이 아니라 전일 종가 대비다.
  const dayLabel = market === 'binance' || market === 'bspot' ? '24시간' : '오늘'
  // 코인은 늘 열려 있다. 야후는 차트 메타의 정규장 시각으로 본다(모르면 열림으로 둔다).
  const nowSec = Date.now() / 1000
  const open = market !== 'yahoo' || !info?.session || (nowSec >= info.session.start && nowSec < info.session.end)

  const dec = priceDecimals(symbol, infos)
  // 시세를 아직 못 받았으면(심볼 전환 직후·요청 제한·실패) 0.00 대신 '—' — 0 은 잘못된 시세로 읽힌다.
  const priceStr = ticker ? fmtPrice(ticker.lastPrice, dec) : '—'
  const head = ticker && priceStr.length > 2 ? priceStr.slice(0, -2) : priceStr
  const tail = ticker && priceStr.length > 2 ? priceStr.slice(-2) : ''
  const color = !ticker ? 'var(--tv-text-dim)' : ticker.priceChangePercent >= 0 ? 'var(--tv-up)' : 'var(--tv-down)'

  return (
    <section className="sd">
      <div className="sd-id">
        <CoinIcon symbol={symbol} size={32} />
        <div className="sd-id-main">
          <span className="sd-sym">{displaySymbol(symbol, infos)}</span>
          <span className="sd-desc">{describeSymbol(symbol, infos)}</span>
        </div>
      </div>
      <p className="sd-exch">{headParts.join(' · ')}</p>

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
        <span className={`sd-dot${open ? '' : ' closed'}`} /> {open ? '시장 열림' : '시장 닫힘'}
      </p>

      <div className="sd-stats">
        <div className="sd-stat">
          <span className="sd-stat-label">{dayLabel} 거래량</span>
          <span className="sd-stat-value">{ticker ? fmtCompact(ticker.volume) : '—'}</span>
        </div>
        <div className="sd-stat">
          <span className="sd-stat-label">거래대금</span>
          <span className="sd-stat-value">{ticker ? fmtCompact(ticker.quoteVolume) : '—'}</span>
        </div>
        <div className="sd-stat">
          <span className="sd-stat-label">{dayLabel} 고가</span>
          <span className="sd-stat-value">{ticker ? fmtPrice(ticker.highPrice, dec) : '—'}</span>
        </div>
        <div className="sd-stat">
          <span className="sd-stat-label">{dayLabel} 저가</span>
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

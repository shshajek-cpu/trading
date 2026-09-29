import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from './ui/Dialog'
import { Icon } from './Icon'
import { CoinIcon } from './CoinIcon'
import { describeSymbol, displaySymbol, exchangeLabel, type SymbolInfo } from '../lib/symbols'
import { rankSymbol, rememberYahooQuote, requireSymbolList, retrySymbols, useSymbolsStatus } from '../hooks/useSymbols'
import { MARKET_LABEL, marketOf } from '../lib/market/ids'
import type { MarketId } from '../lib/market/types'
import type { YahooQuote } from '../lib/market/yahoo'
import { searchYahoo } from '../lib/market'
import { infoQuote, searchSymbols, symbolTypeTag, yahooQueryable, type SearchTab } from '../lib/symbolSearch'
import './symbolSearch.css'

interface SymbolSearchDialogProps {
  open: boolean
  onClose: () => void
  title: string
  symbols: SymbolInfo[]
  onSelect: (symbol: string) => void
  /** 이미 담긴 심볼들 — 목록에 체크로 표시. */
  selected?: string[]
  /** 선택해도 닫지 않는다(관심 목록 담기). */
  keepOpen?: boolean
  /** 처음 열릴 때 채워둘 검색어. */
  initialQuery?: string
}

const TABS: { id: SearchTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'binance', label: MARKET_LABEL.binance },
  { id: 'bspot', label: MARKET_LABEL.bspot },
  { id: 'upbit', label: MARKET_LABEL.upbit },
  { id: 'yahoo', label: MARKET_LABEL.yahoo },
]

/** 거래소 배지 글자. */
const BADGE: Record<MarketId, string> = { binance: 'B', bspot: 'B', upbit: 'U', yahoo: 'Y' }

type ListMarket = Exclude<MarketId, 'yahoo'>

/** 목록을 못 받은 시장의 '불러오는 중'/'다시 시도' 한 줄. 이 줄이 보일 때만 목록을 받기 시작한다. */
function ListStatus({ market, showLabel }: { market: ListMarket; showLabel: boolean }) {
  const status = useSymbolsStatus(market)
  if (!status.missing) return null
  const label = showLabel ? `${MARKET_LABEL[market]} ` : ''
  return status.failed ? (
    <p className="ss-empty">
      {label}심볼 목록을 불러오지 못했습니다 —{' '}
      {/* 목록의 Enter(첫 심볼 고르기)가 이 버튼을 가로채지 않게 한다. */}
      <button type="button" className="tv-btn" onClick={() => retrySymbols(market)} onKeyDown={(e) => e.stopPropagation()}>
        다시 시도
      </button>
    </p>
  ) : (
    <p className="ss-empty">{label}심볼 목록을 불러오는 중…</p>
  )
}

/** displaySymbol 안에서 검색어가 걸린 구간을 accent 로 강조. */
function highlight(text: string, q: string) {
  if (!q) return text
  const idx = text.toUpperCase().indexOf(q)
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="ss-hl">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  )
}

export function SymbolSearchDialog({
  open,
  onClose,
  title,
  symbols,
  onSelect,
  selected,
  keepOpen,
  initialQuery,
}: SymbolSearchDialogProps) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<SearchTab>('all')
  const [active, setActive] = useState(0)
  /** 야후 검색 결과(검색어와 함께 — 늦게 온 옛 결과를 버린다). */
  const [yahooHits, setYahooHits] = useState<{ q: string; quotes: YahooQuote[] }>({ q: '', quotes: [] })
  const [yahooBusy, setYahooBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery(initialQuery ?? '')
    setTab('all')
    setActive(0)
    // 대화상자가 뜬 뒤 검색창에 포커스.
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open, initialQuery])

  const selectedSet = useMemo(() => new Set(selected ?? []), [selected])

  // 전체·현물·업비트 탭이 보이면 그 목록을 받기 시작한다.
  useEffect(() => {
    if (!open) return
    if (tab === 'all' || tab === 'bspot') requireSymbolList('bspot')
    if (tab === 'all' || tab === 'upbit') requireSymbolList('upbit')
  }, [open, tab])

  const trimmed = query.trim()
  const wantYahoo = open && (tab === 'all' || tab === 'yahoo') && yahooQueryable(trimmed)

  // 야후 검색(영문·숫자 검색어만 — 한글은 이름표로 찾는다). 입력이 멈추고 300ms 뒤, 새 입력이면 이전 요청을 끊는다.
  useEffect(() => {
    if (!wantYahoo) {
      setYahooBusy(false)
      return
    }
    const ctrl = new AbortController()
    setYahooBusy(true)
    const t = setTimeout(() => {
      searchYahoo(trimmed, ctrl.signal)
        .then((quotes) => {
          if (!ctrl.signal.aborted) setYahooHits({ q: trimmed, quotes })
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setYahooHits({ q: trimmed, quotes: [] })
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setYahooBusy(false)
        })
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [wantYahoo, trimmed])

  const hits = wantYahoo && yahooHits.q === trimmed ? yahooHits.quotes : undefined

  const results = useMemo(
    () => searchSymbols(symbols, hits ?? [], query, tab, rankSymbol),
    [symbols, hits, query, tab],
  )

  useEffect(() => setActive(0), [query, tab])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const q = query.trim().toUpperCase()

  const choose = (info: SymbolInfo) => {
    if (marketOf(info.symbol) === 'yahoo') {
      // 검색 결과의 이름·거래소를 차트 메타가 오기 전에 먼저 적어 둔다.
      const hit = hits?.find((h) => `YF:${h.symbol}` === info.symbol)
      rememberYahooQuote(hit ?? infoQuote(info))
    }
    onSelect(info.symbol)
    if (!keepOpen) onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const info = results[active]
      if (info) choose(info)
    }
  }

  const header = (
    <div className="ss-header" onKeyDown={onKeyDown}>
      <div className="tv-search ss-search">
        <Icon name="search" size={18} className="ss-search-icon" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="심볼 검색"
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        {query && (
          <button type="button" className="tv-icon-btn ss-clear" aria-label="지우기" onClick={() => setQuery('')}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      <div className="tv-pills ss-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tv-pill${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={780}
      height={640}
      header={header}
      className="ss-dialog"
      footer={<span className="ss-hint">심볼, 코인·종목 이름(한글 포함)으로 검색 — 주식·지수는 영문 심볼로 야후에서도 찾습니다</span>}
    >
      <div className="ss-list" ref={listRef} onKeyDown={onKeyDown}>
        {results.map((info, idx) => {
          const market = marketOf(info.symbol)
          return (
            <button
              key={info.symbol}
              type="button"
              data-idx={idx}
              className={`ss-row${idx === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(idx)}
              onClick={() => choose(info)}
            >
              <CoinIcon symbol={info.symbol} size={24} />
              <span className="ss-sym">{highlight(displaySymbol(info.symbol, [info]), q)}</span>
              <span className="ss-desc">{describeSymbol(info.symbol, [info])}</span>
              <span className="ss-tag">{symbolTypeTag(info)}</span>
              <span className="ss-exch">
                <span className={`ss-exch-badge ss-exch-${market}`}>{BADGE[market]}</span>
                <span className="ss-exch-name">{exchangeLabel(info.symbol, [info])}</span>
              </span>
              <span className="ss-check">
                {selectedSet.has(info.symbol) && <Icon name="check" size={16} />}
              </span>
            </button>
          )
        })}
        {/* 목록을 못 받았으면 '없음' 대신 이유와 다시 시도를 보여 준다. */}
        {open && (tab === 'all' || tab === 'binance') && <ListStatus market="binance" showLabel={tab === 'all'} />}
        {open && (tab === 'all' || tab === 'bspot') && <ListStatus market="bspot" showLabel={tab === 'all'} />}
        {open && (tab === 'all' || tab === 'upbit') && <ListStatus market="upbit" showLabel={tab === 'all'} />}
        {wantYahoo && yahooBusy && <p className="ss-empty">야후에서 찾는 중…</p>}
        {results.length === 0 && !(wantYahoo && yahooBusy) && <p className="ss-empty">일치하는 심볼이 없습니다.</p>}
      </div>
    </Dialog>
  )
}

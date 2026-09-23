import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from './ui/Dialog'
import { Icon } from './Icon'
import { CoinIcon } from './CoinIcon'
import {
  baseCode,
  coinName,
  describeSymbol,
  displaySymbol,
  isQuarterly,
  symbolCategory,
  type SymbolInfo,
} from '../lib/symbols'
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

type Tab = 'all' | 'perp' | 'quarterly' | 'stock'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'perp', label: '무기한' },
  { id: 'quarterly', label: '분기물' },
  { id: 'stock', label: '주식·원자재' },
]

const MAX_ROWS = 200

interface Ranked {
  info: SymbolInfo
  score: number
}

/** 검색어에 대한 순위 점수. 낮을수록 상위. -1 이면 제외. */
function rank(info: SymbolInfo, q: string): number {
  const sym = info.symbol.toUpperCase()
  const disp = displaySymbol(info.symbol, [info]).toUpperCase()
  const base = baseCode(info.baseAsset)
  const name = coinName(info.baseAsset).toUpperCase()
  if (sym === q || disp === q) return 0
  if (base === q) return 1
  if (sym.startsWith(q) || disp.startsWith(q)) return 2
  if (name.startsWith(q)) return 3
  if (sym.includes(q) || name.includes(q)) return 4
  return -1
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
  const [tab, setTab] = useState<Tab>('all')
  const [active, setActive] = useState(0)
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

  const results = useMemo(() => {
    const q = query.trim().toUpperCase()
    const inTab = symbols.filter((s) => tab === 'all' || symbolCategory(s) === tab)
    let ranked: Ranked[]
    if (!q) {
      ranked = inTab.map((info) => ({ info, score: isQuarterly(info) ? 1 : 0 }))
    } else {
      ranked = []
      for (const info of inTab) {
        const score = rank(info, q)
        if (score >= 0) ranked.push({ info, score })
      }
    }
    ranked.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      // 무기한을 분기물보다 앞에.
      const aq = isQuarterly(a.info) ? 1 : 0
      const bq = isQuarterly(b.info) ? 1 : 0
      if (aq !== bq) return aq - bq
      // 접두사 계열에선 짧은 심볼(ETHUSDT)이 긴 것(ETHFIUSDT)보다 앞에.
      if (a.info.symbol.length !== b.info.symbol.length) return a.info.symbol.length - b.info.symbol.length
      return a.info.symbol.localeCompare(b.info.symbol)
    })
    return ranked.slice(0, MAX_ROWS).map((r) => r.info)
  }, [symbols, query, tab])

  useEffect(() => setActive(0), [query, tab])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const q = query.trim().toUpperCase()

  const choose = (symbol: string) => {
    onSelect(symbol)
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
      if (info) choose(info.symbol)
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
      footer={<span className="ss-hint">심볼 또는 코인 이름으로 검색</span>}
    >
      <div className="ss-list" ref={listRef} onKeyDown={onKeyDown}>
        {results.map((info, idx) => {
          const cat = symbolCategory(info)
          const underlying = info.underlyingType === 'EQUITY' ? 'stock' : info.underlyingType === 'COMMODITY' ? 'commodity' : info.underlyingType === 'INDEX' ? 'index' : 'crypto'
          const tag = `${cat === 'quarterly' ? 'futures' : 'swap'} ${underlying}`
          return (
            <button
              key={info.symbol}
              type="button"
              data-idx={idx}
              className={`ss-row${idx === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(idx)}
              onClick={() => choose(info.symbol)}
            >
              <CoinIcon base={info.baseAsset} size={24} />
              <span className="ss-sym">{highlight(displaySymbol(info.symbol, [info]), q)}</span>
              <span className="ss-desc">{describeSymbol(info.symbol, [info])}</span>
              <span className="ss-tag">{tag}</span>
              <span className="ss-exch">
                <span className="ss-exch-badge">B</span>Binance
              </span>
              <span className="ss-check">
                {selectedSet.has(info.symbol) && <Icon name="check" size={16} />}
              </span>
            </button>
          )
        })}
        {results.length === 0 && <p className="ss-empty">일치하는 심볼이 없습니다.</p>}
      </div>
    </Dialog>
  )
}

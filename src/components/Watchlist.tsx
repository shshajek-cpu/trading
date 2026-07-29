import { useMemo, useState } from 'react'
import type { WatchRow } from '../hooks/useWatchlist'

interface WatchlistProps {
  symbols: string[]
  rows: Record<string, WatchRow>
  allSymbols: string[]
  current: string
  onPick: (symbol: string) => void
  onAdd: (symbol: string) => void
  onRemove: (symbol: string) => void
}

function fmtPrice(n: number): string {
  // 저가 코인은 소수점이 길다. 자리수를 값 크기에 맞춘다.
  const digits = n >= 1000 ? 1 : n >= 1 ? 3 : 6
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function Watchlist({
  symbols,
  rows,
  allSymbols,
  current,
  onPick,
  onAdd,
  onRemove,
}: WatchlistProps) {
  const [query, setQuery] = useState('')

  const candidates = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return []
    return allSymbols
      .filter((s) => s.includes(q) && !symbols.includes(s) && !s.includes('_'))
      .slice(0, 6)
  }, [query, allSymbols, symbols])

  return (
    <section className="panel watchlist">
      <h2>관심 종목</h2>

      <div className="watch-add">
        <input
          type="text"
          value={query}
          placeholder="종목 추가"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
        {candidates.length > 0 && (
          <ul className="watch-candidates">
            {candidates.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(s)
                    setQuery('')
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="watch-rows">
        {symbols.map((s) => {
          const row = rows[s]
          const up = (row?.changePercent ?? 0) >= 0
          return (
            <li key={s} className={s === current ? 'active' : undefined}>
              <button type="button" className="watch-pick" onClick={() => onPick(s)}>
                <span className="watch-sym">{s.replace('USDT', '')}</span>
                <span className="watch-price">{row ? fmtPrice(row.price) : '—'}</span>
                <span className={`watch-chg ${up ? 'up' : 'down'}`}>
                  {row ? `${up ? '+' : ''}${row.changePercent.toFixed(2)}%` : ''}
                </span>
              </button>
              <button
                type="button"
                className="watch-del"
                title={`${s} 제거`}
                onClick={() => onRemove(s)}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import { useMemo, useState } from 'react'
import { Icon } from '../Icon'
import type { WatchRow } from '../../hooks/useWatchlist'

interface MarketsScreenProps {
  /** 즐겨찾기한 종목. */
  favorites: string[]
  rows: Record<string, WatchRow>
  /** 거래 가능한 전체 종목. */
  allSymbols: string[]
  current: string
  onPick: (symbol: string) => void
  onToggleFavorite: (symbol: string) => void
}

function fmtPrice(n: number): string {
  const digits = n >= 1000 ? 1 : n >= 1 ? 3 : 6
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/**
 * 시세 화면.
 *
 * 폰에서 종목을 바꾸는 일은 가장 잦은 동작이라 시트 안에 숨기지 않고 탭 하나를 통째로 준다.
 * 검색창을 위에 고정해 두고, 한 줄을 누르면 바로 차트로 넘어간다.
 */
export function MarketsScreen({
  favorites,
  rows,
  allSymbols,
  current,
  onPick,
  onToggleFavorite,
}: MarketsScreenProps) {
  const [query, setQuery] = useState('')

  const q = query.trim().toUpperCase()

  // 검색 중이면 전체에서 찾고, 아니면 즐겨찾기만 보여준다.
  const list = useMemo(() => {
    if (!q) return favorites
    return allSymbols.filter((s) => s.includes(q) && !s.includes('_')).slice(0, 40)
  }, [q, favorites, allSymbols])

  const favSet = useMemo(() => new Set(favorites), [favorites])

  return (
    <div className="screen markets-screen">
      <div className="search-bar">
        <Icon name="search" size={17} />
        <input
          type="search"
          value={query}
          placeholder="종목 검색"
          aria-label="종목 검색"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="icon-btn" aria-label="지우기" onClick={() => setQuery('')}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {!q && <p className="screen-label">즐겨찾기</p>}

      <ul className="market-rows">
        {list.map((s) => {
          const row = rows[s]
          const up = (row?.changePercent ?? 0) >= 0
          const fav = favSet.has(s)
          return (
            <li key={s} className={s === current ? 'active' : undefined}>
              <button type="button" className="market-pick" onClick={() => onPick(s)}>
                <span className="market-sym">
                  {s.replace('USDT', '')}
                  <em>USDT</em>
                </span>
                <span className="market-num">
                  <b>{row ? fmtPrice(row.price) : '—'}</b>
                  <span className={`market-chg ${up ? 'up' : 'down'}`}>
                    {row ? `${up ? '+' : ''}${row.changePercent.toFixed(2)}%` : ''}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={`icon-btn fav-btn${fav ? ' on' : ''}`}
                aria-label={fav ? `${s} 즐겨찾기 해제` : `${s} 즐겨찾기`}
                aria-pressed={fav}
                onClick={() => onToggleFavorite(s)}
              >
                <Icon name={fav ? 'starFill' : 'star'} size={17} />
              </button>
            </li>
          )
        })}

        {list.length === 0 && (
          <li className="empty">
            {q ? '검색 결과가 없습니다.' : '위에서 검색해 즐겨찾기에 담아 보세요.'}
          </li>
        )}
      </ul>
    </div>
  )
}

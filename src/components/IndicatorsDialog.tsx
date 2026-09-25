import { useMemo, useState } from 'react'
import { Dialog } from './ui/Dialog'
import {
  ALL_INDICATOR_KINDS,
  INDICATOR_CATEGORIES,
  INDICATOR_DEFS,
  createIndicator,
  indicatorSearchTerms,
  type IndicatorCategory,
  type IndicatorInstance,
  type IndicatorKind,
} from '../lib/indicatorConfig'
import './indicators.css'

interface IndicatorsDialogProps {
  open: boolean
  onClose: () => void
  indicators: IndicatorInstance[]
  onChange: (next: IndicatorInstance[]) => void
}

const FAV_KEY = 'trading.indicatorFavorites.v1'

function loadFavorites(): IndicatorKind[] {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((k): k is IndicatorKind => Object.hasOwn(INDICATOR_DEFS, k))
  } catch {
    return []
  }
}

type Section = 'fav' | 'all' | IndicatorCategory

/** TradingView "지표, 메트릭, 전략" 다이얼로그. 행을 누르면 추가되고 다이얼로그는 열린 채. */
export function IndicatorsDialog({ open, onClose, indicators, onChange }: IndicatorsDialogProps) {
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<Section>('all')
  const [favorites, setFavorites] = useState<IndicatorKind[]>(loadFavorites)

  const toggleFavorite = (kind: IndicatorKind) => {
    setFavorites((prev) => {
      const next = prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next))
      } catch {
        /* 무시 */
      }
      return next
    })
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let kinds = ALL_INDICATOR_KINDS
    if (q) {
      kinds = kinds.filter((k) => indicatorSearchTerms(k).some((t) => t.toLowerCase().includes(q)))
    } else if (section === 'fav') {
      kinds = kinds.filter((k) => favorites.includes(k))
    } else if (section !== 'all') {
      kinds = kinds.filter((k) => INDICATOR_DEFS[k].category === section)
    }
    return kinds
  }, [query, section, favorites])

  const sidebar: { id: Section; label: string }[] = [
    { id: 'fav', label: '즐겨찾기' },
    { id: 'all', label: '기술적 지표' },
    ...INDICATOR_CATEGORIES.map((c) => ({ id: c, label: c })),
  ]

  const header = (
    <div className="tv-search">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        placeholder="지표 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter = 목록 맨 위 지표 추가(행을 누른 것과 같다, 창은 열린 채).
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
          e.preventDefault()
          const first = rows[0]
          if (first) onChange([...indicators, createIndicator(first, indicators)])
        }}
        aria-label="지표 검색"
      />
    </div>
  )

  return (
    <Dialog open={open} onClose={onClose} title="지표, 메트릭, 전략" width={760} height={600} header={header}>
      <div className="ind-dialog">
        <nav className="ind-sidebar" aria-label="지표 분류">
          {sidebar.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? 'active' : undefined}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="ind-list">
          {rows.length === 0 ? (
            <div className="ind-empty">{query ? '검색 결과가 없습니다.' : '즐겨찾기한 지표가 없습니다.'}</div>
          ) : (
            rows.map((kind) => {
              const def = INDICATOR_DEFS[kind]
              const fav = favorites.includes(kind)
              return (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                <div
                  className="ind-list-row"
                  key={kind}
                  onClick={() => onChange([...indicators, createIndicator(kind, indicators)])}
                >
                  <button
                    type="button"
                    className={`ind-star${fav ? ' on' : ''}`}
                    title={fav ? '즐겨찾기 해제' : '즐겨찾기'}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(kind)
                    }}
                  >
                    {fav ? '★' : '☆'}
                  </button>
                  <span className="ind-name">{def.name}</span>
                  <span className="ind-cat">{def.category}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Dialog>
  )
}

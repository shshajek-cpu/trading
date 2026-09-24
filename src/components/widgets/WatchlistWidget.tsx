import { useEffect, useMemo, useRef, useState } from 'react'
import type { WatchRow } from '../../hooks/useWatchlist'
import { CoinIcon } from '../CoinIcon'
import { Icon } from '../Icon'
import { Popover, MenuItem } from '../ui/Popover'
import { SymbolSearchDialog } from '../SymbolSearchDialog'
import { describeSymbol, displaySymbol, priceDecimals, type SymbolInfo } from '../../lib/symbols'
import './widgets.css'

interface WatchlistWidgetProps {
  symbols: string[]
  rows: Record<string, WatchRow>
  infos: SymbolInfo[]
  current: string
  onPick: (s: string) => void
  onAdd: (s: string) => void
  onRemove: (s: string) => void
  onReorder: (next: string[]) => void
  /** panel = 데스크톱 오른쪽 위젯, page = 폰 앱의 "관심 목록" 탭(큰 제목, 두 줄 행). */
  variant: 'panel' | 'page'
}

type SortCol = 'symbol' | 'price' | 'change' | 'changePercent'
type SortDir = 'asc' | 'desc' | 'none'

function fmtPrice(n: number, decimals: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtChange(n: number, decimals: number): string {
  return `${n > 0 ? '+' : ''}${fmtPrice(n, decimals)}`
}

function fmtPct(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

export function WatchlistWidget({
  symbols,
  rows,
  infos,
  current,
  onPick,
  onAdd,
  onRemove,
  onReorder,
  variant,
}: WatchlistWidgetProps) {
  const [sortCol, setSortCol] = useState<SortCol>('symbol')
  const [sortDir, setSortDir] = useState<SortDir>('none')
  const [addOpen, setAddOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // 폰 관심 목록 편집(빼기·위/아래 이동). 폰은 끌어 옮기기가 스크롤과 겹쳐 버튼으로 한다.
  const [editing, setEditing] = useState(false)
  const menuBtn = useRef<HTMLButtonElement>(null)

  // 마지막 틱 방향 플래시.
  const prevPrices = useRef<Record<string, number>>({})
  const [flash, setFlash] = useState<Record<string, 'up' | 'down'>>({})
  useEffect(() => {
    const next: Record<string, 'up' | 'down'> = {}
    for (const s of symbols) {
      const p = rows[s]?.price
      const old = prevPrices.current[s]
      if (p != null && old != null && p !== old) next[s] = p > old ? 'up' : 'down'
      if (p != null) prevPrices.current[s] = p
    }
    if (Object.keys(next).length === 0) return
    setFlash(next)
    const t = setTimeout(() => setFlash({}), 400)
    return () => clearTimeout(t)
  }, [rows, symbols])

  const sorted = useMemo(() => {
    if (sortDir === 'none') return symbols
    const factor = sortDir === 'asc' ? 1 : -1
    const key = (s: string): number | string => {
      const r = rows[s]
      if (sortCol === 'symbol') return s
      if (!r) return sortDir === 'asc' ? Infinity : -Infinity
      if (sortCol === 'price') return r.price
      if (sortCol === 'change') return r.change
      return r.changePercent
    }
    return [...symbols].sort((a, b) => {
      const ka = key(a)
      const kb = key(b)
      if (typeof ka === 'string' && typeof kb === 'string') return ka.localeCompare(kb) * factor
      return ((ka as number) - (kb as number)) * factor
    })
  }, [symbols, rows, sortCol, sortDir])

  const cycleSort = (col: SortCol) => {
    if (sortCol !== col) {
      setSortCol(col)
      setSortDir('asc')
      return
    }
    setSortDir((d) => (d === 'none' ? 'asc' : d === 'asc' ? 'desc' : 'none'))
  }

  const sortMark = (col: SortCol) => (sortCol === col && sortDir !== 'none' ? (sortDir === 'asc' ? '▲' : '▼') : '')

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= symbols.length) return
    const next = [...symbols]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onReorder(next)
  }

  // 드래그 정렬(정렬이 없을 때만).
  const dragFrom = useRef<number | null>(null)
  const canDrag = sortDir === 'none' && variant === 'panel'
  const onDrop = (to: number) => {
    const from = dragFrom.current
    dragFrom.current = null
    if (from != null) move(from, to)
  }

  const clearAll = () => {
    setMenuOpen(false)
    if (symbols.length === 0) return
    if (!window.confirm('관심 목록을 모두 지울까요?')) return
    for (const s of symbols) onRemove(s)
  }

  const isPage = variant === 'page'
  const isEditing = isPage && editing
  // 편집 중에는 저장된 순서 그대로 보여야 위/아래 이동이 그 순서를 바꾼다.
  const list = isEditing ? symbols : sorted

  return (
    <section className={`wl${isPage ? ' wl-page' : ''}`}>
      <header className={isPage ? 'm-page-head' : 'wl-head'}>
        {isPage ? (
          <h1 className="m-page-title">관심 목록</h1>
        ) : (
          <span className="wl-title">
            관심 목록 <span className="wl-caret">▾</span>
          </span>
        )}
        {isEditing ? (
          <button type="button" className="wl-done" onClick={() => setEditing(false)}>
            완료
          </button>
        ) : (
          <>
            <button type="button" className="tv-icon-btn" aria-label="심볼 추가" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={isPage ? 22 : 18} />
            </button>
            <button
              ref={menuBtn}
              type="button"
              className="tv-icon-btn"
              aria-label="더보기"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name="more" size={isPage ? 22 : 18} />
            </button>
          </>
        )}
      </header>

      {!isPage && (
        <div className="wl-cols">
          <button type="button" className="wl-col wl-col-sym" onClick={() => cycleSort('symbol')}>
            심볼 <span className="wl-mark">{sortMark('symbol')}</span>
          </button>
          <button type="button" className="wl-col wl-col-num" onClick={() => cycleSort('price')}>
            현재가 <span className="wl-mark">{sortMark('price')}</span>
          </button>
          <button type="button" className="wl-col wl-col-num wl-col-change" onClick={() => cycleSort('change')}>
            변동 <span className="wl-mark">{sortMark('change')}</span>
          </button>
          <button type="button" className="wl-col wl-col-num" onClick={() => cycleSort('changePercent')}>
            변동% <span className="wl-mark">{sortMark('changePercent')}</span>
          </button>
        </div>
      )}

      <ul className="wl-rows">
        {list.map((s, idx) => {
          const r = rows[s]
          const pct = r?.changePercent ?? 0
          const up = pct >= 0
          const color = up ? 'var(--tv-up)' : 'var(--tv-down)'
          const dec = priceDecimals(s, infos)
          return (
            <li
              key={s}
              className={`wl-row${s === current && !isEditing ? ' active' : ''}${isEditing ? ' editing' : ''}${flash[s] ? ` flash-${flash[s]}` : ''}`}
              draggable={canDrag}
              onDragStart={() => (dragFrom.current = idx)}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onDrop={() => canDrag && onDrop(idx)}
              onClick={isEditing ? undefined : () => onPick(s)}
            >
              <CoinIcon base={infos.find((i) => i.symbol === s)?.baseAsset ?? s.replace(/USDT.*/, '')} size={isPage ? 32 : 18} />
              {isPage && (
                <div className="wl-full-main">
                  <span className="wl-full-sym">{displaySymbol(s, infos)}</span>
                  <span className="wl-full-desc">{describeSymbol(s, infos)}</span>
                </div>
              )}
              {isEditing ? (
                <>
                  <button
                    type="button"
                    className="tv-icon-btn wl-edit-btn"
                    aria-label="위로"
                    disabled={idx === 0}
                    onClick={() => move(idx, idx - 1)}
                  >
                    <Icon name="arrowUp" size={20} />
                  </button>
                  <button
                    type="button"
                    className="tv-icon-btn wl-edit-btn"
                    aria-label="아래로"
                    disabled={idx === list.length - 1}
                    onClick={() => move(idx, idx + 1)}
                  >
                    <Icon name="arrowDown" size={20} />
                  </button>
                  <button
                    type="button"
                    className="tv-icon-btn wl-edit-btn wl-edit-remove"
                    aria-label="목록에서 제거"
                    onClick={() => onRemove(s)}
                  >
                    <Icon name="trash" size={20} />
                  </button>
                </>
              ) : isPage ? (
                <div className="wl-full-num">
                  <span className="wl-full-price">{r ? fmtPrice(r.price, dec) : '—'}</span>
                  <span className="wl-full-chg" style={{ color }}>
                    {r ? `${fmtChange(r.change, dec)} ${fmtPct(pct)}` : ''}
                  </span>
                </div>
              ) : (
                <>
                  <span className="wl-sym">{displaySymbol(s, infos)}</span>
                  <span className="wl-price">{r ? fmtPrice(r.price, dec) : '—'}</span>
                  <span className="wl-num wl-change" style={{ color }}>
                    {r ? fmtChange(r.change, dec) : ''}
                  </span>
                  <span className="wl-num" style={{ color }}>
                    {r ? fmtPct(pct) : ''}
                  </span>
                  <button
                    type="button"
                    className="tv-icon-btn wl-remove"
                    aria-label="목록에서 제거"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(s)
                    }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </>
              )}
            </li>
          )
        })}
        {symbols.length === 0 && <li className="wl-empty">관심 목록이 비어 있습니다.</li>}
      </ul>

      <Popover anchor={menuBtn.current} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom-end">
        <MenuItem
          label="정렬 초기화"
          onSelect={() => {
            setSortDir('none')
            setSortCol('symbol')
            setMenuOpen(false)
          }}
        />
        <MenuItem label="모두 지우기" onSelect={clearAll} />
        {isPage && (
          <MenuItem
            label="목록 편집"
            disabled={symbols.length === 0}
            onSelect={() => {
              setMenuOpen(false)
              setEditing(true)
            }}
          />
        )}
      </Popover>

      <SymbolSearchDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="관심 목록에 추가"
        symbols={infos}
        onSelect={(s) => (symbols.includes(s) ? onRemove(s) : onAdd(s))}
        selected={symbols}
        keepOpen
      />
    </section>
  )
}

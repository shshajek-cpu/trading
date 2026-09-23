import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'

export function SymbolPicker({
  symbol,
  symbols,
  onChange,
}: {
  symbol: string
  symbols: string[]
  onChange: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    const list = q ? symbols.filter((s) => s.includes(q)) : symbols
    return list.slice(0, 200)
  }, [symbols, query])

  return (
    <div className="symbol-picker" ref={rootRef}>
      <button
        type="button"
        className="symbol-button"
        aria-expanded={open}
        aria-label={`종목 ${symbol}, 눌러서 변경`}
        onClick={() => {
          setOpen((v) => !v)
          setQuery('')
        }}
      >
        <span className="symbol-name">{symbol.replace('USDT', '')}</span>
        <span className="symbol-quote">USDT</span>
        <Icon name="chevron" size={13} className="caret" />
      </button>
      {open && (
        <div className="symbol-dropdown">
          <input
            autoFocus
            className="symbol-search"
            placeholder="심볼 검색"
            aria-label="심볼 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="symbol-list">
            {filtered.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className={s === symbol ? 'active' : undefined}
                  onClick={() => {
                    onChange(s)
                    setOpen(false)
                  }}
                >
                  <span>{s.replace('USDT', '')}</span>
                  <em>USDT</em>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="empty">결과 없음</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

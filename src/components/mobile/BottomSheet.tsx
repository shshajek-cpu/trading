import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBackClose } from '../../hooks/useBackClose'
import { Icon } from '../Icon'
import type { MenuEntry } from '../ContextMenu'
import './mobile.css'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * TradingView 앱의 아래에서 올라오는 시트: 어두운 배경, 손잡이, 큰 제목, ✕.
 * 배경을 누르거나 안드로이드 뒤로가기·Esc 로 닫힌다.
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useBackClose(open, onClose)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      className="m-sheet-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section className="m-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="m-sheet-handle" aria-hidden="true" />
        <header className="m-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="m-sheet-close" aria-label="닫기" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="m-sheet-body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}

export interface SheetTile {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
  active?: boolean
  disabled?: boolean
}

/** 두 칸짜리 큰 타일 격자(TradingView 앱 "추가"·"더보기" 시트). */
export function SheetTiles({ tiles, columns = 2 }: { tiles: SheetTile[]; columns?: 2 | 3 | 4 }) {
  return (
    <div className={`m-tiles cols-${columns}`}>
      {tiles.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`m-tile${t.active ? ' active' : ''}`}
          disabled={t.disabled}
          onClick={t.onSelect}
        >
          <span className="m-tile-icon">{t.icon}</span>
          <span className="m-tile-label">{t.label}</span>
        </button>
      ))}
    </div>
  )
}

/** 시트 안의 목록 행. 컨텍스트 메뉴와 같은 MenuEntry 를 받아 우클릭 메뉴와 같은 항목을 폰에서 보여 준다. */
export function SheetList({ entries, onDone }: { entries: MenuEntry[]; onDone?: () => void }) {
  return (
    <div className="m-list">
      {entries.map((e, i) =>
        e.type === 'divider' ? (
          <div key={`d${i}`} className="m-list-divider" />
        ) : (
          <button
            key={e.label}
            type="button"
            role={e.checked === undefined ? undefined : 'menuitemcheckbox'}
            aria-checked={e.checked}
            className="m-list-row"
            disabled={e.disabled}
            onClick={() => {
              e.onSelect()
              onDone?.()
            }}
          >
            <span className="m-list-icon">
              {e.checked ? <Icon name="check" size={20} /> : e.checked === false ? null : e.icon}
            </span>
            <span className="m-list-label">{e.label}</span>
          </button>
        ),
      )}
    </div>
  )
}

export function SheetSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="m-sheet-section">
      {title && <h3>{title}</h3>}
      {children}
    </section>
  )
}

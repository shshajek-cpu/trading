import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBackClose } from '../../hooks/useBackClose'
import './ui.css'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Desktop width in px; phones always get a full-screen sheet. */
  width?: number
  /** Fixed desktop height in px (lists that should not jump while filtering). */
  height?: number
  /** Content between the title bar and the body, e.g. a search field or tabs. */
  header?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}

/** TradingView modal: dimmed backdrop, 20px title, close ×, Escape and Android back close it. */
export function Dialog({ open, onClose, title, width = 560, height, header, footer, className, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useBackClose(open, onClose)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    // Focus the first field so typing starts immediately (symbol search, indicator search).
    const first = panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.tv-dialog-close)')
    first?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      className="tv-dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`tv-dialog${className ? ` ${className}` : ''}`}
        style={{ width, height }}
      >
        <div className="tv-dialog-head">
          <h2 className="tv-dialog-title">{title}</h2>
          <button type="button" className="tv-dialog-close" aria-label="닫기" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {header && <div className="tv-dialog-header">{header}</div>}
        <div className="tv-dialog-body">{children}</div>
        {footer && <div className="tv-dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

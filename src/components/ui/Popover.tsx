import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './ui.css'

export type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-start' | 'left-start'

interface PopoverProps {
  /** Element the popover hangs off. Clicks on it do not count as "outside". */
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  placement?: Placement
  /** Gap between anchor and popover, px. */
  offset?: number
  className?: string
  children: ReactNode
}

const MARGIN = 6

/**
 * TradingView-style dropdown surface: fixed-positioned in a portal, flips/clamps to the
 * viewport, closes on outside pointerdown and Escape.
 */
export function Popover({
  anchor,
  open,
  onClose,
  placement = 'bottom-start',
  offset = 4,
  className,
  children,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setPos(null)
      return
    }
    const place = () => {
      const el = ref.current
      if (!el) return
      const a = anchor.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left: number
      let top: number
      if (placement.startsWith('right') || placement.startsWith('left')) {
        left = placement.startsWith('right') ? a.right + offset : a.left - offset - w
        if (left + w > vw - MARGIN) left = a.left - offset - w
        if (left < MARGIN) left = a.right + offset
        top = a.top
      } else {
        left = placement.endsWith('end') ? a.right - w : a.left
        const below = a.bottom + offset
        const above = a.top - offset - h
        const wantTop = placement.startsWith('top')
        top = wantTop ? (above >= MARGIN ? above : below) : below + h <= vh - MARGIN || above < MARGIN ? below : above
      }
      left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - w - MARGIN))
      top = Math.max(MARGIN, top)
      setPos({ left, top, maxHeight: vh - top - MARGIN })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor, placement, offset])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchor])

  if (!open) return null
  return createPortal(
    <div
      ref={ref}
      className={`tv-popover${className ? ` ${className}` : ''}`}
      style={
        pos
          ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight }
          : { left: -9999, top: -9999, visibility: 'hidden' }
      }
      role="menu"
    >
      {children}
    </div>,
    document.body,
  )
}

export function MenuSection({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="tv-menu-section">
      {title && <div className="tv-menu-title">{title}</div>}
      {children}
    </div>
  )
}

export function MenuDivider() {
  return <div className="tv-menu-divider" role="separator" />
}

interface MenuItemProps {
  icon?: ReactNode
  label: ReactNode
  /** Right-aligned hint such as a keyboard shortcut. */
  shortcut?: ReactNode
  /** Right-aligned control (e.g. favorite star). Clicks on it do not select the item. */
  trailing?: ReactNode
  active?: boolean
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
}

export function MenuItem({ icon, label, shortcut, trailing, active, checked, disabled, onSelect }: MenuItemProps) {
  return (
    <div
      role="menuitem"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-checked={checked}
      className={`tv-menu-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
      onClick={() => {
        if (!disabled) onSelect()
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      {icon !== undefined && <span className="tv-menu-icon">{icon}</span>}
      <span className="tv-menu-label">{label}</span>
      {shortcut && <span className="tv-menu-shortcut">{shortcut}</span>}
      {trailing && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <span className="tv-menu-trailing" onClick={(e) => e.stopPropagation()}>
          {trailing}
        </span>
      )}
    </div>
  )
}

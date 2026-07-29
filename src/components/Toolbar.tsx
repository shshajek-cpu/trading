import { useEffect, useRef, useState } from 'react'
import type { LayoutMode } from '../lib/layoutConfig'

export type PopoverId = 'indicators' | 'alerts' | 'drawings' | 'sync' | 'watchlist' | 'mtf'

interface ToolbarProps {
  layout: LayoutMode
  onLayoutChange: (layout: LayoutMode) => void
  pipSupported: boolean
  pipOpen: boolean
  onTogglePip: () => void
  /** 열린 팝오버. 상단바 버튼을 누르면 그 아래로 내려온다. */
  open: PopoverId | null
  onOpenChange: (id: PopoverId | null) => void
  alertCount: number
  children?: React.ReactNode
}

const LAYOUTS: { mode: LayoutMode; label: string; title: string }[] = [
  { mode: 1, label: '▢', title: '1분할' },
  { mode: 2, label: '◫', title: '2분할' },
  { mode: 4, label: '⊞', title: '4분할' },
]

export function Toolbar({
  layout,
  onLayoutChange,
  pipSupported,
  pipOpen,
  onTogglePip,
  open,
  onOpenChange,
  alertCount,
  children,
}: ToolbarProps) {
  const barRef = useRef<HTMLElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  // 팭오버를 누른 버튼 아래에 맞춘다.
  const [left, setLeft] = useState(0)

  // 바깥을 누르거나 Esc 를 누르면 닫는다.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) onOpenChange(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(null)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  const tab = (id: PopoverId, label: string, badge?: number) => (
    <button
      type="button"
      className={open === id ? 'active' : undefined}
      onClick={(e) => {
        const bar = barRef.current
        if (bar) {
          const b = e.currentTarget.getBoundingClientRect()
          setLeft(b.left - bar.getBoundingClientRect().left)
        }
        onOpenChange(open === id ? null : id)
      }}
    >
      {label}
      {badge ? <span className="badge">{badge}</span> : null}
    </button>
  )

  return (
    <header className="toolbar" ref={barRef}>
      <span className="app-title">Trading</span>

      <div className="layout-switch">
        {LAYOUTS.map(({ mode, label, title }) => (
          <button
            key={mode}
            type="button"
            title={title}
            className={mode === layout ? 'active' : undefined}
            onClick={() => onLayoutChange(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar-tabs" ref={tabsRef}>
        {tab('watchlist', '☰ 종목')}
        {tab('mtf', '⧉ 시간대')}
        {tab('indicators', '〜 지표')}
        {tab('drawings', '─ 선')}
        {tab('alerts', '🔔 알림', alertCount)}
        {tab('sync', '⇅ 동기화')}
      </div>

      <div className="toolbar-gap" />

      <button
        type="button"
        className={`pip-button${pipOpen ? ' active' : ''}`}
        disabled={!pipSupported}
        title={
          pipSupported
            ? '미니 시세창 (항상 위에 표시)'
            : '이 브라우저는 Document Picture-in-Picture를 지원하지 않습니다'
        }
        onClick={onTogglePip}
      >
        ⧉ 미니창
      </button>

      {open && (
        <div className="popover" style={{ left }}>
          {children}
        </div>
      )}
    </header>
  )
}

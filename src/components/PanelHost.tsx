import { useEffect, useRef } from 'react'
import { Icon } from './Icon'
import { PANELS, PANEL_MAP, type PanelId } from '../lib/panels'

interface PanelHostProps {
  open: PanelId | null
  onOpenChange: (id: PanelId | null) => void
  alertCount: number
  /** 좁은 화면이면 아래에서 올라오는 시트, 넓으면 오른쪽 서랍. */
  mobile: boolean
  children: React.ReactNode
}

/**
 * 설정 묶음을 담는 그릇.
 * 데스크톱: 오른쪽 아이콘 레일 + 그 옆으로 밀려나오는 유리 서랍.
 * 모바일:   아래에서 올라오는 시트(손가락으로 끌어 내려 닫는다).
 * 두 화면이 같은 내용을 쓰므로 무엇을 켰는지 헷갈리지 않는다.
 */
export function PanelHost({ open, onOpenChange, alertCount, mobile, children }: PanelHostProps) {
  const meta = open ? PANEL_MAP[open] : null
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; offset: number } | null>(null)

  // Esc 로 닫는다.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // 모바일 시트를 손가락으로 끌어 내려 닫는다 — 아래로 100px 넘게 끌면 닫힌다.
  const onHandleDown = (e: React.PointerEvent) => {
    if (!mobile) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, offset: 0 }
  }

  const onHandleMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    const sheet = sheetRef.current
    if (!drag || !sheet) return
    const offset = Math.max(0, e.clientY - drag.startY)
    drag.offset = offset
    sheet.style.transition = 'none'
    sheet.style.transform = `translateY(${offset}px)`
  }

  const onHandleUp = () => {
    const drag = dragRef.current
    const sheet = sheetRef.current
    dragRef.current = null
    if (!sheet) return
    sheet.style.transition = ''
    sheet.style.transform = ''
    if (drag && drag.offset > 100) onOpenChange(null)
  }

  return (
    <>
      {/* 데스크톱 오른쪽 아이콘 레일 — 항상 보이고, 지금 열린 것에 불이 들어온다. */}
      <nav className="dock-rail" aria-label="설정 패널">
        {PANELS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`dock-btn${open === p.id ? ' active' : ''}`}
            title={p.label}
            aria-label={p.label}
            aria-pressed={open === p.id}
            onClick={() => onOpenChange(open === p.id ? null : p.id)}
          >
            <Icon name={p.icon} size={19} />
            <span className="dock-label">{p.label}</span>
            {p.id === 'alerts' && alertCount > 0 && (
              <span className="dot-badge">{alertCount > 9 ? '9+' : alertCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* 모바일에서만 뒤를 덮는다. 데스크톱 서랍은 차트를 밀어내지 않고 겹쳐 뜬다. */}
      {open && mobile && (
        <button
          type="button"
          className="scrim"
          aria-label="닫기"
          onClick={() => onOpenChange(null)}
        />
      )}

      <aside
        ref={sheetRef}
        className={`panel-host${open ? ' open' : ''}`}
        // 닫혀 있을 때는 화면 낭독기와 탭 이동에서 통째로 뺀다.
        // aria-hidden 만 두면 안의 버튼에 탭으로 들어가 '보이지 않는 곳'에 갇힌다.
        inert={!open}
        aria-label={meta?.label}
      >
        {/* 시트 손잡이 — 폰에서 끌어 내려 닫는다. */}
        <div
          className="sheet-grip"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <span />
        </div>

        <header className="panel-head">
          {meta && (
            <>
              <span className="panel-head-icon">
                <Icon name={meta.icon} size={17} />
              </span>
              <div className="panel-head-text">
                <h2>{meta.label}</h2>
                <p>{meta.hint}</p>
              </div>
            </>
          )}
          <button
            type="button"
            className="icon-btn panel-close"
            aria-label="닫기"
            onClick={() => onOpenChange(null)}
          >
            <Icon name="close" size={17} />
          </button>
        </header>

        <div className="panel-body">{children}</div>
      </aside>
    </>
  )
}

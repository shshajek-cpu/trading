import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  equalizeBoundary,
  gridGeometry,
  moveBoundary,
  type CellRect,
  type GridBoundary,
  type LayoutGrid,
} from '../lib/layoutConfig'
import { Icon } from './Icon'

interface ChartGridProps {
  grid: LayoutGrid
  /** 한 칸 크게 보기 중인 칸. 나머지 칸은 가린 채 마운트해 둔다(되돌렸을 때 보던 자리·리플레이가 남게). */
  maximized: number | null
  onGridChange: (grid: LayoutGrid) => void
  renderCell: (index: number, style: CSSProperties) => ReactNode
  variant: 'desktop' | 'phone'
  /** 폰: 칸 크기 조절 중 — 경계마다 44px 손잡이와 완료 칩. */
  resizing?: boolean
  onResizeDone?: () => void
  onEqualize?: () => void
}

const HIDDEN: CSSProperties = { display: 'none' }
const FULL: CSSProperties = { position: 'absolute', inset: 0 }
/** 칸 사이 간격(px) — 데스크톱은 끌 수 있는 4px 막대, 폰은 1px 경계. */
const GAP = { desktop: 4, phone: 1 }
/** 끌어서 줄일 수 있는 가장 작은 칸(px). */
const MIN_PX = { desktop: 80, phone: 56 }
/** 폰: 칸이 이보다 좁거나 낮으면 줄 방향을 뒤집어 본다(세로 화면의 좌우 2칸 → 위아래). */
const FIT_W = 200
const FIT_H = 120
const EPS = 1e-6

/** 가장 옹색한 칸이 FIT_W×FIT_H 에 얼마나 차는지(1 이상이면 넉넉). */
function fitScore(rects: CellRect[], width: number, height: number): number {
  return Math.min(...rects.map((r) => Math.min((r.w * width) / FIT_W, (r.h * height) / FIT_H)))
}

/** 칸 자리 → 절대 배치. 경계 쪽 가장자리만 간격의 반씩 비운다. */
function place(r: CellRect, gap: number): CSSProperties {
  const lead = Math.ceil(gap / 2)
  const trail = gap - lead
  const l = r.x > EPS ? lead : 0
  const rt = r.x + r.w < 1 - EPS ? trail : 0
  const t = r.y > EPS ? lead : 0
  const b = r.y + r.h < 1 - EPS ? trail : 0
  return {
    position: 'absolute',
    left: `calc(${r.x * 100}% + ${l}px)`,
    top: `calc(${r.y * 100}% + ${t}px)`,
    width: `calc(${r.w * 100}% - ${l + rt}px)`,
    height: `calc(${r.h * 100}% - ${t + b}px)`,
  }
}

/** 경계 막대 자리 — 두 칸 사이 간격을 정확히 덮는다. */
function barStyle(b: GridBoundary, gap: number): CSSProperties {
  const at = `calc(${b.pos * 100}% - ${gap - Math.ceil(gap / 2)}px)`
  const span = { start: `${b.from * 100}%`, size: `${(b.to - b.from) * 100}%` }
  return b.vertical
    ? { left: at, width: gap, top: span.start, height: span.size }
    : { top: at, height: gap, left: span.start, width: span.size }
}

/** 폰 손잡이 자리 — 경계 한가운데. */
function handleStyle(b: GridBoundary): CSSProperties {
  const mid = `${((b.from + b.to) / 2) * 100}%`
  const at = `${b.pos * 100}%`
  return b.vertical ? { left: at, top: mid } : { top: at, left: mid }
}

/**
 * 분할 차트 격자. 칸은 모두 한 부모 아래 절대 배치라 격자 모양이 바뀌어도 차트가 다시 만들어지지 않는다.
 * 데스크톱은 경계 막대를 끌고(더블클릭 = 양옆 균등, 방향키 = 2%·Shift 10%, Enter = 균등), 폰은 크기 조절 모드의 손잡이를 끈다.
 */
export function ChartGrid({
  grid,
  maximized,
  onGridChange,
  renderCell,
  variant,
  resizing = false,
  onResizeDone,
  onEqualize,
}: ChartGridProps) {
  const ref = useRef<HTMLElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const phone = variant === 'phone'

  useLayoutEffect(() => {
    const el = ref.current
    if (!phone || !el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phone])

  const straight = gridGeometry(grid)
  let geometry = straight
  if (phone && size && size.w > 0 && size.h > 0) {
    const flipped = gridGeometry(grid, true)
    const here = fitScore(straight.rects, size.w, size.h)
    if (here < 1 && fitScore(flipped.rects, size.w, size.h) > here) geometry = flipped
  }
  const gap = GAP[variant]
  const showBounds = maximized === null && (!phone || resizing)

  const startDrag = (b: GridBoundary) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    const el = ref.current
    if (!el) return
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    el.classList.add('resizing', b.vertical ? 'col' : 'row')
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const length = b.vertical ? r.width : r.height
      if (length <= 0) return
      const pos = b.vertical ? (ev.clientX - r.left) / length : (ev.clientY - r.top) / length
      onGridChange(moveBoundary(grid, b, pos, MIN_PX[variant] / length))
    }
    const up = () => {
      el.classList.remove('resizing', 'col', 'row')
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const onKey = (b: GridBoundary) => (e: React.KeyboardEvent<HTMLElement>) => {
    const back = b.vertical ? 'ArrowLeft' : 'ArrowUp'
    const fwd = b.vertical ? 'ArrowRight' : 'ArrowDown'
    if (e.key === 'Enter') {
      e.preventDefault()
      onGridChange(equalizeBoundary(grid, b))
      return
    }
    if (e.key !== back && e.key !== fwd) return
    e.preventDefault()
    const el = ref.current
    const length = el ? (b.vertical ? el.clientWidth : el.clientHeight) : 0
    const step = (e.shiftKey ? 0.1 : 0.02) * (e.key === fwd ? 1 : -1)
    onGridChange(moveBoundary(grid, b, b.pos + step, length > 0 ? MIN_PX[variant] / length : 0.05))
  }

  const separator = (b: GridBoundary, className: string, style: CSSProperties, children?: ReactNode) => (
    // 창 분할 막대(WAI-ARIA window splitter): 포커스를 받아 방향키로 옮긴다.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex
    <div
      key={`${b.kind}-${b.line}-${b.index}`}
      className={`${className} ${b.vertical ? 'col' : 'row'}`}
      style={style}
      role="separator"
      tabIndex={0}
      aria-orientation={b.vertical ? 'vertical' : 'horizontal'}
      aria-label={b.kind === 'line' ? '줄 경계' : '칸 경계'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(b.pos * 100)}
      onPointerDown={startDrag(b)}
      onDoubleClick={() => onGridChange(equalizeBoundary(grid, b))}
      onKeyDown={onKey(b)}
    >
      {children}
    </div>
  )

  // 데스크톱은 차트 영역 자체가 본문(main)이고, 폰은 MobileShell 의 main 안에 들어간다.
  const Root = phone ? 'div' : 'main'
  return (
    <Root ref={ref as React.RefObject<HTMLDivElement>} className={phone ? 'm-chart-grid' : 'tv-chart-grid'}>
      {geometry.rects.map((r, i) =>
        renderCell(i, maximized === null ? place(r, gap) : i === maximized ? FULL : HIDDEN),
      )}

      {showBounds &&
        geometry.bounds.map((b) =>
          phone
            ? separator(b, 'm-grid-handle', handleStyle(b), <span className="m-grid-handle-pill" />)
            : separator(b, 'tv-split-bar', barStyle(b, gap)),
        )}

      {phone && resizing && maximized === null && (
        <div className="m-tool-chip m-grid-chip" role="status">
          <span>칸 크기 조절</span>
          {onEqualize && (
            <button type="button" className="m-grid-chip-text" onClick={onEqualize}>
              균등
            </button>
          )}
          <button type="button" aria-label="칸 크기 조절 끝내기" onClick={onResizeDone}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </Root>
  )
}

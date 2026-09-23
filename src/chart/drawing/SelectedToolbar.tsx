import { useRef, useState } from 'react'
import {
  withAlpha,
  type Drawing,
  type DrawingKind,
  type DrawingStyle,
} from '../../lib/drawings'
import { Popover, MenuSection, MenuItem } from '../../components/ui/Popover'
import { ToolIcon } from './toolIcons'

export interface SelectedToolbarProps {
  drawing: Drawing
  globalLocked: boolean
  onUpdate: (id: string, patch: Partial<Omit<Drawing, 'id'>>, opts?: { history?: boolean }) => void
  onRemove: (id: string) => void
  onClone: (d: Drawing) => void
  onEditText: (d: Drawing) => void
  palette: readonly string[]
}

const FILL_KINDS: Record<DrawingKind, true | undefined> = {
  rectangle: true, ellipse: true, triangle: true, parallelChannel: true,
  fibRetracement: true, priceRange: true, dateRange: true, datePriceRange: true,
  longPosition: true, shortPosition: true,
  trend: undefined, ray: undefined, infoLine: undefined, extended: undefined,
  trendAngle: undefined, horizontal: undefined, horizontalRay: undefined,
  vertical: undefined, crossLine: undefined, brush: undefined, text: undefined,
  arrowLine: undefined, arrowMarkUp: undefined, arrowMarkDown: undefined,
}

const TEXT_KINDS: Record<string, true> = { text: true, arrowMarkUp: true, arrowMarkDown: true }

const WIDTHS: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]
const STYLES: { id: DrawingStyle['lineStyle']; label: string }[] = [
  { id: 'solid', label: '실선' },
  { id: 'dashed', label: '파선' },
  { id: 'dotted', label: '점선' },
]

export function SelectedToolbar({
  drawing,
  globalLocked,
  onUpdate,
  onRemove,
  onClone,
  onEditText,
  palette,
}: SelectedToolbarProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [menu, setMenu] = useState<'color' | 'fill' | 'width' | 'style' | null>(null)
  const colorRef = useRef<HTMLButtonElement>(null)
  const fillRef = useRef<HTMLButtonElement>(null)
  const widthRef = useRef<HTMLButtonElement>(null)
  const styleRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  const s = drawing.style
  const hasFill = FILL_KINDS[drawing.kind] === true
  const isText = TEXT_KINDS[drawing.kind] === true
  const lockedNow = globalLocked || drawing.locked

  const setStyle = (patch: Partial<DrawingStyle>) => {
    onUpdate(drawing.id, { style: { ...s, ...patch } })
  }

  const onGripDown = (e: React.PointerEvent) => {
    const parent = (e.currentTarget as HTMLElement).closest('.tv-draw-seltoolbar') as HTMLElement | null
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    const move = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const host = parent.parentElement?.getBoundingClientRect()
      const ox = host?.left ?? 0
      const oy = host?.top ?? 0
      setPos({ left: ev.clientX - ox - dragRef.current.dx, top: ev.clientY - oy - dragRef.current.dy })
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const style = pos
    ? { left: pos.left, top: pos.top, transform: 'none' as const }
    : undefined

  return (
    <div className={`tv-draw-seltoolbar${pos ? ' moved' : ''}`} style={style}>
      <button
        type="button"
        className="tv-draw-selgrip"
        aria-label="이동"
        onPointerDown={onGripDown}
      >
        <ToolIcon name="grip" size={18} />
      </button>

      <button
        ref={colorRef}
        type="button"
        className="tv-draw-selbtn"
        title="선 색"
        aria-label="선 색"
        onClick={() => setMenu(menu === 'color' ? null : 'color')}
      >
        <span className="tv-draw-swatch" style={{ background: s.color }} />
      </button>
      <Popover anchor={colorRef.current} open={menu === 'color'} onClose={() => setMenu(null)} placement="bottom-start">
        <ColorGrid palette={palette} value={s.color} onPick={(c) => { setStyle({ color: c }); setMenu(null) }} />
      </Popover>

      {hasFill && (
        <>
          <button
            ref={fillRef}
            type="button"
            className="tv-draw-selbtn"
            title="채움 색"
            aria-label="채움 색"
            onClick={() => setMenu(menu === 'fill' ? null : 'fill')}
          >
            <ToolIcon name="fill" size={20} />
          </button>
          <Popover anchor={fillRef.current} open={menu === 'fill'} onClose={() => setMenu(null)} placement="bottom-start">
            <ColorGrid
              palette={palette}
              value={s.fillColor ?? s.color}
              onPick={(c) => { setStyle({ fillColor: withAlpha(c, 0.2) }); setMenu(null) }}
            />
          </Popover>
        </>
      )}

      <button
        ref={widthRef}
        type="button"
        className="tv-draw-selbtn"
        title="선 굵기"
        aria-label="선 굵기"
        onClick={() => setMenu(menu === 'width' ? null : 'width')}
      >
        <ToolIcon name="lineWidth" size={20} />
      </button>
      <Popover anchor={widthRef.current} open={menu === 'width'} onClose={() => setMenu(null)} placement="bottom-start">
        <MenuSection title="선 굵기">
          {WIDTHS.map((w) => (
            <MenuItem
              key={w}
              label={`${w}px`}
              active={s.lineWidth === w}
              onSelect={() => { setStyle({ lineWidth: w }); setMenu(null) }}
            />
          ))}
        </MenuSection>
      </Popover>

      <button
        ref={styleRef}
        type="button"
        className="tv-draw-selbtn"
        title="선 종류"
        aria-label="선 종류"
        onClick={() => setMenu(menu === 'style' ? null : 'style')}
      >
        <ToolIcon name="lineStyle" size={20} />
      </button>
      <Popover anchor={styleRef.current} open={menu === 'style'} onClose={() => setMenu(null)} placement="bottom-start">
        <MenuSection title="선 종류">
          {STYLES.map((st) => (
            <MenuItem
              key={st.id}
              label={st.label}
              active={s.lineStyle === st.id}
              onSelect={() => { setStyle({ lineStyle: st.id }); setMenu(null) }}
            />
          ))}
        </MenuSection>
      </Popover>

      {isText && (
        <button
          type="button"
          className="tv-draw-selbtn"
          title="텍스트 편집"
          aria-label="텍스트 편집"
          onClick={() => onEditText(drawing)}
        >
          <ToolIcon name="text" size={20} />
        </button>
      )}

      {drawing.kind === 'horizontal' && (
        <button
          type="button"
          className={`tv-draw-selbtn${drawing.alert ? ' on' : ''}`}
          title="알림"
          aria-label="알림"
          aria-pressed={drawing.alert}
          onClick={() =>
            onUpdate(
              drawing.id,
              drawing.alert ? { alert: false } : { alert: true, fired: false, above: null },
            )
          }
        >
          <ToolIcon name="bell" size={20} />
        </button>
      )}

      <button
        type="button"
        className={`tv-draw-selbtn${lockedNow ? ' on' : ''}`}
        title="잠금"
        aria-label="잠금"
        aria-pressed={drawing.locked}
        onClick={() => onUpdate(drawing.id, { locked: !drawing.locked })}
      >
        <ToolIcon name={lockedNow ? 'lock' : 'unlock'} size={20} />
      </button>

      <button
        type="button"
        className="tv-draw-selbtn"
        title="복제"
        aria-label="복제"
        onClick={() => onClone(drawing)}
      >
        <ToolIcon name="clone" size={20} />
      </button>

      <button
        type="button"
        className="tv-draw-selbtn"
        title="삭제"
        aria-label="삭제"
        onClick={() => onRemove(drawing.id)}
      >
        <ToolIcon name="trash" size={20} />
      </button>
    </div>
  )
}

function ColorGrid({
  palette,
  value,
  onPick,
}: {
  palette: readonly string[]
  value: string
  onPick: (c: string) => void
}) {
  return (
    <div className="tv-draw-colorgrid">
      <div className="tv-draw-colorrow">
        {palette.map((c) => (
          <button
            key={c}
            type="button"
            className={`tv-draw-colorcell${value.toLowerCase() === c.toLowerCase() ? ' active' : ''}`}
            style={{ background: c }}
            aria-label={c}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
      <label className="tv-draw-colorcustom">
        <span>사용자 색</span>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#2962ff'}
          onChange={(e) => onPick(e.target.value)}
        />
      </label>
    </div>
  )
}

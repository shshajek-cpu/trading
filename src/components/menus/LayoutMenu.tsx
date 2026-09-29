import { useState } from 'react'
import {
  cellCount,
  equalGrid,
  gridGeometry,
  LAYOUT_SYNC_ITEMS,
  MAX_CELLS,
  MAX_LINES,
  MAX_PER_LINE,
  PRESET_GROUPS,
  shapeKey,
  type GridDir,
  type GridShape,
  type LayoutControls,
} from '../../lib/layoutConfig'
import { tip } from '../../lib/tooltip'
import { MenuDivider, MenuItem, MenuSection, Popover } from '../ui/Popover'
import { Icon, LayoutIcon } from '../Icon'

/** 데스크톱 레이아웃 메뉴(menu)와 폰 레이아웃 시트(sheet)가 같은 조각을 쓴다 — sheet 는 손가락 크기. */
type Variant = 'menu' | 'sheet'

/** 칸 수별 줄로 늘어놓은 프리셋 모양 버튼(TradingView 레이아웃 메뉴처럼 그림으로). */
export function LayoutPresetPicker({
  current,
  onPick,
  variant,
}: {
  current: GridShape
  onPick: (shape: GridShape) => void
  variant: Variant
}) {
  const key = shapeKey(current)
  return (
    <div className={`tv-layout-presets ${variant}`}>
      {PRESET_GROUPS.map((g) => (
        <div key={g.count} className="tv-layout-group">
          <span className="tv-layout-count">{g.count}</span>
          {g.presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`tv-layout-preset${shapeKey(p.shape) === key ? ' active' : ''}`}
              aria-label={p.label}
              aria-pressed={shapeKey(p.shape) === key}
              {...tip(p.label)}
              onClick={() => onPick(p.shape)}
            >
              <LayoutIcon shape={p.shape} size={variant === 'sheet' ? 30 : 26} />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

/** 「직접 만들기」: 줄 방향, 줄 추가·빼기, 줄마다 칸 수. 미리보기는 고치는 즉시 바뀌고 「적용」해야 차트가 바뀐다. */
export function LayoutEditor({
  initial,
  onApply,
  onCancel,
  variant,
}: {
  initial: GridShape
  onApply: (shape: GridShape) => void
  onCancel: () => void
  variant: Variant
}) {
  const [dir, setDir] = useState<GridDir>(initial.dir)
  const [lines, setLines] = useState<number[]>(initial.lines)
  const total = cellCount({ dir, lines })
  const preview = gridGeometry(equalGrid({ dir, lines }))
  const lineWord = dir === 'rows' ? '가로 줄' : '세로 줄'

  return (
    <div className={`tv-layout-editor ${variant}`}>
      <div className="tv-layout-editor-head">
        <span>줄 방향</span>
        <div className="tv-layout-seg" role="radiogroup" aria-label="줄 방향">
          {(['rows', 'cols'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={dir === d}
              className={dir === d ? 'active' : undefined}
              onClick={() => setDir(d)}
            >
              {d === 'rows' ? '가로 줄' : '세로 줄'}
            </button>
          ))}
        </div>
      </div>

      <div className="tv-layout-preview" aria-label={`미리보기 ${total}칸`} role="img">
        {preview.rects.map((r, i) => (
          <span
            key={i}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
          >
            {i + 1}
          </span>
        ))}
      </div>

      <ol className="tv-layout-lines">
        {lines.map((n, li) => (
          <li key={li}>
            <span className="tv-layout-line-name">
              {lineWord} {li + 1}
            </span>
            <div className="tv-layout-seg" role="radiogroup" aria-label={`${lineWord} ${li + 1} 칸 수`}>
              {Array.from({ length: MAX_PER_LINE }, (_, k) => k + 1).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={n === c}
                  className={n === c ? 'active' : undefined}
                  disabled={total - n + c > MAX_CELLS}
                  onClick={() => setLines(lines.map((x, i) => (i === li ? c : x)))}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="tv-layout-icon-btn"
              aria-label={`${lineWord} ${li + 1} 빼기`}
              {...tip('줄 빼기')}
              disabled={lines.length === 1}
              onClick={() => setLines(lines.filter((_, i) => i !== li))}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="tv-layout-add"
        disabled={lines.length >= MAX_LINES || total >= MAX_CELLS}
        onClick={() => setLines([...lines, 1])}
      >
        <Icon name="plus" size={18} />
        줄 추가
      </button>
      <p className="tv-layout-hint">
        줄 {MAX_LINES}개, 한 줄에 {MAX_PER_LINE}칸, 모두 {MAX_CELLS}칸까지 · 지금 {total}칸
      </p>

      <div className="tv-layout-actions">
        <button type="button" className="tv-btn" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="tv-btn primary" onClick={() => onApply({ dir, lines })}>
          적용
        </button>
      </div>
    </div>
  )
}

/** 「내 레이아웃」: 지금 격자 + 칸 설정을 이름 붙여 저장·적용·이름 바꾸기·삭제. */
export function SavedLayoutList({
  controls,
  onApplied,
  variant,
}: {
  controls: LayoutControls
  /** 적용한 뒤(메뉴·시트 닫기). */
  onApplied: () => void
  variant: Variant
}) {
  const { saved } = controls
  const [draft, setDraft] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  const commitSave = () => {
    const name = draft?.trim()
    if (name) controls.onSave(name)
    setDraft(null)
  }
  const commitRename = () => {
    const name = renaming?.name.trim()
    if (renaming && name) controls.onRenameSaved(renaming.id, name)
    setRenaming(null)
  }

  return (
    <div className={`tv-saved-layouts ${variant}`}>
      {saved.length === 0 && draft === null && <p className="tv-layout-hint">저장한 레이아웃이 없습니다</p>}
      <ul>
        {saved.map((l) => (
          <li key={l.id}>
            {renaming?.id === l.id ? (
              <input
                className="tv-input"
                aria-label="레이아웃 이름"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={renaming.name}
                maxLength={40}
                onChange={(e) => setRenaming({ id: l.id, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                }}
                onBlur={commitRename}
              />
            ) : (
              <button
                type="button"
                className="tv-saved-layout-apply"
                onClick={() => {
                  controls.onApplySaved(l.id)
                  onApplied()
                }}
              >
                <LayoutIcon shape={l.grid} size={variant === 'sheet' ? 24 : 20} />
                <span className="tv-saved-layout-name">{l.name}</span>
                <span className="tv-saved-layout-meta">{l.cells.length}칸</span>
              </button>
            )}
            <button
              type="button"
              className="tv-layout-icon-btn"
              aria-label={`${l.name} 이름 바꾸기`}
              {...tip('이름 바꾸기')}
              onClick={() => setRenaming({ id: l.id, name: l.name })}
            >
              <Icon name="pencil" size={18} />
            </button>
            <button
              type="button"
              className="tv-layout-icon-btn"
              aria-label={`${l.name} 삭제`}
              {...tip('삭제')}
              onClick={() => controls.onDeleteSaved(l.id)}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      {draft === null ? (
        <button type="button" className="tv-layout-add" onClick={() => setDraft(`내 레이아웃 ${saved.length + 1}`)}>
          <Icon name="save" size={18} />
          지금 레이아웃 저장
        </button>
      ) : (
        <form
          className="tv-saved-layout-form"
          onSubmit={(e) => {
            e.preventDefault()
            commitSave()
          }}
        >
          <input
            className="tv-input"
            aria-label="새 레이아웃 이름"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
          <button type="submit" className="tv-btn primary" disabled={!draft.trim()}>
            저장
          </button>
        </form>
      )}
    </div>
  )
}

interface LayoutMenuProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  controls: LayoutControls
}

export function LayoutMenu({ anchor, open, onClose, controls }: LayoutMenuProps) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-end" className="tv-layout-menu">
      <LayoutMenuBody controls={controls} onClose={onClose} />
    </Popover>
  )
}

/** 메뉴가 열릴 때마다 새로 마운트돼 「직접 만들기」 화면에서 닫았어도 다음에는 처음 화면으로 연다. */
function LayoutMenuBody({ controls, onClose }: { controls: LayoutControls; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  const { grid, sync } = controls

  if (editing) {
    return (
      <MenuSection title="직접 만들기">
        <LayoutEditor
          variant="menu"
          initial={grid}
          onCancel={() => setEditing(false)}
          onApply={(shape) => {
            controls.onShapeChange(shape)
            onClose()
          }}
        />
      </MenuSection>
    )
  }

  return (
    <>
      <MenuSection title="레이아웃">
        <LayoutPresetPicker
          variant="menu"
          current={grid}
          onPick={(shape) => {
            controls.onShapeChange(shape)
            onClose()
          }}
        />
      </MenuSection>
      <MenuItem icon={<Icon name="pencil" size={20} />} label="직접 만들기…" onSelect={() => setEditing(true)} />
      <MenuItem
        icon={<Icon name="equalize" size={20} />}
        label="균등 분할"
        disabled={cellCount(grid) === 1}
        onSelect={() => {
          controls.onEqualize()
          onClose()
        }}
      />
      <MenuDivider />
      <MenuSection title="내 레이아웃">
        <SavedLayoutList variant="menu" controls={controls} onApplied={onClose} />
      </MenuSection>
      <MenuDivider />
      <MenuSection title="모든 칸에 같이 적용">
        {/* 켜고 끄는 항목이라 메뉴를 닫지 않는다. */}
        {LAYOUT_SYNC_ITEMS.map((s) => (
          <MenuItem
            key={s.key}
            icon={sync[s.key] ? <Icon name="check" size={18} /> : <span />}
            label={s.label}
            checked={sync[s.key]}
            onSelect={() => controls.onSyncChange(s.key, !sync[s.key])}
          />
        ))}
      </MenuSection>
    </>
  )
}

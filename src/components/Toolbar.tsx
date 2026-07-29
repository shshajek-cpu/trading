import type { LayoutMode } from '../lib/layoutConfig'

interface ToolbarProps {
  layout: LayoutMode
  onLayoutChange: (layout: LayoutMode) => void
  pipSupported: boolean
  pipOpen: boolean
  onTogglePip: () => void
}

const LAYOUTS: { mode: LayoutMode; label: string; title: string }[] = [
  { mode: 1, label: '▢', title: '1분할' },
  { mode: 2, label: '◫', title: '2분할' },
  { mode: 4, label: '⊞', title: '4분할' },
]

export function Toolbar({ layout, onLayoutChange, pipSupported, pipOpen, onTogglePip }: ToolbarProps) {
  return (
    <header className="toolbar">
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
    </header>
  )
}

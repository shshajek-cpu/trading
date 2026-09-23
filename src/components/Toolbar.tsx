import type { LayoutMode } from '../lib/layoutConfig'
import { Icon, type IconName } from './Icon'

interface ToolbarProps {
  layout: LayoutMode
  onLayoutChange: (layout: LayoutMode) => void
  pipSupported: boolean
  pipOpen: boolean
  onTogglePip: () => void
}

const LAYOUTS: { mode: LayoutMode; icon: IconName; title: string }[] = [
  { mode: 1, icon: 'layout1', title: '한 칸' },
  { mode: 2, icon: 'layout2', title: '두 칸' },
  { mode: 4, icon: 'layout4', title: '네 칸' },
]

/** 화면 맨 위 유리 바. 앱 이름과 화면 분할, 미니창만 둔다 — 설정은 오른쪽 서랍이 맡는다. */
export function Toolbar({
  layout,
  onLayoutChange,
  pipSupported,
  pipOpen,
  onTogglePip,
}: ToolbarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Trading</span>
      </div>

      <div className="seg layout-switch" role="group" aria-label="화면 분할">
        {LAYOUTS.map(({ mode, icon, title }) => (
          <button
            key={mode}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={mode === layout}
            className={mode === layout ? 'active' : undefined}
            onClick={() => onLayoutChange(mode)}
          >
            <Icon name={icon} size={16} />
          </button>
        ))}
      </div>

      <div className="topbar-gap" />

      <button
        type="button"
        className={`chip pip-button${pipOpen ? ' active' : ''}`}
        disabled={!pipSupported}
        title={
          pipSupported
            ? '미니 시세창 (항상 위에 표시)'
            : '이 브라우저는 미니창을 지원하지 않습니다'
        }
        onClick={onTogglePip}
      >
        <Icon name="pip" size={16} />
        <span>미니창</span>
      </button>
    </header>
  )
}

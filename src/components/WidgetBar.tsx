import type { ReactNode } from 'react'
import { WIDGET_TABS, type WidgetId } from '../lib/widgets'
import { Icon } from './Icon'
import { tip } from '../lib/tooltip'

interface WidgetBarProps {
  open: WidgetId | null
  onToggle: (id: WidgetId) => void
  alertCount: number
  children: ReactNode
}

export function WidgetBar({ open, onToggle, alertCount, children }: WidgetBarProps) {
  return (
    <>
      {open && <div className="tv-widget-page">{children}</div>}
      <nav className="tv-widget-tabs" aria-label="위젯">
        {WIDGET_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tv-widget-tab${open === t.id ? ' active' : ''}`}
            {...tip(t.label, t.desc, undefined, 'left')}
            aria-label={t.label}
            aria-pressed={open === t.id}
            onClick={() => onToggle(t.id)}
          >
            <Icon name={t.icon} size={22} />
            {t.id === 'alerts' && alertCount > 0 && <span className="tv-tab-badge">{alertCount}</span>}
          </button>
        ))}
      </nav>
    </>
  )
}

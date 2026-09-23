import { createPortal } from 'react-dom'
import { useBackClose } from '../hooks/useBackClose'
import { WIDGET_TABS, type WidgetId } from '../lib/widgets'
import { Icon } from './Icon'

interface MainMenuDrawerProps {
  open: boolean
  onClose: () => void
  onOpenWidget: (id: WidgetId) => void
  theme: 'dark' | 'light'
  onThemeChange: (v: 'dark' | 'light') => void
  onShortcuts: () => void
  install: { canShow: boolean; ios: boolean; installable: boolean; install: () => void }
}

export function MainMenuDrawer({
  open,
  onClose,
  onOpenWidget,
  theme,
  onThemeChange,
  onShortcuts,
  install,
}: MainMenuDrawerProps) {
  useBackClose(open, onClose)
  if (!open) return null

  return createPortal(
    <div
      className="tv-drawer-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <aside className="tv-drawer" aria-label="메인 메뉴">
        <header className="tv-drawer-head">
          <span className="tv-drawer-title">메뉴</span>
          <button type="button" className="tv-icon-btn" aria-label="닫기" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>

        <nav className="tv-drawer-group">
          {WIDGET_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tv-drawer-item"
              onClick={() => {
                onOpenWidget(t.id)
                onClose()
              }}
            >
              <Icon name={t.icon} size={22} />
              <span>{t.label}</span>
              <Icon name="chevronRight" size={16} className="tv-drawer-chev" />
            </button>
          ))}
        </nav>

        <div className="tv-drawer-group">
          <label className="tv-drawer-item switch">
            <Icon name="moon" size={22} />
            <span>다크 테마</span>
            <input
              className="tv-switch"
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => onThemeChange(e.target.checked ? 'dark' : 'light')}
            />
          </label>
          <button
            type="button"
            className="tv-drawer-item"
            onClick={() => {
              onShortcuts()
              onClose()
            }}
          >
            <Icon name="keyboard" size={22} />
            <span>키보드 단축키</span>
            <Icon name="chevronRight" size={16} className="tv-drawer-chev" />
          </button>
        </div>

        {install.canShow && (
          <div className="tv-drawer-group">
            <button
              type="button"
              className="tv-drawer-item"
              onClick={() => {
                if (!install.ios) install.install()
                onClose()
              }}
            >
              <Icon name="install" size={22} />
              <span>{install.ios ? '홈 화면에 추가 (공유 → 추가)' : '앱 설치'}</span>
            </button>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  )
}

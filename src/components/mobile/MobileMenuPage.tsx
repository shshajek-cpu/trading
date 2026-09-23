import { Icon, type IconName } from '../Icon'
import './mobile.css'

interface MenuRow {
  key: string
  icon: IconName
  label: string
  onSelect: () => void
}

interface MobileMenuPageProps {
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  rows: MenuRow[]
  install: { canShow: boolean; ios: boolean; install: () => void }
}

/** 폰 앱의 "메뉴" 탭: 큰 제목 아래 설정·도구 목록(TradingView 앱 메뉴 화면). */
export function MobileMenuPage({ theme, onThemeChange, rows, install }: MobileMenuPageProps) {
  return (
    <>
      <header className="m-page-head">
        <h1 className="m-page-title">메뉴</h1>
      </header>
      <div className="m-page-body">
        <div className="m-menu-group">
          {rows.map((r) => (
            <button key={r.key} type="button" className="m-menu-row" onClick={r.onSelect}>
              <Icon name={r.icon} size={24} />
              <span>{r.label}</span>
              <Icon name="chevronRight" size={18} className="m-menu-chev" />
            </button>
          ))}
        </div>

        <div className="m-menu-group">
          <label className="m-menu-row">
            <Icon name="moon" size={24} />
            <span>다크 테마</span>
            <input
              className="tv-switch"
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => onThemeChange(e.target.checked ? 'dark' : 'light')}
            />
          </label>
        </div>

        {install.canShow && (
          <div className="m-menu-group">
            <button type="button" className="m-menu-row" onClick={() => !install.ios && install.install()}>
              <Icon name="install" size={24} />
              <span>{install.ios ? '홈 화면에 추가 (공유 → 홈 화면에 추가)' : '앱 설치'}</span>
            </button>
          </div>
        )}
      </div>
    </>
  )
}

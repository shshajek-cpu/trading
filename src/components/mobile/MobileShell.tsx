import { useEffect } from 'react'
import { Icon } from '../Icon'
import { MOBILE_TABS, type MobileTab } from '../../lib/mobileNav'

interface MobileShellProps {
  tab: MobileTab
  onTabChange: (tab: MobileTab) => void
  alertCount: number
  /** 탭 위에 덮여 있는 상세 페이지가 있으면 탭바를 가린다. */
  pageOpen: boolean
  children: React.ReactNode
}

/**
 * 폰 앱의 뼈대 — 내용 + 아래 탭바.
 *
 * 진짜 앱과 같은 규칙을 따른다.
 * 탭은 네 개로 고정이고 위치가 변하지 않는다. 상세 페이지는 탭 위로 밀려 올라오고,
 * 뒤로가기로 되돌아온다.
 */
export function MobileShell({
  tab,
  onTabChange,
  alertCount,
  pageOpen,
  children,
}: MobileShellProps) {
  useEffect(() => {
    const stopViewportDrag = (event: TouchEvent) => {
      const target = event.target as Element | null
      if (
        target?.closest(
          'input, textarea, select, .iv-chips, .markets-screen, .alerts-screen, .more-screen, .subpage-body',
        )
      ) {
        return
      }
      if (event.cancelable) event.preventDefault()
    }

    document.addEventListener('touchmove', stopViewportDrag, { passive: false })
    return () => document.removeEventListener('touchmove', stopViewportDrag)
  }, [])

  return (
    <div className={`m-app${pageOpen ? ' page-open' : ''}`}>
      {children}

      <nav className="tabbar" aria-label="주요 화면">
        {MOBILE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tabbar-item${tab === t.id ? ' active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => onTabChange(t.id)}
          >
            <span className="tabbar-icon">
              <Icon name={t.icon} size={22} />
              {t.id === 'alerts' && alertCount > 0 && (
                <em className="dot-badge">{alertCount > 9 ? '9+' : alertCount}</em>
              )}
            </span>
            <span className="tabbar-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

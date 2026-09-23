import { Icon } from '../Icon'
import { MOBILE_PAGES, type MobilePage, type MobilePageMeta } from '../../lib/mobileNav'

interface MoreScreenProps {
  onOpen: (page: MobilePage) => void
  /** 아직 홈 화면에 추가하지 않았다면 설치 줄을 띄운다. */
  showInstall: boolean
  installable: boolean
  ios: boolean
  onInstall: () => void
}

const GROUPS: MobilePageMeta['group'][] = ['차트 도구', '분석', '기기']

/**
 * 더보기 화면 — 자주 쓰지 않는 것들을 설정 앱처럼 줄로 세운다.
 * 누르면 그 자리에서 상세 페이지가 옆으로 밀려 들어온다.
 */
export function MoreScreen({ onOpen, showInstall, installable, ios, onInstall }: MoreScreenProps) {
  return (
    <div className="screen more-screen">
      {showInstall && (
        <div className="install-card">
          <span className="install-icon">
            <Icon name="expand" size={18} />
          </span>
          <div className="install-text">
            <strong>앱으로 설치하기</strong>
            <span>
              {ios && !installable
                ? '아래 공유 버튼 → 홈 화면에 추가'
                : '주소창 없이 전체 화면으로 열립니다'}
            </span>
          </div>
          {installable && (
            <button type="button" className="install-go" onClick={onInstall}>
              설치
            </button>
          )}
        </div>
      )}

      {GROUPS.map((group) => (
        <section key={group} className="more-group">
          <p className="screen-label">{group}</p>
          <ul className="more-rows">
            {MOBILE_PAGES.filter((p) => p.group === group).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onOpen(p.id)}>
                  <span className="more-icon">
                    <Icon name={p.icon} size={18} />
                  </span>
                  <span className="more-label">
                    <strong>{p.label}</strong>
                    <em>{p.hint}</em>
                  </span>
                  <Icon name="chevron" size={16} className="more-caret" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

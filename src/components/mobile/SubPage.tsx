import { Icon } from '../Icon'

interface SubPageProps {
  title: string
  hint?: string
  onBack: () => void
  children: React.ReactNode
}

/**
 * 탭 위로 밀려 들어오는 상세 페이지.
 * 앱과 같이 왼쪽 위 '뒤로' 로 돌아가고, 기기 뒤로가기로도 닫힌다.
 */
export function SubPage({ title, hint, onBack, children }: SubPageProps) {
  return (
    <div className="subpage" role="dialog" aria-label={title}>
      <header className="subpage-head">
        <button type="button" className="icon-btn" aria-label="뒤로" onClick={onBack}>
          <Icon name="back" size={19} />
        </button>
        <div className="subpage-title">
          <strong>{title}</strong>
          {hint && <em>{hint}</em>}
        </div>
      </header>
      <div className="subpage-body">{children}</div>
    </div>
  )
}

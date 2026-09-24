import { Icon } from './Icon'

export interface ToastItem {
  id: string
  message: string
  /** 토스트 안의 버튼 하나(예: '새로고침'). 누르면 실행하고 토스트를 닫는다. */
  action?: { label: string; run: () => void }
}

/** 오른쪽 아래 안내 쪽지. 쪽지 자체는 버튼이 아니다 — 동작 버튼과 닫기 버튼이 따로 있다. */
export function Toasts({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(({ id, message, action }) => (
        <div key={id} className="toast">
          <span className="toast-icon">
            <Icon name="bell" size={16} />
          </span>
          <span className="toast-msg">{message}</span>
          {action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                action.run()
                onDismiss(id)
              }}
            >
              {action.label}
            </button>
          )}
          <button type="button" className="toast-close" aria-label="닫기" onClick={() => onDismiss(id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

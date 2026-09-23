import { Icon } from './Icon'

export interface Toast {
  id: string
  message: string
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className="toast" onClick={() => onDismiss(t.id)}>
          <span className="toast-icon">
            <Icon name="bell" size={16} />
          </span>
          <span className="toast-msg">{t.message}</span>
          <Icon name="close" size={14} className="toast-x" />
        </button>
      ))}
    </div>
  )
}

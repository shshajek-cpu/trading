export interface Toast {
  id: string
  message: string
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <button key={t.id} type="button" className="toast" onClick={() => onDismiss(t.id)}>
          {t.message}
        </button>
      ))}
    </div>
  )
}

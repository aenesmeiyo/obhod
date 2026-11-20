import type { ToastEvent } from '@shared/types'
import { IconCheck, IconInfo, IconWarning, IconX } from '../icons'

interface Props {
  toasts: Array<ToastEvent & { leaving?: boolean }>
  onDismiss: (id: string) => void
}

export function ToastHost({ toasts, onDismiss }: Props) {
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind} ${toast.leaving ? 'is-leaving' : ''}`}>
          <span className="toast-icon">
            {toast.kind === 'success' ? (
              <IconCheck size={16} />
            ) : toast.kind === 'error' ? (
              <IconWarning size={16} />
            ) : (
              <IconInfo size={16} />
            )}
          </span>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            {toast.message ? <span>{toast.message}</span> : null}
          </div>
          <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Закрыть">
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

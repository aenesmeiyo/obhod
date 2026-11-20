import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  text: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  danger,
  busy,
  onConfirm,
  onClose
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button ${danger ? 'button-danger' : 'button-light'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Подождите…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-text">{text}</p>
    </Modal>
  )
}

import { IconPower } from '../icons'

interface Props {
  active: boolean
  busy?: boolean
  disabled?: boolean
  onClick: () => void
  onLabel?: string
  offLabel?: string
  busyLabel?: string
  wide?: boolean
  title?: string
}

export function PowerButton({
  active,
  busy,
  disabled,
  onClick,
  onLabel = 'Выключить',
  offLabel = 'Включить',
  busyLabel = 'Подождите…',
  wide,
  title
}: Props) {
  return (
    <button
      type="button"
      className={`power-button ${active ? 'is-active' : 'is-idle'} ${wide ? 'is-wide' : ''}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-pressed={active}
      title={title}
    >
      <span className="power-icon">{busy ? <span className="spinner" /> : <IconPower size={18} />}</span>
      <span className="power-label">{busy ? busyLabel : active ? onLabel : offLabel}</span>
      <span className="power-led" aria-hidden="true" />
    </button>
  )
}

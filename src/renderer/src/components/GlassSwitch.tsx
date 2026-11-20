import { Switch } from 'glisse'

interface Props {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  label: string
}

export function GlassSwitch({ checked, onChange, disabled, label }: Props) {
  return (
    <Switch
      className="ob-switch"
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
    />
  )
}

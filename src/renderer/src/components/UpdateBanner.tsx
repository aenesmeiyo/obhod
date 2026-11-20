import { useState } from 'react'
import type { AppState } from '@shared/types'
import { IconSparkles, IconX } from '../icons'

const STORAGE_KEY = 'obhod:dismissed-updates'

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

interface Props {
  state: AppState
  onApply: (components: Array<'zapret' | 'tgws'>) => Promise<void>
}

export function UpdateBanner({ state, onApply }: Props) {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)
  const [busy, setBusy] = useState(false)

  const entries: Array<{ id: 'zapret' | 'tgws'; name: string; latest: string; current: string | null }> = []
  if (state.zapret.update.available && state.zapret.update.latest) {
    entries.push({
      id: 'zapret',
      name: 'Zapret',
      latest: state.zapret.update.latest,
      current: state.zapret.version
    })
  }
  if (state.tgws.update.available && state.tgws.update.latest) {
    entries.push({
      id: 'tgws',
      name: 'TG WS Proxy',
      latest: state.tgws.update.latest,
      current: state.tgws.version
    })
  }

  const visible = entries.filter((entry) => !dismissed.includes(`${entry.id}:${entry.latest}`))
  if (visible.length === 0) return null

  const dismiss = (): void => {
    const next = Array.from(new Set([...dismissed, ...visible.map((entry) => `${entry.id}:${entry.latest}`)]))
    setDismissed(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const apply = async (): Promise<void> => {
    setBusy(true)
    try {
      await onApply(visible.map((entry) => entry.id))
    } catch {
      /* the main process already shows an error toast */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="update-banner" role="status">
      <span className="update-icon">
        <IconSparkles size={18} />
      </span>
      <div className="update-copy">
        <strong>Вышло обновление</strong>
        <span>
          {visible.map((entry, index) => (
            <span key={entry.id}>
              {index > 0 ? ' · ' : ''}
              {entry.name} {entry.latest}
              {entry.current ? <em> (сейчас {entry.current})</em> : null}
            </span>
          ))}
        </span>
      </div>
      <button type="button" className="button button-light button-small" onClick={apply} disabled={busy}>
        {busy ? 'Обновляем…' : visible.length > 1 ? 'Обновить всё' : 'Обновить'}
      </button>
      <button type="button" className="icon-button subtle" onClick={dismiss} title="Скрыть до следующего обновления">
        <IconX size={15} />
      </button>
    </div>
  )
}

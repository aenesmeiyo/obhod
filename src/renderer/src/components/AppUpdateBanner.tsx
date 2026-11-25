import { useState } from 'react'
import type { AppState } from '@shared/types'
import { IconDownload, IconRefresh, IconSparkles, IconX } from '../icons'

interface Props {
  state: AppState
}

export function AppUpdateBanner({ state }: Props) {
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const update = state.appUpdate

  if (hidden || !update.latest) return null
  if (!update.available && !update.downloading && !update.downloaded) return null

  const download = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.obhod.downloadAppUpdate()
    } catch {
      /* the main process shows the error toast */
    } finally {
      setBusy(false)
    }
  }

  const install = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.obhod.installAppUpdate()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="update-banner app-update-banner" role="status">
      <span className="update-icon">
        <IconSparkles size={18} />
      </span>
      <div className="update-copy">
        <strong>
          {update.downloaded ? 'Обновление готово к установке' : 'Вышло обновление «Обхода»'}
        </strong>
        <span>
          Обход {update.latest} <em>(сейчас {update.current})</em>
          {update.downloading
            ? ` · скачиваем ${update.percent}%`
            : update.downloaded
              ? ' · установится при выходе'
              : ''}
        </span>
        {update.downloading ? (
          <div className="app-update-progress" aria-hidden="true">
            <span style={{ width: `${update.percent}%` }} />
          </div>
        ) : null}
      </div>
      {update.downloaded ? (
        <button type="button" className="button button-light button-small" onClick={() => void install()} disabled={busy}>
          <IconRefresh size={14} /> {busy ? 'Перезапускаем…' : 'Перезапустить'}
        </button>
      ) : (
        <button
          type="button"
          className="button button-light button-small"
          onClick={() => void download()}
          disabled={busy || update.downloading}
        >
          <IconDownload size={14} /> {update.downloading ? 'Скачиваем…' : 'Скачать'}
        </button>
      )}
      <button
        type="button"
        className="icon-button subtle"
        onClick={() => setHidden(true)}
        title="Скрыть до следующего запуска"
      >
        <IconX size={15} />
      </button>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import type { LogLine } from '@shared/types'
import { IconCopy, IconTerminal, IconX } from '../icons'

interface Props {
  open: boolean
  onClose: () => void
  logs: LogLine[]
}

function time(value: number): string {
  return new Date(value).toLocaleTimeString('ru-RU', { hour12: false })
}

export function LogsDrawer({ open, onClose, logs }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' })
  }, [open, logs.length])

  return (
    <>
      <div className={`drawer-backdrop ${open ? 'is-open' : ''}`} onClick={onClose} />
      <aside className={`logs-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <header className="drawer-head">
          <div className="drawer-title">
            <IconTerminal size={18} />
            <div>
              <strong>Журнал</strong>
              <span>Последние события приложения</span>
            </div>
          </div>
          <div className="drawer-actions">
            <button
              type="button"
              className="icon-button subtle"
              title="Скопировать журнал"
              onClick={() => void window.obhod.copyText(logs.map((line) => `${time(line.time)} ${line.message}`).join('\n'))}
            >
              <IconCopy size={15} />
            </button>
            <button type="button" className="icon-button subtle" onClick={onClose} title="Закрыть">
              <IconX size={16} />
            </button>
          </div>
        </header>
        <div className="logs-body">
          {logs.length === 0 ? (
            <div className="logs-empty">Пока тихо. Здесь появятся события.</div>
          ) : (
            logs.map((line, index) => (
              <div key={`${line.time}-${index}`} className={`log-line log-${line.level}`}>
                <span className="log-time">{time(line.time)}</span>
                <span className="log-message">{line.message}</span>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      </aside>
    </>
  )
}

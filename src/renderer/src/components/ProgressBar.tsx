import type { ProgressEvent } from '@shared/types'
import { formatBytes, formatSpeed } from '../hooks'

interface Props {
  progress: ProgressEvent
}

export function ProgressBar({ progress }: Props) {
  const percent = Math.max(0, Math.min(100, progress.percent))
  return (
    <div className={`progress-block ${progress.phase === 'error' ? 'is-error' : ''}`}>
      <div className="progress-head">
        <span className="progress-label">{progress.label}</span>
        <span className="progress-value">
          {progress.phase === 'download'
            ? `${Math.round(percent)}%`
            : progress.phase === 'done'
              ? 'Готово'
              : `${Math.round(percent)}%`}
        </span>
      </div>
      <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-meta">
        <span>
          {progress.phase === 'download' && progress.total > 0
            ? `${formatBytes(progress.received)} из ${formatBytes(progress.total)}`
            : progress.detail || (progress.phase === 'extract' ? 'Распаковываем файлы' : 'Устанавливаем')}
        </span>
        <span>{progress.phase === 'download' ? formatSpeed(progress.speed) : ''}</span>
      </div>
    </div>
  )
}

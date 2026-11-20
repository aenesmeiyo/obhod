import type { ReactElement } from 'react'
import { SegmentedControl } from 'glisse'
import type { NavTarget } from '@shared/types'
import { IconFlask, IconHome, IconMinus, IconSettings, IconTerminal, IconX } from '../icons'

const items: Array<{ id: NavTarget; label: string; icon: (props: { size?: number }) => ReactElement }> = [
  { id: 'home', label: 'Главная', icon: IconHome },
  { id: 'test', label: 'Тест', icon: IconFlask },
  { id: 'settings', label: 'Настройки', icon: IconSettings }
]

interface Props {
  page: NavTarget
  onNavigate: (page: NavTarget) => void
  onLogs: () => void
}

export function TitleBar({ page, onNavigate, onLogs }: Props) {
  const segmentedItems = items.map((item) => {
    const Icon = item.icon
    return {
      value: item.id,
      label: (
        <span className="nav-label">
          <Icon size={16} />
          <span>{item.label}</span>
        </span>
      )
    }
  })

  return (
    <header className="titlebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <span className="brand-ring" />
          <span className="brand-slash" />
        </span>
        <span className="brand-name">Обход</span>
      </div>

      <nav className="nav" aria-label="Разделы">
        <SegmentedControl
          className="nav-segmented"
          items={segmentedItems}
          value={page}
          onValueChange={(value) => onNavigate(value as NavTarget)}
        />
      </nav>

      <div className="title-actions">
        <button type="button" className="icon-button" onClick={onLogs} title="Журнал событий">
          <IconTerminal size={17} />
        </button>
        <span className="title-separator" />
        <button
          type="button"
          className="window-button"
          onClick={() => window.obhod.windowMinimize()}
          title="Свернуть"
        >
          <IconMinus size={16} />
        </button>
        <button
          type="button"
          className="window-button window-close"
          onClick={() => window.obhod.windowClose()}
          title="Закрыть"
        >
          <IconX size={16} />
        </button>
      </div>
    </header>
  )
}

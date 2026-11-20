import { useMemo, useState } from 'react'
import type { StrategyInfo } from '@shared/types'
import { Modal } from './Modal'
import { IconCheck, IconSearch } from '../icons'

interface Props {
  open: boolean
  strategies: StrategyInfo[]
  current: string
  busy?: boolean
  onClose: () => void
  onSelect: (file: string) => Promise<void> | void
}

export function StrategyPicker({ open, strategies, current, busy, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return strategies
    return strategies.filter(
      (item) => item.label.toLowerCase().includes(value) || item.file.toLowerCase().includes(value)
    )
  }, [query, strategies])

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="wide"
      title="Стратегия обхода"
      subtitle="Чем отличается — видно по методам desync. Начните с базовой, если не уверены."
    >
      <div className="search-field">
        <IconSearch size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти стратегию"
          autoFocus
        />
      </div>
      <div className="strategy-list">
        {filtered.map((item) => (
          <button
            key={item.file}
            type="button"
            className={`strategy-row ${item.file === current ? 'is-current' : ''}`}
            onClick={() => void onSelect(item.file)}
            disabled={busy || !item.valid}
          >
            <span className="strategy-check">{item.file === current ? <IconCheck size={15} /> : null}</span>
            <span className="strategy-main">
              <strong>{item.label}</strong>
              <span className="strategy-methods">{item.methods}</span>
            </span>
            <span className="strategy-file">{item.valid ? item.file.replace(/\.bat$/i, '') : 'недоступна'}</span>
          </button>
        ))}
        {filtered.length === 0 ? <div className="empty-inline">Ничего не найдено</div> : null}
      </div>
    </Modal>
  )
}

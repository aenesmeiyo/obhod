import { useMemo, useState } from 'react'
import type { AppState, TestProgress, TestStrategyResult } from '@shared/types'
import { useElapsed, formatTime } from '../hooks'
import { IconCheck, IconClock, IconCrown, IconFlask, IconWarning } from '../icons'

interface Props {
  state: AppState
  test: TestProgress | null
  onRun: () => void
  onCancel: () => void
  onApply: (strategy: string) => Promise<void>
}

const IconPlaySolid = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.4-6.8c.6-.4.6-1.4 0-1.8L9.6 4.3C8.9 3.9 8 4.4 8 5.2Z" />
  </svg>
)

function sortResults(results: TestStrategyResult[]): TestStrategyResult[] {
  return [...results].sort((a, b) => {
    if (a.started !== b.started) return a.started ? -1 : 1
    if (b.ok !== a.ok) return b.ok - a.ok
    if (b.pingOk !== a.pingOk) return b.pingOk - a.pingOk
    return a.avgMs - b.avgMs
  })
}

export function TestPage({ state, test, onRun, onCancel, onApply }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const running = test?.status === 'running'
  const elapsed = useElapsed(Boolean(running))
  const sorted = useMemo(() => sortResults(test?.results ?? []), [test?.results])
  const best = test?.best ?? null
  const bestResult = sorted.find((result) => result.strategy === best) ?? null
  const percent = test && test.total > 0 ? Math.round((Math.min(test.index, test.total) / test.total) * 100) : 0

  const apply = async (strategy: string): Promise<void> => {
    setApplying(strategy)
    try {
      await onApply(strategy)
    } finally {
      setApplying(null)
    }
  }

  return (
    <div className="page test-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">Автоподбор</span>
          <h1>Тест стратегий</h1>
          <p>Проверим все стратегии на реальных целях и выберем ту, что работает лучше сейчас.</p>
        </div>
        <div className={`test-orb ${running ? 'is-running' : ''}`}>
          <IconFlask size={24} />
        </div>
      </header>

      <section className="test-console">
        <div className="console-top">
          <div className="console-status">
            <span className={`status-dot ${running ? 'pulse' : test?.status === 'done' ? 'is-on' : ''}`} />
            <strong>
              {running
                ? `Стратегия ${Math.min(test!.index + 1, test!.total)} из ${test!.total}`
                : test?.status === 'done'
                  ? 'Тест завершён'
                  : test?.status === 'cancelled'
                    ? 'Тест отменён'
                    : test?.status === 'error'
                      ? 'Ошибка теста'
                      : 'Готов к запуску'}
            </strong>
            {running ? <span className="console-current">{test?.current?.replace(/\.bat$/i, '')}</span> : null}
            {running ? (
              <span className="console-time">
                <IconClock size={13} /> {elapsed} с
              </span>
            ) : null}
          </div>          <div className="console-actions">
            {running ? (
              <button type="button" className="button button-ghost" onClick={onCancel}>
                Остановить
              </button>
            ) : (
              <button
                type="button"
                className="button button-light"
                onClick={onRun}
                disabled={!state.zapret.installed}
              >
                <IconPlaySolid size={14} />
                {test?.status === 'done' ? 'Прогнать снова' : 'Начать тест'}
              </button>
            )}
          </div>
        </div>

        <div className="console-progress">
          <div className="progress-track tall">
            <span className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="console-percent">{percent}%</span>
        </div>

        {state.zapret.running || running ? (
          <div className="console-note">
            <IconWarning size={15} />
            {running
              ? 'Обход временно остановлен: стратегии проверяются по очереди.'
              : 'На время теста текущий обход будет остановлен, затем включится снова.'}
          </div>
        ) : null}

        {!state.zapret.installed ? (
          <div className="console-note">
            <IconWarning size={15} /> Сначала скачайте Zapret на главном экране.
          </div>
        ) : null}

        {test?.message ? <div className="console-note is-error">{test.message}</div> : null}
      </section>

      {best && test?.status === 'done' ? (
        <section className="best-card">
          <span className="best-icon">
            <IconCrown size={22} />
          </span>
          <div className="best-copy">
            <span className="eyebrow">Лучший результат</span>
            <strong>{bestResult?.label ?? best.replace(/\.bat$/i, '')}</strong>
            <span>
              {sorted[0]?.ok ?? 0} из {sorted[0]?.total ?? 0} проверок · пинг {sorted[0]?.pingOk ?? 0}/
              {sorted[0]?.pingTotal ?? 0}
            </span>
          </div>
          <button
            type="button"
            className="button button-light"
            onClick={() => void apply(best)}
            disabled={applying !== null}
          >
            {applying === best ? 'Применяем…' : 'Применить'}
          </button>
        </section>
      ) : null}

      {sorted.length > 0 ? (
        <section className="results">
          <div className="results-head">
            <span />
            <span>Стратегия</span>
            <span>Проверки</span>
            <span>Пинг</span>
            <span>Среднее</span>
            <span />
          </div>
          <div className="results-list">
            {sorted.map((result, index) => (
              <div
                key={result.strategy}
                className={`result-row ${result.strategy === best ? 'is-best' : ''} ${!result.started ? 'is-failed' : ''}`}
              >
                <div className="result-main">
                  <span className="result-rank">{index + 1}</span>
                  <div className="result-name">
                    <strong>{result.label}</strong>
                    <span>{result.strategy.replace(/\.bat$/i, '')}</span>
                  </div>
                  <div className="result-score">
                    <div className="score-track">
                      <span
                        className="score-fill"
                        style={{ width: `${result.total > 0 ? (result.ok / result.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="score-text">
                      {result.ok}/{result.total}
                    </span>
                  </div>
                  <div className="result-ping">
                    {result.pingOk}/{result.pingTotal}
                  </div>
                  <div className="result-time">{result.started ? formatTime(result.avgMs) : '—'}</div>
                  <div className="result-actions">
                    <button
                      type="button"
                      className="button button-mini"
                      onClick={() => void apply(result.strategy)}
                      disabled={!result.started || applying !== null}
                    >
                      {applying === result.strategy ? '…' : result.strategy === state.zapret.strategy ? 'Выбрана' : 'Выбрать'}
                    </button>
                    <button
                      type="button"
                      className={`icon-button subtle ${expanded === result.strategy ? 'is-active' : ''}`}
                      onClick={() => setExpanded(expanded === result.strategy ? null : result.strategy)}
                      title="Детали проверок"
                      disabled={!result.started}
                    >
                      <IconCheck size={14} />
                    </button>
                  </div>
                </div>
                {expanded === result.strategy ? (
                  <div className="result-checks">
                    {result.checks.map((check) => (
                      <div key={check.target} className={`check-row ${check.ok ? 'is-ok' : 'is-fail'}`}>
                        <span className="check-dot" />
                        <span className="check-name">{check.target}</span>
                        <span className="check-status">{check.status}</span>
                        <span className="check-ms">{check.ms} мс</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : !running ? (
        <section className="empty-test">
          <div className="empty-icon">
            <IconFlask size={28} />
          </div>
          <strong>Пока нет результатов</strong>
          <p>
            Запустите тест — он последовательно включит каждую стратегию и проверит Discord, YouTube,
            Google и DNS. Это занимает несколько минут.
          </p>
        </section>
      ) : null}
    </div>
  )
}

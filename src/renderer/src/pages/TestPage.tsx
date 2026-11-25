import { useMemo, useState } from 'react'
import type { AppState, TestCheck, TestProgress, TestStrategyResult } from '@shared/types'
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
    if (Boolean(a.verified) !== Boolean(b.verified)) return a.verified ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    if (a.broken !== b.broken) return a.broken - b.broken
    if (b.fixed !== a.fixed) return b.fixed - a.fixed
    return a.avgMs - b.avgMs
  })
}

function baselineSummary(baseline: TestCheck[] | null): string | null {
  if (!baseline || baseline.length === 0) return null
  const ok = baseline.filter((check) => check.ok).length
  return `Без обхода отвечают ${ok} из ${baseline.length}`
}

function checkTone(check: TestCheck): string {
  if (check.ok) return 'is-ok'
  if (check.state === 'frozen') return 'is-frozen'
  return 'is-fail'
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
  const summary = baselineSummary(test?.baseline ?? null)

  const apply = async (strategy: string): Promise<void> => {
    setApplying(strategy)
    try {
      await onApply(strategy)
    } finally {
      setApplying(null)
    }
  }

  const statusText = running
    ? test!.phase === 'baseline'
      ? 'Замер без обхода'
      : test!.phase === 'verify'
        ? 'Перепроверка лидера'
        : `Стратегия ${Math.min(test!.index + 1, test!.total)} из ${test!.total}`
    : test?.status === 'done'
      ? 'Тест завершён'
      : test?.status === 'cancelled'
        ? 'Тест отменён'
        : test?.status === 'error'
          ? 'Ошибка теста'
          : 'Готов к запуску'

  return (
    <div className="page test-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">Автоподбор</span>
          <h1>Тест стратегий</h1>
          <p>Заливаем по 64 КБ в каждый хост: так провайдер режет YouTube и Discord на 16–20 КБ.</p>
        </div>
        <div className={`test-orb ${running ? 'is-running' : ''}`}>
          <IconFlask size={24} />
        </div>
      </header>

      <section className="test-console">
        <div className="console-top">
          <div className="console-status">
            <span className={`status-dot ${running ? 'pulse' : test?.status === 'done' ? 'is-on' : ''}`} />
            <strong>{statusText}</strong>
            {running && test?.current ? <span className="console-current">{test.current}</span> : null}
            {running ? (
              <span className="console-time">
                <IconClock size={13} /> {elapsed} с
              </span>
            ) : null}
            {summary ? <span className="console-baseline">{summary}</span> : null}
          </div>
          <div className="console-actions">
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
              ? `Обход остановлен. IP-список на время теста — «любой». ${
                  (test?.lanes ?? 1) > 1 ? `Стратегии проверяются по ${test!.lanes} сразу.` : 'Стратегии проверяются по очереди.'
                }`
              : 'На время теста обход остановится, IP-список станет «любым» и вернётся после.'}
          </div>
        ) : null}

        {!state.zapret.installed ? (
          <div className="console-note">
            <IconWarning size={15} /> Сначала скачайте Zapret на главном экране.
          </div>
        ) : null}

        {test?.message ? <div className="console-note is-error">{test.message}</div> : null}
      </section>

      {best && test?.status === 'done' && bestResult ? (
        <section className="best-card">
          <span className="best-icon">
            <IconCrown size={22} />
          </span>
          <div className="best-copy">
            <span className="eyebrow">Лучший результат</span>
            <strong>{bestResult.label}</strong>
            <span>
              исправлено {bestResult.fixed} · сломано {bestResult.broken} · отвечают {bestResult.ok}/
              {bestResult.total}
              {test.bestVerified ? ' · проверена повторно' : ' · без перепроверки'}
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
            <span>Заморозки</span>
            <span>Фикс / слом</span>
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
                    <strong>
                      {result.label}
                      {result.verified ? <span className="verified-mark"> ✓</span> : null}
                    </strong>
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
                  <div className={`result-frozen ${result.frozen > 0 ? 'is-warn' : ''}`}>{result.frozen}</div>
                  <div className="result-fix">
                    <span className="fix-plus">+{result.fixed}</span>
                    <span className={result.broken > 0 ? 'fix-minus' : 'fix-zero'}>−{result.broken}</span>
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
                    {result.error ? (
                      <div className="check-row is-fail">
                        <span className="check-dot" />
                        <span className="check-name">{result.error}</span>
                      </div>
                    ) : null}
                    {result.checks.map((check) => (
                      <div
                        key={`${check.host}-${check.mode}`}
                        className={`check-row ${checkTone(check)}`}
                        title={`${check.host} · ${check.mode === 'tls13' ? 'TLS 1.3' : 'TLS 1.2'}${
                          check.before === 'bad' ? ' · без обхода было заблокировано' : ''
                        }`}
                      >
                        <span className="check-dot" />
                        <span className="check-name">
                          {check.target}
                          {check.before === 'bad' ? <em className="check-before">блок</em> : null}
                        </span>
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
            Тест поднимет каждую стратегию, отправит по 64 КБ на Discord, YouTube, контрольные хосты и
            зафиксирует заморозку на 16–20 КБ. Сначала измеряется фон без обхода, поэтому видно, что
            стратегия реально исправила, а что сломала.
          </p>
        </section>
      ) : null}
    </div>
  )
}

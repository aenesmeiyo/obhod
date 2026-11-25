import { useCallback, useEffect, useState } from 'react'
import type { NavTarget } from '@shared/types'
import { useAppState, useLogs, useProgress, useTestProgress, useToasts } from './hooks'
import { TitleBar } from './components/TitleBar'
import { AppUpdateBanner } from './components/AppUpdateBanner'
import { UpdateBanner } from './components/UpdateBanner'
import { ToastHost } from './components/ToastHost'
import { LogsDrawer } from './components/LogsDrawer'
import { StrategyPicker } from './components/StrategyPicker'
import { HomePage } from './pages/HomePage'
import { TestPage } from './pages/TestPage'
import { SettingsPage } from './pages/SettingsPage'
import { IconWarning } from './icons'

export default function App() {
  const { state, error, retry } = useAppState()
  const progress = useProgress()
  const test = useTestProgress()
  const { toasts, dismiss } = useToasts()
  const [page, setPage] = useState<NavTarget>('home')
  const [logsOpen, setLogsOpen] = useState(false)
  const [strategyOpen, setStrategyOpen] = useState(false)
  const [strategyBusy, setStrategyBusy] = useState(false)
  const logs = useLogs(logsOpen)

  useEffect(() => {
    return window.obhod.onNavigate((target) => setPage(target))
  }, [])

  const applyUpdates = useCallback(async (components: Array<'zapret' | 'tgws'>) => {
    for (const component of components) {
      await window.obhod.applyUpdate(component)
    }
  }, [])

  const selectStrategy = async (file: string): Promise<void> => {
    setStrategyBusy(true)
    try {
      await window.obhod.setStrategy(file)
      setStrategyOpen(false)
    } finally {
      setStrategyBusy(false)
    }
  }

  if (error) {
    return (
      <div className="app">
        <div className="aurora" aria-hidden="true">
          <span className="aurora-blob blob-one" />
          <span className="aurora-blob blob-two" />
          <span className="aurora-blob blob-three" />
        </div>
        <div className="splash">
          <span className="splash-mark">
            <span className="brand-ring" />
            <span className="brand-slash" />
          </span>
          <span className="splash-title">Не удалось загрузить «Обход»</span>
          <span className="splash-sub splash-error">
            <IconWarning size={14} /> {error}
          </span>
          <div className="splash-actions">
            <button type="button" className="button button-light" onClick={retry}>
              Повторить
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                try {
                  void window.obhod?.openFolder?.('logs').catch(() => undefined)
                } catch {
                  /* the preload bridge may be missing entirely */
                }
              }}
            >
              Открыть журнал
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="app">
        <div className="aurora" aria-hidden="true">
          <span className="aurora-blob blob-one" />
          <span className="aurora-blob blob-two" />
          <span className="aurora-blob blob-three" />
        </div>
        <div className="splash">
          <span className="splash-mark">
            <span className="brand-ring" />
            <span className="brand-slash" />
          </span>
          <span className="splash-title">Обход</span>
          <span className="splash-sub">Загружаем состояние…</span>
          <span className="splash-loader" />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="aurora" aria-hidden="true">
        <span className="aurora-blob blob-one" />
        <span className="aurora-blob blob-two" />
        <span className="aurora-blob blob-three" />
      </div>
      <div className="grain" aria-hidden="true" />

      <TitleBar page={page} onNavigate={setPage} onLogs={() => setLogsOpen(true)} />

      <main className="content">
        <div className="content-inner">
          {!state.elevated ? (
            <div className="elevation-banner">
              <IconWarning size={16} />
              <span>
                Приложение запущено без прав администратора — Zapret не сможет включиться. Перезапустите
                «Обход» с повышенными правами.
              </span>
              <button
                type="button"
                className="button button-mini button-light"
                onClick={() => void window.obhod.relaunchElevated()}
              >
                Перезапустить
              </button>
            </div>
          ) : null}

          <AppUpdateBanner state={state} />
          <UpdateBanner state={state} onApply={applyUpdates} />

          <div className="page-stage" key={page}>
            {page === 'home' ? (
              <HomePage
                state={state}
                progress={progress}
                onOpenStrategy={() => setStrategyOpen(true)}
                onOpenSettings={() => setPage('settings')}
              />
            ) : null}
            {page === 'test' ? (
              <TestPage
                state={state}
                test={test}
                onRun={() => void window.obhod.runTest()}
                onCancel={() => void window.obhod.cancelTest()}
                onApply={async (strategy) => {
                  await window.obhod.applyBestStrategy(strategy)
                }}
              />
            ) : null}
            {page === 'settings' ? (
              <SettingsPage state={state} onOpenStrategy={() => setStrategyOpen(true)} />
            ) : null}
          </div>
        </div>
      </main>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
      <LogsDrawer open={logsOpen} onClose={() => setLogsOpen(false)} logs={logs} />
      <StrategyPicker
        open={strategyOpen}
        strategies={state.zapret.strategies}
        current={state.zapret.strategy}
        busy={strategyBusy}
        onClose={() => setStrategyOpen(false)}
        onSelect={selectStrategy}
      />
    </div>
  )
}

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type {
  AppState,
  DiagnosticsResult,
  GameFilter,
  GameFilterMode,
  IpsetMode
} from '@shared/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { GlassSwitch } from '../components/GlassSwitch'
import {
  IconActivity,
  IconArrowUpRight,
  IconChevron,
  IconCopy,
  IconDownload,
  IconFolder,
  IconRefresh,
  IconShield,
  IconSparkles,
  IconTelegram,
  IconTrash,
  IconWarning
} from '../icons'

interface Props {
  state: AppState
  onOpenStrategy: () => void
}

function validRange(value: string): boolean {
  const trimmed = value.replace(/\s+/g, '')
  if (!trimmed) return false
  return trimmed.split(',').every((item) => {
    const match = item.match(/^([1-9]\d*)(?:-([1-9]\d*))?$/)
    if (!match) return false
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    return start <= 65535 && end <= 65535 && start <= end
  })
}

interface SegmentedOption<T extends string> {
  value: T
  label: string
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled
}: {
  value: T
  options: Array<SegmentedOption<T>>
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  return (
    <div
      className="segmented"
      style={
        {
          ['--seg-index' as string]: index,
          ['--seg-count' as string]: options.length
        } as CSSProperties
      }
    >
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented-item ${option.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
          disabled={disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Row({
  title,
  subtitle,
  children,
  stack
}: {
  title: string
  subtitle?: string
  children: ReactNode
  stack?: boolean
}) {
  return (
    <div className={`settings-row ${stack ? 'is-stacked' : ''}`}>
      <div className="row-copy">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      <div className="row-control">{children}</div>
    </div>
  )
}

const gameFilterOptions: Array<SegmentedOption<GameFilterMode>> = [
  { value: 'disabled', label: 'Выкл' },
  { value: 'all', label: 'TCP + UDP' },
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' }
]

const ipsetOptions: Array<SegmentedOption<IpsetMode>> = [
  { value: 'loaded', label: 'Список' },
  { value: 'none', label: 'Выкл' },
  { value: 'any', label: 'Любой' }
]

export function SettingsPage({ state, onOpenStrategy }: Props) {
  const { zapret, tgws } = state
  const [game, setGame] = useState<GameFilter>(zapret.gameFilter)
  const [gameDirty, setGameDirty] = useState(false)
  const [savingGame, setSavingGame] = useState(false)
  const [port, setPort] = useState(String(tgws.port))
  const [savingPort, setSavingPort] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null)
  const [removeTarget, setRemoveTarget] = useState<'zapret' | 'tgws' | null>(null)

  useEffect(() => {
    if (!gameDirty) setGame(zapret.gameFilter)
  }, [zapret.gameFilter, gameDirty])

  useEffect(() => {
    setPort(String(tgws.port))
  }, [tgws.port])

  const gameValid = validRange(game.tcpRange) && validRange(game.udpRange)
  const canSaveGame = gameDirty && gameValid && !savingGame

  const run = async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(key)
    try {
      await fn()
    } catch {
      /* errors are surfaced by the main process */
    } finally {
      setBusy(null)
    }
  }

  const saveGame = async (): Promise<void> => {
    setSavingGame(true)
    try {
      await window.obhod.setGameFilter(game)
      setGameDirty(false)
    } finally {
      setSavingGame(false)
    }
  }

  const savePort = async (): Promise<void> => {
    setSavingPort(true)
    try {
      await window.obhod.setTgwsPort(Number(port))
    } finally {
      setSavingPort(false)
    }
  }

  const runDiagnostics = async (): Promise<void> => {
    setBusy('diagnostics')
    try {
      setDiagnostics(await window.obhod.runDiagnostics())
    } finally {
      setBusy(null)
    }
  }

  const diagnosticsCount = useMemo(() => {
    if (!diagnostics) return null
    const issues = diagnostics.items.filter((item) => item.level !== 'ok').length
    return issues === 0 ? 'Всё в порядке' : `${issues} замечани${issues === 1 ? 'е' : issues < 5 ? 'я' : 'й'}`
  }, [diagnostics])

  return (
    <div className="page settings-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">Параметры</span>
          <h1>Настройки</h1>
          <p>Тонкая настройка обхода, прокси и самого приложения.</p>
        </div>
      </header>

      <div className="settings-columns">
        <div className="settings-column">
        <section className="settings-section">
          <header className="section-head">
            <div className="section-title">
              <span className="section-icon">
                <IconShield size={18} />
              </span>
              <div>
                <strong>Zapret</strong>
                <span>{zapret.installed ? `версия ${zapret.version ?? '—'}` : 'не установлен'}</span>
              </div>
            </div>
            <div className="section-actions">
              {zapret.update.available ? (
                <button
                  type="button"
                  className="button button-mini button-light"
                  onClick={() => void run('update-zapret', () => window.obhod.applyUpdate('zapret'))}
                  disabled={busy !== null}
                >
                  <IconDownload size={14} /> Обновить
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-mini"
                  onClick={() => void window.obhod.checkUpdates(true)}
                  disabled={!zapret.installed}
                >
                  <IconRefresh size={14} /> Проверить
                </button>
              )}
              <button type="button" className="icon-button subtle" onClick={() => void window.obhod.openFolder('zapret')} title="Открыть папку Zapret" disabled={!zapret.installed}>
                <IconFolder size={15} />
              </button>
            </div>
          </header>

          <Row title="Стратегия" subtitle="Набор методов обхода DPI">
            <button type="button" className="select-button" onClick={onOpenStrategy} disabled={!zapret.installed}>
              <span>{zapret.strategy.replace(/\.bat$/i, '')}</span>
              <IconChevron size={14} />
            </button>
          </Row>

          <Row title="Game Filter" subtitle="Обход для игр: расширяет диапазон портов" stack>
            <Segmented
              value={game.mode}
              options={gameFilterOptions}
              onChange={(mode) => {
                setGame((current) => ({ ...current, mode }))
                setGameDirty(true)
              }}
              disabled={!zapret.installed}
            />
            <div className={`range-grid ${game.mode === 'disabled' ? 'is-muted' : ''}`}>
              <label>
                <span>TCP-порты</span>
                <input
                  value={game.tcpRange}
                  onChange={(event) => {
                    setGame((current) => ({ ...current, tcpRange: event.target.value }))
                    setGameDirty(true)
                  }}
                  placeholder="1024-65535"
                  disabled={!zapret.installed || game.mode === 'disabled' || game.mode === 'udp'}
                  className={!validRange(game.tcpRange) ? 'is-invalid' : ''}
                />
              </label>
              <label>
                <span>UDP-порты</span>
                <input
                  value={game.udpRange}
                  onChange={(event) => {
                    setGame((current) => ({ ...current, udpRange: event.target.value }))
                    setGameDirty(true)
                  }}
                  placeholder="1024-65535"
                  disabled={!zapret.installed || game.mode === 'disabled' || game.mode === 'tcp'}
                  className={!validRange(game.udpRange) ? 'is-invalid' : ''}
                />
              </label>
            </div>
            {!gameValid ? (
              <span className="field-error">
                <IconWarning size={13} /> Пример: 1024-65535,27015
              </span>
            ) : null}
            {gameDirty && gameValid ? (
              <div className="row-save">
                <span>Обход перезапустится, если включён</span>
                <button type="button" className="button button-light button-small" onClick={() => void saveGame()} disabled={!canSaveGame}>
                  {savingGame ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </div>
            ) : null}
          </Row>

          <Row title="IP-список" subtitle="Какие адреса попадают под обход" stack>
            <div className="inline-control">
              <Segmented
                value={zapret.ipsetMode}
                options={ipsetOptions}
                onChange={(mode) =>
                  void run(`ipset-${mode}`, () => window.obhod.setIpsetMode(mode))
                }
                disabled={!zapret.installed || busy !== null}
              />
              <button
                type="button"
                className="button button-mini"
                onClick={() => void run('ipset-update', () => window.obhod.updateIpset())}
                disabled={!zapret.installed || busy !== null}
              >
                <IconRefresh size={14} /> Обновить
              </button>
            </div>
          </Row>

          <Row title="Проверять обновления" subtitle="Показывать баннер при выходе новой версии">
            <GlassSwitch
              checked={zapret.autoUpdate}
              onChange={(value) => void window.obhod.setAutoUpdate('zapret', value)}
              label="Проверять обновления Zapret"
            />
          </Row>

          <div className="section-footer">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void run('restart', async () => {
                await window.obhod.stopZapret()
                await window.obhod.startZapret()
              })}
              disabled={!zapret.running || busy !== null}
            >
              <IconRefresh size={15} /> Перезапустить
            </button>
            <button
              type="button"
              className="button button-ghost danger-text"
              onClick={() => setRemoveTarget('zapret')}
              disabled={!zapret.installed}
            >
              <IconTrash size={15} /> Удалить
            </button>
          </div>
        </section>
        <section className="settings-section">
          <header className="section-head">
            <div className="section-title">
              <span className="section-icon muted">
                <IconSparkles size={18} />
              </span>
              <div>
                <strong>Приложение</strong>
                <span>Поведение и запуск</span>
              </div>
            </div>
          </header>

          <Row title="Сворачивать в трей" subtitle="Кнопка закрытия прячет окно, обход продолжает работать">
            <GlassSwitch
              checked={state.ui.minimizeToTray}
              onChange={(value) => void window.obhod.setUiSettings({ minimizeToTray: value })}
              label="Сворачивать в трей"
            />
          </Row>

          <Row title="Запуск с Windows" subtitle="Стартовать свёрнутым вместе с системой">
            <GlassSwitch
              checked={state.ui.launchAtLogin}
              onChange={(value) => void window.obhod.setUiSettings({ launchAtLogin: value })}
              label="Запуск с Windows"
            />
          </Row>

          <Row title="Проверять обновления при запуске" subtitle="Тихий запрос к GitHub в фоне">
            <GlassSwitch
              checked={state.ui.checkUpdatesOnLaunch}
              onChange={(value) => void window.obhod.setUiSettings({ checkUpdatesOnLaunch: value })}
              label="Проверять обновления при запуске"
            />
          </Row>

          <div className="section-footer">
            <button type="button" className="button button-ghost" onClick={() => void window.obhod.openFolder('data')}>
              <IconFolder size={15} /> Папка данных
            </button>
            <span className="section-hint">Обход {state.appVersion}</span>
          </div>
        </section>
        </div>
        <div className="settings-column">
        <section className="settings-section">
          <header className="section-head">
            <div className="section-title">
              <span className="section-icon tg">
                <IconTelegram size={18} />
              </span>
              <div>
                <strong>TG WS Proxy</strong>
                <span>{tgws.installed ? `версия ${tgws.version ?? '—'}` : 'не установлен'}</span>
              </div>
            </div>
            <div className="section-actions">
              {tgws.update.available ? (
                <button
                  type="button"
                  className="button button-mini button-light"
                  onClick={() => void run('update-tgws', () => window.obhod.applyUpdate('tgws'))}
                  disabled={busy !== null}
                >
                  <IconDownload size={14} /> Обновить
                </button>
              ) : null}
              <button type="button" className="icon-button subtle" onClick={() => void window.obhod.openFolder('tgws')} title="Открыть папку TG WS Proxy" disabled={!tgws.installed}>
                <IconFolder size={15} />
              </button>
            </div>
          </header>

          {tgws.installed ? (
            <>
              <Row title="Порт прокси" subtitle="Локальный адрес 127.0.0.1">
                <div className="inline-control">
                  <input
                    className={`text-input port-input ${Number(port) < 1024 || Number(port) > 65535 ? 'is-invalid' : ''}`}
                    value={port}
                    onChange={(event) => setPort(event.target.value.replace(/[^\d]/g, ''))}
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    className="button button-mini button-light"
                    onClick={() => void savePort()}
                    disabled={savingPort || Number(port) === tgws.port || Number(port) < 1024 || Number(port) > 65535}
                  >
                    {savingPort ? '…' : 'Сохранить'}
                  </button>
                </div>
              </Row>

              <Row title="Секрет" subtitle="Нужен Telegram для подключения">
                <div className="secret-field">
                  <code>dd{tgws.secret.slice(0, 6)}…{tgws.secret.slice(-4)}</code>
                  <button
                    type="button"
                    className="icon-button subtle"
                    title="Скопировать ссылку"
                    onClick={() => void window.obhod.copyTelegramLink()}
                  >
                    <IconCopy size={15} />
                  </button>
                </div>
              </Row>

              <Row title="Подключение" subtitle={tgws.running ? 'Прокси работает' : 'Сначала включите прокси'}>
                <button
                  type="button"
                  className="button button-mini button-light"
                  onClick={() => void window.obhod.openTelegram()}
                  disabled={!tgws.running}
                >
                  <IconTelegram size={14} /> В Telegram <IconArrowUpRight size={13} />
                </button>
              </Row>

              <Row title="Проверять обновления" subtitle="Новые версии прокси">
                <GlassSwitch
                  checked={tgws.autoUpdate}
                  onChange={(value) => void window.obhod.setAutoUpdate('tgws', value)}
                  label="Проверять обновления TG WS Proxy"
                />
              </Row>

              <div className="section-footer">
                <button
                  type="button"
                  className="button button-ghost danger-text"
                  onClick={() => setRemoveTarget('tgws')}
                >
                  <IconTrash size={15} /> Удалить
                </button>
                <span className="section-hint">Порт и секрет сохраняются при обновлении</span>
              </div>
            </>
          ) : (
            <div className="install-empty">
              <p>Прокси для Telegram ещё не скачан.</p>
              <button
                type="button"
                className="button button-light"
                onClick={() => void run('install-tgws', () => window.obhod.installTgws())}
                disabled={busy !== null}
              >
                <IconDownload size={16} /> {busy === 'install-tgws' ? 'Скачиваем…' : 'Скачать TG WS Proxy'}
              </button>
            </div>
          )}
        </section>
        <section className="settings-section">
          <header className="section-head">
            <div className="section-title">
              <span className="section-icon muted">
                <IconActivity size={18} />
              </span>
              <div>
                <strong>Диагностика</strong>
                <span>{diagnosticsCount ?? 'Проверка окружения'}</span>
              </div>
            </div>
            <button
              type="button"
              className="button button-mini"
              onClick={() => void runDiagnostics()}
              disabled={busy === 'diagnostics' || state.diagnosticsRunning}
            >
              <IconRefresh size={14} /> {state.diagnosticsRunning ? 'Проверяем…' : 'Проверить'}
            </button>
          </header>

          {diagnostics ? (
            <div className="diagnostics-list">
              {diagnostics.items.map((item, index) => (
                <div key={`${item.title}-${index}`} className={`diagnostic-row level-${item.level}`}>
                  <span className="diagnostic-dot" />
                  <div>
                    <strong>{item.title}</strong>
                    {item.detail ? <span>{item.detail}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="diagnostics-empty">
              Проверим права, службы Windows, конфликтующие приложения, hosts и состояние обхода.
            </p>
          )}
        </section>
        </div>
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        title={removeTarget === 'zapret' ? 'Удалить Zapret?' : 'Удалить TG WS Proxy?'}
        text={
          removeTarget === 'zapret'
            ? 'Файлы Zapret и стратегии будут удалены. Настройки Game Filter и пользовательские списки тоже исчезнут.'
            : 'Прокси и его настройки будут удалены. Telegram перестанет подключаться через него.'
        }
        busy={busy !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return
          const target = removeTarget
          void run('remove', async () => {
            if (target === 'zapret') await window.obhod.removeZapret()
            else await window.obhod.removeTgws()
            setRemoveTarget(null)
          })
        }}
      />
    </div>
  )
}


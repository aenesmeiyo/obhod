import { useState } from 'react'
import type { AppState, ProgressEvent } from '@shared/types'
import { GlassSwitch } from '../components/GlassSwitch'
import { ProgressBar } from '../components/ProgressBar'
import {
  IconArrowUpRight,
  IconBolt,
  IconChevron,
  IconClock,
  IconCopy,
  IconDownload,
  IconGauge,
  IconShield,
  IconSparkles,
  IconTelegram
} from '../icons'

interface Props {
  state: AppState
  progress: ProgressEvent | null
  onOpenStrategy: () => void
  onOpenSettings: () => void
}

type Busy = 'start' | 'stop' | 'install' | null

function gameFilterLabel(mode: AppState['zapret']['gameFilter']['mode']): string {
  if (mode === 'all') return 'TCP+UDP'
  if (mode === 'tcp') return 'TCP'
  if (mode === 'udp') return 'UDP'
  return 'выкл'
}

function timeLabel(version: string | null): string {
  return version ? `v${version.replace(/^v/i, '')}` : 'не установлен'
}

export function HomePage({ state, progress, onOpenStrategy, onOpenSettings }: Props) {
  const [busy, setBusy] = useState<{ zapret: Busy; tgws: Busy }>({ zapret: null, tgws: null })
  const { zapret, tgws } = state

  const zapretProgress = zapret.busy && progress?.kind === 'zapret' ? progress : null
  const tgwsProgress = tgws.busy && progress?.kind === 'tgws' ? progress : null

  const act = async (target: 'zapret' | 'tgws', action: Busy, fn: () => Promise<void>): Promise<void> => {
    setBusy((current) => ({ ...current, [target]: action }))
    try {
      await fn()
    } catch {
      /* main process already reports the error */
    } finally {
      setBusy((current) => ({ ...current, [target]: null }))
    }
  }

  const installZapret = (): void => {
    void act('zapret', 'install', async () => {
      await window.obhod.installZapret()
      await window.obhod.startZapret()
    })
  }

  const toggleZapret = (): void => {
    if (zapret.running) void act('zapret', 'stop', () => window.obhod.stopZapret())
    else void act('zapret', 'start', () => window.obhod.startZapret())
  }

  const installTgws = (): void => {
    void act('tgws', 'install', async () => {
      await window.obhod.installTgws()
      await window.obhod.startTgws()
    })
  }

  const toggleTgws = (): void => {
    if (tgws.running) void act('tgws', 'stop', () => window.obhod.stopTgws())
    else void act('tgws', 'start', () => window.obhod.startTgws())
  }

  const zapretStatus = zapret.running ? 'Работает' : zapret.installed ? 'Выключен' : 'Не установлен'
  const tgwsStatus = tgws.running ? 'Работает' : tgws.installed ? 'Выключен' : 'Не установлен'

  return (
    <div className="page home-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Локальный обход</span>
          <h1>Discord, YouTube и Telegram — снова на связи.</h1>
          <p>Один экран вместо bat-файлов, папок и поиска рабочей стратегии.</p>
        </div>
      </section>

      <div className="service-grid">
        <section className={`service-card zapret-card ${zapret.running ? 'is-on' : ''}`}>
          <span className="card-aurora" aria-hidden="true" />
          <header className="card-head">
            <div className="service-icon zapret-icon">
              <IconBolt size={22} />
            </div>
            <div className="service-meta">
              <span className="eyebrow">DPI · WinDivert</span>
              <span className={`service-status ${zapret.running ? 'is-on' : ''}`}>
                <span className="status-dot" />
                {zapretStatus}
              </span>
            </div>
            <GlassSwitch
              checked={zapret.running}
              onChange={toggleZapret}
              disabled={
                busy.zapret !== null ||
                zapret.busy ||
                !zapret.installed ||
                !state.elevated
              }
              label="Включить обход Zapret"
            />
          </header>

          <div className="card-title">
            <h2>
              Discord
              <br />
              и YouTube
            </h2>
            <span className={`version-chip ${zapret.update.available ? 'has-update' : ''}`}>
              {zapret.update.available ? `есть ${zapret.update.latest}` : timeLabel(zapret.version)}
            </span>
          </div>

          <p className="card-description">
            Обходит DPI для Discord и YouTube. Стратегии запускаются в фоне — без чёрных окон и лишних
            служб.
          </p>

          <div className="card-footer">
            {zapretProgress ? (
              <ProgressBar progress={zapretProgress} />
            ) : !zapret.installed ? (
              <button
                type="button"
                className="button button-light button-install"
                onClick={installZapret}
                disabled={busy.zapret !== null}
              >
                <IconDownload size={17} />
                <span>Скачать Zapret</span>
                <em>1,5 МБ</em>
              </button>
            ) : (
              <div className="chip-row footer-chips">
                <button
                  type="button"
                  className="chip"
                  onClick={onOpenStrategy}
                  title="Выбрать стратегию"
                >
                  <IconGauge size={14} />
                  <span>{zapret.strategy.replace(/\.bat$/i, '')}</span>
                  <IconChevron size={13} />
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={onOpenSettings}
                  title="Настройки Game Filter"
                >
                  <IconShield size={14} />
                  <span>Game Filter · {gameFilterLabel(zapret.gameFilter.mode)}</span>
                </button>
              </div>
            )}
          </div>
        </section>

        <section className={`service-card tgws-card ${tgws.running ? 'is-on' : ''}`}>
          <span className="card-aurora" aria-hidden="true" />
          <header className="card-head">
            <div className="service-icon tgws-icon">
              <IconTelegram size={22} />
            </div>
            <div className="service-meta">
              <span className="eyebrow">MTProto · WebSocket</span>
              <span className={`service-status ${tgws.running ? 'is-on' : ''}`}>
                <span className="status-dot" />
                {tgwsStatus}
              </span>
            </div>
            <GlassSwitch
              checked={tgws.running}
              onChange={toggleTgws}
              disabled={busy.tgws !== null || tgws.busy || !tgws.installed}
              label="Включить прокси Telegram"
            />
          </header>

          <div className="card-title">
            <h2>Telegram</h2>
            <span className={`version-chip ${tgws.update.available ? 'has-update' : ''}`}>
              {tgws.update.available ? `есть ${tgws.update.latest}` : timeLabel(tgws.version)}
            </span>
          </div>

          <p className="card-description">
            Локальный MTProto-прокси через WebSocket. Подключается прямо в Telegram — без VPN и
            сторонних клиентов.
          </p>

          {tgws.installed ? (
            <div className="chip-row">
              <span className="chip chip-static">
                <IconClock size={14} />
                <span>127.0.0.1:{tgws.port}</span>
              </span>
              <span className="chip chip-static">
                <IconSparkles size={14} />
                <span>CF Proxy · H2</span>
              </span>
            </div>
          ) : null}

          <div className="card-footer">
            {tgwsProgress ? (
              <ProgressBar progress={tgwsProgress} />
            ) : !tgws.installed ? (
              <button
                type="button"
                className="button button-light button-install"
                onClick={installTgws}
                disabled={busy.tgws !== null}
              >
                <IconDownload size={17} />
                <span>Скачать TG WS Proxy</span>
                <em>21 МБ</em>
              </button>
            ) : (
              <div className="footer-split">
                <button
                  type="button"
                  className="button button-connect"
                  onClick={() => void window.obhod.openTelegram()}
                  disabled={!tgws.running}
                  title={tgws.running ? 'Открыть прокси в Telegram' : 'Сначала включите прокси'}
                >
                  <IconTelegram size={16} />
                  <span>Подключить в Telegram</span>
                  <IconArrowUpRight size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button glass"
                  onClick={() => void window.obhod.copyTelegramLink()}
                  title="Скопировать ссылку"
                  disabled={!tgws.running}
                >
                  <IconCopy size={16} />
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="home-footer">
        <span>
          <IconShield size={14} /> Всё работает локально — данные не уходят на серверы
        </span>
      </footer>
    </div>
  )
}

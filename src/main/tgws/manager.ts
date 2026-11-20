import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import type { ProgressEvent, TgwsInfo } from '@shared/types'
import { downloadsDir, ensureDir, tgwsDataDir, tgwsDir, tgwsExePath } from '../paths'
import { getState, updateState } from '../store'
import { logger } from '../logger'
import { events } from '../events'
import { downloadFile } from '../download'
import { getLatestRelease, pickTgwsAsset, TGWS_REPO, type Release } from '../github'
import { findProcessPid, killProcess, killImage, sleep, waitFor } from '../proc'

const TGWS_PROCESS = 'TgWsProxy_windows.exe'

export function tgwsLink(port: number, secret: string): string {
  return `tg://proxy?server=127.0.0.1&port=${port}&secret=dd${secret}`
}

function probePort(port: number, timeout = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const done = (value: boolean): void => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

interface TgwsConfigFile {
  port?: number
  secret?: string
  [key: string]: unknown
}

export class TgwsManager {
  private pid: number | null = null
  private running = false
  private pollTimer: NodeJS.Timeout | null = null
  private pollBusy = false
  private busy = false
  private manualConfig = false

  init(): void {
    this.syncConfig()
    this.pollTimer = setInterval(() => {
      void this.poll()
    }, 2500)
    void this.poll()
  }

  dispose(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  isInstalled(): boolean {
    return existsSync(tgwsExePath())
  }

  get isRunning(): boolean {
    return this.running
  }

  getInfo(): TgwsInfo {
    const state = getState()
    this.syncConfigQuiet()
    const port = state.tgws.port
    const secret = state.tgws.secret
    return {
      installed: this.isInstalled(),
      version: this.isInstalled() ? state.tgws.version : null,
      path: this.isInstalled() ? tgwsExePath() : null,
      running: this.running,
      pid: this.pid,
      port,
      secret,
      link: tgwsLink(port, secret),
      autoUpdate: state.tgws.autoUpdate,
      update: state.tgws.update,
      busy: this.busy,
      error: null
    }
  }

  private configPath(): string {
    return join(tgwsDataDir(), 'config.json')
  }

  private syncConfig(): void {
    if (!existsSync(this.configPath())) return
    try {
      const config = JSON.parse(readFileSync(this.configPath(), 'utf8')) as TgwsConfigFile
      const port = Number(config.port)
      const secret = String(config.secret || '')
      const validPort = Number.isInteger(port) && port > 0 && port <= 65535
      const validSecret = /^[a-f0-9]{32}$/i.test(secret)
      if (validPort && port !== getState().tgws.port) {
        updateState((state) => {
          state.tgws.port = port
        })
      }
      if (validSecret && secret !== getState().tgws.secret) {
        updateState((state) => {
          state.tgws.secret = secret
        })
      }
    } catch (error) {
      logger.warn(`Не удалось прочитать config.json TG WS Proxy: ${String(error)}`)
    }
  }

  private syncConfigQuiet(): void {
    if (this.manualConfig) return
    this.syncConfig()
  }

  ensureConfig(): void {
    ensureDir(tgwsDataDir())
    const state = getState()
    const existing: TgwsConfigFile = existsSync(this.configPath())
      ? (JSON.parse(readFileSync(this.configPath(), 'utf8')) as TgwsConfigFile)
      : {}
    const config: Record<string, unknown> = {
      host: '127.0.0.1',
      dc_ip: ['2:149.154.167.220', '4:149.154.167.220'],
      verbose: false,
      check_updates: false,
      log_max_mb: 5,
      buf_kb: 256,
      pool_size: 4,
      cfproxy: true,
      h2: true,
      cfproxy_user_domain_enabled: false,
      cfproxy_user_domain: [],
      cfproxy_worker_enabled: false,
      cfproxy_worker_domain: [],
      force_test_dc: false,
      no_secure: false,
      appearance: 'dark',
      language: 'ru',
      autostart: false,
      ...existing
    }
    config.port = state.tgws.port
    config.secret = state.tgws.secret
    config.check_updates = false
    config.language = 'ru'
    config.appearance = 'dark'
    config.autostart = false
    writeFileSync(this.configPath(), JSON.stringify(config, null, 2), 'utf8')
    writeFileSync(join(tgwsDataDir(), '.first_run_done_mtproto'), '', 'utf8')
    writeFileSync(join(tgwsDataDir(), '.ipv6_warned'), '', 'utf8')
  }

  private async poll(): Promise<void> {
    if (this.pollBusy) return
    this.pollBusy = true
    try {
      const pid = await findProcessPid(TGWS_PROCESS)
      const running = pid !== null
      if (running !== this.running || pid !== this.pid) {
        this.running = running
        this.pid = pid
        events.state()
      }
    } finally {
      this.pollBusy = false
    }
  }

  private async ensureProcessStopped(): Promise<void> {
    const pid = this.pid ?? (await findProcessPid(TGWS_PROCESS))
    if (pid) {
      await killProcess(pid)
      await sleep(300)
      if (await findProcessPid(TGWS_PROCESS)) await killImage(TGWS_PROCESS)
    }
    this.pid = null
    this.running = false
  }

  async start(): Promise<void> {
    if (!this.isInstalled()) throw new Error('TG WS Proxy не установлен')
    const state = getState()
    const existing = await findProcessPid(TGWS_PROCESS)
    if (existing) {
      this.pid = existing
      this.running = true
      if (await probePort(state.tgws.port, 1500)) {
        events.state()
        return
      }
      await this.ensureProcessStopped()
    }

    this.ensureConfig()
    logger.info(`Запуск TG WS Proxy на порту ${state.tgws.port}`)
    const child = spawn(tgwsExePath(), ['--portable'], {
      cwd: tgwsDir(),
      windowsHide: true,
      detached: true,
      stdio: 'ignore'
    })
    child.on('error', (error) => {
      logger.error(`Не удалось запустить TG WS Proxy: ${String(error)}`)
    })
    child.unref()

    const opened = await waitFor(async () => {
      if (await probePort(state.tgws.port, 500)) return true
      return false
    }, 15_000, 500)

    const pid = await findProcessPid(TGWS_PROCESS)
    if (!opened) {
      const logTail = this.readLogTail()
      if (pid) {
        this.pid = pid
        this.running = true
        events.state()
      }
      throw new Error(
        `Прокси не открыл порт ${state.tgws.port}.${logTail ? `\n${logTail}` : ''}`
      )
    }

    this.pid = pid
    this.running = pid !== null
    logger.success(`TG WS Proxy запущен на 127.0.0.1:${state.tgws.port}`)
    events.toast('success', 'TG WS Proxy включён', `127.0.0.1:${state.tgws.port}`)
    events.state()
  }

  private readLogTail(): string {
    try {
      const path = join(tgwsDataDir(), 'proxy.log')
      if (!existsSync(path)) return ''
      const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/)
      return lines.slice(-5).join('\n')
    } catch {
      return ''
    }
  }

  async stop(): Promise<void> {
    await this.ensureProcessStopped()
    logger.info('TG WS Proxy остановлен')
    events.state()
  }

  async setPort(port: number): Promise<void> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Порт должен быть числом от 1 до 65535')
    }
    if (port < 1024) throw new Error('Выберите порт больше 1023')
    const wasRunning = this.running
    if (wasRunning) await this.ensureProcessStopped()
    updateState((state) => {
      state.tgws.port = port
    })
    this.ensureConfig()
    events.toast('success', 'Порт изменён', `127.0.0.1:${port}`)
    events.state()
    if (wasRunning) await this.start()
  }

  async install(release?: Release): Promise<void> {
    if (this.busy) throw new Error('Установка уже идёт')
    this.busy = true
    events.state()
    try {
      const target = release ?? (await getLatestRelease(TGWS_REPO, true))
      if (!target) throw new Error('Не удалось получить информацию о TG WS Proxy')
      const asset = pickTgwsAsset(target)
      if (!asset) throw new Error('В релизе нет сборки для Windows x64')

      ensureDir(downloadsDir())
      const downloadPath = join(downloadsDir(), `TgWsProxy-${target.tag}.exe`)
      const emit = (phase: ProgressEvent['phase'], percent: number, label: string): void => {
        events.progress({
          kind: 'tgws',
          phase,
          percent,
          received: 0,
          total: 0,
          speed: 0,
          label
        })
      }

      await downloadFile(asset.url, downloadPath, {
        kind: 'tgws',
        label: `TG WS Proxy ${target.tag}`,
        onProgress: (progress) => {
          events.progress({ ...progress, percent: Math.round(progress.percent * 0.85) })
        }
      })

      const wasRunning = this.running
      if (wasRunning) await this.ensureProcessStopped()
      emit('install', 90, 'Установка')

      ensureDir(tgwsDir())
      rmSync(tgwsExePath(), { force: true })
      copyFileSync(downloadPath, tgwsExePath())
      this.ensureConfig()
      rmSync(downloadPath, { force: true })

      updateState((state) => {
        state.tgws.version = target.tag
        state.tgws.update = {
          ...state.tgws.update,
          current: target.tag,
          latest: target.tag,
          available: false,
          checkedAt: Date.now()
        }
      })
      this.busy = false
      emit('done', 100, 'Готово')
      logger.success(`TG WS Proxy ${target.tag} установлен`)
      events.toast('success', 'TG WS Proxy установлен', `Версия ${target.tag}`)
      events.state()

      if (wasRunning) {
        try {
          await this.start()
        } catch (error) {
          logger.warn(`Не удалось перезапустить TG WS Proxy: ${String(error)}`)
        }
      }
    } catch (error) {
      this.busy = false
      events.progress({
        kind: 'tgws',
        phase: 'error',
        percent: 0,
        received: 0,
        total: 0,
        speed: 0,
        label: 'Ошибка установки'
      })
      events.state()
      throw error
    }
  }

  async remove(): Promise<void> {
    await this.ensureProcessStopped()
    rmSync(tgwsDir(), { recursive: true, force: true })
    updateState((state) => {
      state.tgws.version = null
    })
    events.toast('info', 'TG WS Proxy удалён')
    events.state()
  }

  setAutoUpdate(enabled: boolean): void {
    updateState((state) => {
      state.tgws.autoUpdate = enabled
    })
    events.state()
  }
}

export function ensureTgwsDir(): void {
  mkdirSync(tgwsDir(), { recursive: true })
}

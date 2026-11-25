import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AppState,
  ComponentId,
  GameFilter,
  IpsetMode,
  TgwsInfo,
  UiSettings,
  ZapretInfo
} from '@shared/types'
import { zapret, tgws, tester, updates, appUpdater } from './services'
import { getState, updateState } from './store'
import { logger, getLogs } from './logger'
import { events } from './events'
import { dataDir, downloadsDir, logsDir, zapretDir, tgwsDir, tgwsExePath } from './paths'
import { run } from './proc'
import { parseStrategy } from './zapret/strategy'
import { readGameFilter } from './zapret/settings'

let elevated = false
let diagnosticsRunning = false

export function setElevated(value: boolean): void {
  elevated = value
  events.state()
}

function fallbackZapretInfo(): ZapretInfo {
  const state = getState()
  const installed = zapret.isInstalled()
  return {
    installed,
    version: installed ? state.zapret.version : null,
    path: installed ? zapret.rootDir : null,
    running: false,
    pid: null,
    strategy: state.zapret.strategy,
    strategies: [],
    gameFilter: state.zapret.gameFilter,
    ipsetMode: 'none',
    autoUpdate: state.zapret.autoUpdate,
    update: state.zapret.update,
    busy: false,
    error: null
  }
}

function fallbackTgwsInfo(): TgwsInfo {
  const state = getState()
  const installed = tgws.isInstalled()
  return {
    installed,
    version: installed ? state.tgws.version : null,
    path: installed ? tgwsExePath() : null,
    running: false,
    pid: null,
    port: state.tgws.port,
    secret: state.tgws.secret,
    link: `tg://proxy?server=127.0.0.1&port=${state.tgws.port}&secret=dd${state.tgws.secret}`,
    autoUpdate: state.tgws.autoUpdate,
    update: state.tgws.update,
    busy: false,
    error: null
  }
}

export function buildState(): AppState {
  const persisted = getState()
  let zapretInfo: ZapretInfo
  let tgwsInfo: TgwsInfo
  try {
    zapretInfo = zapret.getInfo()
  } catch (error) {
    logger.error(`Не удалось собрать состояние Zapret: ${asErrorMessage(error)}`)
    zapretInfo = { ...fallbackZapretInfo(), error: asErrorMessage(error) }
  }
  try {
    tgwsInfo = tgws.getInfo()
  } catch (error) {
    logger.error(`Не удалось собрать состояние TG WS Proxy: ${asErrorMessage(error)}`)
    tgwsInfo = { ...fallbackTgwsInfo(), error: asErrorMessage(error) }
  }
  return {
    ready: true,
    elevated,
    appVersion: app.getVersion(),
    appUpdate: appUpdater.getInfo(),
    zapret: zapretInfo,
    tgws: tgwsInfo,
    ui: persisted.ui,
    testing: tester.isTesting,
    diagnosticsRunning,
    dataDir: dataDir()
  }
}

interface Deps {
  getWindow: () => BrowserWindow | null
  showWindow: () => void
  hideWindow: () => void
  quitApp: () => void
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function handle<Args extends unknown[], Result>(
  channel: string,
  fn: (...args: Args) => Promise<Result> | Result
): void {
  ipcMain.handle(channel, async (_event, ...args: Args) => {
    try {
      return await fn(...args)
    } catch (error) {
      const message = asErrorMessage(error)
      logger.error(`${channel}: ${message}`)
      events.toast('error', 'Не получилось', message)
      throw new Error(message)
    }
  })
}

function isComponent(value: unknown): value is ComponentId {
  return value === 'zapret' || value === 'tgws'
}

async function applyAutostart(enabled: boolean): Promise<void> {
  if (!app.isPackaged) {
    logger.warn('Автозапуск доступен только в установленной версии')
    return
  }
  // A scheduled task with the highest run level starts the elevated app at
  // logon without an UAC prompt every time (unlike a HKCU Run entry).
  if (enabled) {
    await run('schtasks.exe', [
      '/Create',
      '/TN',
      'Obhod',
      '/TR',
      `"${process.execPath}" --hidden`,
      '/SC',
      'ONLOGON',
      '/RL',
      'HIGHEST',
      '/F'
    ])
  } else {
    await run('schtasks.exe', ['/Delete', '/TN', 'Obhod', '/F'])
  }
}

export function registerIpc(deps: Deps): void {
  handle('api:getState', () => buildState())
  handle('api:getLogs', () => getLogs())

  handle('api:installZapret', async () => {
    await zapret.install()
    void updates.check(true)
  })
  handle('api:removeZapret', async () => {
    await zapret.remove()
    updateState((state) => {
      state.zapret.update = {
        ...state.zapret.update,
        current: null,
        available: false
      }
    })
    events.state()
  })
  handle('api:startZapret', async () => {
    await zapret.start()
  })
  handle('api:stopZapret', async () => {
    await zapret.stop()
  })
  handle('api:setStrategy', async (file: string) => {
    if (typeof file !== 'string') throw new Error('Некорректная стратегия')
    await zapret.setStrategy(file)
  })
  handle('api:setGameFilter', async (filter: GameFilter) => {
    if (!filter || typeof filter !== 'object') throw new Error('Некорректные настройки фильтра')
    await zapret.setGameFilter(filter)
  })
  handle('api:setIpsetMode', async (mode: IpsetMode) => {
    if (!['loaded', 'none', 'any'].includes(mode)) throw new Error('Некорректный режим IP-списка')
    await zapret.setIpsetMode(mode)
  })
  handle('api:updateIpset', async () => {
    await zapret.updateIpset()
  })
  handle('api:runDiagnostics', async () => {
    diagnosticsRunning = true
    events.state()
    try {
      return await zapret.runDiagnostics()
    } finally {
      diagnosticsRunning = false
      events.state()
    }
  })
  handle('api:checkUpdates', async (force?: boolean) => {
    await updates.check(Boolean(force), Boolean(force))
  })
  handle('api:checkAppUpdate', async (force?: boolean) => {
    await appUpdater.check(Boolean(force), true)
  })
  handle('api:downloadAppUpdate', async () => {
    await appUpdater.download()
  })
  handle('api:installAppUpdate', () => {
    appUpdater.install()
  })
  handle('api:applyUpdate', async (component: unknown) => {
    if (!isComponent(component)) throw new Error('Неизвестный компонент')
    await updates.apply(component)
    void updates.check(true)
  })

  handle('api:installTgws', async () => {
    await tgws.install()
    void updates.check(true)
  })
  handle('api:removeTgws', async () => {
    await tgws.remove()
    updateState((state) => {
      state.tgws.update = { ...state.tgws.update, current: null, available: false }
    })
    events.state()
  })
  handle('api:startTgws', async () => {
    await tgws.start()
  })
  handle('api:stopTgws', async () => {
    await tgws.stop()
  })
  handle('api:setTgwsPort', async (port: number) => {
    await tgws.setPort(Number(port))
  })
  handle('api:openTelegram', async () => {
    const state = buildState()
    const link = state.tgws.link
    try {
      await shell.openExternal(link)
      logger.info(`Открыта ссылка Telegram: ${link}`)
    } catch (error) {
      clipboard.writeText(link)
      logger.warn(`Не удалось открыть Telegram: ${String(error)}`)
      events.toast('info', 'Ссылка скопирована', 'Вставьте её в «Избранное» Telegram и нажмите')
      throw new Error('Telegram не открылся автоматически. Ссылка скопирована в буфер обмена.')
    }
  })
  handle('api:copyTelegramLink', async () => {
    clipboard.writeText(buildState().tgws.link)
    events.toast('success', 'Ссылка скопирована')
  })

  handle('api:runTest', async () => {
    if (tester.isTesting) throw new Error('Тест уже идёт')
    void tester.run().catch((error) => {
      logger.error(`Тест: ${asErrorMessage(error)}`)
      events.toast('error', 'Тест не запустился', asErrorMessage(error))
      events.test({
        status: 'error',
        phase: 'done',
        index: 0,
        total: 0,
        current: null,
        results: [],
        baseline: null,
        best: null,
        bestVerified: false,
        lanes: 1,
        message: asErrorMessage(error)
      })
    })
  })
  handle('api:cancelTest', () => {
    tester.cancel()
  })
  handle('api:applyBestStrategy', async (file: string) => {
    if (typeof file !== 'string') throw new Error('Некорректная стратегия')
    await zapret.setStrategy(file)
    events.toast('success', 'Стратегия применена', file.replace(/\.bat$/i, ''))
  })

  handle('api:setUiSettings', async (patch: Partial<UiSettings>) => {
    if (!patch || typeof patch !== 'object') throw new Error('Некорректные настройки')
    const previous = getState().ui
    updateState((state) => {
      state.ui = { ...state.ui, ...patch }
    })
    if (patch.launchAtLogin !== undefined && patch.launchAtLogin !== previous.launchAtLogin) {
      await applyAutostart(patch.launchAtLogin)
    }
    events.state()
  })
  handle('api:setAutoUpdate', async (component: unknown, enabled: boolean) => {
    if (!isComponent(component)) throw new Error('Неизвестный компонент')
    if (component === 'zapret') zapret.setAutoUpdate(Boolean(enabled))
    else tgws.setAutoUpdate(Boolean(enabled))
    if (enabled) void updates.check(true)
  })

  handle('api:openFolder', async (which: 'zapret' | 'tgws' | 'data' | 'logs') => {
    const paths: Record<typeof which, string> = {
      zapret: zapretDir(),
      tgws: tgwsDir(),
      data: dataDir(),
      logs: logsDir()
    }
    const target = paths[which]
    if (!target || !existsSync(target)) throw new Error('Папка ещё не создана')
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  })
  handle('api:openExternal', async (url: string) => {
    if (typeof url !== 'string' || !/^(https?|tg):/i.test(url)) throw new Error('Ссылка не разрешена')
    await shell.openExternal(url)
  })
  handle('api:copyText', (text: string) => {
    clipboard.writeText(String(text ?? ''))
  })

  ipcMain.on('api:windowMinimize', () => deps.getWindow()?.minimize())
  ipcMain.on('api:windowHideToTray', () => deps.hideWindow())
  ipcMain.on('api:windowClose', () => {
    if (getState().ui.minimizeToTray) deps.hideWindow()
    else deps.quitApp()
  })
  ipcMain.on('api:showWindow', () => deps.showWindow())
  ipcMain.on('api:quit', () => deps.quitApp())

  handle('api:relaunchElevated', async () => {
    const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`
    const args = app.isPackaged ? '' : ` -ArgumentList ${quote(app.getAppPath())}`

    // The helper waits until this process has released the single-instance
    // lock, then asks Windows to start the app elevated. Without the wait the
    // elevated copy can see the old instance and quit immediately.
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$current = Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue`,
      'if ($current) { [void]$current.WaitForExit(30000) }',
      // If UAC is unavailable or cancelled, reopen the app without elevation
      // instead of leaving the user with no window at all.
      `try { Start-Process -FilePath ${quote(process.execPath)}${args} -Verb RunAs } ` +
        `catch { Start-Process -FilePath ${quote(process.execPath)}${args} }`
    ].join('; ')

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }
    )
    child.unref()
    logger.info('Запрошен перезапуск с правами администратора')
    setTimeout(() => deps.quitApp(), 150)
  })

  logger.info(`Данные приложения: ${dataDir()}`)
  logger.info(`Загрузки: ${downloadsDir()}`)
  logger.info(`Логи: ${join(logsDir(), 'app.log')}`)

  if (!app.isPackaged) {
    ipcMain.handle('api:debugParse', (_event, file: string) =>
      parseStrategy(zapretDir(), file, readGameFilter(zapretDir()))
    )
    ipcMain.handle('api:debugEmitTest', () => {
      const now = Date.now()
      const results = buildState().zapret.strategies.map((strategy, index) => {
        const total = 22
        const ok = Math.max(4, total - Math.floor((index * 7) % 15))
        const frozen = Math.min(total - ok, Math.floor((index * 3) % 6))
        const fixed = Math.max(0, 8 - Math.floor(index / 3))
        const broken = index % 4 === 0 ? 1 : 0
        return {
          strategy: strategy.file,
          label: strategy.label,
          valid: true,
          started: true,
          ok,
          total,
          frozen,
          failed: total - ok - frozen,
          fixed,
          kept: ok - fixed,
          broken,
          score: fixed * 3 + (ok - fixed) - broken * 3,
          avgMs: 320 + index * 37,
          verified: index === 0,
          checks: [
            {
              target: 'Discord · TLS 1.3',
              host: 'discord.com',
              group: 'service' as const,
              mode: 'tls13' as const,
              ok: ok > 8,
              state: ok > 8 ? ('ok' as const) : ('frozen' as const),
              status: ok > 8 ? 'HTTP 200' : 'Заморозка',
              ms: 300 + index * 9,
              code: ok > 8 ? 200 : null,
              upBytes: 65536,
              downBytes: 0,
              before: 'bad' as const
            },
            {
              target: 'YouTube · TLS 1.3',
              host: 'www.youtube.com',
              group: 'service' as const,
              mode: 'tls13' as const,
              ok: ok > 10,
              state: ok > 10 ? ('ok' as const) : ('blocked' as const),
              status: ok > 10 ? 'HTTP 200' : 'Hello таймаут',
              ms: 500 + index * 11,
              code: ok > 10 ? 200 : null,
              upBytes: 65536,
              downBytes: 0,
              before: 'bad' as const
            }
          ]
        }
      })
      const best = results.reduce((a, b) => (a.score >= b.score ? a : b))
      events.test({
        status: 'done',
        phase: 'done',
        index: results.length,
        total: results.length,
        current: null,
        results,
        baseline: null,
        best: best.strategy,
        bestVerified: true,
        lanes: 3,
        message: null
      })
      return { at: now, count: results.length }
    })
    ipcMain.handle('api:debugShowUpdate', () => {
      updateState((state) => {
        state.zapret.update = {
          ...state.zapret.update,
          available: true,
          latest: '1.10.5',
          current: state.zapret.version,
          url: 'https://github.com/Flowseal/zapret-discord-youtube/releases/latest',
          checkedAt: Date.now()
        }
      })
      events.state()
      return true
    })
  }
}

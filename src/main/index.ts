import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setBroadcast, events } from './events'
import { setLogSink, logger } from './logger'
import { buildState, registerIpc, setElevated } from './ipc'
import { zapret, tgws, tester, updates } from './services'
import { getState, updateState } from './store'
import { ensureAppDirs, dataDir } from './paths'
import { isElevated } from './proc'

app.setPath('userData', join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Obhod'))
app.setAppUserModelId('ru.obhod.app')

process.on('uncaughtException', (error) => {
  try {
    logger.error(`Необработанная ошибка: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  } catch {
    /* ignore */
  }
})

process.on('unhandledRejection', (reason) => {
  try {
    logger.error(`Необработанный Promise: ${reason instanceof Error ? reason.message : String(reason)}`)
  } catch {
    /* ignore */
  }
})

const startHidden = process.argv.includes('--hidden')
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function resourcePath(name: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', name)
    : join(app.getAppPath(), 'resources', name)
}

function showWindow(): void {
  if (!mainWindow) {
    void createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideWindow(): void {
  mainWindow?.hide()
}

function quitApp(): void {
  quitting = true
  app.quit()
}

function trayIcon(): Electron.NativeImage {
  const path = resourcePath('icon.ico')
  if (existsSync(path)) {
    const image = nativeImage.createFromPath(path)
    if (!image.isEmpty()) return image.resize({ width: 16, height: 16 })
  }
  return nativeImage.createEmpty()
}

function refreshTray(): void {
  if (!tray) return
  const state = buildState()
  const menu = Menu.buildFromTemplate([
    { label: 'Открыть «Обход»', click: () => showWindow() },
    { type: 'separator' },
    {
      label: state.zapret.running ? 'Zapret: выключить' : 'Zapret: включить',
      enabled: state.zapret.installed,
      click: () => {
        const action = state.zapret.running ? zapret.stop() : zapret.start()
        void action.catch((error) => events.toast('error', 'Zapret', String(error)))
      }
    },
    {
      label: state.tgws.running ? 'TG WS Proxy: выключить' : 'TG WS Proxy: включить',
      enabled: state.tgws.installed,
      click: () => {
        const action = state.tgws.running ? tgws.stop() : tgws.start()
        void action.catch((error) => events.toast('error', 'TG WS Proxy', String(error)))
      }
    },
    {
      label: 'Подключить прокси в Telegram',
      enabled: state.tgws.running,
      click: () => {
        void shell.openExternal(state.tgws.link).catch(() => {
          events.toast('info', 'Ссылка скопирована', state.tgws.link)
        })
      }
    },
    { type: 'separator' },
    {
      label: 'Проверить обновления',
      click: () => {
        void updates.check(true, true)
      }
    },
    { label: 'Настройки', click: () => {
      showWindow()
      events.navigate('settings')
    } },
    { type: 'separator' },
    { label: 'Выход', click: () => quitApp() }
  ])
  tray.setContextMenu(menu)
  tray.setToolTip(`Обход — Zapret ${state.zapret.running ? 'вкл' : 'выкл'}, TG WS ${state.tgws.running ? 'вкл' : 'выкл'}`)
}

function createTray(): void {
  try {
    tray = new Tray(trayIcon())
    tray.on('click', () => showWindow())
    tray.on('double-click', () => showWindow())
    refreshTray()
  } catch (error) {
    logger.warn(`Не удалось создать иконку в трее: ${String(error)}`)
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    frame: false,
    title: 'Обход',
    backgroundColor: '#050506',
    icon: resourcePath('icon.ico'),
    roundedCorners: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.removeMenu()

  mainWindow.on('close', (event) => {
    if (!quitting && getState().ui.minimizeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.on('maximize', () => mainWindow?.webContents.send('evt:window-state', { maximized: true }))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('evt:window-state', { maximized: false }))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|tg):/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    if (/^(https?|tg):/i.test(url)) void shell.openExternal(url)
  })
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })

  const capture = process.env.OBHOD_CAPTURE
  if (capture) {
    mainWindow.webContents.once('did-finish-load', () => {
      const targetPage = process.env.OBHOD_CAPTURE_PAGE
      setTimeout(() => {
        if (targetPage) events.navigate(targetPage as 'home' | 'test' | 'settings')
        setTimeout(async () => {
          try {
            const image = await mainWindow?.webContents.capturePage()
            if (image) {
              const dir = join(app.getAppPath(), '.research')
              mkdirSync(dir, { recursive: true })
              writeFileSync(join(dir, capture), image.toPNG())
            }
          } finally {
            app.quit()
          }
        }, targetPage ? 1400 : 2200)
      }, 1600)
    })
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(async () => {
    ensureAppDirs()
    logger.info(`Обход ${app.getVersion()} запускается`)

    setLogSink((line) => events.log(line))

    setBroadcast((channel, payload) => {
      if (channel === 'state') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('evt:state', buildState())
        }
        refreshTray()
        return
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`evt:${channel}`, payload)
      }
    })

    registerIpc({
      getWindow: () => mainWindow,
      showWindow,
      hideWindow,
      quitApp
    })

    zapret.init()
    tgws.init()
    setElevated(await isElevated())
    createTray()
    await createWindow()

    if (!app.isPackaged) {
      logger.info('Режим разработки: приложение запущено без прав администратора')
    }

    updates.init()
    if (getState().ui.checkUpdatesOnLaunch) {
      setTimeout(() => {
        void updates.check(false)
      }, 3500)
    }

    app.on('activate', () => showWindow())
  })

  app.on('before-quit', () => {
    quitting = true
    zapret.dispose()
    tgws.dispose()
    updates.dispose()
    tray?.destroy()
    tray = null
  })

  app.on('window-all-closed', () => {
    if (!getState().ui.minimizeToTray) app.quit()
  })
}

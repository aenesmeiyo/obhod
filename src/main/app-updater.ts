import { app } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { AppUpdateInfo } from '@shared/types'
import { events } from './events'
import { logger } from './logger'
import { getState } from './store'

/**
 * Self-update for the app itself. electron-updater reads `latest.yml` from the
 * GitHub release and runs the NSIS installer. The per-machine installer asks
 * for UAC once, then the app restarts on the new version.
 */
export class AppUpdater {
  private latest: string | null = null
  private available = false
  private downloading = false
  private downloaded = false
  private percent = 0
  private checkedAt: number | null = null
  private error: string | null = null
  private checking = false
  private manual = false
  private initialized = false
  private lastProgressAt = 0

  init(): void {
    if (this.initialized) return
    this.initialized = true

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false
    autoUpdater.logger = {
      info: (message?: unknown) => logger.info(`Обновление: ${String(message)}`),
      warn: (message?: unknown) => logger.warn(`Обновление: ${String(message)}`),
      error: (message?: unknown) => logger.error(`Обновление: ${String(message)}`),
      debug: (message?: unknown) => logger.info(`Обновление: ${String(message)}`)
    }

    autoUpdater.on('checking-for-update', () => {
      this.error = null
    })
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.latest = info.version
      this.available = true
      this.downloaded = false
      this.percent = 0
      this.checkedAt = Date.now()
      this.error = null
      logger.info(`Доступно обновление приложения: ${info.version}`)
      events.toast('info', 'Доступно обновление', `Обход ${info.version}`)
      this.emit()
    })
    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.latest = info.version
      this.available = false
      this.downloaded = false
      this.percent = 0
      this.checkedAt = Date.now()
      this.error = null
      if (this.manual) events.toast('success', 'Обновлений нет', `Обход ${app.getVersion()}`)
      this.emit()
    })
    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.downloading = true
      this.percent = Math.max(0, Math.min(100, Math.round(progress.percent)))
      const now = Date.now()
      if (now - this.lastProgressAt > 700) {
        this.lastProgressAt = now
        this.emit()
      }
    })
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.latest = info.version
      this.available = true
      this.downloading = false
      this.downloaded = true
      this.percent = 100
      this.checkedAt = Date.now()
      this.error = null
      logger.success(`Обновление ${info.version} скачано`)
      events.toast('success', 'Обновление скачано', 'Установится при выходе или по кнопке «Перезапустить»')
      this.emit()
    })
    autoUpdater.on('error', (error: Error) => {
      this.downloading = false
      this.error = error.message || String(error)
      logger.warn(`Обновление приложения: ${this.error}`)
      if (this.manual) events.toast('error', 'Не удалось проверить обновление', this.error)
      this.emit()
    })
  }

  getInfo(): AppUpdateInfo {
    return {
      current: app.getVersion(),
      latest: this.latest,
      available: this.available,
      downloading: this.downloading,
      downloaded: this.downloaded,
      percent: this.percent,
      checkedAt: this.checkedAt,
      error: this.error
    }
  }

  async check(force = false, manual = false): Promise<void> {
    this.manual = manual
    if (!app.isPackaged) {
      if (manual) events.toast('info', 'Обновления приложения', 'Доступны только в установленной версии')
      return
    }
    if (this.checking) return
    this.checking = true
    this.error = null
    try {
      if (!force && !getState().ui.checkUpdatesOnLaunch) return
      logger.info('Проверяем обновление приложения')
      await autoUpdater.checkForUpdates()
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
      logger.warn(`Не удалось проверить обновление приложения: ${this.error}`)
      if (manual) events.toast('error', 'Не удалось проверить обновление', this.error)
      this.emit()
    } finally {
      this.checking = false
    }
  }

  async download(): Promise<void> {
    if (!this.available || this.downloading || this.downloaded) return
    this.downloading = true
    this.error = null
    this.percent = 0
    this.emit()
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.downloading = false
      this.error = error instanceof Error ? error.message : String(error)
      logger.warn(`Не удалось скачать обновление: ${this.error}`)
      events.toast('error', 'Не удалось скачать обновление', this.error)
      this.emit()
    }
  }

  install(): void {
    if (!this.downloaded) return
    logger.info('Перезапуск для установки обновления приложения')
    this.manual = false
    autoUpdater.quitAndInstall(false, true)
  }

  private emit(): void {
    events.state()
  }
}

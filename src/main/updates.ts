import type { ComponentId, UpdateInfo } from '@shared/types'
import { getState, updateState } from './store'
import { logger } from './logger'
import { events } from './events'
import {
  getLatestRelease,
  isNewer,
  pickTgwsAsset,
  pickZapretAsset,
  TGWS_REPO,
  ZAPRET_REPO,
  type Release
} from './github'
import type { ZapretManager } from './zapret/manager'
import type { TgwsManager } from './tgws/manager'

const releaseCache = new Map<string, Release>()

function applyRelease(
  repo: string,
  release: Release | null,
  currentVersion: string | null,
  update: UpdateInfo,
  hasAsset: (release: Release) => boolean
): UpdateInfo {
  if (!release) {
    return { ...update, current: currentVersion, checking: false, checkedAt: Date.now() }
  }
  if (!hasAsset(release)) {
    return { ...update, current: currentVersion, checking: false, checkedAt: Date.now() }
  }
  releaseCache.set(repo, release)
  return {
    current: currentVersion,
    latest: release.tag,
    available: isNewer(release.tag, currentVersion),
    url: release.htmlUrl,
    checkedAt: Date.now(),
    checking: false
  }
}

export class UpdateChecker {
  private checking = false
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly zapret: ZapretManager,
    private readonly tgws: TgwsManager
  ) {}

  init(): void {
    updateState((state) => {
      state.zapret.update.checking = false
      state.tgws.update.checking = false
    })
    this.timer = setInterval(() => {
      void this.check(false)
    }, 4 * 60 * 60 * 1000)
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async check(force = false, manual = false): Promise<void> {
    if (this.checking) return
    if (!force) {
      const ui = getState().ui
      if (!ui.checkUpdatesOnLaunch) return
    }
    this.checking = true
    updateState((state) => {
      state.zapret.update.checking = true
      state.tgws.update.checking = true
    })
    events.state()

    try {
      const zapretInstalled = this.zapret.isInstalled()
      const tgwsInstalled = this.tgws.isInstalled()
      const [zapretRelease, tgwsRelease] = await Promise.all([
        zapretInstalled && (force || getState().zapret.autoUpdate) ? getLatestRelease(ZAPRET_REPO, force) : null,
        tgwsInstalled && (force || getState().tgws.autoUpdate) ? getLatestRelease(TGWS_REPO, force) : null
      ])

      updateState((state) => {
        if (zapretInstalled) {
          state.zapret.update = applyRelease(
            ZAPRET_REPO,
            zapretRelease,
            state.zapret.version,
            state.zapret.update,
            (release) => pickZapretAsset(release) !== null
          )
        } else {
          state.zapret.update = { ...state.zapret.update, checking: false, current: null, available: false }
        }
        if (tgwsInstalled) {
          state.tgws.update = applyRelease(
            TGWS_REPO,
            tgwsRelease,
            state.tgws.version,
            state.tgws.update,
            (release) => pickTgwsAsset(release) !== null
          )
        } else {
          state.tgws.update = { ...state.tgws.update, checking: false, current: null, available: false }
        }
      })

      const zapretNew = getState().zapret.update.available
      const tgwsNew = getState().tgws.update.available
      if (zapretNew) {
        logger.info(`Доступно обновление Zapret: ${getState().zapret.update.latest}`)
      }
      if (tgwsNew) {
        logger.info(`Доступно обновление TG WS Proxy: ${getState().tgws.update.latest}`)
      }
      if (manual) {
        if (zapretNew || tgwsNew) {
          const parts: string[] = []
          if (zapretNew) parts.push(`Zapret ${getState().zapret.update.latest}`)
          if (tgwsNew) parts.push(`TG WS Proxy ${getState().tgws.update.latest}`)
          events.toast('info', 'Есть обновления', parts.join(' · '))
        } else {
          events.toast('success', 'Обновлений нет', 'Установлены последние версии')
        }
      }
    } catch (error) {
      logger.warn(`Проверка обновлений не удалась: ${String(error)}`)
      if (manual) events.toast('error', 'Не удалось проверить обновления', String(error))
      updateState((state) => {
        state.zapret.update.checking = false
        state.tgws.update.checking = false
      })
    } finally {
      this.checking = false
      events.state()
    }
  }

  async apply(component: ComponentId): Promise<void> {
    const repo = component === 'zapret' ? ZAPRET_REPO : TGWS_REPO
    let release = releaseCache.get(repo)
    if (!release || !isNewer(release.tag, getState()[component].version)) {
      release = (await getLatestRelease(repo, true)) ?? undefined
    }
    if (!release) throw new Error('Не удалось получить релиз для обновления')

    if (component === 'zapret') {
      await this.zapret.install(release)
    } else {
      await this.tgws.install(release)
    }

    updateState((state) => {
      state[component].update = {
        ...state[component].update,
        current: release.tag,
        latest: release.tag,
        available: false,
        checkedAt: Date.now(),
        checking: false
      }
    })
    events.state()
  }
}

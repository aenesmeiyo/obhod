import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { GameFilter, UiSettings, UpdateInfo } from '@shared/types'
import { ensureDir, dataDir, stateFile } from './paths'
import { logger } from './logger'

export interface PersistedState {
  zapret: {
    version: string | null
    strategy: string
    gameFilter: GameFilter
    autoUpdate: boolean
    update: UpdateInfo
  }
  tgws: {
    version: string | null
    port: number
    secret: string
    autoUpdate: boolean
    update: UpdateInfo
  }
  ui: UiSettings
}

function emptyUpdate(): UpdateInfo {
  return {
    current: null,
    latest: null,
    available: false,
    url: '',
    checkedAt: null,
    checking: false
  }
}

function defaults(): PersistedState {
  return {
    zapret: {
      version: null,
      strategy: 'general.bat',
      gameFilter: { mode: 'disabled', tcpRange: '1024-65535', udpRange: '1024-65535' },
      autoUpdate: true,
      update: emptyUpdate()
    },
    tgws: {
      version: null,
      port: 1443,
      secret: randomBytes(16).toString('hex'),
      autoUpdate: true,
      update: emptyUpdate()
    },
    ui: {
      minimizeToTray: true,
      launchAtLogin: false,
      checkUpdatesOnLaunch: true
    }
  }
}

let cached: PersistedState | null = null

function merge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return patch as T
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return base
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    result[key] = key in result ? merge(result[key], value) : value
  }
  return result as T
}

export function loadState(): PersistedState {
  if (cached) return cached
  const fallback = defaults()
  try {
    ensureDir(dataDir())
    if (existsSync(stateFile())) {
      const raw = JSON.parse(readFileSync(stateFile(), 'utf8')) as unknown
      cached = merge(fallback, raw)
      if (!/^[a-f0-9]{32}$/i.test(cached.tgws.secret)) cached.tgws.secret = fallback.tgws.secret
    } else {
      cached = fallback
    }
  } catch (error) {
    logger.warn(`Не удалось прочитать state.json: ${String(error)}`)
    cached = fallback
  }
  return cached
}

export function saveState(): void {
  if (!cached) return
  try {
    ensureDir(dataDir())
    const tmp = `${stateFile()}.tmp`
    writeFileSync(tmp, JSON.stringify(cached, null, 2), 'utf8')
    renameSync(tmp, stateFile())
  } catch (error) {
    logger.error(`Не удалось сохранить state.json: ${String(error)}`)
  }
}

export function getState(): PersistedState {
  return loadState()
}

export function updateState(mutator: (state: PersistedState) => void): PersistedState {
  const state = loadState()
  mutator(state)
  saveState()
  return state
}

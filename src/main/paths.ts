import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

export function dataDir(): string {
  return app.getPath('userData')
}

export function zapretDir(): string {
  return join(dataDir(), 'zapret')
}

export function zapretBinDir(): string {
  return join(zapretDir(), 'bin')
}

export function zapretListsDir(): string {
  return join(zapretDir(), 'lists')
}

export function zapretUtilsDir(): string {
  return join(zapretDir(), 'utils')
}

export function tgwsDir(): string {
  return join(dataDir(), 'tgws')
}

export function tgwsDataDir(): string {
  return join(tgwsDir(), 'TgWsProxy_data')
}

export function tgwsExePath(): string {
  return join(tgwsDir(), 'TgWsProxy_windows.exe')
}

export function downloadsDir(): string {
  return join(dataDir(), 'downloads')
}

export function logsDir(): string {
  return join(dataDir(), 'logs')
}

export function stateFile(): string {
  return join(dataDir(), 'state.json')
}

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true })
  return path
}

export function ensureAppDirs(): void {
  for (const dir of [dataDir(), zapretDir(), tgwsDir(), downloadsDir(), logsDir()]) {
    ensureDir(dir)
  }
}

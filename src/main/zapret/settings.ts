import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GameFilter, GameFilterMode, IpsetMode } from '@shared/types'
import { validatePortRanges } from './strategy'

export const DEFAULT_GAME_FILTER: GameFilter = {
  mode: 'disabled',
  tcpRange: '1024-65535',
  udpRange: '1024-65535'
}

export const ZAPRET_UPDATE_URL =
  'https://raw.githubusercontent.com/Flowseal/zapret-discord-youtube/main/.service/ipset-service.txt'

/**
 * service.bat creates these on every strategy launch. winws.exe refuses to
 * start when a hostlist path is missing, so the app must create them too.
 */
export function ensureUserLists(rootDir: string): void {
  const lists = join(rootDir, 'lists')
  mkdirSync(lists, { recursive: true })
  const files: Array<[string, string]> = [
    ['ipset-exclude-user.txt', '203.0.113.113/32\n'],
    ['list-general-user.txt', '# Never leave this file empty\ndomain.example.abc\n'],
    ['list-exclude-user.txt', 'domain.example.abc\n']
  ]
  for (const [name, content] of files) {
    const path = join(lists, name)
    if (!existsSync(path)) writeFileSync(path, content, 'utf8')
  }
}

function gameFilterPath(rootDir: string): string {
  return join(rootDir, 'utils', 'game_filter.enabled')
}

function ipsetPath(rootDir: string): string {
  return join(rootDir, 'lists', 'ipset-all.txt')
}

function ipsetBackupPath(rootDir: string): string {
  return join(rootDir, 'lists', 'ipset-all.txt.backup')
}

export function readGameFilter(rootDir: string): GameFilter {
  const path = gameFilterPath(rootDir)
  if (!existsSync(path)) return { ...DEFAULT_GAME_FILTER }
  try {
    const raw = readFileSync(path, 'utf8')
    const values = new Map<string, string>()
    for (const line of raw.split(/\r?\n/)) {
      const [key, ...rest] = line.split('=')
      if (key) values.set(key.trim().toLowerCase(), rest.join('=').trim())
    }
    const modeValue = (values.get('mode') || 'disabled').toLowerCase()
    const mode: GameFilterMode =
      modeValue === 'all' || modeValue === 'tcp' || modeValue === 'udp' ? modeValue : 'disabled'
    return {
      mode,
      tcpRange: validatePortRanges(values.get('tcp') || '') || DEFAULT_GAME_FILTER.tcpRange,
      udpRange: validatePortRanges(values.get('udp') || '') || DEFAULT_GAME_FILTER.udpRange
    }
  } catch {
    return { ...DEFAULT_GAME_FILTER }
  }
}

export function writeGameFilter(rootDir: string, filter: GameFilter): GameFilter {
  const tcpRange = validatePortRanges(filter.tcpRange)
  const udpRange = validatePortRanges(filter.udpRange)
  if (!tcpRange || !udpRange) {
    throw new Error('Некорректный диапазон портов. Пример: 1024-65535,27015')
  }
  mkdirSync(join(rootDir, 'utils'), { recursive: true })
  const normalized: GameFilter = { mode: filter.mode, tcpRange, udpRange }
  writeFileSync(
    gameFilterPath(rootDir),
    `mode=${normalized.mode}\ntcp=${normalized.tcpRange}\nudp=${normalized.udpRange}\n`,
    'utf8'
  )
  return normalized
}

export function readIpsetMode(rootDir: string): IpsetMode {
  const path = ipsetPath(rootDir)
  if (!existsSync(path)) return 'none'
  try {
    const content = readFileSync(path, 'utf8')
    if (!content.trim()) return 'any'
    if (content.includes('203.0.113.113/32')) return 'none'
    return 'loaded'
  } catch {
    return 'none'
  }
}

export function setIpsetMode(rootDir: string, mode: IpsetMode): IpsetMode {
  const path = ipsetPath(rootDir)
  const backup = ipsetBackupPath(rootDir)
  mkdirSync(join(rootDir, 'lists'), { recursive: true })

  if (mode === 'any') {
    if (existsSync(path)) copyFileSync(path, backup)
    writeFileSync(path, '', 'utf8')
    return 'any'
  }

  if (mode === 'none') {
    if (existsSync(path) && readIpsetMode(rootDir) === 'loaded') {
      copyFileSync(path, backup)
    }
    writeFileSync(path, '203.0.113.113/32\n', 'utf8')
    return 'none'
  }

  if (!existsSync(backup)) {
    throw new Error('Нет резервной копии списка IP. Сначала обновите список.')
  }
  rmSync(path, { force: true })
  renameSync(backup, path)
  return 'loaded'
}

export function installIpsetContent(rootDir: string, content: string): void {
  mkdirSync(join(rootDir, 'lists'), { recursive: true })
  writeFileSync(ipsetPath(rootDir), content, 'utf8')
}

export function ipsetFilePath(rootDir: string): string {
  return ipsetPath(rootDir)
}

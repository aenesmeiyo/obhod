import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import type { GameFilter, StrategyInfo } from '@shared/types'

export interface ParsedStrategy {
  file: string
  label: string
  valid: boolean
  args: string[]
  methods: string
  error?: string
}

const KNOWN_METHODS = [
  'fake',
  'fakedsplit',
  'fakeddisorder',
  'multisplit',
  'multidisorder',
  'split',
  'disorder',
  'hostfakesplit',
  'syndata'
]

function naturalCompare(a: string, b: string): number {
  const key = (value: string): string => value.replace(/(\d+)/g, (digits) => digits.padStart(8, '0'))
  return key(a).localeCompare(key(b), 'ru')
}

export function strategyLabel(file: string): string {
  const name = basename(file, '.bat')
  const stripped = name.replace(/^general\s*/i, '').replace(/^[\s(]+|[\s)]+$/g, '')
  if (!stripped) return 'Базовая'
  return stripped.toUpperCase()
}

export function computeGameFilterArgs(filter: GameFilter): { tcp: string; udp: string } {
  const { mode, tcpRange, udpRange } = filter
  return {
    tcp: mode === 'all' || mode === 'tcp' ? tcpRange : '12',
    udp: mode === 'all' || mode === 'udp' ? udpRange : '12'
  }
}

export function validatePortRanges(input: string): string | null {
  const value = input.replace(/\s+/g, '')
  if (!value) return null
  for (const item of value.split(',')) {
    const match = item.match(/^([1-9]\d*)(?:-([1-9]\d*))?$/)
    if (!match) return null
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    if (start > 65535 || end > 65535 || start > end) return null
  }
  return value
}

/** Joins misused caret continuations and extracts everything after winws.exe. */
function extractCommandLine(raw: string): string | null {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const logical: string[] = []
  let pending = ''
  for (const line of text.split('\n')) {
    const trimmedRight = line.replace(/\s+$/, '')
    if (/\^\s*$/.test(trimmedRight)) {
      pending += `${trimmedRight.replace(/\s*\^\s*$/, '')} `
      continue
    }
    logical.push(pending + line)
    pending = ''
  }
  if (pending) logical.push(pending)

  for (const line of logical) {
    const index = line.toLowerCase().indexOf('winws.exe')
    if (index === -1) continue
    const after = line.slice(index + 'winws.exe'.length)
    const rest = after.replace(/^"?/, '').trim()
    if (rest) return rest
  }
  return null
}

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && /\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

function expandVariables(
  input: string,
  context: { binDir: string; listsDir: string; rootDir: string; game: { tcp: string; udp: string } }
): { value: string; unknown: string[] } {
  const unknown: string[] = []
  const withTrailingSlash = (path: string): string => (path.endsWith('\\') ? path : `${path}\\`)
  const value = input.replace(/%([^%]+)%/g, (whole, name: string) => {
    switch (name.toUpperCase()) {
      case 'BIN':
        return withTrailingSlash(context.binDir)
      case 'LISTS':
        return withTrailingSlash(context.listsDir)
      case 'GAMEFILTERTCP':
        return context.game.tcp
      case 'GAMEFILTERUDP':
        return context.game.udp
      case '~DP0':
        return withTrailingSlash(context.rootDir)
      default:
        unknown.push(name)
        return whole
    }
  })
  return { value, unknown }
}

function resolvePathToken(token: string, rootDir: string): string {
  const eq = token.indexOf('=')
  const prefix = eq >= 0 ? token.slice(0, eq + 1) : ''
  const value = eq >= 0 ? token.slice(eq + 1) : token
  if (!value || isAbsolute(value) || /^[a-z]+:\/\//i.test(value)) return token
  if (!/\.(bin|txt)$/i.test(value)) return token
  return `${prefix}${join(rootDir, value)}`
}

function describeMethods(args: string[]): string {
  const found = new Set<string>()
  for (const arg of args) {
    const match = arg.match(/^--dpi-desync=(.+)$/i)
    if (!match) continue
    for (const part of match[1].split(',')) {
      const value = part.trim().toLowerCase()
      if (!value) continue
      if (!found.has(value)) found.add(value)
    }
  }
  if (found.size === 0) return '—'
  return Array.from(found)
    .sort((a, b) => {
      const ia = KNOWN_METHODS.indexOf(a)
      const ib = KNOWN_METHODS.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
    .join(' · ')
}

export function parseStrategy(
  rootDir: string,
  file: string,
  gameFilter: GameFilter
): ParsedStrategy {
  const result: ParsedStrategy = {
    file,
    label: strategyLabel(file),
    valid: false,
    args: [],
    methods: '—'
  }

  const batPath = join(rootDir, file)
  if (!existsSync(batPath)) {
    result.error = 'Файл стратегии не найден'
    return result
  }

  let raw: string
  try {
    raw = readFileSync(batPath, 'utf8')
  } catch (error) {
    result.error = `Не удалось прочитать: ${String(error)}`
    return result
  }

  const commandLine = extractCommandLine(raw)
  if (!commandLine) {
    result.error = 'В стратегии нет запуска winws.exe'
    return result
  }

  const binDir = join(rootDir, 'bin')
  const listsDir = join(rootDir, 'lists')
  const expanded = expandVariables(commandLine, {
    binDir,
    listsDir,
    rootDir,
    game: computeGameFilterArgs(gameFilter)
  })
  if (expanded.unknown.length > 0) {
    result.error = `Неизвестные переменные: ${expanded.unknown.join(', ')}`
    return result
  }

  const tokens = tokenize(expanded.value)
    .map((token) => resolvePathToken(token, rootDir))
    .filter((token) => token.length > 0)

  if (!tokens.some((token) => /^--filter-/.test(token))) {
    result.error = 'Не найдены параметры фильтра'
    return result
  }
  if (!tokens.some((token) => /^--dpi-desync=/.test(token))) {
    result.error = 'Не найдены параметры desync'
    return result
  }
  if (!existsSync(join(binDir, 'winws.exe'))) {
    result.error = 'winws.exe не найден'
    return result
  }

  result.args = tokens
  result.methods = describeMethods(tokens)
  result.valid = true
  return result
}

export function listStrategyFiles(rootDir: string): string[] {
  if (!existsSync(rootDir)) return []
  return readdirSync(rootDir)
    .filter((name) => /\.bat$/i.test(name) && !/^service/i.test(name))
    .sort(naturalCompare)
}

export function listStrategies(rootDir: string, gameFilter: GameFilter): StrategyInfo[] {
  return listStrategyFiles(rootDir).map((file) => {
    const parsed = parseStrategy(rootDir, file, gameFilter)
    return {
      file,
      label: parsed.label,
      valid: parsed.valid,
      methods: parsed.methods
    }
  })
}

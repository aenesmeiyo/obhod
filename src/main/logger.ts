import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { LogLine } from '@shared/types'
import { logsDir, ensureDir } from './paths'

const MAX_LINES = 600
const MAX_FILE_BYTES = 2 * 1024 * 1024

// A packaged Windows app has no console. Writing to a closed pipe raises EPIPE
// asynchronously and turns into an uncaught exception, so only mirror to the
// console when it is a real interactive terminal.
const consoleAvailable = Boolean(process.stdout?.isTTY && process.stderr?.isTTY)
try {
  process.stdout?.on('error', () => undefined)
  process.stderr?.on('error', () => undefined)
} catch {
  /* not fatal */
}

let buffer: LogLine[] = []
let sink: ((line: LogLine) => void) | null = null
let logPath = ''

function ensureLogFile(): string {
  if (!logPath) {
    ensureDir(logsDir())
    logPath = join(logsDir(), 'app.log')
  }
  return logPath
}

function rotateIfNeeded(): void {
  try {
    const path = ensureLogFile()
    if (existsSync(path) && statSync(path).size > MAX_FILE_BYTES) {
      renameSync(path, `${path}.1`)
    }
  } catch {
    /* rotation is best effort */
  }
}

function format(line: LogLine): string {
  const time = new Date(line.time).toISOString()
  return `${time} [${line.level}] ${line.message}\n`
}

export function setLogSink(fn: ((line: LogLine) => void) | null): void {
  sink = fn
}

export function log(level: LogLine['level'], message: string): void {
  const line: LogLine = { time: Date.now(), level, message }
  buffer.push(line)
  if (buffer.length > MAX_LINES) buffer = buffer.slice(-MAX_LINES)
  try {
    rotateIfNeeded()
    appendFileSync(ensureLogFile(), format(line), 'utf8')
  } catch {
    /* logging must never break the app */
  }
  if (consoleAvailable) {
    try {
      if (level === 'error') console.error(message)
      else if (level === 'warn') console.warn(message)
      else console.log(message)
    } catch {
      /* ignore a disappearing console */
    }
  }
  sink?.(line)
}

export const logger = {
  info: (message: string) => log('info', message),
  warn: (message: string) => log('warn', message),
  error: (message: string) => log('error', message),
  success: (message: string) => log('success', message)
}

export function getLogs(): LogLine[] {
  return buffer.slice()
}

export function logFilePath(): string {
  return ensureLogFile()
}

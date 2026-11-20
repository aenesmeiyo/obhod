import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ProgressEvent } from '@shared/types'
import { logger } from './logger'

export interface DownloadOptions {
  label: string
  kind: ProgressEvent['kind']
  onProgress?: (progress: ProgressEvent) => void
  signal?: AbortSignal
}

const USER_AGENT = 'Obhod/1.0 (Windows)'

export async function downloadFile(url: string, destination: string, options: DownloadOptions): Promise<number> {
  mkdirSync(dirname(destination), { recursive: true })
  const temp = `${destination}.part`
  rmSync(temp, { force: true })

  logger.info(`Скачивание: ${url}`)
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
    signal: options.signal
  })
  if (!response.ok || !response.body) {
    throw new Error(`Не удалось скачать файл: HTTP ${response.status}`)
  }

  const total = Number(response.headers.get('content-length') || 0)
  let received = 0
  let lastEmit = 0
  const started = Date.now()
  let speed = 0

  const emit = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastEmit < 120) return
    lastEmit = now
    const elapsed = Math.max(0.2, (now - started) / 1000)
    speed = received / elapsed
    options.onProgress?.({
      kind: options.kind,
      phase: 'download',
      percent: total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0,
      received,
      total,
      speed,
      label: options.label
    })
  }

  emit(true)
  const stream = createWriteStream(temp)
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      received += chunk.byteLength
      if (!stream.write(chunk)) {
        await new Promise<void>((resolve) => stream.once('drain', resolve))
      }
      emit()
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      stream.end((error?: Error | null) => (error ? reject(error) : resolve()))
    })
  }

  if (total > 0 && received !== total) {
    throw new Error(`Файл скачан не полностью (${received} из ${total} байт)`)
  }

  const previous = existsSync(destination) ? statSync(destination).size : 0
  rmSync(destination, { force: true })
  const { renameSync } = await import('node:fs')
  renameSync(temp, destination)
  emit(true)
  options.onProgress?.({
    kind: options.kind,
    phase: 'download',
    percent: 100,
    received,
    total: total || received,
    speed,
    label: options.label
  })
  logger.info(`Скачано ${(received / 1024 / 1024).toFixed(1)} МБ (было ${(previous / 1024 / 1024).toFixed(1)} МБ)`)
  return received
}

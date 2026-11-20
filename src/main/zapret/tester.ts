import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { request as httpsRequest } from 'node:https'
import type { TestCheck, TestProgress, TestStrategyResult } from '@shared/types'
import { zapretBinDir, zapretDir } from '../paths'
import { getState } from '../store'
import { logger } from '../logger'
import { events } from '../events'
import { findProcessPid, isElevated, killImage, run, sleep, waitFor } from '../proc'
import { parseStrategy } from './strategy'
import type { ZapretManager } from './manager'

interface Target {
  name: string
  url: string | null
  ping: string | null
}

const DEFAULT_TARGETS: Target[] = [
  { name: 'DiscordMain', url: 'https://discord.com', ping: 'discord.com' },
  { name: 'DiscordGateway', url: 'https://gateway.discord.gg', ping: 'gateway.discord.gg' },
  { name: 'DiscordCDN', url: 'https://cdn.discordapp.com', ping: 'cdn.discordapp.com' },
  { name: 'YouTubeWeb', url: 'https://www.youtube.com', ping: 'www.youtube.com' },
  { name: 'YouTubeShort', url: 'https://youtu.be', ping: 'youtu.be' },
  { name: 'YouTubeImage', url: 'https://i.ytimg.com', ping: 'i.ytimg.com' },
  { name: 'YouTubeVideo', url: 'https://redirector.googlevideo.com', ping: 'redirector.googlevideo.com' },
  { name: 'GoogleMain', url: 'https://www.google.com', ping: 'www.google.com' },
  { name: 'CloudflareDNS', url: null, ping: '1.1.1.1' },
  { name: 'GoogleDNS', url: null, ping: '8.8.8.8' }
]

function loadTargets(): Target[] {
  try {
    const path = join(zapretDir(), 'utils', 'targets.txt')
    if (!existsSync(path)) return DEFAULT_TARGETS
    const targets: Target[] = []
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"([^"]+)"/)
      if (!match) continue
      const [, name, value] = match
      if (/^PING:/i.test(value)) {
        targets.push({ name, url: null, ping: value.replace(/^PING:\s*/i, '') })
      } else if (/^https?:\/\//i.test(value)) {
        targets.push({
          name,
          url: value,
          ping: value.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
        })
      }
    }
    return targets.length > 0 ? targets : DEFAULT_TARGETS
  } catch {
    return DEFAULT_TARGETS
  }
}

function httpsCheck(target: Target, mode: 'http' | 'tls13'): Promise<TestCheck> {
  const url = target.url as string
  return new Promise((resolve) => {
    const started = Date.now()
    let settled = false
    const finish = (ok: boolean, status: string): void => {
      if (settled) return
      settled = true
      resolve({ target: `${target.name} ${mode === 'http' ? 'HTTP' : 'TLS1.3'}`, ok, status, ms: Date.now() - started })
    }
    try {
      const parsed = new URL(url)
      const tlsOptions =
        mode === 'tls13'
          ? ({ minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' } as const)
          : ({ ALPNProtocols: ['http/1.1'] } as const)
      const req = httpsRequest(
        {
          hostname: parsed.hostname,
          port: 443,
          path: `${parsed.pathname || '/'}${parsed.search}`,
          method: 'HEAD',
          timeout: 4000,
          servername: parsed.hostname,
          ...tlsOptions,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Obhod/1.0',
            Accept: '*/*',
            Connection: 'close'
          }
        },
        (response) => {
          const status = response.statusCode ?? 0
          response.resume()
          finish(status > 0 && status < 500, String(status))
        }
      )
      req.on('timeout', () => {
        req.destroy()
        finish(false, 'timeout')
      })
      req.on('error', (error: NodeJS.ErrnoException) => finish(false, error.code || 'error'))
      req.end()
    } catch {
      finish(false, 'error')
    }
  })
}

async function pingCheck(target: Target): Promise<TestCheck> {
  const started = Date.now()
  const result = await run('ping.exe', ['-n', '1', '-w', '1200', '-4', target.ping as string], {
    timeout: 4000
  })
  const ok = /TTL=/i.test(result.stdout)
  return { target: `${target.name} PING`, ok, status: ok ? 'ok' : 'timeout', ms: Date.now() - started }
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

function emit(progress: TestProgress): void {
  events.test(progress)
}

export class Tester {
  private testing = false
  private cancelled = false
  private currentChildPid: number | null = null

  constructor(private readonly zapret: ZapretManager) {}

  get isTesting(): boolean {
    return this.testing
  }

  cancel(): void {
    if (this.testing) {
      this.cancelled = true
      logger.warn('Тест стратегий отменяется')
    }
  }

  async run(): Promise<void> {
    if (this.testing) throw new Error('Тест уже идёт')
    if (!this.zapret.isInstalled()) throw new Error('Zapret не установлен')
    if (!(await isElevated())) throw new Error('Для теста нужны права администратора')

    this.testing = true
    this.cancelled = false
    const wasRunning = this.zapret.isRunning
    const previousStrategy = getState().zapret.strategy
    const strategies = this.zapret.getStrategies(true).filter((item) => item.valid)
    const total = strategies.length
    const targets = loadTargets()
    const gameFilter = this.zapret.getInfo().gameFilter
    const results: TestStrategyResult[] = []

    if (total === 0) {
      this.testing = false
      throw new Error('Не найдено ни одной рабочей стратегии')
    }

    logger.info(`Запуск теста: ${total} стратегий, ${targets.length} целей`)
    if (wasRunning) await this.zapret.stop(true)
    await this.cleanupWinws()

    try {
      for (let index = 0; index < strategies.length; index += 1) {
        if (this.cancelled) break
        const strategy = strategies[index]
        emit({
          status: 'running',
          index,
          total,
          current: strategy.file,
          results: results.slice(),
          best: this.bestOf(results),
          message: null
        })

        const parsed = parseStrategy(zapretDir(), strategy.file, gameFilter)
        if (!parsed.valid) {
          results.push({
            strategy: strategy.file,
            label: strategy.label,
            valid: false,
            started: false,
            ok: 0,
            total: 0,
            pingOk: 0,
            pingTotal: 0,
            avgMs: 0,
            checks: [],
            error: parsed.error
          })
          continue
        }

        await this.cleanupWinws()
        const child = spawn(join(zapretBinDir(), 'winws.exe'), parsed.args, {
          cwd: zapretBinDir(),
          windowsHide: true,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, NO_UPDATE_CHECK: '1' }
        })
        this.currentChildPid = child.pid ?? null
        child.on('error', (error) => {
          logger.warn(`Тест: не удалось запустить winws.exe: ${String(error)}`)
        })
        child.unref()

        const pid = await waitFor(async () => (await findProcessPid('winws.exe')) ?? false, 3000, 200)
        if (!pid) {
          results.push({
            strategy: strategy.file,
            label: strategy.label,
            valid: true,
            started: false,
            ok: 0,
            total: 0,
            pingOk: 0,
            pingTotal: 0,
            avgMs: 0,
            checks: [],
            error: 'winws.exe не запустился'
          })
          continue
        }

        await sleep(900)
        const urlTargets = targets.filter((target) => target.url)
        const checks: TestCheck[] = []
        const tasks: Array<() => Promise<TestCheck>> = []
        for (const target of urlTargets) {
          tasks.push(() => httpsCheck(target, 'http'))
          tasks.push(() => httpsCheck(target, 'tls13'))
        }
        const urlChecks = await pool(tasks, 10, (task) => task())
        checks.push(...urlChecks)

        const pingTargets = targets.filter((target) => target.ping)
        const pingChecks = await pool(pingTargets, 5, (target) => pingCheck(target))
        checks.push(...pingChecks)

        const urlResults = checks.filter((check) => !check.target.endsWith('PING'))
        const pingResults = checks.filter((check) => check.target.endsWith('PING'))
        const ok = urlResults.filter((check) => check.ok).length
        const avgMs =
          urlResults.length > 0
            ? Math.round(urlResults.reduce((sum, check) => sum + check.ms, 0) / urlResults.length)
            : 0

        const result: TestStrategyResult = {
          strategy: strategy.file,
          label: strategy.label,
          valid: true,
          started: true,
          ok,
          total: urlResults.length,
          pingOk: pingResults.filter((check) => check.ok).length,
          pingTotal: pingResults.length,
          avgMs,
          checks
        }
        results.push(result)
        logger.info(`Тест ${index + 1}/${total}: ${strategy.file} — ${ok}/${urlResults.length}`)
        await this.cleanupWinws()
        await sleep(250)
      }
    } finally {
      await this.cleanupWinws()
      this.currentChildPid = null
      this.testing = false
    }

    const best = this.bestOf(results)
    const status = this.cancelled ? 'cancelled' : 'done'
    emit({
      status,
      index: results.length,
      total,
      current: null,
      results,
      best,
      message: this.cancelled ? 'Тест отменён' : null
    })

    if (wasRunning) {
      try {
        await this.zapret.start(previousStrategy)
      } catch (error) {
        logger.warn(`Не удалось вернуть Zapret после теста: ${String(error)}`)
      }
    }

    if (!this.cancelled && best) {
      logger.success(`Лучшая стратегия: ${best}`)
      events.toast('success', 'Тест завершён', `Лучшая: ${best.replace(/\.bat$/i, '')}`)
    }
  }

  private bestOf(results: TestStrategyResult[]): string | null {
    let best: TestStrategyResult | null = null
    for (const result of results) {
      if (!result.started) continue
      if (
        !best ||
        result.ok > best.ok ||
        (result.ok === best.ok && result.pingOk > best.pingOk) ||
        (result.ok === best.ok && result.pingOk === best.pingOk && result.avgMs < best.avgMs)
      ) {
        best = result
      }
    }
    return best?.strategy ?? null
  }

  private async cleanupWinws(): Promise<void> {
    await killImage('winws.exe')
    await sleep(350)
  }
}

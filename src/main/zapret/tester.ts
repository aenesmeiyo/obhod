import { spawn } from 'node:child_process'
import { closeSync, copyFileSync, existsSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GameFilter, StrategyInfo, TestCheck, TestProgress, TestStrategyResult } from '@shared/types'
import { ensureDir, logsDir, zapretBinDir, zapretDir } from '../paths'
import { getState } from '../store'
import { logger } from '../logger'
import { events } from '../events'
import { isElevated, killImage, killProcess, listProcesses, run, sleep } from '../proc'
import { parseStrategy } from './strategy'
import { readGameFilter } from './settings'
import {
  buildLaneFilter,
  buildMatrix,
  buildResult,
  baselineBlocked,
  loadFreezeHosts,
  resolveTargets,
  runMatrix,
  SERVICE_HOSTS,
  type DpiJob
} from './dpi'
import type { ZapretManager } from './manager'

/** How many strategies are exercised at once in parallel mode. */
const LANE_COUNT = 3
/** Source ports reserved per lane; one fresh port per connection. */
const LANE_SPAN = 600
const LANE_BASES = [26000, 28000, 30000, 32000, 34000]
const START_TIMEOUT_MS = 7000
const WARMUP_MS = 500

interface Lane {
  item: StrategyInfo
  slot: number
  base: number
  pid: number
}

function emit(progress: TestProgress): void {
  events.test(progress)
}

function naturalSortResults(results: TestStrategyResult[]): TestStrategyResult[] {
  return [...results].sort((a, b) => {
    if (a.started !== b.started) return a.started ? -1 : 1
    if (Boolean(a.verified) !== Boolean(b.verified)) return a.verified ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    if (a.broken !== b.broken) return a.broken - b.broken
    if (b.fixed !== a.fixed) return b.fixed - a.fixed
    return a.avgMs - b.avgMs
  })
}

export class Tester {
  private testing = false
  private cancelled = false
  private currentChildPid: number | null = null
  private laneBase = LANE_BASES[0]
  private laneBases: number[] = []
  private laneCursors: number[] = []

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

    const strategies = this.zapret.getStrategies(true).filter((item) => item.valid)
    if (strategies.length === 0) throw new Error('Не найдено ни одной рабочей стратегии')

    this.testing = true
    this.cancelled = false
    const wasRunning = this.zapret.isRunning || (await listProcesses('winws.exe')).length > 0
    const previousStrategy = getState().zapret.strategy
    const parallelSetting = getState().ui.parallelTest && strategies.length > 1
    let lanes = parallelSetting ? Math.min(LANE_COUNT, strategies.length) : 1
    const total = strategies.length
    const results: TestStrategyResult[] = []
    let message: string | null = null

    this.laneBase = await this.pickLaneBase()
    this.laneBases = Array.from({ length: LANE_COUNT }, (_, index) => this.laneBase + index * LANE_SPAN)
    this.laneCursors = Array.from({ length: LANE_COUNT }, () => 0)
    logger.info(
      `Запуск теста: ${total} стратегий, режим ${lanes > 1 ? `параллельный (${lanes} полосы)` : 'последовательный'}`
    )

    emit({
      status: 'running',
      phase: 'baseline',
      index: 0,
      total,
      current: null,
      results: [],
      baseline: null,
      best: null,
      bestVerified: false,
      lanes,
      message: null
    })

    try {
      if (wasRunning) await this.zapret.stop(true)
      await this.cleanupWinws()
      const freezeHosts = await loadFreezeHosts()
      const jobs = buildMatrix(freezeHosts)
      const addresses = await resolveTargets(jobs)
      const hosts = new Set(jobs.map((job) => job.host.host))
      if (lanes > 1 && addresses.size < hosts.size) {
        logger.warn(
          `Параллельный режим отключён: не все цели разрешились (${addresses.size}/${hosts.size})`
        )
        lanes = 1
      }
      logger.info(
        `Цели теста: ${jobs.length} проверок (${SERVICE_HOSTS.length} сервисов + ${freezeHosts.length} хостов 16-20), IP определено: ${addresses.size}`
      )

      const outcome = await this.withIpsetAny(async () => {
        let picked: string | null = null
        let pickedVerified = false

        emit({
          status: 'running',
          phase: 'baseline',
          index: 0,
          total,
          current: null,
          results: [],
          baseline: null,
          best: null,
          bestVerified: false,
          lanes,
          message: null
        })

        const measured = await runMatrix(jobs, { addresses }, () => this.cancelled)
        const blocked = measured.filter((check) => !check.ok && check.state !== 'unsupported').length
        logger.info(`Базовая линия без обхода: ${measured.length - blocked}/${measured.length} целей отвечают`)

        emit({
          status: 'running',
          phase: 'strategies',
          index: 0,
          total,
          current: null,
          results: [],
          baseline: measured,
          best: null,
          bestVerified: false,
          lanes,
          message: null
        })

        if (!this.cancelled) {
          await this.runStrategies(strategies, jobs, addresses, measured, results, lanes, (index, current) => {
            emit({
              status: 'running',
              phase: 'strategies',
              index,
              total,
              current,
              results: naturalSortResults(results),
              baseline: measured,
              best: this.bestOf(results),
              bestVerified: false,
              lanes,
              message: null
            })
          })
        }

        if (!this.cancelled && results.some((result) => result.started)) {
          const verified = await this.verify(results, jobs, addresses, measured, total, lanes)
          picked = verified.best
          pickedVerified = verified.verified
        }
        return { baseline: measured, best: picked, bestVerified: pickedVerified }
      })

      const baseline = outcome.baseline
      const best = outcome.best
      const bestVerified = outcome.bestVerified
      if (this.cancelled) {
        message = 'Тест отменён'
      } else if (best) {
        const bestResult = results.find((result) => result.strategy === best)
        if (bestResult && !bestVerified) {
          message = 'Перепроверка не подтвердила результат — попробуйте ещё раз'
        }
      } else {
        message = 'Не удалось проверить ни одну стратегию'
      }

      emit({
        status: this.cancelled ? 'cancelled' : 'done',
        phase: 'done',
        index: results.length,
        total,
        current: null,
        results: naturalSortResults(results),
        baseline,
        best,
        bestVerified,
        lanes,
        message
      })

      if (!this.cancelled && best) {
        logger.success(`Лучшая стратегия: ${best}${bestVerified ? ' (перепроверена)' : ''}`)
        events.toast(
          'success',
          'Тест завершён',
          `Лучшая: ${best.replace(/\.bat$/i, '')}${bestVerified ? ' · проверена повторно' : ''}`
        )
      } else if (this.cancelled) {
        events.toast('info', 'Тест отменён')
      }
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
      logger.error(`Тест: ${message}`)
      throw error
    } finally {
      await this.cleanupWinws()
      this.currentChildPid = null
      this.testing = false
      if (wasRunning) {
        try {
          await this.zapret.start(previousStrategy)
        } catch (error) {
          logger.warn(`Не удалось вернуть Zapret после теста: ${String(error)}`)
        }
      }
    }
  }

  private async runStrategies(
    strategies: StrategyInfo[],
    jobs: DpiJob[],
    addresses: Map<string, string>,
    baseline: TestCheck[],
    results: TestStrategyResult[],
    lanes: number,
    onProgress: (index: number, current: string | null) => void
  ): Promise<void> {
    const gameFilter = readGameFilter(zapretDir())
    let parallel = lanes > 1

    for (let offset = 0; offset < strategies.length; offset += lanes) {
      if (this.cancelled) break
      const batch = strategies.slice(offset, offset + lanes)

      if (!parallel) {
        for (const item of batch) {
          if (this.cancelled) break
          onProgress(results.length, item.file)
          results.push(await this.testSequential(item, jobs, addresses, baseline, gameFilter))
          onProgress(results.length, item.file)
        }
        continue
      }

      onProgress(results.length, batch.map((item) => item.file.replace(/\.bat$/i, '')).join(' + '))
      const attempted = await this.testBatch(batch, jobs, addresses, baseline, gameFilter)
      results.push(...attempted.results)
      if (attempted.failed.length > 0) {
        // A lane that cannot start is retried alone, so a single broken
        // strategy never spoils the batch.
        for (const item of attempted.failed) {
          if (this.cancelled) break
          results.push(await this.testSequential(item, jobs, addresses, baseline, gameFilter))
          onProgress(results.length, item.file)
        }
      }
      onProgress(results.length, batch[batch.length - 1]?.file ?? null)

      if (attempted.results.length === 0 && batch.length > 1) {
        logger.warn('Параллельные полосы не запустились — продолжаю последовательно')
        parallel = false
      }
    }
  }

  private async testBatch(
    batch: StrategyInfo[],
    jobs: DpiJob[],
    addresses: Map<string, string>,
    baseline: TestCheck[],
    gameFilter: GameFilter
  ): Promise<{ results: TestStrategyResult[]; failed: StrategyInfo[] }> {
    const results: TestStrategyResult[] = []
    const failed: StrategyInfo[] = []
    const lanes: Lane[] = []

    for (let index = 0; index < batch.length; index += 1) {
      const item = batch[index]
      const parsed = parseStrategy(zapretDir(), item.file, gameFilter)
      if (!parsed.valid) {
        results.push(buildResult(item.file, item.label, [], baseline, { valid: false, started: false, error: parsed.error }))
        continue
      }
      // A strategy with its own full WinDivert filter cannot be narrowed to a
      // lane; run it alone instead.
      if (parsed.args.some((arg) => /^--wf-raw(=|$)/i.test(arg))) {
        failed.push(item)
        continue
      }
      const slot = lanes.length
      const base = this.laneBases[slot] ?? this.laneBase + slot * LANE_SPAN
      const filter = buildLaneFilter(base, LANE_SPAN, addresses)
      const pid = await this.startWinws([...parsed.args, `--wf-raw=${filter}`])
      if (!pid) {
        failed.push(item)
        continue
      }
      lanes.push({ item, slot, base, pid })
    }

    if (lanes.length === 0) return { results, failed }

    const alive = new Set((await listProcesses('winws.exe')).map((process) => process.pid))
    const active = lanes.filter((lane) => alive.has(lane.pid))
    for (const lane of lanes) {
      if (!active.includes(lane)) {
        logger.warn(`Полоса ${lane.item.file} завершилась до проверки`)
        failed.push(lane.item)
      }
    }
    if (active.length === 0) {
      await this.cleanupWinws()
      return { results, failed }
    }

    const checks = await Promise.all(
      active.map((lane) =>
        runMatrix(jobs, { addresses, portFor: () => this.nextPort(lane) }, () => this.cancelled)
      )
    )
    const aliveAfter = new Set((await listProcesses('winws.exe')).map((process) => process.pid))
    for (let index = 0; index < active.length; index += 1) {
      const lane = active[index]
      if (!aliveAfter.has(lane.pid)) {
        logger.warn(`Полоса ${lane.item.file} упала во время проверки — перепроверю отдельно`)
        failed.push(lane.item)
        continue
      }
      results.push(buildResult(lane.item.file, lane.item.label, checks[index], baseline))
    }
    await this.cleanupWinws()
    return { results, failed }
  }

  private async testSequential(
    item: StrategyInfo,
    jobs: DpiJob[],
    addresses: Map<string, string>,
    baseline: TestCheck[],
    gameFilter: GameFilter
  ): Promise<TestStrategyResult> {
    const parsed = parseStrategy(zapretDir(), item.file, gameFilter)
    if (!parsed.valid) {
      return buildResult(item.file, item.label, [], baseline, { valid: false, started: false, error: parsed.error })
    }
    await this.cleanupWinws()
    const pid = await this.startWinws(parsed.args)
    if (!pid) {
      return buildResult(item.file, item.label, [], baseline, {
        started: false,
        error: 'winws.exe не запустился'
      })
    }
    await sleep(100)
    const checks = await runMatrix(jobs, { addresses }, () => this.cancelled)
    await this.cleanupWinws()
    return buildResult(item.file, item.label, checks, baseline)
  }

  private async verify(
    results: TestStrategyResult[],
    jobs: DpiJob[],
    addresses: Map<string, string>,
    baseline: TestCheck[],
    total: number,
    lanes: number
  ): Promise<{ best: string | null; verified: boolean }> {
    const candidates = naturalSortResults(results.filter((result) => result.started)).slice(0, 3)
    const baseBlocked = baselineBlocked(baseline)
    const gameFilter = readGameFilter(zapretDir())

    for (const candidate of candidates) {
      if (this.cancelled) break
      emit({
        status: 'running',
        phase: 'verify',
        index: results.length,
        total,
        current: candidate.strategy,
        results: naturalSortResults(results),
        baseline,
        best: candidate.strategy,
        bestVerified: false,
        lanes,
        message: null
      })

      const item: StrategyInfo = {
        file: candidate.strategy,
        label: candidate.label,
        valid: true,
        methods: ''
      }
      const verified = await this.testSequential(item, jobs, addresses, baseline, gameFilter)
      const passed = baseBlocked > 0
        ? verified.started && verified.fixed >= 1 && verified.broken <= 1
        : verified.started && verified.broken === 0

      logger.info(
        `Перепроверка ${candidate.strategy}: ok=${verified.ok}/${verified.total}, fixed=${verified.fixed}, broken=${verified.broken} — ${passed ? 'ок' : 'не прошла'}`
      )
      if (passed) {
        verified.verified = true
        const index = results.findIndex((result) => result.strategy === candidate.strategy)
        if (index >= 0) results[index] = verified
        return { best: candidate.strategy, verified: true }
      }
    }

    return { best: candidates[0]?.strategy ?? null, verified: false }
  }

  private bestOf(results: TestStrategyResult[]): string | null {
    const started = results.filter((result) => result.started)
    if (started.length === 0) return null
    return naturalSortResults(started)[0]?.strategy ?? null
  }

  /** Picks a source-port range that is not excluded or dynamic on this machine. */
  private async pickLaneBase(): Promise<number> {
    const excluded = await this.excludedPorts()
    const dynamic = await this.dynamicPorts()
    for (const base of LANE_BASES) {
      const spans = Array.from({ length: LANE_COUNT }, (_, index) => ({
        from: base + index * LANE_SPAN,
        to: base + index * LANE_SPAN + LANE_SPAN - 1
      }))
      const overlaps = (from: number, to: number): boolean => spans.some((span) => span.from <= to && from <= span.to)
      if (excluded.some((range) => overlaps(range.from, range.to))) continue
      if (dynamic && overlaps(dynamic.from, dynamic.to)) continue
      return base
    }
    return LANE_BASES[0]
  }

  private async excludedPorts(): Promise<Array<{ from: number; to: number }>> {
    const output = await run('netsh.exe', ['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'], {
      timeout: 4000
    })
    const ranges: Array<{ from: number; to: number }> = []
    for (const line of output.stdout.split(/\r?\n/)) {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s*$/)
      if (match) ranges.push({ from: Number(match[1]), to: Number(match[2]) })
    }
    return ranges
  }

  private async dynamicPorts(): Promise<{ from: number; to: number } | null> {
    const output = await run('netsh.exe', ['interface', 'ipv4', 'show', 'dynamicport', 'tcp'], { timeout: 4000 })
    const numbers = Array.from(output.stdout.matchAll(/:\s*(\d+)\s*$/gm)).map((match) => Number(match[1]))
    if (numbers.length < 2) return null
    const from = numbers[0]
    const to = from + numbers[1] - 1
    return { from, to }
  }

  private nextPort(lane: Lane): number {
    // Ports are never reused during one run: a used client port sits in
    // TIME_WAIT for two minutes and binding it again would fail.
    const index = this.laneCursors[lane.slot] ?? 0
    this.laneCursors[lane.slot] = index + 1
    return lane.base + (index % LANE_SPAN)
  }

  private async startWinws(args: string[]): Promise<number | null> {
    ensureDir(logsDir())
    let logFd: number | null = null
    try {
      logFd = openSync(join(logsDir(), 'winws.log'), 'a')
    } catch {
      logFd = null
    }
    const child = spawn(join(zapretBinDir(), 'winws.exe'), args, {
      cwd: zapretBinDir(),
      windowsHide: true,
      detached: true,
      stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'],
      env: { ...process.env, NO_UPDATE_CHECK: '1' }
    })
    if (logFd !== null) closeSync(logFd)
    this.currentChildPid = child.pid ?? null
    child.on('error', (error) => {
      logger.warn(`Тест: не удалось запустить winws.exe: ${String(error)}`)
    })
    child.unref()

    const pid = child.pid
    if (!pid) return null

    const deadline = Date.now() + START_TIMEOUT_MS
    while (Date.now() < deadline) {
      if ((await listProcesses('winws.exe')).some((process) => process.pid === pid)) {
        await sleep(WARMUP_MS)
        const alive = (await listProcesses('winws.exe')).some((process) => process.pid === pid)
        return alive ? pid : null
      }
      await sleep(150)
    }
    return null
  }

  private async cleanupWinws(): Promise<void> {
    const pids = (await listProcesses('winws.exe')).map((process) => process.pid)
    for (const pid of pids) await killProcess(pid)
    await killImage('winws.exe')
    await sleep(300)
  }

  /**
   * The 16-20 test only makes sense for every destination, not just the IPs in
   * the user's list. The original tool clears the list for the run as well.
   */
  private async withIpsetAny<T>(fn: () => Promise<T>): Promise<T> {
    const lists = join(zapretDir(), 'lists')
    ensureDir(lists)
    const list = join(lists, 'ipset-all.txt')
    const backup = join(lists, 'ipset-all.test-backup.txt')

    if (existsSync(backup)) {
      // A previous run was interrupted; put the real list back first.
      try {
        if (existsSync(list)) rmSync(list, { force: true })
        renameSync(backup, list)
        logger.warn('Восстановлен список IP после прерванного теста')
      } catch {
        /* keep going */
      }
    }

    let original: Buffer | null = null
    const hadList = existsSync(list)
    try {
      original = hadList ? readFileSync(list) : null
      copyFileSync(list, backup)
    } catch {
      if (original) writeFileSync(backup, original)
      else writeFileSync(backup, Buffer.alloc(0))
    }
    writeFileSync(list, '')

    try {
      return await fn()
    } finally {
      try {
        if (!hadList) {
          rmSync(backup, { force: true })
          rmSync(list, { force: true })
        } else if (existsSync(backup)) {
          if (existsSync(list)) rmSync(list, { force: true })
          renameSync(backup, list)
        } else if (original) {
          writeFileSync(list, original)
        }
      } catch (error) {
        logger.warn(`Не удалось вернуть список IP: ${String(error)}`)
      }
    }
  }
}

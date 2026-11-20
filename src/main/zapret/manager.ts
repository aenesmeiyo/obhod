import { spawn, type ChildProcess } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import type {
  GameFilter,
  IpsetMode,
  ProgressEvent,
  StrategyInfo,
  ZapretInfo
} from '@shared/types'
import { downloadsDir, ensureDir, logsDir, zapretDir, zapretBinDir } from '../paths'
import { getState, updateState } from '../store'
import { logger } from '../logger'
import { events } from '../events'
import { downloadFile } from '../download'
import { getLatestRelease, pickZapretAsset, ZAPRET_REPO, type Release } from '../github'
import {
  findProcessPid,
  isElevated,
  killProcess,
  killImage,
  run,
  sleep,
  waitFor
} from '../proc'
import { listStrategies, parseStrategy, type ParsedStrategy } from './strategy'
import {
  ensureUserLists,
  installIpsetContent,
  readGameFilter,
  readIpsetMode,
  setIpsetMode,
  writeGameFilter
} from './settings'

const ZAPRET_PROCESS = 'winws.exe'
const IPSET_URL =
  'https://raw.githubusercontent.com/Flowseal/zapret-discord-youtube/main/.service/ipset-service.txt'
const USER_FILES = [
  'lists/list-general-user.txt',
  'lists/list-exclude-user.txt',
  'lists/ipset-exclude-user.txt',
  'lists/ipset-all.txt',
  'lists/ipset-all.txt.backup'
]

function readLocalVersion(rootDir: string): string | null {
  try {
    const text = readFileSync(join(rootDir, 'service.bat'), 'utf8')
    const match = text.match(/LOCAL_VERSION=([^\s"]+)/i)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

export class ZapretManager {
  private child: ChildProcess | null = null
  private pid: number | null = null
  private running = false
  private pollTimer: NodeJS.Timeout | null = null
  private pollBusy = false
  private cachedStrategies: StrategyInfo[] | null = null
  private busy = false

  init(): void {
    this.syncVersion()
    if (this.isInstalled()) ensureUserLists(zapretDir())
    this.pollTimer = setInterval(() => {
      void this.poll()
    }, 2500)
    void this.poll()
  }

  dispose(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  get isRunning(): boolean {
    return this.running
  }

  get rootDir(): string {
    return zapretDir()
  }

  isInstalled(): boolean {
    return existsSync(join(zapretDir(), 'service.bat')) && existsSync(join(zapretBinDir(), 'winws.exe'))
  }

  syncVersion(): void {
    if (!this.isInstalled()) {
      if (getState().zapret.version !== null) {
        updateState((state) => {
          state.zapret.version = null
        })
      }
      return
    }
    const version = readLocalVersion(zapretDir())
    if (version && version !== getState().zapret.version) {
      updateState((state) => {
        state.zapret.version = version
      })
      events.state()
    }
  }

  private async poll(): Promise<void> {
    if (this.pollBusy) return
    this.pollBusy = true
    try {
      const pid = await findProcessPid(ZAPRET_PROCESS)
      const running = pid !== null
      if (running !== this.running || pid !== this.pid) {
        this.running = running
        this.pid = pid
        if (!running) this.child = null
        events.state()
      }
    } finally {
      this.pollBusy = false
    }
  }

  getStrategies(force = false): StrategyInfo[] {
    if (force || !this.cachedStrategies) {
      if (!this.isInstalled()) {
        this.cachedStrategies = []
      } else {
        this.cachedStrategies = listStrategies(zapretDir(), readGameFilter(zapretDir()))
      }
    }
    return this.cachedStrategies
  }

  getInfo(): ZapretInfo {
    const state = getState()
    this.syncVersionQuiet()
    return {
      installed: this.isInstalled(),
      version: this.isInstalled() ? state.zapret.version : null,
      path: this.isInstalled() ? zapretDir() : null,
      running: this.running,
      pid: this.pid,
      strategy: this.resolveStrategy(state.zapret.strategy),
      strategies: this.getStrategies(),
      gameFilter: this.isInstalled() ? readGameFilter(zapretDir()) : state.zapret.gameFilter,
      ipsetMode: this.isInstalled() ? readIpsetMode(zapretDir()) : 'none',
      autoUpdate: state.zapret.autoUpdate,
      update: state.zapret.update,
      busy: this.busy,
      error: null
    }
  }

  private syncVersionQuiet(): void {
    if (!this.isInstalled()) return
    const version = readLocalVersion(zapretDir())
    if (version && version !== getState().zapret.version) {
      updateState((state) => {
        state.zapret.version = version
      })
    }
  }

  private resolveStrategy(requested: string): string {
    const available = this.getStrategies().map((item) => item.file)
    if (available.includes(requested)) return requested
    return available.includes('general.bat') ? 'general.bat' : (available[0] ?? requested)
  }

  private parse(strategy: string): ParsedStrategy {
    const gameFilter = readGameFilter(zapretDir())
    const parsed = parseStrategy(zapretDir(), strategy, gameFilter)
    if (!parsed.valid) {
      throw new Error(`Стратегия «${strategy}» не запускается: ${parsed.error ?? 'неизвестная ошибка'}`)
    }
    return parsed
  }

  async start(strategy?: string): Promise<void> {
    if (!this.isInstalled()) throw new Error('Zapret не установлен')
    if (!(await isElevated())) throw new Error('Нужны права администратора: перезапустите «Обход» от имени администратора')
    if (this.busy) throw new Error('Дождитесь завершения текущей операции')

    const file = this.resolveStrategy(strategy ?? getState().zapret.strategy)
    ensureUserLists(zapretDir())
    const parsed = this.parse(file)
    await this.stop(true)

    const winwsLog = join(logsDir(), 'winws.log')
    ensureDir(logsDir())
    let logFd: number | null = null
    try {
      logFd = openSync(winwsLog, 'a')
    } catch {
      logFd = null
    }
    const child = spawn(join(zapretBinDir(), 'winws.exe'), parsed.args, {
      cwd: zapretBinDir(),
      windowsHide: true,
      detached: true,
      stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'],
      env: { ...process.env, NO_UPDATE_CHECK: '1' }
    })
    if (logFd !== null) closeSync(logFd)
    this.child = child
    child.on('error', (error) => {
      logger.error(`Не удалось запустить winws.exe: ${String(error)}`)
    })
    child.on('exit', (code) => {
      if (this.pid === child.pid && (this.running || this.busy)) {
        logger.warn(`winws.exe завершился с кодом ${code ?? '?'}`)
      }
    })
    child.unref()

    const started = await waitFor(async () => {
      const pid = await findProcessPid(ZAPRET_PROCESS)
      return pid ?? false
    }, 3500, 250)

    if (!started) {
      await killImage(ZAPRET_PROCESS)
      const details = this.readZapretLogTail()
      throw new Error(
        `winws.exe не запустился.${details ? `\n${details}` : ' Проверьте права администратора и антивирус.'}`
      )
    }

    this.pid = started
    this.running = true
    updateState((state) => {
      state.zapret.strategy = file
    })
    logger.success(`Zapret запущен: ${file}`)
    events.toast('success', 'Обход включён', file.replace(/\.bat$/i, ''))
    events.state()
  }

  private readZapretLogTail(): string {
    try {
      const path = join(logsDir(), 'winws.log')
      if (!existsSync(path)) return ''
      const content = readFileSync(path, 'utf8')
      const lines = content.trim().split(/\r?\n/)
      return lines.slice(-6).join('\n')
    } catch {
      return ''
    }
  }

  async stop(silent = false): Promise<void> {
    const pid = this.pid ?? (await findProcessPid(ZAPRET_PROCESS))
    if (pid) {
      await killProcess(pid)
      await sleep(250)
      const still = await findProcessPid(ZAPRET_PROCESS)
      if (still) await killImage(ZAPRET_PROCESS)
    }
    this.pid = null
    this.running = false
    this.child = null
    if (!silent) {
      logger.info('Zapret остановлен')
      events.state()
    } else {
      events.state()
    }
  }

  async setStrategy(file: string): Promise<void> {
    const strategies = this.getStrategies().map((item) => item.file)
    if (!strategies.includes(file)) throw new Error('Такой стратегии нет в установленной версии')
    const wasRunning = this.running
    updateState((state) => {
      state.zapret.strategy = file
    })
    if (wasRunning) {
      await this.stop(true)
      await this.start(file)
    }
    events.state()
  }

  async setGameFilter(filter: GameFilter): Promise<void> {
    if (!this.isInstalled()) throw new Error('Zapret не установлен')
    const normalized = writeGameFilter(zapretDir(), filter)
    updateState((state) => {
      state.zapret.gameFilter = normalized
    })
    this.cachedStrategies = null
    const wasRunning = this.running
    if (wasRunning) {
      await this.stop(true)
      await this.start()
    }
    events.toast('success', 'Game Filter сохранён', this.describeFilter(normalized))
    events.state()
  }

  private describeFilter(filter: GameFilter): string {
    if (filter.mode === 'disabled') return 'Выключен'
    if (filter.mode === 'all') return `TCP ${filter.tcpRange} · UDP ${filter.udpRange}`
    if (filter.mode === 'tcp') return `TCP ${filter.tcpRange}`
    return `UDP ${filter.udpRange}`
  }

  async setIpsetMode(mode: IpsetMode): Promise<void> {
    if (!this.isInstalled()) throw new Error('Zapret не установлен')
    setIpsetMode(zapretDir(), mode)
    const labels: Record<IpsetMode, string> = {
      loaded: 'список загружен',
      none: 'список отключён',
      any: 'любые IP'
    }
    if (this.running) {
      await this.stop(true)
      await this.start()
    }
    events.toast('success', 'IPSet обновлён', labels[mode])
    events.state()
  }

  async updateIpset(): Promise<void> {
    if (!this.isInstalled()) throw new Error('Zapret не установлен')
    events.progress({
      kind: 'ipset',
      phase: 'download',
      percent: 10,
      received: 0,
      total: 0,
      speed: 0,
      label: 'Обновление списка IP'
    })
    const response = await fetch(IPSET_URL, {
      headers: { 'User-Agent': 'Obhod/1.0' },
      signal: AbortSignal.timeout(20_000)
    })
    if (!response.ok) throw new Error(`Не удалось скачать список IP: HTTP ${response.status}`)
    const content = await response.text()
    if (!content.trim()) throw new Error('Сервер вернул пустой список IP')
    installIpsetContent(zapretDir(), content)
    if (this.running) {
      await this.stop(true)
      await this.start()
    }
    events.progress({
      kind: 'ipset',
      phase: 'done',
      percent: 100,
      received: content.length,
      total: content.length,
      speed: 0,
      label: 'Список IP обновлён'
    })
    events.toast('success', 'Список IP обновлён', `${content.split(/\r?\n/).length} строк`)
    events.state()
  }

  async install(release?: Release): Promise<void> {
    if (this.busy) throw new Error('Установка уже идёт')
    this.busy = true
    events.state()
    try {
      const target = release ?? (await getLatestRelease(ZAPRET_REPO, true))
      if (!target) throw new Error('Не удалось получить информацию о последней версии Zapret')
      const asset = pickZapretAsset(target)
      if (!asset) throw new Error('В релизе нет zip-архива')

      ensureDir(downloadsDir())
      const zipPath = join(downloadsDir(), `zapret-${target.tag}.zip`)
      const emit = (phase: ProgressEvent['phase'], percent: number, label: string, detail?: string): void => {
        events.progress({
          kind: 'zapret',
          phase,
          percent,
          received: 0,
          total: 0,
          speed: 0,
          label,
          detail
        })
      }

      await downloadFile(asset.url, zipPath, {
        kind: 'zapret',
        label: `Zapret ${target.tag}`,
        onProgress: (progress) => {
          events.progress({ ...progress, percent: Math.round(progress.percent * 0.72) })
        }
      })

      emit('extract', 76, 'Распаковка архива')
      const tempRoot = join(downloadsDir(), `zapret-tmp-${Date.now()}`)
      rmSync(tempRoot, { recursive: true, force: true })
      mkdirSync(tempRoot, { recursive: true })
      const zip = new AdmZip(zipPath)
      zip.extractAllTo(tempRoot, true)

      const entries = readdirSync(tempRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      let root = tempRoot
      for (const entry of entries) {
        if (existsSync(join(tempRoot, entry.name, 'service.bat'))) {
          root = join(tempRoot, entry.name)
          break
        }
      }
      if (!existsSync(join(root, 'service.bat')) || !existsSync(join(root, 'bin', 'winws.exe'))) {
        throw new Error('Архив повреждён: не найдены service.bat и bin/winws.exe')
      }

      const preservedFilter = existsSync(join(zapretDir(), 'utils', 'game_filter.enabled'))
        ? readFileSync(join(zapretDir(), 'utils', 'game_filter.enabled'))
        : null
      const preservedUsers = new Map<string, Buffer>()
      for (const relative of USER_FILES) {
        const path = join(zapretDir(), relative)
        if (existsSync(path)) preservedUsers.set(relative, readFileSync(path))
      }
      const wasRunning = this.running
      if (wasRunning) await this.stop(true)

      emit('install', 88, 'Замена файлов')
      const oldDir = join(zapretDir(), '..', `.zapret-old-${Date.now()}`)
      if (existsSync(zapretDir())) renameSync(zapretDir(), oldDir)
      try {
        renameSync(root, zapretDir())
      } catch (error) {
        if (existsSync(oldDir) && !existsSync(zapretDir())) renameSync(oldDir, zapretDir())
        throw error
      }
      rmSync(oldDir, { recursive: true, force: true })

      if (preservedFilter) {
        ensureDir(join(zapretDir(), 'utils'))
        writeFileSync(join(zapretDir(), 'utils', 'game_filter.enabled'), preservedFilter)
      }
      for (const [relative, content] of preservedUsers) {
        ensureDir(join(zapretDir(), relative.split(/[\\/]/).slice(0, -1).join('/')))
        writeFileSync(join(zapretDir(), relative), content)
      }
      ensureUserLists(zapretDir())

      this.cachedStrategies = null
      const strategy = this.resolveStrategy(getState().zapret.strategy)
      updateState((state) => {
        state.zapret.version = target.tag
        state.zapret.strategy = strategy
        state.zapret.gameFilter = readGameFilter(zapretDir())
        state.zapret.update = {
          ...state.zapret.update,
          current: target.tag,
          latest: target.tag,
          available: false,
          checkedAt: Date.now()
        }
      })
      rmSync(tempRoot, { recursive: true, force: true })
      rmSync(zipPath, { force: true })

      emit('done', 100, 'Готово')
      logger.success(`Zapret ${target.tag} установлен`)
      events.toast('success', 'Zapret установлен', `Версия ${target.tag}`)
      this.busy = false
      events.state()

      if (wasRunning) {
        try {
          await this.start()
        } catch (error) {
          logger.warn(`Не удалось перезапустить Zapret после обновления: ${String(error)}`)
        }
      }
    } catch (error) {
      this.busy = false
      events.progress({
        kind: 'zapret',
        phase: 'error',
        percent: 0,
        received: 0,
        total: 0,
        speed: 0,
        label: 'Ошибка установки',
        detail: String(error)
      })
      events.state()
      throw error
    }
  }

  async remove(): Promise<void> {
    await this.stop(true)
    rmSync(zapretDir(), { recursive: true, force: true })
    this.cachedStrategies = null
    updateState((state) => {
      state.zapret.version = null
      state.zapret.strategy = 'general.bat'
    })
    events.toast('info', 'Zapret удалён')
    events.state()
  }

  setAutoUpdate(enabled: boolean): void {
    updateState((state) => {
      state.zapret.autoUpdate = enabled
    })
    events.state()
  }

  async runDiagnostics(): Promise<import('@shared/types').DiagnosticsResult> {
    const items: import('@shared/types').DiagnosticsItem[] = []
    const add = (level: 'ok' | 'warn' | 'error', title: string, detail?: string): void => {
      items.push({ level, title, detail })
    }

    if (await isElevated()) add('ok', 'Права администратора')
    else add('error', 'Нет прав администратора', 'Zapret не сможет запуститься')

    const bfe = await run('sc.exe', ['query', 'BFE'])
    if (/RUNNING/i.test(bfe.stdout)) add('ok', 'Base Filtering Engine работает')
    else add('error', 'Base Filtering Engine не запущен', 'Служба BFE обязательна для Zapret')

    const tcp = await run('netsh.exe', ['interface', 'tcp', 'show', 'global'])
    if (/timestamps.*enabled/i.test(tcp.stdout)) add('ok', 'TCP timestamps включены')
    else add('warn', 'TCP timestamps выключены', 'Можно включить командой netsh')

    const windivert = await run('sc.exe', ['query', 'WinDivert'])
    if (/RUNNING|STOP_PENDING/i.test(windivert.stdout) && !this.running) {
      add('warn', 'Служба WinDivert активна, но winws не запущен', 'Перезапустите обход или ПК')
    } else {
      add('ok', 'WinDivert в норме')
    }

    const proxy = await run('reg.exe', [
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '/v',
      'ProxyEnable'
    ])
    if (/0x1/.test(proxy.stdout)) add('warn', 'Включён системный прокси', 'Проверьте, что он рабочий')
    else add('ok', 'Системный прокси выключен')

    const adguard = await run('tasklist.exe', ['/FI', 'IMAGENAME eq AdguardSvc.exe', '/NH'])
    if (/AdguardSvc/i.test(adguard.stdout)) add('warn', 'AdGuard может мешать Discord')
    else add('ok', 'AdGuard не найден')

    const killer = await run('sc.exe', ['query'])
    if (/Killer/i.test(killer.stdout)) add('warn', 'Службы Killer конфликтуют с Zapret')
    else add('ok', 'Killer не найден')

    if (/[а-яё]/i.test(zapretDir())) {
      add('warn', 'Путь содержит кириллицу', 'Если обход не работает, перенесите данные в C:\\Obhod')
    } else {
      add('ok', 'Путь без кириллицы')
    }

    const hosts = readFileSafe(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts'))
    if (/youtube\.com|youtu\.be/i.test(hosts)) add('warn', 'В hosts есть записи YouTube')
    else add('ok', 'hosts без записей YouTube')

    if (this.isInstalled()) add('ok', 'Zapret установлен', `Версия ${readLocalVersion(zapretDir()) ?? '?'}`)
    else add('error', 'Zapret не установлен')

    return { items, checkedAt: Date.now() }
  }
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

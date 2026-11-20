export type GameFilterMode = 'disabled' | 'all' | 'tcp' | 'udp'
export type IpsetMode = 'loaded' | 'none' | 'any'
export type ComponentId = 'zapret' | 'tgws'
export type ProgressKind = 'zapret' | 'tgws' | 'update-zapret' | 'update-tgws' | 'ipset'

export interface GameFilter {
  mode: GameFilterMode
  tcpRange: string
  udpRange: string
}

export interface StrategyInfo {
  /** File name, for example "general (ALT3).bat" */
  file: string
  /** Human readable label without extension and "general" prefix */
  label: string
  /** Whether the winws.exe command line could be parsed */
  valid: boolean
  /** Short summary of the desync methods used */
  methods: string
}

export interface ZapretInfo {
  installed: boolean
  version: string | null
  path: string | null
  running: boolean
  pid: number | null
  strategy: string
  strategies: StrategyInfo[]
  gameFilter: GameFilter
  ipsetMode: IpsetMode
  autoUpdate: boolean
  update: UpdateInfo
  busy: boolean
  error: string | null
}

export interface TgwsInfo {
  installed: boolean
  version: string | null
  path: string | null
  running: boolean
  pid: number | null
  port: number
  secret: string
  link: string
  autoUpdate: boolean
  update: UpdateInfo
  busy: boolean
  error: string | null
}

export interface UpdateInfo {
  current: string | null
  latest: string | null
  available: boolean
  url: string
  checkedAt: number | null
  checking: boolean
}

export interface UiSettings {
  minimizeToTray: boolean
  launchAtLogin: boolean
  checkUpdatesOnLaunch: boolean
}

export interface AppState {
  ready: boolean
  elevated: boolean
  appVersion: string
  zapret: ZapretInfo
  tgws: TgwsInfo
  ui: UiSettings
  testing: boolean
  diagnosticsRunning: boolean
  dataDir: string
}

export interface ProgressEvent {
  kind: ProgressKind
  phase: 'prepare' | 'download' | 'extract' | 'install' | 'remove' | 'done' | 'error'
  percent: number
  received: number
  total: number
  speed: number
  label: string
  detail?: string
}

export interface ToastEvent {
  id: string
  kind: 'info' | 'success' | 'error'
  title: string
  message?: string
}

export interface TestCheck {
  target: string
  ok: boolean
  status: string
  ms: number
}

export interface TestStrategyResult {
  strategy: string
  label: string
  valid: boolean
  started: boolean
  ok: number
  total: number
  pingOk: number
  pingTotal: number
  avgMs: number
  checks: TestCheck[]
  error?: string
}

export interface TestProgress {
  status: 'running' | 'done' | 'cancelled' | 'error'
  index: number
  total: number
  current: string | null
  results: TestStrategyResult[]
  best: string | null
  message: string | null
}

export interface DiagnosticsItem {
  level: 'ok' | 'warn' | 'error'
  title: string
  detail?: string
}

export interface DiagnosticsResult {
  items: DiagnosticsItem[]
  checkedAt: number
}

export interface LogLine {
  time: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

export type NavTarget = 'home' | 'test' | 'settings'

export interface ObhodApi {
  getState(): Promise<AppState>
  getLogs(): Promise<LogLine[]>
  onState(cb: (state: AppState) => void): () => void
  onProgress(cb: (progress: ProgressEvent) => void): () => void
  onTestProgress(cb: (progress: TestProgress) => void): () => void
  onToast(cb: (toast: ToastEvent) => void): () => void
  onLog(cb: (line: LogLine) => void): () => void
  onNavigate(cb: (target: NavTarget) => void): () => void

  installZapret(): Promise<void>
  removeZapret(): Promise<void>
  startZapret(): Promise<void>
  stopZapret(): Promise<void>
  setStrategy(strategy: string): Promise<void>
  setGameFilter(filter: GameFilter): Promise<void>
  setIpsetMode(mode: IpsetMode): Promise<void>
  updateIpset(): Promise<void>
  runDiagnostics(): Promise<DiagnosticsResult>
  checkUpdates(force?: boolean): Promise<void>
  applyUpdate(component: ComponentId): Promise<void>

  installTgws(): Promise<void>
  removeTgws(): Promise<void>
  startTgws(): Promise<void>
  stopTgws(): Promise<void>
  setTgwsPort(port: number): Promise<void>
  openTelegram(): Promise<void>
  copyTelegramLink(): Promise<void>

  runTest(): Promise<void>
  cancelTest(): Promise<void>
  applyBestStrategy(strategy: string): Promise<void>

  setUiSettings(patch: Partial<UiSettings>): Promise<void>
  setAutoUpdate(component: ComponentId, enabled: boolean): Promise<void>
  openFolder(which: 'zapret' | 'tgws' | 'data' | 'logs'): Promise<void>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  windowMinimize(): void
  windowClose(): void
  windowHideToTray(): void
  quit(): void
  relaunchElevated(): Promise<void>
  debugParse?(file: string): Promise<unknown>
  debugEmitTest?(): Promise<unknown>
  debugShowUpdate?(): Promise<unknown>
}

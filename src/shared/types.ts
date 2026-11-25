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
  /** Test several strategies at once using source-port-scoped winws lanes. */
  parallelTest: boolean
}

export interface AppUpdateInfo {
  current: string
  latest: string | null
  available: boolean
  downloading: boolean
  downloaded: boolean
  percent: number
  checkedAt: number | null
  error: string | null
}

export interface AppState {
  ready: boolean
  elevated: boolean
  appVersion: string
  appUpdate: AppUpdateInfo
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

export type TestState = 'ok' | 'frozen' | 'blocked' | 'unsupported' | 'error'
export type TestGroup = 'service' | 'freeze' | 'control'
export type TestMode = 'tls12' | 'tls13'

/**
 * One TCP 16-20 freeze check: a 64 KB POST over TLS. The censor freezes a
 * connection after ~25 packets (~16-20 KB) in either direction, so a blocked
 * target accepts bytes and then never answers.
 */
export interface TestCheck {
  target: string
  host: string
  group: TestGroup
  mode: TestMode
  ok: boolean
  state: TestState
  /** Short human-readable verdict: "HTTP 404", "ЗАМОРОЗКА", "HELLO TIMEOUT"... */
  status: string
  ms: number
  code: number | null
  upBytes: number
  downBytes: number
  /** Baseline verdict on the same target, when known. */
  before?: 'ok' | 'bad'
}

export interface TestStrategyResult {
  strategy: string
  label: string
  valid: boolean
  started: boolean
  /** Checks that returned an HTTP response. */
  ok: number
  total: number
  /** Connections that accepted data but never answered (the 16-20 signature). */
  frozen: number
  /** Other failed checks (RST, TLS error, DNS). */
  failed: number
  /** Targets broken by default that this strategy restored. */
  fixed: number
  /** Targets that worked by default and still work. */
  kept: number
  /** Targets that worked by default and this strategy broke. */
  broken: number
  /** Ranking score: fixed*3 + kept - broken*3. */
  score: number
  avgMs: number
  checks: TestCheck[]
  /** The best strategy is re-checked a second time after screening. */
  verified?: boolean
  error?: string
}

export interface TestProgress {
  status: 'running' | 'done' | 'cancelled' | 'error'
  phase: 'baseline' | 'strategies' | 'verify' | 'done'
  index: number
  total: number
  current: string | null
  results: TestStrategyResult[]
  /** Results measured with Zapret stopped, used as the comparison point. */
  baseline: TestCheck[] | null
  best: string | null
  bestVerified: boolean
  /** How many strategies were tested simultaneously (1 = sequential). */
  lanes: number
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
  checkAppUpdate(force?: boolean): Promise<void>
  downloadAppUpdate(): Promise<void>
  installAppUpdate(): Promise<void>

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

import { randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import type { TestCheck, TestGroup, TestMode, TestStrategyResult } from '@shared/types'

/**
 * TCP 16-20 freeze checker.
 *
 * The censor in Russia freezes a TCP connection after roughly 25 packets
 * (~16-20 KB) have travelled in either direction on it: the handshake and the
 * first kilobytes pass, then the peer stops answering. That is why a normal
 * HEAD request to YouTube looks "ok" while the video stalls.
 *
 * We reproduce the original dpi-checkers test: POST 64 KB of random data over
 * TLS and wait for any HTTP response. A frozen connection uploads bytes and
 * never answers; a working one returns headers. See
 * https://github.com/hyperion-cs/dpi-checkers and net4people/bbs#490.
 */
export const DPI_BODY_BYTES = 64 * 1024
export const DPI_TIMEOUT_MS = 5000
const DPI_CONCURRENCY = 24
const SUITE_URL = 'https://hyperion-cs.github.io/dpi-checkers/ru/tcp-16-20/suite.v2.json'
const SUITE_LIMIT = 8
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const payload = randomBytes(DPI_BODY_BYTES)

export interface DpiHost {
  host: string
  label: string
  group: TestGroup
  provider?: string
}

export interface DpiJob {
  host: DpiHost
  mode: TestMode
}

/**
 * Resolves every target once. All strategies are then measured against the
 * same server IP, which keeps CDN balancing from changing the comparison
 * between runs. The IP is also used to scope the parallel lane filters.
 */
export async function resolveTargets(jobs: DpiJob[]): Promise<Map<string, string>> {
  const hosts = Array.from(new Set(jobs.map((job) => job.host.host)))
  const addresses = new Map<string, string>()
  await Promise.all(
    hosts.map(async (host) => {
      try {
        const result = await Promise.race([
          lookup(host, { family: 4, all: true }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('dns timeout')), 3000))
        ])
        const address = result[0]?.address
        if (address) addresses.set(host, address)
      } catch {
        /* the check itself will report the DNS error */
      }
    })
  )
  return addresses
}

/** Services the user actually cares about. */
export const SERVICE_HOSTS: DpiHost[] = [
  { host: 'discord.com', label: 'Discord', group: 'service' },
  { host: 'gateway.discord.gg', label: 'Discord Gateway', group: 'service' },
  { host: 'cdn.discordapp.com', label: 'Discord CDN', group: 'service' },
  { host: 'www.youtube.com', label: 'YouTube', group: 'service' },
  { host: 'i.ytimg.com', label: 'YouTube Images', group: 'service' },
  { host: 'redirector.googlevideo.com', label: 'YouTube Video', group: 'service' }
]

/** A host that normally works: catches strategies that break healthy traffic. */
export const CONTROL_HOST: DpiHost = { host: 'www.google.com', label: 'Google (контроль)', group: 'control' }

/** Used when the online suite cannot be fetched. */
export const FALLBACK_FREEZE_HOSTS: DpiHost[] = [
  { host: '5fd8bdae.nip.io', label: 'Hetzner', group: 'freeze', provider: 'Hetzner' },
  { host: 'www.mobil.com.se', label: 'Akamai', group: 'freeze', provider: 'Akamai' },
  { host: 'esm.sh', label: 'Cloudflare', group: 'freeze', provider: 'Cloudflare' },
  { host: 'ssl.p.jwpcdn.com', label: 'Fastly', group: 'freeze', provider: 'Fastly' },
  { host: 'ui-arts.com', label: 'DigitalOcean', group: 'freeze', provider: 'DigitalOcean' },
  { host: 'www.emca.be', label: 'OVH', group: 'freeze', provider: 'OVH' },
  { host: 'cdn.eso.org', label: 'CDN77', group: 'freeze', provider: 'CDN77' },
  { host: 'gcore.com', label: 'Gcore', group: 'freeze', provider: 'Gcore' }
]

/**
 * The original suite is public and updated by the dpi-checkers authors, so it
 * is fetched once per test. One host per provider keeps the matrix diverse.
 */
export async function loadFreezeHosts(limit = SUITE_LIMIT): Promise<DpiHost[]> {
  try {
    const response = await fetch(SUITE_URL, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as Array<{ provider?: string; host?: string; country?: string }>
    const hosts: DpiHost[] = []
    const providers = new Set<string>()
    for (const item of data) {
      if (!item.host || !/^[a-z0-9][a-z0-9.-]*$/i.test(item.host)) continue
      const provider = (item.provider || item.host).trim()
      if (providers.has(provider)) continue
      providers.add(provider)
      const country = (item.country || '').trim()
      hosts.push({
        host: item.host,
        label: country ? `${provider} ${country}` : provider,
        group: 'freeze',
        provider
      })
      if (hosts.length >= limit) break
    }
    return hosts.length > 0 ? hosts : FALLBACK_FREEZE_HOSTS
  } catch {
    return FALLBACK_FREEZE_HOSTS
  }
}

/**
 * Service targets are checked with TLS 1.3 and TLS 1.2 (strategies often parse
 * only one of them). The generic freeze suite only needs TLS 1.3, like the
 * original checker.
 */
export function buildMatrix(freezeHosts: DpiHost[]): DpiJob[] {
  const jobs: DpiJob[] = []
  for (const host of [CONTROL_HOST, ...SERVICE_HOSTS]) {
    for (const mode of ['tls13', 'tls12'] as const) jobs.push({ host, mode })
  }
  for (const host of freezeHosts) jobs.push({ host, mode: 'tls13' })
  return jobs
}

function modeLabel(mode: TestMode): string {
  return mode === 'tls13' ? 'TLS 1.3' : 'TLS 1.2'
}

function errorVerdict(error: NodeJS.ErrnoException): { state: TestCheck['state']; status: string } {
  const code = error.code ?? ''
  const message = error.message ?? ''
  const both = `${code} ${message}`
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|HOSTNAME_MISMATCH|DST_ROOT/i.test(both)) {
    return { state: 'blocked', status: 'TLS-подмена' }
  }
  if (/unsupported protocol|wrong version number|no protocols|protocol version|version too low|protocol_version/i.test(message)) {
    return { state: 'unsupported', status: 'TLS не поддерж.' }
  }
  if (code === 'ECONNRESET' || code === 'ECONNABORTED' || code === 'EPIPE') {
    return { state: 'blocked', status: 'Сброс' }
  }
  if (code === 'ETIMEDOUT') return { state: 'blocked', status: 'Таймаут' }
  if (code === 'ECONNREFUSED') return { state: 'blocked', status: 'Отказ' }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { state: 'error', status: 'DNS' }
  return { state: 'error', status: code || 'Ошибка' }
}

export interface DpiCheckOptions {
  timeoutMs?: number
  /** Local source port for a parallel lane; the lane's WinDivert filter matches it. */
  localPort?: number
  /** Pre-resolved IPv4 address, when available. */
  address?: string
}

export function dpiCheck(job: DpiJob, options: DpiCheckOptions = {}): Promise<TestCheck> {
  const timeoutMs = options.timeoutMs ?? DPI_TIMEOUT_MS
  const started = Date.now()
  const target = `${job.host.label} · ${modeLabel(job.mode)}`

  return new Promise((resolve) => {
    let finished = false
    let secure = false
    let upBytes = 0
    let downBytes = 0
    let code: number | null = null
    let timer: NodeJS.Timeout | undefined
    let request: ReturnType<typeof httpsRequest> | undefined

    const finish = (state: TestCheck['state'], status: string): void => {
      if (finished) return
      finished = true
      if (timer) clearTimeout(timer)
      resolve({
        target,
        host: job.host.host,
        group: job.host.group,
        mode: job.mode,
        ok: state === 'ok',
        state,
        status,
        ms: Date.now() - started,
        code,
        upBytes,
        downBytes
      })
      request?.destroy()
    }

    const options2 = {
      hostname: options.address ?? job.host.host,
      port: 443,
      path: '/',
      method: 'POST',
      family: 4 as const,
      servername: job.host.host,
      ...(options.localPort ? { localPort: options.localPort } : {}),
      ...(job.mode === 'tls13'
        ? { minVersion: 'TLSv1.3' as const, maxVersion: 'TLSv1.3' as const }
        : { minVersion: 'TLSv1.2' as const, maxVersion: 'TLSv1.2' as const }),
      headers: {
        Host: job.host.host,
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        'Content-Type': 'application/octet-stream',
        'Content-Length': DPI_BODY_BYTES,
        Range: `bytes=0-${DPI_BODY_BYTES - 1}`,
        Connection: 'close'
      }
    }

    try {
      request = httpsRequest(options2, (response) => {
        code = response.statusCode ?? null
        response.resume()
        finish('ok', `HTTP ${code ?? 0}`)
      })
    } catch {
      finish('error', 'Ошибка запроса')
      return
    }
    if (!request) {
      finish('error', 'Ошибка запроса')
      return
    }

    timer = setTimeout(() => {
      // The handshake itself did not complete: the SNI/host is cut, not the
      // transfer. Both are blocking, but the label helps to read the results.
      finish(secure ? 'frozen' : 'blocked', secure ? 'Заморозка' : 'Hello таймаут')
    }, timeoutMs)

    request.on('socket', (socket) => {
      socket.on('secureConnect', () => {
        secure = true
      })
    })
    request.on('error', (error: NodeJS.ErrnoException) => {
      if (finished) return
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        finish('error', 'Порт занят')
        return
      }
      const verdict = errorVerdict(error)
      finish(verdict.state, verdict.status)
    })

    request.write(payload, () => {
      upBytes += DPI_BODY_BYTES
    })
    request.end()
  })
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

export interface MatrixOptions {
  timeoutMs?: number
  concurrency?: number
  /** Returns a fresh source port for every check (parallel lane mode). */
  portFor?: () => number
  /** Host -> IPv4 map from resolveTargets(). */
  addresses?: Map<string, string>
}

/** Runs the whole matrix, optionally binding each connection to a lane port. */
export async function runMatrix(
  jobs: DpiJob[],
  options: MatrixOptions = {},
  isCancelled: () => boolean = () => false
): Promise<TestCheck[]> {
  return pool(jobs, options.concurrency ?? DPI_CONCURRENCY, async (job) => {
    if (isCancelled()) {
      return {
        target: `${job.host.label} · ${modeLabel(job.mode)}`,
        host: job.host.host,
        group: job.host.group,
        mode: job.mode,
        ok: false,
        state: 'error',
        status: 'Отменено',
        ms: 0,
        code: null,
        upBytes: 0,
        downBytes: 0
      }
    }

    const address = options.addresses?.get(job.host.host)
    if (!options.portFor) return dpiCheck(job, { timeoutMs: options.timeoutMs, address })

    let last: TestCheck | null = null
    for (let attempt = 0; attempt < 4; attempt += 1) {
      last = await dpiCheck(job, { timeoutMs: options.timeoutMs, localPort: options.portFor(), address })
      if (last.status !== 'Порт занят') return last
    }
    return last as TestCheck
  })
}

export interface TestCounts {
  ok: number
  total: number
  frozen: number
  failed: number
  fixed: number
  kept: number
  broken: number
  score: number
}

function key(check: Pick<TestCheck, 'host' | 'mode'>): string {
  return `${check.host}|${check.mode}`
}

function isBad(check: TestCheck): boolean {
  // Unsupported TLS version is a server property, not a block: neutral.
  return !check.ok && check.state !== 'unsupported'
}

export function baselineMap(baseline: TestCheck[]): Map<string, TestCheck> {
  return new Map(baseline.map((check) => [key(check), check]))
}

/**
 * Compares a strategy against the no-bypass baseline. Counting only raw "ok"
 * checks rewards strategies that leave already working targets alone and hides
 * whether anything was actually fixed, so fixed/broken weigh more.
 */
export function compareChecks(checks: TestCheck[], baseline: TestCheck[] | Map<string, TestCheck>): TestCounts {
  const base = baseline instanceof Map ? baseline : baselineMap(baseline)
  let ok = 0
  let frozen = 0
  let failed = 0
  let fixed = 0
  let kept = 0
  let broken = 0

  for (const check of checks) {
    if (check.ok) ok += 1
    else if (check.state === 'frozen') frozen += 1
    else if (isBad(check)) failed += 1

    const before = base.get(key(check))
    if (!before) continue
    const wasBad = isBad(before)
    if (check.ok) {
      if (wasBad) fixed += 1
      else kept += 1
    } else if (isBad(check) && !wasBad) {
      broken += 1
    }
  }

  const score = fixed * 3 + kept - broken * 3
  return { ok, total: checks.length, frozen, failed, fixed, kept, broken, score }
}

export function buildResult(
  strategy: string,
  label: string,
  checks: TestCheck[],
  baseline: TestCheck[] | Map<string, TestCheck>,
  options: { started?: boolean; valid?: boolean; error?: string } = {}
): TestStrategyResult {
  const base = baseline instanceof Map ? baseline : baselineMap(baseline)
  const annotated = checks.map((check) => {
    const before = base.get(key(check))
    if (!before) return check
    return { ...check, before: isBad(before) ? ('bad' as const) : ('ok' as const) }
  })
  const counts = compareChecks(annotated, base)
  const okChecks = annotated.filter((check) => check.ok)
  const avgMs =
    okChecks.length > 0 ? Math.round(okChecks.reduce((sum, check) => sum + check.ms, 0) / okChecks.length) : 0
  return {
    strategy,
    label,
    valid: options.valid ?? true,
    started: options.started ?? true,
    ok: counts.ok,
    total: counts.total,
    frozen: counts.frozen,
    failed: counts.failed,
    fixed: counts.fixed,
    kept: counts.kept,
    broken: counts.broken,
    score: counts.score,
    avgMs,
    checks: annotated,
    error: options.error
  }
}

export function baselineBlocked(baseline: TestCheck[]): number {
  return baseline.filter((check) => isBad(check)).length
}

/**
 * Full WinDivert filter for one parallel lane. `--wf-raw-part` is OR-ed with
 * the port filters (it widens capture), so a lane must use `--wf-raw` and
 * describe everything itself: its own source ports, the test hosts, and the
 * standard `!impostor` guard that keeps injected packets from being captured
 * again. Lanes built this way never overlap, which is exactly what the zapret
 * docs require for several simultaneous winws processes.
 */
export function buildLaneFilter(base: number, span: number, addresses: Map<string, string>): string {
  const last = base + span - 1
  const ports =
    `((tcp.SrcPort >= ${base} and tcp.SrcPort <= ${last}) or ` +
    `(tcp.DstPort >= ${base} and tcp.DstPort <= ${last}))`
  const ips = Array.from(new Set(addresses.values())).filter((ip) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip))
  const target =
    ips.length === 0
      ? '(ip)'
      : `((${ips.map((ip) => `ip.DstAddr == ${ip}`).join(' or ')}) or ` +
        `(${ips.map((ip) => `ip.SrcAddr == ${ip}`).join(' or ')}))`
  return (
    '!impostor and !loopback and ip and ' +
    `${target} and ${ports} and ` +
    '(!tcp or tcp.Syn or tcp.Rst or tcp.Fin or tcp.PayloadLength>0)'
  )
}

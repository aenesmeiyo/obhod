import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from './logger'

const execFileAsync = promisify(execFile)

export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

/** Runs a native command without ever showing a console window. */
export async function run(
  file: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      timeout: options.timeout ?? 20_000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8'
    })
    return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string }
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message,
      code: typeof err.code === 'number' ? err.code : 1
    }
  }
}

export async function isElevated(): Promise<boolean> {
  // whoami.exe is always present and does not depend on PowerShell being
  // enabled, which matters on stripped-down Windows images. The high and
  // system integrity SIDs are language-independent.
  const whoami = await run('whoami.exe', ['/groups'])
  if (whoami.code === 0 && whoami.stdout) {
    if (/S-1-16-(12288|16384)/i.test(whoami.stdout)) return true
    if (/S-1-16-(8192|4096)/i.test(whoami.stdout)) return false
  }

  const result = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
  ])
  return result.stdout.trim().toLowerCase() === 'true'
}

export interface ProcessEntry {
  pid: number
  name: string
}

export async function listProcesses(imageName: string): Promise<ProcessEntry[]> {
  const result = await run('tasklist.exe', ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH'])
  const entries: ProcessEntry[] = []
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^"([^"]+)","(\d+)"/)
    if (match) entries.push({ name: match[1], pid: Number(match[2]) })
  }
  return entries
}

export async function findProcessPid(imageName: string): Promise<number | null> {
  const list = await listProcesses(imageName)
  return list.length > 0 ? list[0].pid : null
}

export async function killProcess(pid: number): Promise<void> {
  await run('taskkill.exe', ['/PID', String(pid), '/T', '/F'])
}

export async function killImage(imageName: string): Promise<void> {
  await run('taskkill.exe', ['/IM', imageName, '/T', '/F'])
}

export async function processExists(pid: number): Promise<boolean> {
  const result = await run('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'])
  return new RegExp(`,"${pid}"`).test(result.stdout)
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitFor<T>(
  check: () => Promise<T | null | false>,
  timeoutMs: number,
  intervalMs = 250
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await sleep(intervalMs)
  }
  return null
}

export async function pathExists(path: string): Promise<boolean> {
  const result = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Test-Path -LiteralPath '${path.replace(/'/g, "''")}'`
  ])
  return result.stdout.trim().toLowerCase() === 'true'
}

export async function killProcessByNameSafe(imageName: string, expectedPathFragment?: string): Promise<number> {
  const list = await listProcesses(imageName)
  let killed = 0
  for (const entry of list) {
    if (expectedPathFragment) {
      const path = await getProcessPath(entry.pid)
      if (!path || !path.toLowerCase().includes(expectedPathFragment.toLowerCase())) continue
    }
    await killProcess(entry.pid)
    killed += 1
  }
  return killed
}

export async function getProcessPath(pid: number): Promise<string | null> {
  const result = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path`
  ])
  const value = result.stdout.trim()
  return value || null
}

export function logCommandFailure(context: string, result: RunResult): void {
  if (result.code !== 0) {
    logger.warn(`${context}: код ${result.code} ${result.stderr.trim()}`)
  }
}

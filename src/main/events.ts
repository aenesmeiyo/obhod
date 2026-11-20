import type { LogLine, NavTarget, ProgressEvent, ToastEvent, TestProgress } from '@shared/types'

type Channel =
  | 'state'
  | 'progress'
  | 'test'
  | 'toast'
  | 'log'
  | 'navigate'
  | 'window-state'

let broadcast: (channel: Channel, payload: unknown) => void = () => {}
let toastCounter = 0

export function setBroadcast(fn: (channel: Channel, payload: unknown) => void): void {
  broadcast = fn
}

export const events = {
  state(): void {
    broadcast('state', null)
  },
  progress(progress: ProgressEvent): void {
    broadcast('progress', progress)
  },
  test(progress: TestProgress): void {
    broadcast('test', progress)
  },
  toast(kind: ToastEvent['kind'], title: string, message?: string): void {
    toastCounter += 1
    const toast: ToastEvent = { id: `t${Date.now()}-${toastCounter}`, kind, title, message }
    broadcast('toast', toast)
  },
  log(line: LogLine): void {
    broadcast('log', line)
  },
  navigate(target: NavTarget): void {
    broadcast('navigate', target)
  }
}

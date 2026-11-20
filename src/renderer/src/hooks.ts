import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppState,
  LogLine,
  ProgressEvent,
  TestProgress,
  ToastEvent
} from '@shared/types'

export function useAppState(): AppState | null {
  const [state, setState] = useState<AppState | null>(null)
  useEffect(() => {
    let alive = true
    void window.obhod.getState().then((value) => {
      if (alive) setState(value)
    })
    const unsubscribe = window.obhod.onState((value) => setState(value))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])
  return state
}

export interface ToastItem extends ToastEvent {
  leaving?: boolean
}

export function useToasts(): { toasts: ToastItem[]; dismiss: (id: string) => void } {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)))
    const remove = setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
      timers.current.delete(id)
    }, 260)
    timers.current.set(`remove-${id}`, remove)
  }, [])

  useEffect(() => {
    const unsubscribe = window.obhod.onToast((toast) => {
      setToasts((current) => [...current.filter((item) => item.id !== toast.id), toast].slice(-4))
      const timer = setTimeout(() => dismiss(toast.id), 5200)
      timers.current.set(toast.id, timer)
    })
    return () => {
      unsubscribe()
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
    }
  }, [dismiss])

  return { toasts, dismiss }
}

export function useProgress(): ProgressEvent | null {
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  useEffect(() => {
    const unsubscribe = window.obhod.onProgress(setProgress)
    return unsubscribe
  }, [])
  return progress
}

export function useTestProgress(): TestProgress | null {
  const [progress, setProgress] = useState<TestProgress | null>(null)
  useEffect(() => {
    const unsubscribe = window.obhod.onTestProgress(setProgress)
    return unsubscribe
  }, [])
  return progress
}

export function useLogs(open: boolean): LogLine[] {
  const [logs, setLogs] = useState<LogLine[]>([])
  useEffect(() => {
    if (!open) return
    void window.obhod.getLogs().then(setLogs)
    const unsubscribe = window.obhod.onLog((line) => {
      setLogs((current) => [...current, line].slice(-400))
    })
    return unsubscribe
  }, [open])
  return logs
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 Б'
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond) return ''
  return `${formatBytes(bytesPerSecond)}/с`
}

export function formatTime(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} с` : `${ms} мс`
}

export function timeAgo(timestamp: number | null): string {
  if (!timestamp) return 'ещё не проверялось'
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(hours / 24)} дн назад`
}

export function useElapsed(running: boolean): number {
  const [seconds, setSeconds] = useState(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (!running) {
      setSeconds(0)
      return
    }
    startRef.current = Date.now()
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000))
    }, 500)
    return () => clearInterval(timer)
  }, [running])

  return seconds
}

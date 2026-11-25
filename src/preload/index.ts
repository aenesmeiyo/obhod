import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AppState,
  ComponentId,
  DiagnosticsResult,
  GameFilter,
  IpsetMode,
  LogLine,
  NavTarget,
  ObhodApi,
  ProgressEvent,
  TestProgress,
  ToastEvent,
  UiSettings
} from '@shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ObhodApi = {
  getState: () => ipcRenderer.invoke('api:getState') as Promise<AppState>,
  getLogs: () => ipcRenderer.invoke('api:getLogs') as Promise<LogLine[]>,
  onState: (cb) => subscribe<AppState>('evt:state', cb),
  onProgress: (cb) => subscribe<ProgressEvent>('evt:progress', cb),
  onTestProgress: (cb) => subscribe<TestProgress>('evt:test', cb),
  onToast: (cb) => subscribe<ToastEvent>('evt:toast', cb),
  onLog: (cb) => subscribe<LogLine>('evt:log', cb),
  onNavigate: (cb) => subscribe<NavTarget>('evt:navigate', cb),

  installZapret: () => ipcRenderer.invoke('api:installZapret'),
  removeZapret: () => ipcRenderer.invoke('api:removeZapret'),
  startZapret: () => ipcRenderer.invoke('api:startZapret'),
  stopZapret: () => ipcRenderer.invoke('api:stopZapret'),
  setStrategy: (strategy: string) => ipcRenderer.invoke('api:setStrategy', strategy),
  setGameFilter: (filter: GameFilter) => ipcRenderer.invoke('api:setGameFilter', filter),
  setIpsetMode: (mode: IpsetMode) => ipcRenderer.invoke('api:setIpsetMode', mode),
  updateIpset: () => ipcRenderer.invoke('api:updateIpset'),
  runDiagnostics: () => ipcRenderer.invoke('api:runDiagnostics') as Promise<DiagnosticsResult>,
  checkUpdates: (force?: boolean) => ipcRenderer.invoke('api:checkUpdates', force),
  applyUpdate: (component: ComponentId) => ipcRenderer.invoke('api:applyUpdate', component),
  checkAppUpdate: (force?: boolean) => ipcRenderer.invoke('api:checkAppUpdate', force),
  downloadAppUpdate: () => ipcRenderer.invoke('api:downloadAppUpdate'),
  installAppUpdate: () => ipcRenderer.invoke('api:installAppUpdate'),

  installTgws: () => ipcRenderer.invoke('api:installTgws'),
  removeTgws: () => ipcRenderer.invoke('api:removeTgws'),
  startTgws: () => ipcRenderer.invoke('api:startTgws'),
  stopTgws: () => ipcRenderer.invoke('api:stopTgws'),
  setTgwsPort: (port: number) => ipcRenderer.invoke('api:setTgwsPort', port),
  openTelegram: () => ipcRenderer.invoke('api:openTelegram'),
  copyTelegramLink: () => ipcRenderer.invoke('api:copyTelegramLink'),

  runTest: () => ipcRenderer.invoke('api:runTest'),
  cancelTest: () => ipcRenderer.invoke('api:cancelTest'),
  applyBestStrategy: (strategy: string) => ipcRenderer.invoke('api:applyBestStrategy', strategy),

  setUiSettings: (patch: Partial<UiSettings>) => ipcRenderer.invoke('api:setUiSettings', patch),
  setAutoUpdate: (component: ComponentId, enabled: boolean) =>
    ipcRenderer.invoke('api:setAutoUpdate', component, enabled),
  openFolder: (which: 'zapret' | 'tgws' | 'data' | 'logs') => ipcRenderer.invoke('api:openFolder', which),
  openExternal: (url: string) => ipcRenderer.invoke('api:openExternal', url),
  copyText: (text: string) => ipcRenderer.invoke('api:copyText', text),
  windowMinimize: () => ipcRenderer.send('api:windowMinimize'),
  windowClose: () => ipcRenderer.send('api:windowClose'),
  windowHideToTray: () => ipcRenderer.send('api:windowHideToTray'),
  quit: () => ipcRenderer.send('api:quit'),
  relaunchElevated: () => ipcRenderer.invoke('api:relaunchElevated'),
  debugParse: (file: string) => ipcRenderer.invoke('api:debugParse', file),
  debugEmitTest: () => ipcRenderer.invoke('api:debugEmitTest'),
  debugShowUpdate: () => ipcRenderer.invoke('api:debugShowUpdate')
}

contextBridge.exposeInMainWorld('obhod', api)

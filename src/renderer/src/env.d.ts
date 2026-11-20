/// <reference types="vite/client" />

import type { ObhodApi } from '@shared/types'

declare global {
  interface Window {
    obhod: ObhodApi
  }
}

export {}

import { logger } from './logger'

const USER_AGENT = 'Obhod/1.0 (Windows; +https://github.com/Flowseal/zapret-discord-youtube)'

export interface ReleaseAsset {
  name: string
  size: number
  url: string
}

export interface Release {
  tag: string
  name: string
  publishedAt: string
  htmlUrl: string
  assets: ReleaseAsset[]
}

interface CacheEntry {
  at: number
  release: Release | null
}

const cache = new Map<string, CacheEntry>()
const TTL = 5 * 60 * 1000

async function githubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

interface RawRelease {
  tag_name?: string
  name?: string
  published_at?: string
  html_url?: string
  assets?: Array<{ name?: string; size?: number; browser_download_url?: string }>
}

export async function getLatestRelease(repo: string, force = false): Promise<Release | null> {
  const cached = cache.get(repo)
  if (!force && cached && Date.now() - cached.at < TTL) return cached.release

  try {
    const raw = await githubJson<RawRelease>(`https://api.github.com/repos/${repo}/releases/latest`)
    if (!raw.tag_name) throw new Error('В релизе нет tag_name')
    const release: Release = {
      tag: raw.tag_name,
      name: raw.name || raw.tag_name,
      publishedAt: raw.published_at || '',
      htmlUrl: raw.html_url || `https://github.com/${repo}/releases/latest`,
      assets: (raw.assets || [])
        .filter((asset) => asset.name && asset.browser_download_url)
        .map((asset) => ({
          name: asset.name as string,
          size: asset.size || 0,
          url: asset.browser_download_url as string
        }))
    }
    cache.set(repo, { at: Date.now(), release })
    logger.info(`GitHub: ${repo} — последний релиз ${release.tag}`)
    return release
  } catch (error) {
    logger.warn(`GitHub: не удалось получить релиз ${repo}: ${String(error)}`)
    cache.set(repo, { at: Date.now(), release: null })
    return null
  }
}

export const ZAPRET_REPO = 'Flowseal/zapret-discord-youtube'
export const TGWS_REPO = 'Flowseal/tg-ws-proxy'

export function pickZapretAsset(release: Release): ReleaseAsset | null {
  return release.assets.find((asset) => /\.zip$/i.test(asset.name)) ?? null
}

export function pickTgwsAsset(release: Release): ReleaseAsset | null {
  const arch = process.arch
  const preferred = arch === 'arm64' ? 'TgWsProxy_windows_arm64.exe' : 'TgWsProxy_windows.exe'
  return (
    release.assets.find((asset) => asset.name === preferred) ??
    release.assets.find((asset) => /TgWsProxy_windows\.exe$/i.test(asset.name)) ??
    null
  )
}

export function normalizeVersion(tag: string | null | undefined): string {
  if (!tag) return ''
  return tag.trim().replace(/^v/i, '')
}

/** Returns true when `latest` is newer than `current`. */
export function isNewer(latest: string | null | undefined, current: string | null | undefined): boolean {
  const a = normalizeVersion(latest)
  const b = normalizeVersion(current)
  if (!a) return false
  if (!b) return true
  if (a === b) return false
  const pa = a.split(/[.+-]/).map((part) => Number.parseInt(part, 10))
  const pb = b.split(/[.+-]/).map((part) => Number.parseInt(part, 10))
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const na = Number.isFinite(pa[i]) ? pa[i] : 0
    const nb = Number.isFinite(pb[i]) ? pb[i] : 0
    if (na !== nb) return na > nb
  }
  return false
}

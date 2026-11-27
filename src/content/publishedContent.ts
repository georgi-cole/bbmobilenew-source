import catalog from './contentCatalog.json'

type ContentId = keyof typeof catalog
type JsonContentId = Exclude<ContentId, 'credits-video'>
type ContentEntry = { revision: string; bytes: number }
type Manifest = Partial<Record<ContentId, ContentEntry>>

export const PUBLISHED_CONTENT_BASE = 'https://georgi-cole.github.io/bbmobilenew/content/'
const MANIFEST_TTL_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 2_000

export function parsePublishedManifest(value: unknown): Manifest | null {
  if (!value || typeof value !== 'object') return null
  const { schemaVersion, entries } = value as { schemaVersion?: unknown; entries?: unknown }
  if (schemaVersion !== 1 || !entries || typeof entries !== 'object') return null

  const result: Manifest = {}
  for (const id of Object.keys(catalog) as ContentId[]) {
    const entry = (entries as Manifest)[id]
    if (entry === undefined) continue
    if (
      !entry ||
      typeof entry.revision !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.revision) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes <= 0 ||
      entry.bytes > catalog[id].maxBytes
    ) {
      return null
    }
    result[id] = { revision: entry.revision, bytes: entry.bytes }
  }
  return result
}

export interface PublishedContent<T> {
  revision: string
  url: string
  value: T
}

export function createPublishedContentClient(
  baseUrl: string,
  fetchContent: typeof fetch = (...args) => fetch(...args),
  getStorage: () => Storage | undefined = () => globalThis.localStorage
) {
  let manifest: Manifest | null = null
  let expiresAt = 0
  let pendingManifest: Promise<Manifest | null> | undefined

  function urlFor(id: ContentId, entry: Pick<ContentEntry, 'revision'>): string {
    return new URL(`${id}/${entry.revision}.${catalog[id].extension}`, baseUrl).href
  }

  async function read<T>(
    url: string,
    cache: RequestCache,
    consume: (response: Response) => Promise<T>
  ): Promise<T | null> {
    if (globalThis.navigator?.onLine === false) return null
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetchContent(url, {
        cache,
        credentials: 'omit',
        signal: controller.signal,
      })
      return response.ok ? await consume(response) : null
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  function getManifest(): Promise<Manifest | null> {
    if (manifest && Date.now() < expiresAt) return Promise.resolve(manifest)
    pendingManifest ??= read(new URL('manifest.json', baseUrl).href, 'no-store', async (response) =>
      parsePublishedManifest(await response.json())
    )
      .then((result) => {
        if (result) {
          manifest = result
          expiresAt = Date.now() + MANIFEST_TTL_MS
        }
        return result ?? manifest
      })
      .finally(() => {
        pendingManifest = undefined
      })
    return pendingManifest
  }

  async function loadJson<T>(
    id: JsonContentId,
    parse: (value: unknown) => T | null
  ): Promise<PublishedContent<T> | null> {
    const cacheKey = `big-eye/content/v1/${id}`
    let cached: PublishedContent<T> | null = null
    try {
      const raw = JSON.parse(getStorage()?.getItem(cacheKey) ?? 'null') as {
        revision: string
        value: unknown
      } | null
      if (raw && /^[a-f0-9]{64}$/.test(raw.revision)) {
        const value = parse(raw.value)
        if (value !== null) cached = { value, revision: raw.revision, url: urlFor(id, raw) }
      }
    } catch {
      // A disabled or damaged device cache does not prevent loading new content.
    }

    const entry = (await getManifest())?.[id]
    if (!entry || cached?.revision === entry.revision) return cached
    const url = urlFor(id, entry)
    const result = await read(url, 'force-cache', async (response) => {
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength !== entry.bytes) return null
      const subtle = globalThis.crypto?.subtle
      if (subtle) {
        const hash = new Uint8Array(await subtle.digest('SHA-256', bytes))
        const revision = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')
        if (revision !== entry.revision) return null
      }
      const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      const value = parse(raw)
      if (value === null) return null
      try {
        getStorage()?.setItem(cacheKey, JSON.stringify({ revision: entry.revision, value: raw }))
      } catch {
        // The checked revision can still be used for the current session.
      }
      return { value, revision: entry.revision, url }
    })
    return result ?? cached
  }

  return {
    loadJson,
    async getCreditsVideoUrl(): Promise<string | null> {
      const entry = (await getManifest())?.['credits-video']
      return entry ? urlFor('credits-video', entry) : null
    },
  }
}

const client = createPublishedContentClient(PUBLISHED_CONTENT_BASE)

export const USE_PUBLISHED_CONTENT =
  import.meta.env.VITE_CINEMATIC_PACK_EXTERNAL === 'true' ||
  import.meta.env.VITE_APP_ENVIRONMENT === 'production'

export const loadPublishedJson = client.loadJson
export const getPublishedCreditsVideoUrl = client.getCreditsVideoUrl

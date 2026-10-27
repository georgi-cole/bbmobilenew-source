import type { RemoteOperations } from '../../remoteConfig/remoteConfigTypes'

const EVENT_BUFFER_KEY = 'bbmobilenew:product-events'
export type EventProperties = Record<string, string | number | boolean | null | undefined>
export type ProductEvent = {
  name: string
  occurredAt: string
  sessionId: string
  properties: EventProperties
}
type ProductEventListener = (event: ProductEvent, profileId?: string) => void

let telemetry: NonNullable<RemoteOperations['telemetry']> | undefined
let sampled = false
let sessionCounter = 0
function createTelemetrySessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  sessionCounter = (sessionCounter + 1) >>> 0
  return `session-${Date.now().toString(36)}-${sessionCounter.toString(36)}`
}
const sessionId = createTelemetrySessionId()
const sessionSampleBucket =
  Array.from(sessionId).reduce((total, char) => total + char.charCodeAt(0), 0) % 100
const eventListeners = new Set<ProductEventListener>()

/** Observe product actions for the separately configured Supabase analytics stream. */
export function subscribeProductEvents(listener: ProductEventListener): () => void {
  eventListeners.add(listener)
  return () => eventListeners.delete(listener)
}

export function configureProductTelemetry(next: RemoteOperations['telemetry']): void {
  telemetry = next
  sampled = Boolean(next?.enabled) && sessionSampleBucket < (next?.samplePercentage ?? 0)
}

function bufferEvent(event: ProductEvent): void {
  try {
    const current = JSON.parse(sessionStorage.getItem(EVENT_BUFFER_KEY) ?? '[]') as ProductEvent[]
    sessionStorage.setItem(EVENT_BUFFER_KEY, JSON.stringify([...current.slice(-99), event]))
  } catch {
    // Measurement must never block gameplay.
  }
}

export function trackProductEvent(
  name: string,
  properties: EventProperties = {},
  profileId?: string
): void {
  const event: ProductEvent = { name, occurredAt: new Date().toISOString(), sessionId, properties }
  eventListeners.forEach((listener) => {
    try {
      listener(event, profileId)
    } catch {
      // Analytics observers must never interrupt gameplay.
    }
  })
  if (!sampled) return
  bufferEvent(event)
  if (!telemetry?.endpointUrl) return

  const body = JSON.stringify(event)
  if (
    typeof navigator.sendBeacon === 'function' &&
    navigator.sendBeacon(telemetry.endpointUrl, body)
  )
    return
  void fetch(telemetry.endpointUrl, {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'content-type': 'application/json' },
  }).catch(() => undefined)
}

export function readBufferedProductEvents(): ProductEvent[] {
  try {
    return JSON.parse(sessionStorage.getItem(EVENT_BUFFER_KEY) ?? '[]') as ProductEvent[]
  } catch {
    return []
  }
}

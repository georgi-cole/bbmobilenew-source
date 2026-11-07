import type { RemoteOperations } from '../../remoteConfig/remoteConfigTypes'
import { canUseOptionalFeature, subscribePlayerSafety } from '../../safety/playerSafety'

const EVENT_BUFFER_KEY = 'bbmobilenew:product-events'
subscribePlayerSafety(() => {
  if (!canUseOptionalFeature('analytics')) {
    try {
      sessionStorage.removeItem(EVENT_BUFFER_KEY)
    } catch {
      /* Storage may be unavailable. */
    }
  }
})
export type EventProperties = Record<string, string | number | boolean | null | undefined>
export type ProductEvent = {
  name: string
  occurredAt: string
  sessionId: string
  properties: EventProperties
}

let telemetry: NonNullable<RemoteOperations['telemetry']> | undefined
let sampled = false
const eventListeners = new Set<(event: ProductEvent) => void>()

/** Backend collection has its own enablement; remote LiveOps sampling stays independent. */
export function subscribeProductEvents(listener: (event: ProductEvent) => void): () => void {
  eventListeners.add(listener)
  return () => {
    eventListeners.delete(listener)
  }
}
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

export function trackProductEvent(name: string, properties: EventProperties = {}): void {
  if (!canUseOptionalFeature('analytics')) return
  const event: ProductEvent = { name, occurredAt: new Date().toISOString(), sessionId, properties }
  eventListeners.forEach((listener) => {
    try {
      listener(event)
    } catch {
      /* Measurement must never interrupt gameplay. */
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

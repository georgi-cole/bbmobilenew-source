import {
  canUseOptionalFeature,
  subscribePlayerSafety,
  type OptionalPlayerFeature,
} from './playerSafety'

/** Recheck at the network boundary and abort requests when permission is withdrawn. */
export async function optionalPlayerFetch(
  feature: OptionalPlayerFeature,
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  if (!canUseOptionalFeature(feature))
    throw new Error('This optional service is unavailable for this player or has not been enabled.')
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (init.signal?.aborted) controller.abort()
  init.signal?.addEventListener('abort', abort, { once: true })
  const unsubscribe = subscribePlayerSafety(() => {
    if (!canUseOptionalFeature(feature)) controller.abort()
  })
  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    if (controller.signal.aborted || !canUseOptionalFeature(feature))
      throw new Error('Permission for this service has been withdrawn.')
    return response
  } finally {
    init.signal?.removeEventListener('abort', abort)
    unsubscribe()
  }
}

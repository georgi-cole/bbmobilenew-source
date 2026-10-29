// Autosaves keep the existing JSON format; only serialization moves off the UI thread.
self.onmessage = (event: MessageEvent<{ id: number; snapshot: unknown }>) => {
  const { id, snapshot } = event.data
  const startedAt = performance.now()
  try {
    const json = JSON.stringify(snapshot)
    self.postMessage({ id, json, serializeMs: performance.now() - startedAt })
  } catch {
    self.postMessage({ id })
  } // The main-thread recovery serializer handles legacy data.
}
export {}

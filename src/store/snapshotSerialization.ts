const prepared = new WeakMap<object, string>()
let worker: Worker | undefined
let sequence = 0
let lastCloneMs = 0,
  lastWorkerSerializeMs = 0
const pending = new Map<
  number,
  { snapshot: object; done: () => void; timer: ReturnType<typeof setTimeout> }
>()

function failPending() {
  worker?.terminate()
  worker = undefined
  for (const request of pending.values()) {
    clearTimeout(request.timer)
    request.done()
  }
  pending.clear()
}

/** At most four slot preparations; old snapshots are released when jobs finish. */
export function prepareSnapshotJson(snapshot: object): Promise<void> {
  if (typeof Worker === 'undefined' || pending.size >= 4) return Promise.resolve()
  return new Promise((resolve) => {
    try {
      if (!worker) {
        worker = new Worker(new URL('./snapshotJson.worker.ts', import.meta.url), {
          type: 'module',
        })
        worker.onmessage = (
          event: MessageEvent<{ id: number; json?: string; serializeMs?: number }>
        ) => {
          const request = pending.get(event.data.id)
          if (!request) return
          clearTimeout(request.timer)
          pending.delete(event.data.id)
          if (typeof event.data.json === 'string') prepared.set(request.snapshot, event.data.json)
          if (typeof event.data.serializeMs === 'number')
            lastWorkerSerializeMs = event.data.serializeMs
          request.done()
          // No background resource accumulates between save bursts or seasons.
          if (!pending.size) {
            worker?.terminate()
            worker = undefined
          }
        }
        worker.onerror = failPending
        worker.onmessageerror = failPending
      }
      const id = ++sequence
      pending.set(id, { snapshot, done: resolve, timer: setTimeout(failPending, 5000) })
      // Structured cloning still has a cost; it is measured separately from the
      // worker's serialization. Failures retain the existing synchronous fallback.
      const startedAt = performance.now()
      worker.postMessage({ id, snapshot })
      lastCloneMs = performance.now() - startedAt
    } catch {
      failPending()
      resolve()
    }
  })
}

export function takePreparedSnapshotJson(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const json = prepared.get(value)
  prepared.delete(value)
  return json
}

export function getSnapshotSerializationDiagnostics() {
  return { pendingJobs: pending.size, lastCloneMs, lastWorkerSerializeMs }
}

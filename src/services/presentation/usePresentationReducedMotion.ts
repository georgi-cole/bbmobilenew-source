import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let observer: MutationObserver | null = null
let systemQuery: MediaQueryList | null = null

function getSystemQuery(): MediaQueryList | null {
  if (!systemQuery && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    systemQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  }
  return systemQuery
}

function notify(): void {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const query = getSystemQuery()
  if (listeners.size === 1 && query) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', notify)
    else query.addListener(notify)
  }
  if (!observer && typeof MutationObserver !== 'undefined' && document.body) {
    observer = new MutationObserver(notify)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      observer?.disconnect()
      observer = null
      if (query) {
        if (typeof query.removeEventListener === 'function') {
          query.removeEventListener('change', notify)
        } else query.removeListener(notify)
      }
      systemQuery = null
    }
  }
}

function motionDisabled(): boolean {
  return (
    (typeof document !== 'undefined' &&
      (document.body.classList.contains('no-animations') ||
        document.body.classList.contains('reduce-motion'))) ||
    (getSystemQuery()?.matches ?? false)
  )
}

/** Follow both app controls and the system preference, including mid-scene changes. */
export function usePresentationReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, motionDisabled, () => false)
}

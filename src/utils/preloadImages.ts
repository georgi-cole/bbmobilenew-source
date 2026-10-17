const PRELOAD_SELECTOR = 'link[rel="preload"][as="image"][data-game-image-preload]'
export type ImagePreloadPriority = 'high' | 'low' | 'auto'

/** Warm a small, upcoming set of screen images without duplicating requests. */
export function preloadImages(
  sources: readonly string[],
  priority: ImagePreloadPriority = 'high'
): void {
  if (typeof document === 'undefined' || document.visibilityState === 'hidden') return

  const existing = new Map(
    Array.from(document.head.querySelectorAll<HTMLLinkElement>(PRELOAD_SELECTOR), (link) => [
      link.href,
      link,
    ])
  )

  for (const source of sources) {
    const href = new URL(source, document.baseURI).href
    const existingLink = existing.get(href)
    if (existingLink) {
      if (priority === 'high' && existingLink.getAttribute('fetchpriority') !== 'high') {
        existingLink.setAttribute('fetchpriority', 'high')
      }
      continue
    }

    const link = document.createElement('link')
    link.setAttribute('rel', 'preload')
    link.setAttribute('as', 'image')
    link.href = source
    link.setAttribute('data-game-image-preload', '')
    link.setAttribute('fetchpriority', priority)
    document.head.append(link)
    existing.set(href, link)
  }
}

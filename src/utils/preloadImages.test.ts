import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { preloadImages } from './preloadImages'

describe('preloadImages', () => {
  const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')

  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  afterEach(() => {
    document.head.querySelectorAll('[data-game-image-preload]').forEach((link) => link.remove())
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState)
    } else {
      Reflect.deleteProperty(document, 'visibilityState')
    }
  })

  it('adds one high-priority image preload for each distinct image URL', () => {
    expect(document.visibilityState).toBe('visible')
    preloadImages(['/assets/confessional.webp', '/assets/confessional.webp'])
    preloadImages(['/assets/confessional.webp', '/assets/door.webp'])

    const links = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>(
        'link[rel="preload"][as="image"][data-game-image-preload]'
      )
    )
    expect(links).toHaveLength(2)
    expect(links.map((link) => link.href)).toEqual([
      new URL('/assets/confessional.webp', document.baseURI).href,
      new URL('/assets/door.webp', document.baseURI).href,
    ])
    expect(links.every((link) => link.getAttribute('fetchpriority') === 'high')).toBe(true)
  })

  it('raises the priority of an upcoming image when it becomes immediately needed', () => {
    preloadImages(['/assets/confessional.webp'], 'low')
    preloadImages(['/assets/confessional.webp'])

    expect(
      document.querySelector('link[data-game-image-preload]')?.getAttribute('fetchpriority')
    ).toBe('high')
  })

  it('does not start image requests while the app is hidden', () => {
    const visibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })

    try {
      preloadImages(['/assets/confessional.webp'])
      expect(document.head.querySelector('[data-game-image-preload]')).toBeNull()
    } finally {
      if (visibilityState) Object.defineProperty(document, 'visibilityState', visibilityState)
      else Reflect.deleteProperty(document, 'visibilityState')
    }
  })
})

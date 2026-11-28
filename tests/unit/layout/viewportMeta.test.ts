import { describe, expect, it } from 'vitest'
import {
  applyViewportMeta,
  buildViewportMetaContent,
} from '../../../src/components/layout/viewportMeta'

describe('buildViewportMetaContent', () => {
  it('keeps native pinch zoom available in the standard range', () => {
    const content = buildViewportMetaContent(false)
    expect(content).toContain('maximum-scale=5')
    expect(content).toContain('viewport-fit=cover')
    expect(content).not.toContain('interactive-widget')
    expect(content).not.toContain('user-scalable=no')
  })
  it('offers an expanded range when enhanced zoom is enabled', () => {
    expect(buildViewportMetaContent(true)).toContain('maximum-scale=10')
  })

  it('locks the native iOS viewport even when a saved zoom preference is enabled', () => {
    const meta = document.createElement('meta')
    meta.name = 'viewport'
    document.head.append(meta)
    document.documentElement.classList.add('is-capacitor-ios')
    try {
      applyViewportMeta(false)
      expect(meta.content).toContain('maximum-scale=1, user-scalable=no')
      expect(meta.content).toContain('viewport-fit=cover')
      applyViewportMeta(true)
      expect(meta.content).toContain('maximum-scale=1, user-scalable=no')
    } finally {
      document.documentElement.classList.remove('is-capacitor-ios')
      meta.remove()
    }
  })
})

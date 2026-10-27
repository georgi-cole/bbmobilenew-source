import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResponsiveGameLayout } from '../../../src/screens/GameScreen/useResponsiveGameLayout'

beforeEach(() => {
  vi.stubGlobal('visualViewport', undefined)
  vi.stubGlobal('innerWidth', 393)
  vi.stubGlobal('innerHeight', 852)
})

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty('--safe-area-inset-bottom')
  vi.unstubAllGlobals()
})

describe('presentation layout measurements', () => {
  it('accepts late safe-area changes while a presentation holds tile geometry', () => {
    const { result } = renderHook(() =>
      useResponsiveGameLayout(
        { current: null },
        {
          hasDock: true,
          unifiedActionRail: true,
          playerCount: 16,
          userCompactRoster: false,
          inlineLogVisible: false,
          freezeLayout: true,
        }
      )
    )
    const initialRevision = result.current.revision

    act(() => window.dispatchEvent(new Event('resize')))
    expect(result.current.revision).toBe(initialRevision)

    act(() => {
      document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px')
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.cssVars['--game-safe-bottom']).toBe('34px')
    expect(result.current.revision).toBeGreaterThan(initialRevision)

    act(() => {
      document.documentElement.style.setProperty('--safe-area-inset-bottom', '0px')
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.cssVars['--game-safe-bottom']).toBe('0px')

    act(() => {
      vi.stubGlobal('innerWidth', 320)
      vi.stubGlobal('innerHeight', 568)
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.layoutSize).toBe('phone-small')
    expect(result.current.cssVars['--game-cabinet-max-height']).toBe('568px')
  })
})

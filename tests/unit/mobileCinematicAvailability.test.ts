import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldPlayCinematic } from '../../src/cinematic/ceremonies/runtime.mjs'
import {
  VIP_CINEMATIC_PACK,
  vipCinematicMediaLibrary,
  captureVipCinematicMediaResolver,
} from '../../src/cinematic/media/vipCinematicPack'

const state = {
  game: { mode: 'classic' },
  settings: { gameUX: { animations: true, animationMode: 'cinematic' }, display: {} },
}
const verified = VIP_CINEMATIC_PACK.files.map((file) => ({
  ...file,
  uri: `file:///offline/${file.path}`,
}))

afterEach(() => {
  vipCinematicMediaLibrary.useBundled()
  vi.unstubAllEnvs()
})

describe('mobile cinematic readiness', () => {
  it('uses Standard immediately with an absent pack and never resolves missing artwork to bundled URLs', () => {
    vi.stubEnv('VITE_CINEMATIC_PACK_EXTERNAL', 'true')
    vipCinematicMediaLibrary.useBundled()
    expect(shouldPlayCinematic(state, true)).toBe(false)
    const resolve = captureVipCinematicMediaResolver()
    expect(() => resolve(VIP_CINEMATIC_PACK.files[0].path)).toThrow(/not been downloaded/)
    expect(resolve('assets/ceremonies/shared/winner-stage.webp')).toContain('winner-stage.webp')
    expect(resolve('assets/credits/big-eye-cinematic-background.mp4')).toContain('credits/')
  })
  it('requires the complete verified pack and enables local scenes offline without overriding Standard or reduced motion', () => {
    vi.stubEnv('VITE_CINEMATIC_PACK_EXTERNAL', 'true')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Offline')
      })
    )
    try {
      expect(() =>
        vipCinematicMediaLibrary.activateVerified(
          VIP_CINEMATIC_PACK.revision,
          verified.slice(0, -1)
        )
      ).toThrow()
      expect(shouldPlayCinematic(state, true)).toBe(false)
      vipCinematicMediaLibrary.activateVerified(VIP_CINEMATIC_PACK.revision, verified)
      expect(shouldPlayCinematic(state, true)).toBe(true)
      expect(captureVipCinematicMediaResolver()(VIP_CINEMATIC_PACK.files[0].path)).toContain(
        '/offline/'
      )
      expect(
        shouldPlayCinematic(
          {
            ...state,
            settings: {
              ...state.settings,
              gameUX: { animations: true, animationMode: 'standard' },
            },
          },
          true
        )
      ).toBe(false)
      expect(
        shouldPlayCinematic(
          { ...state, settings: { ...state.settings, display: { reduceMotion: true } } },
          true
        )
      ).toBe(false)
      vipCinematicMediaLibrary.useBundled()
      expect(shouldPlayCinematic(state, true)).toBe(false)
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('retains bundled cinematics in browser builds', () => {
    vi.stubEnv('VITE_CINEMATIC_PACK_EXTERNAL', 'false')
    vipCinematicMediaLibrary.useBundled()
    expect(shouldPlayCinematic(state, true)).toBe(true)
    expect(captureVipCinematicMediaResolver()(VIP_CINEMATIC_PACK.files[0].path)).toContain(
      VIP_CINEMATIC_PACK.files[0].path
    )
  })
})

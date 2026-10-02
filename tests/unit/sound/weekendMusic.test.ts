import { describe, expect, it } from 'vitest'
import type { WeekendInterludeState } from '../../../src/types'
import {
  resolveDesiredMusicCue,
  type MusicResolverState,
} from '../../../src/services/sound/resolveDesiredMusic'
import { buildEffectiveMusicConfig } from '../../../src/services/sound/musicRuntimeConfig'
import { sanitiseMusicConfigOverrides } from '../../../src/services/sound/musicConfigSanitizer'
import { hasSameResolvedPlayback } from '../../../src/services/sound/musicCueTransitions'
import { resolveRuntimeMusicMix } from '../../../src/services/sound/musicMix'

function previewState(afterDay: 5 | 10 | 15, debug: boolean): MusicResolverState {
  const weekend: WeekendInterludeState = {
    active: true,
    afterDay,
    weekendDay: 1,
    ...(debug ? { debug: true } : {}),
    episode: afterDay === 5 ? 'hub_says' : afterDay === 10 ? 'party' : 'season_so_far',
    stage: 'intro',
    wallet: { energy: 30, influence: 999, info: 999 },
  }
  return {
    game: {
      gameId: 'weekend-music',
      status: 'active',
      phase: 'week_end',
      spectatorActive: null,
      weekendInterlude: weekend,
    },
    challenge: { pending: null },
    social: { panelOpen: false, incomingInboxOpen: false },
    ui: { musicScene: 'none' },
  }
}

describe('weekend themes', () => {
  it.each([5, 10, 15] as const)(
    'keeps the theme continuous across both days and Social surfaces after Day %s',
    (afterDay) => {
      for (const debug of [false, true]) {
        const state = previewState(afterDay, debug)
        const entry = resolveDesiredMusicCue(state, '#/game?debug=1')
        expect(entry.track).toBe(`weekend_${afterDay / 5}`)
        expect(entry.source).toBe('weekend')
        expect(entry.playbackCue).toMatchObject({
          loop: true,
          fadeInMs: 900,
          fadeOutMs: 1000,
          crossfadeMs: 900,
          restartPolicy: 'continue',
        })
        const weekend = state.game.weekendInterlude as WeekendInterludeState
        for (const stage of [
          'instructions',
          'social',
          'day_transition',
          'day_two_intro',
          'social',
        ] as const) {
          weekend.stage = stage
          if (stage === 'day_two_intro') weekend.weekendDay = 2
          state.social = { panelOpen: true, incomingInboxOpen: true }
          expect(hasSameResolvedPlayback(entry, resolveDesiredMusicCue(state, '#/game'))).toBe(true)
        }
        expect(resolveDesiredMusicCue(state, '#/diary-room').track).toBe(entry.track)
        expect(resolveDesiredMusicCue(state, '#/settings').track).toBe(entry.track)

        // Completing a real weekend advances the calendar; previews restore the old phase.
        state.game.weekendInterlude = null
        state.game.phase = debug ? 'week_end' : 'week_start'
        state.social = { panelOpen: false, incomingInboxOpen: false }
        expect(resolveDesiredMusicCue(state, '#/game').track).toBe(
          debug ? 'move_into_me_instrumental_general' : 'none'
        )
      }
    }
  )

  it('preserves Music Manager overrides through sanitization and runtime resolution', () => {
    const overrides = sanitiseMusicConfigOverrides({
      contextMusic: { weekend2: { kind: 'silence' } },
    })
    const config = buildEffectiveMusicConfig(undefined, overrides)
    const state = previewState(10, true)
    expect(resolveDesiredMusicCue(state, '#/game', config).track).toBe('none')
    expect(resolveDesiredMusicCue(previewState(5, true), '#/game', config).track).toBe('weekend_1')
    expect(resolveDesiredMusicCue(previewState(15, true), '#/game', config).track).toBe('weekend_3')
  })

  it('ignores the underlying eviction presentation during a forced weekend', () => {
    const state = previewState(10, true)
    state.game.phase = 'eviction_results'
    state.game.voteResults = { nova: 3, rae: 1 }
    state.game.evictionOverlayPlayerId = 'nova'
    expect(resolveDesiredMusicCue(state, '#/game').playbackCue?.effectPreset).toBe('none')
    expect(resolveRuntimeMusicMix(state.game)).toBe('normal')
    expect(resolveDesiredMusicCue(state, '#/').track).toBe('introhub')
  })
})

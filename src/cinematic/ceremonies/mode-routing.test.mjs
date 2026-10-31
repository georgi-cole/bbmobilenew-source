import { describe, expect, it } from 'vitest'
import { adaptCeremonyScene, baseScene, modeActors } from './mode-routing.mjs'
import { winnerScene } from './runtime.mjs'

describe('Vox competition ceremony routing', () => {
  const game = {
    voxPopuli: { status: 'active' },
    players: [
      { id: 'winner', name: 'Aria' },
      { id: 'last', name: 'Ash' },
    ],
  }

  it('routes immunity wins to a two-person winner and last-place ceremony', () => {
    const props = {
      targetIds: ['winner', 'last'],
      voxLastPlaceId: 'last',
      caption: 'Aria wins Immunity! Ash finishes last and is nominated.',
      tiles: [{ badgeCode: 'immune' }, { badgeCode: 'nominated' }],
    }

    expect(winnerScene(props, game)).toBe('voxImmunity')
    expect(baseScene('voxImmunity')).toBeNull()
    expect(modeActors('voxImmunity', props, game)).toEqual(['winner', 'last'])
  })

  it('keeps Power of Safety as its own Vox reveal without routing to All the Power', () => {
    const props = {
      targetIds: ['winner'],
      caption: 'Aria wins Power of Safety!',
      tiles: [{ badgeCode: 'pos' }],
    }

    expect(winnerScene(props, { ...game, lohId: 'winner', posWinnerId: 'winner' })).toBe('safety')
    expect(adaptCeremonyScene('allPower', props, game)).toBeNull()
  })
})

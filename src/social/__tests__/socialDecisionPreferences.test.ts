import { describe, expect, it } from 'vitest'
import type { AiGameIdentity } from '../../ai/aiGameIdentity'
import { getSocialExperienceRead, getSocialMotivePreferences } from '../socialDecisionPreferences'

function identity(
  archetype: AiGameIdentity['archetype'],
  temperament: AiGameIdentity['temperament'] = 'calm'
): AiGameIdentity {
  return {
    archetype,
    temperament,
    competitionDrive: 0.5,
    emotionalVolatility: 0.9,
    audienceFocus: 0.5,
    survivalFocus: 0.5,
  }
}

describe('social decision preferences', () => {
  it('produces identical indexed reads and invalidates when history or memory changes', () => {
    const actions = Array.from({ length: 500 }, (_, i) => ({
      actionId: i % 2 ? 'protect' : 'betray',
      actorId: `a${i % 16}`,
      targetId: 'observer',
      week: 8,
      cost: 1,
      delta: i % 2 ? 8 : -10,
      outcome: 'success' as const,
      newEnergy: 9,
      timestamp: i,
    }))
    const immutable = Object.freeze(actions)
    for (let i = 0; i < 16; i++)
      expect(
        getSocialExperienceRead('observer', `a${i}`, { recentActions: immutable, week: 8 })
      ).toEqual(
        getSocialExperienceRead('observer', `a${i}`, { recentActions: [...actions], week: 8 })
      )
    expect(
      getSocialExperienceRead('observer', 'new', { recentActions: immutable, week: 8 }).help
    ).toBe(0)
    const next = Object.freeze([...actions, { ...actions[1], actorId: 'new' }])
    expect(getSocialExperienceRead('observer', 'new', { recentActions: next, week: 8 }).help).toBe(
      1
    )
  })
  it('gives loyal and calculated contestants different priorities', () => {
    const loyal = getSocialMotivePreferences('loyal-contestant', identity('loyal_anchor'))
    const calculated = getSocialMotivePreferences(
      'calculated-contestant',
      identity('strategic_operator')
    )

    expect(loyal.loyalty).toBeGreaterThan(calculated.loyalty)
    expect(calculated.ambition).toBeGreaterThan(loyal.ambition)
  })

  it('lets impulsive temperament strengthen revenge while calming a calculated player', () => {
    const impulsive = getSocialMotivePreferences(
      'impulsive-contestant',
      identity('chaos_agent', 'impulsive')
    )
    const calm = getSocialMotivePreferences('calm-contestant', identity('strategic_operator'))

    expect(impulsive.revenge).toBeGreaterThan(calm.revenge)
  })

  it('uses recent help and betrayal the contestant personally experienced', () => {
    const help = getSocialExperienceRead('observer', 'ally', {
      week: 5,
      recentActions: [
        {
          actionId: 'protect',
          actorId: 'ally',
          targetId: 'observer',
          cost: 1,
          delta: 8,
          outcome: 'success',
          newEnergy: 9,
          timestamp: 0,
          week: 5,
        },
      ],
    })
    const betrayal = getSocialExperienceRead('observer', 'rival', {
      week: 5,
      recentActions: [
        {
          actionId: 'betray',
          actorId: 'rival',
          targetId: 'observer',
          cost: 1,
          delta: -10,
          outcome: 'success',
          newEnergy: 9,
          timestamp: 0,
          week: 5,
        },
      ],
    })

    expect(help.help).toBe(1)
    expect(betrayal.betrayal).toBe(1)
    expect(betrayal.grievance).toBe(1)
  })
})

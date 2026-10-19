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

  it('keeps pair experience scoped to the other actor and current evidence window', () => {
    const recentActions = [
      {
        actionId: 'protect',
        actorId: 'ally',
        targetId: 'observer',
        cost: 1,
        delta: 8,
        outcome: 'success' as const,
        newEnergy: 9,
        timestamp: 0,
        week: 5,
      },
      {
        actionId: 'public_callout',
        actorId: 'ally',
        targetId: 'someone-else',
        subjectId: 'observer',
        cost: 1,
        delta: -8,
        outcome: 'success' as const,
        newEnergy: 8,
        timestamp: 1,
        week: 4,
      },
      {
        actionId: 'betray',
        actorId: 'unrelated',
        targetId: 'observer',
        cost: 1,
        delta: -10,
        outcome: 'success' as const,
        newEnergy: 8,
        timestamp: 2,
        week: 5,
      },
    ]

    const experience = getSocialExperienceRead('observer', 'ally', {
      week: 5,
      recentActions,
    })

    expect(experience).toEqual({
      help: 1,
      grievance: 0.35750000000000004,
      humiliation: 0.55,
      betrayal: 0,
    })
  })
})

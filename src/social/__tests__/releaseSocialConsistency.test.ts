import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../store/gameSlice'
import { resolveLohPlanDisclosure } from '../SocialManeuvers'
import { getPendingAutomaticNomineeId } from '../automaticNomination'
import { isProtectedSocialAlly } from '../allianceTargetContinuity'
import { chooseIncomingInteractionType } from '../incomingInteractionAutonomy'
import { isIncomingInteractionInvalidated } from '../incomingInteractionValidity'
import { createInitialRealityDomainState } from '../reality/state'
import { createRealityAlliance } from '../reality/relationshipForms'
import { evaluateSocialActionEligibility } from '../socialActionEligibility'
import { validateSocialExecution } from '../socialExecutionGuard'
import { SOCIAL_ACTIONS } from '../socialActions'
import type { IncomingInteraction } from '../types'

const players = [
  { id: 'you', name: 'You', isUser: true, status: 'loh' as const },
  { id: 'aria', name: 'Aria', status: 'active' as const },
  { id: 'rae', name: 'Rae', status: 'active' as const },
  { id: 'other', name: 'Other', status: 'active' as const },
]
function action(id: string) {
  return SOCIAL_ACTIONS.find((entry) => entry.id === id)!
}
function alliance() {
  const reality = createInitialRealityDomainState()
  const pact = createRealityAlliance(reality, {
    id: 'aria-rae',
    kind: 'PACT',
    founderIds: ['aria', 'rae'],
    memberIds: [],
    purpose: 'Mutual protection',
    at: { day: 3, phase: 'social_1' },
  })
  pact.status = 'ACTIVE'
  return { reality, pact }
}
function card(scenarioKey: string, extras: Record<string, unknown> = {}): IncomingInteraction {
  return {
    id: 'card',
    fromId: 'aria',
    type: 'warning',
    text: 'Let us talk.',
    payload: { scenarioKey, ...extras },
    createdAt: 1,
    createdWeek: 3,
    expiresAtWeek: 3,
    read: false,
    requiresResponse: true,
    resolved: false,
  }
}

describe('reported social release regressions', () => {
  it('does not offer or execute Make a Pact with an existing pact partner', () => {
    const { reality, pact } = alliance()
    for (const status of ['ACTIVE', 'PROBATIONARY', 'FRACTURED'] as const) {
      pact.status = status
      expect(
        evaluateSocialActionEligibility({
          action: action('ride_or_die'),
          actorId: 'aria',
          targetIds: ['rae'],
          players,
          reality,
          relationships: { aria: { rae: { affinity: 80, tags: ['romance'] } } },
          dramaMode: true,
          requireCompleteSelection: true,
        })
      ).toEqual({ eligible: false, reason: 'You already share a personal pact' })
    }
  })

  it.each(['rumor', 'pitch_target', 'plant_lie'])(
    'keeps an AI %s from silently targeting their own ally',
    (id) => {
      const { reality } = alliance()
      expect(
        validateSocialExecution(
          {
            game: { phase: 'social_1', week: 3, dramaSocialMode: true, players },
            social: { reality, relationships: {} },
          },
          {
            action: action(id),
            actorId: 'aria',
            targetIds: ['you'],
            subjectId: 'rae',
            allowAIOnly: true,
          }
        ).eligible
      ).toBe(false)
      expect(isProtectedSocialAlly(reality, {}, 'aria', 'rae')).toBe(true)
    }
  )

  it('removes an already queued hostile recommendation when its subject is now allied', () => {
    const { reality } = alliance()
    expect(
      isIncomingInteractionInvalidated(
        card('direct_nomination_pitch', {
          subjectId: 'rae',
          originActionId: 'pitch_target',
        }),
        { phase: 'social_1', week: 3, players, lohId: 'you', nomineeIds: [] },
        reality
      )
    ).toBe(true)
    expect(
      isIncomingInteractionInvalidated(
        card('generic_gossip', {
          subjectId: 'rae',
          originActionId: 'rumor',
        }),
        { phase: 'social_1', week: 3, players, lohId: 'you', nomineeIds: [] },
        reality
      )
    ).toBe(true)
  })

  it('lets a fractured commitment become a strategic target instead of protecting it forever', () => {
    const { reality, pact } = alliance()
    pact.status = 'FRACTURED'
    expect(isProtectedSocialAlly(reality, {}, 'aria', 'rae')).toBe(false)
  })

  it('knows the automatic nominee before the ceremony but does not reuse that rule after Safety', () => {
    const game = { phase: 'social_1', publicModeEnabled: true, lastHohCompFinisherId: 'aria' }
    expect(getPendingAutomaticNomineeId(game)).toBe('aria')
    expect(getPendingAutomaticNomineeId({ ...game, phase: 'social_2' })).toBeNull()
    expect(
      getPendingAutomaticNomineeId({ ...game, doubleEviction: { weekActive: true } })
    ).toBeNull()
    expect(
      getPendingAutomaticNomineeId({ ...game, missionPowers: { automaticNomineeToId: 'rae' } })
    ).toBe('rae')
    for (const scenario of ['hoh_safety_request', 'nominee_hoh_plea']) {
      expect(
        isIncomingInteractionInvalidated(card(scenario), {
          ...game,
          week: 3,
          players,
          lohId: 'you',
          nomineeIds: [],
        })
      ).toBe(true)
    }
    const initialGame = createInitialGameState()
    const fullGame = {
      ...initialGame,
      ...game,
      phase: 'social_1' as const,
      players: players.map((player, index) => ({ ...initialGame.players[index], ...player })),
    }
    expect(
      chooseIncomingInteractionType('aria', 'you', {
        phase: 'social_1',
        week: 3,
        players,
        relationships: {},
        lohId: 'you',
        nomineeIds: [],
        gameState: fullGame,
      })
    ).not.toBe('deal_offer')
  })

  it('does not use an automatic nominee as a new nomination or a deceptive nomination decoy', () => {
    const game = {
      phase: 'social_1',
      publicModeEnabled: true,
      lastHohCompFinisherId: 'aria',
      players,
    }
    const input = {
      game,
      relationships: {},
      lohId: 'you',
      askerId: 'other',
      priorAsks: 0,
      ambushIntent: true,
      random: () => 0,
    }
    expect(resolveLohPlanDisclosure({ ...input, actualTargetId: 'aria' })).toEqual({
      outcome: 'vague',
      statedTargetId: null,
    })
    expect(resolveLohPlanDisclosure({ ...input, actualTargetId: 'rae' })).toEqual({
      outcome: 'vague',
      statedTargetId: null,
    })
  })
})

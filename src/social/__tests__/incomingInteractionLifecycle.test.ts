import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  createInitialGameState,
  hydrateGame,
  setPhase,
  submitHumanVote,
} from '../../store/gameSlice'
import { compareIncomingClock, isIncomingInteractionOverdue } from '../incomingInteractionDeadline'
import {
  createIncomingInteraction,
  normalizeIncomingInteractionContract,
} from '../incomingInteractionFactory'
import {
  assignDeliverySlot,
  deliverScheduledIncomingInteractionsForPhase,
} from '../incomingInteractionScheduler'
import { getIncomingActionContent } from '../incomingActionContentBank'
import { getIncomingInteractionResponseOptions } from '../incomingInteractionPresentation'
import { isIncomingInteractionInvalidated } from '../incomingInteractionValidity'
import { respondToIncomingInteraction } from '../incomingInteractions'
import type { RealityInteraction } from '../reality'
import { socialMiddleware } from '../socialMiddleware'
import socialReducer, {
  hydrateSocial,
  markIncomingInteractionRead,
  pushIncomingInteraction,
  selectPendingIncomingInteractionCount,
  selectUnreadIncomingNoticeCount,
} from '../socialSlice'
import type { IncomingInteraction, ScheduledIncomingInteraction, SocialState } from '../types'

function setup() {
  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  })
  const game = createInitialGameState()
  const human = game.players.find((player) => player.isUser)!
  const [sender, second, loh] = game.players.filter((player) => !player.isUser)
  game.week = 4
  game.phase = 'social_1'
  const required = (overrides: Partial<Parameters<typeof createIncomingInteraction>[0]> = {}) =>
    createIncomingInteraction({
      id: 'required-message',
      fromId: sender.id,
      type: 'check_in',
      text: 'Can we talk?',
      week: 4,
      phase: 'social_1',
      deadlinePhase: 'social_1',
      mode: 'normal',
      responsePolicy: 'required',
      ...overrides,
    })
  return { store, game, human, sender, second, loh, required }
}

function linkedInteraction(fromId: string, targetId: string): RealityInteraction {
  return {
    id: 'linked-scene',
    actionId: 'whisper',
    actorId: fromId,
    targetIds: [targetId],
    direction: 'AI_TO_HUMAN',
    contextSnapshot: {
      day: 4,
      phase: 'social_1',
      gameMode: 'CLASSIC',
      socialIntensity: 'NORMAL',
      audienceMode: 'OFF',
      feedPerspective: 'PLAYER_LIMITED',
      activeActorIds: [fromId, targetId],
      rolesByActor: {},
      atRiskActorIds: [],
      powerHolderIds: [],
    },
    intentTags: [],
    visibility: 'PRIVATE',
    witnessIds: [],
    status: 'AWAITING_HUMAN',
    responseOptions: ['ACCEPT', 'IGNORE'],
    outcomeEventIds: [],
    createdSequence: 1,
  }
}

function withLinkedInteraction(social: SocialState, interaction: RealityInteraction): SocialState {
  return {
    ...social,
    reality: {
      ...social.reality,
      interactions: { ...social.reality.interactions, [interaction.id]: interaction },
    },
  }
}

function scheduled(interaction: IncomingInteraction): ScheduledIncomingInteraction {
  return {
    interaction,
    scheduledForWeek: 4,
    scheduledForDay: 4,
    scheduledForPhase: 'social_1',
    scheduledAt: 1,
    priority: 'high',
    deliveryReason: 'spaced',
  }
}

describe('incoming social lifecycle', () => {
  it.each([
    ['loh_comp_announcement', 'loh_results'],
    ['democracia_vote', 'social_1'],
    ['democracia_results', 'social_1'],
    ['pre_veto_public_save', 'pos_results'],
    ['pos_comp_announcement', 'pos_results'],
    ['pos_comp', 'pos_results'],
    ['pos_ceremony', 'pos_ceremony_results'],
  ])('orders %s before the %s deadline', (phase, deadline) => {
    expect(compareIncomingClock({ day: 4, phase }, { day: 4, phase: deadline })).toBeLessThan(0)
  })

  it('resolves an expired saved conversation with the same effect as a live phase transition', () => {
    const resumed = setup()
    const live = setup()
    const interaction = live.required()
    live.store.dispatch(hydrateGame(live.game))
    live.store.dispatch(pushIncomingInteraction(interaction))
    live.store.dispatch(setPhase('live_vote'))

    resumed.game.phase = 'live_vote'
    resumed.store.dispatch(hydrateGame(resumed.game))
    resumed.store.dispatch(
      hydrateSocial({
        ...resumed.store.getState().social,
        incomingInteractions: [interaction],
      })
    )

    const resumedSocial = resumed.store.getState().social
    const liveSocial = live.store.getState().social
    expect(
      resumedSocial.incomingInteractions.find(({ id }) => id === interaction.id)
    ).toMatchObject({ resolved: true, resolvedWith: 'ignore' })
    expect(
      resumedSocial.relationships[resumed.sender.id]?.[resumed.human.id]?.affinity
    ).toBeLessThan(0)
    expect(resumedSocial.relationships[resumed.sender.id]?.[resumed.human.id]?.affinity).toBe(
      liveSocial.relationships[live.sender.id]?.[live.human.id]?.affinity
    )
  })

  it('does not schedule or deliver a card beyond the same-day phase deadline', () => {
    const { store, game, required, human, sender } = setup()
    const link = linkedInteraction(sender.id, human.id)
    const interaction = required({ payload: { realityInteractionId: link.id } })
    expect(
      assignDeliverySlot({
        week: 4,
        phase: 'social_1',
        priority: 'high',
        slotCounts: new Map(),
        visibleActiveCount: 7,
        interaction,
      })
    ).toBeNull()
    store.dispatch(hydrateGame(game))
    store.dispatch(
      hydrateSocial({
        ...withLinkedInteraction(store.getState().social, link),
        scheduledIncomingInteractions: [scheduled(interaction)],
      })
    )
    deliverScheduledIncomingInteractionsForPhase('social_2', store as never)

    const { social } = store.getState()
    expect(social.scheduledIncomingInteractions).toEqual([])
    expect(social.incomingInteractions).toEqual([])
    expect(social.reality.interactions[link.id]).toMatchObject({
      status: 'EXPIRED',
      outcomeEventIds: [],
    })
    expect(social.relationships[sender.id]?.[human.id]).toBeUndefined()
  })

  it('retires the linked scene when a restored card refers to a participant who left', () => {
    const { store, game, human, sender, second, required } = setup()
    const link = linkedInteraction(sender.id, human.id)
    link.direction = 'GROUP'
    link.targetIds.push(second.id)
    second.status = 'jury'
    const interaction = required({ payload: { realityInteractionId: link.id } })
    store.dispatch(hydrateGame(game))
    store.dispatch(
      hydrateSocial({
        ...withLinkedInteraction(store.getState().social, link),
        incomingInteractions: [interaction],
      })
    )
    expect(store.getState().social.incomingInteractions[0]?.resolvedWith).toBe('dismiss')
    expect(store.getState().social.reality.interactions[link.id]).toMatchObject({
      status: 'INVALIDATED',
      outcomeEventIds: [],
    })
    expect(store.getState().social.relationships[sender.id]?.[human.id]).toBeUndefined()
  })

  it('quietly expires a read-only note and its linked scene without keeping a read badge', () => {
    const { store, game, human, sender, required } = setup()
    const link = linkedInteraction(sender.id, human.id)
    const interaction = required({
      responsePolicy: 'readOnly',
      payload: { realityInteractionId: link.id },
    })
    store.dispatch(hydrateGame(game))
    store.dispatch(
      hydrateSocial({
        ...withLinkedInteraction(store.getState().social, link),
        incomingInteractions: [interaction],
      })
    )
    expect(selectUnreadIncomingNoticeCount(store.getState())).toBe(1)
    expect(selectPendingIncomingInteractionCount(store.getState())).toBe(0)
    store.dispatch(markIncomingInteractionRead(interaction.id))
    expect(selectUnreadIncomingNoticeCount(store.getState())).toBe(0)
    expect(isIncomingInteractionOverdue(interaction, { day: 5, phase: 'week_start' })).toBe(true)

    store.dispatch(hydrateGame({ ...store.getState().game, week: 5, phase: 'week_start' }))
    store.dispatch(hydrateSocial(store.getState().social))
    expect(store.getState().social.incomingInteractions[0]).toMatchObject({
      resolved: true,
      resolvedWith: 'dismiss',
    })
    expect(store.getState().social.reality.interactions[link.id]).toMatchObject({
      status: 'EXPIRED',
      outcomeEventIds: [],
    })
    expect(store.getState().social.relationships[sender.id]?.[human.id]).toBeUndefined()
  })

  it('closes a live vote pitch when the human ballot locks without a late promise or penalty', () => {
    const { store, game, human, sender, second, loh, required } = setup()
    game.phase = 'live_vote'
    game.awaitingHumanVote = true
    game.lohId = loh.id
    game.nomineeIds = [sender.id, second.id]
    const interaction = required({
      type: 'deal_offer',
      phase: 'live_vote',
      deadlinePhase: 'live_vote',
      payload: { scenarioKey: 'live_vote_pitch', nominationBlockIds: game.nomineeIds },
    })

    store.dispatch(hydrateGame(game))
    store.dispatch(pushIncomingInteraction(interaction))
    expect(store.getState().social.incomingInteractions[0]?.resolved).toBe(false)
    store.dispatch(submitHumanVote(second.id))
    expect(store.getState().game.votes?.[human.id]).toBe(second.id)
    expect(store.getState().game.phase).toBe('live_vote')
    expect(store.getState().social.incomingInteractions[0]?.resolvedWith).toBe('dismiss')
    store.dispatch(
      respondToIncomingInteraction({
        interactionId: interaction.id,
        responseType: 'accept',
      }) as never
    )
    expect(store.getState().social.commitments).toEqual([])
    expect(store.getState().social.relationships[sender.id]?.[human.id]).toBeUndefined()
  })

  it('migrates an unresolved legacy nomination warning while preserving its opening and deadline', () => {
    const { required } = setup()
    const legacy = {
      ...required({ text: 'You should be prepared for the block.' }),
      payload: {
        source: 'background_social',
        originActionId: 'nominate',
        scenarioKey: 'nomination_aftershock',
        realityInteractionId: 'linked-nomination',
      },
    }
    expect(normalizeIncomingInteractionContract(legacy)).toMatchObject({
      id: legacy.id,
      text: legacy.text,
      deadline: legacy.deadline,
      type: 'warning',
      requiresResponse: false,
      payload: {
        scenarioKey: 'background_nominate_human',
        responsePolicy: 'optional',
        realityInteractionId: 'linked-nomination',
      },
    })
    expect(
      normalizeIncomingInteractionContract({ ...legacy, resolved: true }).payload?.scenarioKey
    ).toBe('nomination_aftershock')
  })

  it('distinguishes nomination setup from aftermath within the nomination ceremony phase', () => {
    const { game, human, sender, required } = setup()
    game.lohId = human.id
    game.phase = 'nomination_results'
    game.awaitingNominations = true
    const request = required({ payload: { scenarioKey: 'hoh_safety_request' } })
    const aftermath = required({ payload: { scenarioKey: 'nomination_aftershock' } })
    expect(isIncomingInteractionInvalidated(request, game)).toBe(false)
    expect(isIncomingInteractionInvalidated(aftermath, game)).toBe(true)
    game.awaitingNominations = false
    game.nomineeIds = [sender.id]
    expect(isIncomingInteractionInvalidated(request, game)).toBe(true)
    expect(isIncomingInteractionInvalidated(aftermath, game)).toBe(false)
  })

  it.each(['ask_safety_plan', 'ask_hold_safety'] as const)(
    'routes %s from a background scene to the human Safety holder',
    (actionId) => {
      const { store, game, human, sender, second, loh, required } = setup()
      game.phase = 'pos_results'
      game.lohId = sender.id
      game.posWinnerId = human.id
      game.nomineeIds = [second.id, loh.id]
      sender.status = 'loh'
      human.status = 'pos'
      const link = linkedInteraction(sender.id, human.id)
      link.actionId = actionId
      const content = getIncomingActionContent(actionId)!
      const interaction = required({
        type: content.interactionType,
        phase: 'pos_results',
        deadlinePhase: undefined,
        responsePolicy: actionId === 'ask_safety_plan' ? 'optional' : 'required',
        payload: {
          source: 'background_social',
          originActionId: actionId,
          realityInteractionId: link.id,
          scenarioKey: content.scenarioKey,
          nominationBlockIds: [...game.nomineeIds],
        },
      })
      const pendingCeremony = { ...game, phase: 'pos_ceremony_results', awaitingPovDecision: true }
      expect(isIncomingInteractionInvalidated(interaction, pendingCeremony)).toBe(false)
      expect(
        isIncomingInteractionInvalidated(interaction, {
          ...pendingCeremony,
          awaitingPovDecision: false,
        })
      ).toBe(true)
      expect(
        isIncomingInteractionInvalidated(interaction, { ...game, posWinnerId: second.id })
      ).toBe(true)
      expect(
        isIncomingInteractionInvalidated(interaction, { ...game, nomineeIds: [second.id] })
      ).toBe(true)
      if (actionId === 'ask_hold_safety') {
        expect(isIncomingInteractionInvalidated(interaction, { ...game, lohId: second.id })).toBe(
          true
        )
      }

      const legacy = normalizeIncomingInteractionContract({
        ...interaction,
        deadline: { day: 5, phase: 'nomination_results', policy: 'AUTO_IGNORE' },
        payload: { ...interaction.payload, scenarioKey: 'hoh_safety_request' },
      })
      expect(legacy.payload?.scenarioKey).toBe(content.scenarioKey)
      if (actionId === 'ask_hold_safety') {
        expect(legacy.deadline).toMatchObject({ day: 4, phase: 'pos_ceremony_results' })
      }

      store.dispatch(hydrateGame(game))
      store.dispatch(hydrateSocial(withLinkedInteraction(store.getState().social, link)))
      store.dispatch(pushIncomingInteraction(interaction))
      expect(store.getState().social.incomingInteractions[0]?.resolved).toBe(false)
      const [choice] = getIncomingInteractionResponseOptions(interaction.type, interaction)
      store.dispatch(
        respondToIncomingInteraction({
          interactionId: interaction.id,
          choiceId: choice.id,
        }) as never
      )
      expect(store.getState().social.incomingInteractions[0]?.resolved).toBe(true)
      if (actionId === 'ask_hold_safety') {
        expect(Object.values(store.getState().social.reality.promises)).toContainEqual(
          expect.objectContaining({ kind: 'hold_safety', promisorId: human.id, status: 'ACTIVE' })
        )
      }
    }
  )

  it('invalidates a linked Safety consultation when the block or the canonical holder changes', () => {
    const { game, human, sender, second, loh, required } = setup()
    game.phase = 'pos_results'
    game.lohId = human.id
    game.posWinnerId = sender.id
    game.nomineeIds = [second.id]
    sender.status = 'pos'
    const consultation = required({
      type: 'deal_offer',
      phase: 'pos_results',
      deadlinePhase: 'pos_ceremony',
      payload: {
        scenarioKey: 'safety_holder_consults_loh',
        nominationBlockIds: [...game.nomineeIds],
      },
    })
    expect(isIncomingInteractionInvalidated(consultation, game)).toBe(false)
    expect(isIncomingInteractionInvalidated(consultation, { ...game, posWinnerId: loh.id })).toBe(
      true
    )
    expect(isIncomingInteractionInvalidated(consultation, { ...game, nomineeIds: [loh.id] })).toBe(
      true
    )
    expect(isIncomingInteractionInvalidated(consultation, { ...game, phase: 'social_2' })).toBe(
      true
    )
  })
})

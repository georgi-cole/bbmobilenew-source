import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  activateCupidArrowNow,
  advance,
  createInitialGameState,
  getSafetyRelationshipScore,
  hydrateGame,
} from '../../store/gameSlice'
import { createIncomingInteraction } from '../incomingInteractionFactory'
import { respondToIncomingInteraction } from '../incomingInteractions'
import {
  REALITY_ACTION_BY_ID,
  addRealityFact,
  createInitialRealityDomainState,
  resolvePendingHumanRealityInteraction,
  runRealityOpportunity,
  type RealityActorSnapshot,
} from '../reality'
import { createInitialRealitySimulationState } from '../realitySimulation'
import socialReducer, {
  commitRealityDomainUpdate,
  hydrateSocial,
  pushIncomingInteraction,
} from '../socialSlice'

describe('linked incoming relationship continuity', () => {
  it('keeps Cupid and intel effects while settling the direct pair once, including after reload', () => {
    const store = configureStore({ reducer: { game: gameReducer, social: socialReducer } })
    const game = createInitialGameState()
    game.week = 3
    game.phase = 'social_1'
    store.dispatch(hydrateGame(game))
    store.dispatch(activateCupidArrowNow())
    const human = game.players.find((player) => player.isUser)!
    const [senderId, partnerId] = store
      .getState()
      .game.cupidArrow!.pairs.find((pair) => !pair.memberIds.includes(human.id))!.memberIds
    const ids = [senderId, human.id, partnerId]
    const actors = Object.fromEntries(
      ids.map((id): [string, RealityActorSnapshot] => [
        id,
        {
          id,
          isHuman: id === human.id,
          active: true,
          roles: ['active'],
          resources: { energy: 20, influence: 1_000, info: 1_000 },
        },
      ])
    )
    const domain = createInitialRealityDomainState()
    const factId = 'fact:incoming-relationship-continuity'
    addRealityFact(domain, {
      id: factId,
      propositionType: 'SECRET_MEETING',
      subjectIds: [senderId, partnerId],
      value: true,
      day: 3,
      phase: 'social_1',
      visibility: 'PAIR_ONLY',
      participantIds: [senderId, partnerId],
      witnessIds: [],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'meeting:incoming-relationship-continuity',
    })
    const pending = runRealityOpportunity({
      domain,
      simulation: createInitialRealitySimulationState(31),
      opportunity: {
        actorId: senderId,
        direction: 'AI_TO_HUMAN',
        context: {
          day: 3,
          phase: 'social_1',
          gameMode: 'CLASSIC',
          socialIntensity: 'REALITY',
          audienceMode: 'OFF',
          feedPerspective: 'PLAYER_LIMITED',
          activeActorIds: ids,
          rolesByActor: Object.fromEntries(ids.map((id) => [id, ['active']])),
          atRiskActorIds: [],
          powerHolderIds: [],
        },
        actors,
        candidates: [{ action: REALITY_ACTION_BY_ID.get('compliment')!, targetIds: [human.id] }],
      },
    })
    expect(pending.interaction?.status, JSON.stringify(pending.simulation.trace)).toBe(
      'AWAITING_HUMAN'
    )
    const interactionId = pending.interaction!.id
    const direct = resolvePendingHumanRealityInteraction({
      domain: pending.domain,
      interactionId,
      humanId: human.id,
      responseType: 'positive',
      day: 3,
      phase: 'social_1',
    })
    store.dispatch(commitRealityDomainUpdate({ domain: pending.domain }))
    const incoming = createIncomingInteraction({
      id: 'linked-compliment',
      fromId: senderId,
      type: 'compliment',
      text: 'You kept the conversation going today.',
      week: 3,
      phase: 'social_1',
      mode: 'drama',
      payload: {
        scenarioKey: 'generic_check_in',
        originActionId: 'compliment',
        source: 'background_social',
        realityInteractionId: interactionId,
        intelFactId: factId,
      },
    })
    store.dispatch(pushIncomingInteraction(incoming))
    const respond = respondToIncomingInteraction({
      interactionId: incoming.id,
      responseType: 'positive',
    })
    store.dispatch(respond as never)

    const settled = store.getState().social
    expect(settled.incomingInteractions[0]).toMatchObject({ resolved: true })
    expect(settled.reality.interactions[interactionId].status).toBe('RESOLVED')
    for (const [from, to] of [
      [senderId, human.id],
      [human.id, senderId],
    ]) {
      const expected = direct.domain.relationships[from][to]
      expect(settled.reality.relationships[from][to]).toMatchObject({
        warmth: expected.warmth,
        trust: expected.trust,
        familiarity: expected.familiarity,
      })
    }
    expect(settled.relationships[partnerId]?.[human.id]?.affinity).toBeGreaterThan(0)
    expect(settled.reality.relationships[partnerId]?.[human.id]?.warmth).toBeGreaterThan(0)
    expect(settled.reality.beliefsByOwner[human.id]?.[`belief:${human.id}:${factId}`]).toBeDefined()
    expect(
      (settled.intelligenceDeliveries ?? []).filter((entry) => entry.factId === factId)
    ).toHaveLength(1)

    store.dispatch(hydrateSocial(JSON.parse(JSON.stringify(settled))))
    const resumed = store.getState().social
    expect(resumed.incomingInteractions[0]).toMatchObject({ resolved: true })
    expect(resumed.reality.relationships[partnerId]?.[human.id]).toEqual(
      settled.reality.relationships[partnerId]?.[human.id]
    )
    store.dispatch(respond as never)
    expect(store.getState().social).toBe(resumed)
  })

  it('carries a named nonbinding Safety recommendation through a save into the real ceremony', () => {
    const game = createInitialGameState({ seed: 41 })
    const human = game.players.find((player) => player.isUser)!
    const [holderTemplate, nomineeTemplate, , , ...remaining] = game.players.filter(
      (player) => !player.isUser
    )
    const holder = { ...holderTemplate, id: 'safety-holder', status: 'pos' as const }
    human.status = 'loh'
    const nominees = ['first', 'second', 'third'].map((slot) => ({
      ...nomineeTemplate,
      id: `safety-${slot}`,
      name: `${slot} nominee`,
      status: 'nominated' as const,
    }))
    const [first, second, third] = nominees
    game.players = [human, holder, ...nominees, ...remaining]
    game.week = 3
    game.phase = 'pos_ceremony'
    game.lohId = human.id
    game.posWinnerId = holder.id
    game.nomineeIds = nominees.map(({ id }) => id)
    game.doubleEviction = { usedCount: 1, weekActive: true, pendingSecondEviction: null }
    game.strategicRelationships = {
      [holder.id]: {
        [first.id]: { affinity: 78, tags: [] },
        [second.id]: { affinity: 76, tags: [] },
        [third.id]: { affinity: 75, tags: [] },
      },
    }
    // Equal competition records leave a small relationship preference for the
    // first nominee. The named recommendation can tip this close choice.
    expect(getSafetyRelationshipScore(game, holder.id, nominees[0])).toBeGreaterThan(
      getSafetyRelationshipScore(game, holder.id, nominees[2])
    )
    expect(gameReducer(game, advance()).povSavedId).toBe(first.id)
    const store = configureStore({
      reducer: { game: gameReducer, social: socialReducer },
    })
    store.dispatch(hydrateGame(game))
    const interaction = createIncomingInteraction({
      id: 'safety-advice-ceremony',
      fromId: holder.id,
      type: 'deal_offer',
      text: 'Who do you think I should save?',
      week: game.week,
      phase: game.phase,
      mode: 'normal',
      payload: {
        scenarioKey: 'safety_holder_consults_loh',
        nomineeIds: game.nomineeIds,
        nomineeNames: nominees.map(({ name }) => name),
      },
    })
    store.dispatch(pushIncomingInteraction(interaction))
    store.dispatch(
      respondToIncomingInteraction({
        interactionId: interaction.id,
        choiceId: `safety-save:${third.id}`,
      }) as never
    )

    const before = store.getState()
    expect(before.game.lohSafetyAdvice).toMatchObject({ advice: 'use', targetId: third.id })
    expect(before.game.povSavedId).toBeNull()
    expect(before.game.nomineeIds).toEqual(game.nomineeIds)
    store.dispatch(hydrateGame(JSON.parse(JSON.stringify(before.game))))
    store.dispatch(hydrateSocial(JSON.parse(JSON.stringify(before.social))))
    expect(store.getState().game.lohSafetyAdvice).toEqual(before.game.lohSafetyAdvice)
    store.dispatch(advance())
    const after = store.getState().game
    expect(after.phase).toBe('pos_ceremony_results')
    expect(after.povSavedId, JSON.stringify(after.tvFeed.slice(-3))).toBe(third.id)
    expect(after.nomineeIds).not.toContain(third.id)
    expect(after.replacementNeeded).toBe(true)
  })
})

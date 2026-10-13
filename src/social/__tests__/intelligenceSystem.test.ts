import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import type { AiGameIdentity } from '../../ai/aiGameIdentity'
import type { Player } from '../../types'
import { addRealityFact, learnRealityFact } from '../reality/knowledge'
import { createInitialRealityDomainState } from '../reality/state'
import {
  getRealityAllianceKnowledgeView,
  recordRealityAllianceDiscovery,
  recordRealityAllianceInvitation,
} from '../reality/allianceKnowledge'
import { createRealityAlliance } from '../reality/relationshipForms'
import { SOCIAL_INITIAL_STATE } from '../constants'
import { migrateSocialState } from '../socialStateMigration'
import socialReducer, {
  hydrateSocial,
  recordIntelligenceDelivery,
  replaceRealityDomain,
} from '../socialSlice'
import { deliverIntelActionFact } from '../intelligenceMiddleware'
import {
  applyCompetitionIntentToScore,
  buildIntelFactFromSocialAction,
  decideCompetitionIntent,
  formatFauxTvWhisper,
  getIntelLeadViews,
  makeIntelMemory,
  selectDiscoverableFact,
  selectIntelActionFact,
  selectIntelFactForActor,
  selectFauxTvFact,
} from '../intelligenceSystem'

const floater: AiGameIdentity = {
  archetype: 'active_floater',
  temperament: 'secretive',
  competitionDrive: 0.35,
  emotionalVolatility: 0.25,
  audienceFocus: 0.4,
  survivalFocus: 0.45,
}

const players: Player[] = [
  { id: 'human', name: 'You', avatar: '', status: 'active', isUser: true },
  { id: 'sol', name: 'Sol', avatar: '', status: 'active', aiGameIdentity: floater },
  { id: 'lux', name: 'Lux', avatar: '', status: 'active' },
]

describe('intelligence system', () => {
  it('never introduces competition throwing in Surveyeval or before day three', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      expect(
        decideCompetitionIntent(seed, 'sol', floater, {
          mode: 'survival',
          day: 8,
          phase: 'loh_comp',
          prizeType: 'LOH',
        })
      ).toBe('compete')
      expect(
        decideCompetitionIntent(seed, 'sol', floater, {
          mode: 'classic',
          day: 2,
          phase: 'loh_comp',
          prizeType: 'LOH',
        })
      ).toBe('compete')
    }
  })

  it('makes an intentional throw visibly weaker without forcing a zero score', () => {
    const score = applyCompetitionIntentToScore(
      900,
      {
        key: 'test',
        category: 'mental',
        scoreDirection: 'higher-is-better',
        volatility: 0.2,
        weights: { mental: 1, physical: 0, precision: 0, nerve: 0 },
        minScore: 100,
        maxScore: 1000,
      },
      'throw',
      44,
      'sol'
    )
    expect(score).toBeGreaterThan(100)
    expect(score).toBeLessThan(500)
  })

  it('turns witnessed social behaviour into a persistent, sourced lead', () => {
    const fact = buildIntelFactFromSocialAction(
      {
        actionId: 'proposeAlliance',
        actorId: 'sol',
        targetId: 'lux',
        cost: 1,
        delta: 4,
        outcome: 'success',
        newEnergy: 4,
        timestamp: 1234,
        week: 4,
        phase: 'social_1',
        source: 'system',
      },
      players,
      'social_1'
    )
    expect(fact?.propositionType).toBe('SECRET_ALLIANCE')
    expect(fact).not.toBeNull()
    if (!fact) return

    const domain = createInitialRealityDomainState()
    addRealityFact(domain, fact)
    const memory = makeIntelMemory({
      ownerId: 'human',
      fact,
      sourceType: 'HEARSAY',
      sourceChain: ['lux'],
      confidence: 0.7,
      day: 4,
      phase: 'social_1',
    })
    learnRealityFact(domain, { ownerId: 'human', factId: fact.id, memory, confidence: 0.7 })
    const [lead] = getIntelLeadViews(domain, 'human', players, 4)
    expect(lead.text).toContain('Sol, Lux')
    expect(lead.confidence).toBe('Credible')
    expect(lead.source).toBe('Hub rumour')
  })

  it('keeps facts about eliminated players out of current Intel leads', () => {
    const fact = buildIntelFactFromSocialAction(
      {
        actionId: 'proposeAlliance',
        actorId: 'sol',
        targetId: 'lux',
        cost: 1,
        delta: 4,
        outcome: 'success',
        newEnergy: 4,
        timestamp: 1234,
        week: 4,
        phase: 'social_1',
        source: 'system',
      },
      players,
      'social_1'
    )
    expect(fact).not.toBeNull()
    if (!fact) return

    const domain = createInitialRealityDomainState()
    addRealityFact(domain, fact)
    const memory = makeIntelMemory({
      ownerId: 'human',
      fact,
      sourceType: 'HEARSAY',
      sourceChain: ['sol'],
      confidence: 0.7,
      day: 4,
      phase: 'social_1',
    })
    learnRealityFact(domain, { ownerId: 'human', factId: fact.id, memory, confidence: 0.7 })

    const withLuxEvicted = players.map((player) =>
      player.id === 'lux' ? { ...player, status: 'evicted' as const } : player
    )
    expect(getIntelLeadViews(domain, 'human', withLuxEvicted, 4)).toEqual([])
  })

  it('varies repeated private-meeting lead copy while retaining the concrete names', () => {
    const domain = createInitialRealityDomainState()
    for (const id of ['a', 'c']) {
      const fact = {
        id,
        propositionType: 'SECRET_MEETING' as const,
        subjectIds: ['sol', 'lux'],
        value: true,
        day: 4,
        phase: 'social_1',
        visibility: 'PAIR_ONLY' as const,
        participantIds: ['sol', 'lux'],
        witnessIds: ['human'],
        viewerVisible: false,
        publicVisible: false,
        juryVisible: false,
        sourceEventId: `social:${id}`,
      }
      addRealityFact(domain, fact)
      const memory = makeIntelMemory({
        ownerId: 'human',
        fact,
        sourceType: 'WITNESSED',
        sourceChain: ['human'],
        confidence: 0.7,
        day: 4,
        phase: 'social_1',
      })
      learnRealityFact(domain, { ownerId: 'human', factId: fact.id, memory, confidence: 0.7 })
    }

    const leads = getIntelLeadViews(domain, 'human', players, 4)
    expect(new Set(leads.map((lead) => lead.text)).size).toBeGreaterThan(1)
    expect(leads.every((lead) => lead.text.includes('Sol and Lux'))).toBe(true)
  })

  it('offers targeted intel only while the source knows something the recipient does not', () => {
    const domain = createInitialRealityDomainState()
    const fact = {
      id: 'fact:intel:targeting-human',
      propositionType: 'TARGETING',
      subjectIds: ['lux'],
      objectId: 'human',
      value: true,
      day: 4,
      phase: 'social_2',
      visibility: 'PRIVATE' as const,
      participantIds: ['lux', 'sol'],
      witnessIds: ['sol'],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'strategy:targeting-human',
    }
    addRealityFact(domain, fact)

    const sourceMemory = makeIntelMemory({
      ownerId: 'sol',
      fact,
      sourceType: 'WITNESSED',
      sourceChain: ['sol'],
      confidence: 0.84,
      day: 4,
      phase: 'social_2',
    })
    learnRealityFact(domain, {
      ownerId: 'sol',
      factId: fact.id,
      memory: sourceMemory,
      confidence: 0.84,
    })

    expect(selectIntelFactForActor(domain, 'sol', 'human', 4, players)?.fact.id).toBe(fact.id)

    const recipientMemory = makeIntelMemory({
      ownerId: 'human',
      fact,
      sourceType: 'HEARSAY',
      sourceChain: ['sol'],
      confidence: 0.84,
      day: 4,
      phase: 'social_2',
    })
    learnRealityFact(domain, {
      ownerId: 'human',
      factId: fact.id,
      memory: recipientMemory,
      confidence: 0.84,
    })

    expect(selectIntelFactForActor(domain, 'sol', 'human', 4, players)).toBeNull()
  })

  it('round-trips rejected-invitation knowledge and delivery deduplication through a saved social state', () => {
    const domain = createInitialRealityDomainState()
    const alliance = createRealityAlliance(domain, {
      id: 'rejected-invite-pact',
      founderIds: ['sol', 'mara'],
      memberIds: ['kai'],
      purpose: 'Protect the vote',
      at: { day: 4, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'

    expect(
      recordRealityAllianceInvitation(domain, {
        allianceId: alliance.id,
        inviterId: 'sol',
        inviteeId: 'lux',
        at: { day: 4, phase: 'social_1' },
        sourceEventId: 'invite-rejected-by-lux',
      })
    ).not.toBeNull()
    expect(alliance.memberIds).not.toContain('lux')

    const factId = Object.keys(domain.beliefsByOwner.lux ?? {})[0]?.replace('belief:lux:', '')
    expect(factId).toBeTruthy()
    const savedSocialState = JSON.parse(
      JSON.stringify({
        ...SOCIAL_INITIAL_STATE,
        reality: domain,
        intelligenceDeliveries: [
          {
            id: `intel-delivery:action:lux:${factId}`,
            factId,
            channel: 'social_action',
            day: 4,
            recipientId: 'lux',
          },
        ],
      })
    )

    const restored = migrateSocialState(savedSocialState)
    const view = getRealityAllianceKnowledgeView(restored.reality, alliance.id, 'lux')

    expect(view.fullMembershipKnown).toBe(true)
    expect(view.knownMemberIds.sort()).toEqual(['kai', 'mara', 'sol'])
    expect(restored.intelligenceDeliveries).toHaveLength(1)
    expect(restored.intelligenceDeliveries?.[0]?.factId).toBe(factId)

    const store = configureStore({ reducer: { social: socialReducer } })
    store.dispatch(hydrateSocial(restored))
    store.dispatch(recordIntelligenceDelivery(restored.intelligenceDeliveries![0]))
    expect(store.getState().social.intelligenceDeliveries).toHaveLength(1)
  })

  it('shares a genuinely new member from an overlapping pact once, without repeating the chain', () => {
    const domain = createInitialRealityDomainState()
    const inner = createRealityAlliance(domain, {
      id: 'overlap-inner-pact',
      founderIds: ['lia', 'kai'],
      memberIds: [],
      purpose: 'Core protection',
      at: { day: 3, phase: 'social_1' },
    })
    inner.status = 'ACTIVE'
    const wider = createRealityAlliance(domain, {
      id: 'overlap-wide-pact',
      founderIds: ['lia', 'kai'],
      memberIds: ['nova'],
      purpose: 'Wider vote plan',
      at: { day: 4, phase: 'social_1' },
    })
    wider.status = 'ACTIVE'

    recordRealityAllianceInvitation(domain, {
      allianceId: inner.id,
      inviterId: 'lia',
      inviteeId: 'lux',
      at: { day: 4, phase: 'social_1' },
      sourceEventId: 'inner-invite',
    })
    recordRealityAllianceDiscovery(domain, {
      allianceId: wider.id,
      observerId: 'sol',
      revealedMemberIds: wider.memberIds,
      confidence: 0.9,
      fullMembershipKnown: true,
      at: { day: 5, phase: 'social_1' },
      sourceEventId: 'wider-discovery',
    })

    const offered = selectIntelFactForActor(domain, 'sol', 'lux', 5, players)
    expect(offered?.fact.objectId).toBe(wider.id)
    expect(offered?.fact.subjectIds).toContain('nova')

    if (!offered) throw new Error('Expected the wider alliance lead to be offered')
    learnRealityFact(domain, {
      ownerId: 'lux',
      factId: offered.fact.id,
      confidence: 0.72,
      memory: makeIntelMemory({
        ownerId: 'lux',
        fact: offered.fact,
        sourceType: 'HEARSAY',
        sourceChain: ['sol'],
        confidence: 0.72,
        day: 5,
        phase: 'social_1',
      }),
    })

    expect(selectIntelFactForActor(domain, 'sol', 'lux', 5, players)).toBeNull()
  })

  it('keeps public alliance exposure copy compact for large coalitions', () => {
    const extendedPlayers: Player[] = [
      ...players,
      { id: 'mara', name: 'Mara', avatar: '', status: 'active' },
      { id: 'kai', name: 'Kai', avatar: '', status: 'active' },
    ]
    const text = formatFauxTvWhisper(
      {
        id: 'public-alliance',
        propositionType: 'ALLIANCE_EXPOSED',
        subjectIds: ['sol', 'lux', 'mara', 'kai'],
        value: 'The Circle',
        day: 5,
        phase: 'social_2',
        visibility: 'HOUSE_PUBLIC',
        participantIds: ['sol', 'lux', 'mara', 'kai'],
        witnessIds: [],
        viewerVisible: true,
        publicVisible: true,
        juryVisible: true,
        sourceEventId: 'alliance-exposure',
      },
      extendedPlayers
    )

    expect(text).toContain('Sol, Lux, Mara and 1 other')
    expect(text).not.toContain('Kai')
  })

  it('keeps unwitnessed private facts out of ordinary observation', () => {
    const domain = createInitialRealityDomainState()
    addRealityFact(domain, {
      id: 'fact:intel:private-meeting',
      propositionType: 'SECRET_MEETING',
      subjectIds: ['sol', 'lux'],
      value: true,
      day: 4,
      phase: 'social_1',
      visibility: 'PAIR_ONLY',
      participantIds: ['sol', 'lux'],
      witnessIds: [],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'social:private-meeting',
    })

    expect(selectDiscoverableFact(domain, 'human', 4, new Set(), players, true)).toBeNull()
    expect(selectDiscoverableFact(domain, 'human', 4, new Set(), players, false)?.id).toBe(
      'fact:intel:private-meeting'
    )
  })

  it('uses one shared daily cap for observation discovery and private intel delivery', () => {
    const domain = createInitialRealityDomainState()
    addRealityFact(domain, {
      id: 'fact:intel:observed-meeting',
      propositionType: 'SECRET_MEETING',
      subjectIds: ['sol', 'lux'],
      value: true,
      day: 4,
      phase: 'social_1',
      visibility: 'GROUP_VISIBLE',
      participantIds: ['sol', 'lux'],
      witnessIds: ['sol'],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'social:observed-meeting',
    })

    expect(selectIntelActionFact(domain, [], 'human', 4, 'observe', players)?.id).toBe(
      'fact:intel:observed-meeting'
    )
    expect(
      selectIntelActionFact(
        domain,
        [
          {
            id: 'incoming-one',
            factId: 'other-one',
            channel: 'incoming',
            day: 4,
            recipientId: 'human',
          },
          {
            id: 'incoming-two',
            factId: 'other-two',
            channel: 'incoming',
            day: 4,
            recipientId: 'human',
          },
        ],
        'human',
        4,
        'observe',
        players
      )
    ).toBeNull()
    expect(selectIntelActionFact(domain, [], 'human', 2, 'observe', players)).toBeNull()
  })

  it('replays an observed lead into the restored Reality domain exactly once', () => {
    const store = configureStore({ reducer: { social: socialReducer } })
    const domain = createInitialRealityDomainState()
    const fact = {
      id: 'fact:intel:restored-observation',
      propositionType: 'SECRET_MEETING' as const,
      subjectIds: ['sol', 'lux'],
      value: true,
      day: 4,
      phase: 'social_1',
      visibility: 'GROUP_VISIBLE' as const,
      participantIds: ['sol', 'lux'],
      witnessIds: ['sol'],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'social:restored-observation',
    }
    addRealityFact(domain, fact)
    store.dispatch(replaceRealityDomain(domain))

    deliverIntelActionFact(store.dispatch, fact, 'human', 'observe', 4, 'social_1')
    deliverIntelActionFact(store.dispatch, fact, 'human', 'observe', 4, 'social_1')

    const restored = store.getState().social
    expect(restored.reality.beliefsByOwner.human[`belief:human:${fact.id}`]?.status).toBe('ACTIVE')
    expect(restored.intelligenceDeliveries).toHaveLength(1)
  })


  it('filters current intel involving eliminated participants and allows fresh intel after a return', () => {
    const domain = createInitialRealityDomainState()
    const fact = {
      id: 'fact:ash-lux-warning',
      propositionType: 'SECRET_MEETING',
      subjectIds: ['sol', 'lux'],
      value: true,
      day: 4,
      phase: 'social_1',
      visibility: 'GROUP_VISIBLE' as const,
      participantIds: ['sol', 'lux'],
      witnessIds: ['human'],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'social:ash-lux',
    }
    addRealityFact(domain, fact)
    const memory = makeIntelMemory({
      ownerId: 'human',
      fact,
      sourceType: 'WITNESSED',
      sourceChain: ['human'],
      confidence: 0.8,
      day: 4,
      phase: 'social_1',
    })
    learnRealityFact(domain, { ownerId: 'human', factId: fact.id, memory, confidence: 0.8 })

    const withLuxEliminated = players.map((player) =>
      player.id === 'lux' ? { ...player, status: 'evicted' as const } : player
    )
    expect(selectIntelFactForActor(domain, 'human', 'mara', 4, withLuxEliminated)).toBeNull()
    expect(selectDiscoverableFact(domain, 'mara', 4, new Set(), withLuxEliminated)).toBeNull()
    expect(
      selectIntelActionFact(domain, [], 'mara', 4, 'observe', withLuxEliminated)
    ).toBeNull()
    expect(selectFauxTvFact(domain, 4, new Set(), withLuxEliminated)).toBeNull()
    expect(getIntelLeadViews(domain, 'human', withLuxEliminated, 4)).toEqual([])

    const luxReturns = withLuxEliminated.map((player) =>
      player.id === 'lux'
        ? { ...player, status: 'active' as const, firstEvictedAtWeek: 3 }
        : player
    )
    expect(selectDiscoverableFact(domain, 'mara', 4, new Set(), luxReturns)?.id).toBe(fact.id)

    const stalePreReturnFact = { ...fact, id: 'fact:before-return', day: 3 }
    addRealityFact(domain, stalePreReturnFact)
    expect(
      selectDiscoverableFact(domain, 'mara', 4, new Set([fact.id]), luxReturns)
    ).toBeNull()
  })

})

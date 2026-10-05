import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  commitNominees,
  createInitialGameState,
  submitPovDecision,
  setReplacementNominee,
  submitDiamondReplacement,
  submitCoupReplacement,
  submitCoLohNomination,
} from '../../store/gameSlice'
import socialReducer, { addSocialCommitment, replaceRealityDomain } from '../socialSlice'
import { socialMiddleware } from '../socialMiddleware'
import { realityIntegrityMiddleware } from '../realityIntegrityMiddleware'
import {
  createInitialRealityDomainState,
  createRealityAlliance,
  finalizeRealityVote,
  computeRealityJuryEvaluation,
  recordRealityCeremonyOutcome,
  recordRealityAllianceBetrayal,
  upsertRealityPromise,
} from '../reality'
import { upsertRealityFacadeAgreement } from '../reality/facadeAgreements'
import { getDecisionRelationshipTags } from '../reality/decisionRelationships'
import type { RealityCeremonyInput } from '../reality/ceremonies'
import type { RealityDomainState } from '../reality/types'

function pact(state: RealityDomainState, id = 'pact', members: string[] = []) {
  const alliance = createRealityAlliance(state, {
    id,
    founderIds: ['loh', 'ally'],
    memberIds: members,
    purpose: 'Work together',
    at: { day: 3, phase: 'social_1' },
  })
  alliance.status = 'ACTIVE'
  return alliance
}

function nomination(overrides: Partial<RealityCeremonyInput> = {}): RealityCeremonyInput {
  return {
    kind: 'NOMINATIONS_LOCKED',
    actorId: 'loh',
    targetIds: ['ally'],
    day: 3,
    phase: 'nomination_results',
    witnessIds: ['loh', 'ally', 'outsider'],
    publicEligible: false,
    eligibleAlternativeIds: ['outsider'],
    ...overrides,
  }
}

function promise(
  state: RealityDomainState,
  kind = 'protect',
  status: 'ACTIVE' | 'PROPOSED' = 'ACTIVE'
) {
  upsertRealityPromise(state, {
    id: 'promise',
    kind,
    status,
    promisorId: 'loh',
    beneficiaryIds: ['ally'],
    witnessIds: [],
    createdAt: { day: 3, phase: 'social_1' },
    stakes: 0.8,
    scope: {},
    deadline: { day: 3, phase: 'eviction_results' },
  })
}

function facade(state: RealityDomainState, stage: 'INITIAL_NOMINATION' | 'REPLACEMENT', day = 3) {
  upsertRealityFacadeAgreement(state, {
    id: 'facade',
    lohId: 'loh',
    facadeId: 'ally',
    day,
    stage,
    status: 'ACCEPTED',
    voluntary: true,
  })
}

function betrayals(state: RealityDomainState) {
  return state.events.filter((event) => event.type === 'ALLIANCE_BETRAYAL')
}

describe('coordinated betrayal consequences', () => {
  it('keeps both relationship directions, commitment, and promises untouched by automatic placement', () => {
    const state = createInitialRealityDomainState()
    const alliance = pact(state)
    promise(state)
    const relationships = structuredClone(state.relationships)
    relationships.loh.ally.activePromiseIds = []
    const commitments = structuredClone(alliance.memberCommitment)
    recordRealityCeremonyOutcome(state, nomination({ automaticTargetIds: ['ally'] }))
    expect(state.relationships).toEqual(relationships)
    expect(alliance.memberCommitment).toEqual(commitments)
    expect(alliance.status).toBe('ACTIVE')
    expect(state.promises.promise.status).toBe('VOID')
    expect(betrayals(state)).toHaveLength(0)
    expect(state.contestants.ally.stress).toBeGreaterThan(0)
  })

  it.each(['INITIAL_NOMINATION', 'REPLACEMENT'] as const)(
    'honors consent at the %s stage',
    (stage) => {
      const state = createInitialRealityDomainState()
      const alliance = pact(state)
      promise(state)
      facade(state, stage)
      const before = structuredClone(state.relationships)
      before.loh.ally.activePromiseIds = []
      const commitments = structuredClone(alliance.memberCommitment)
      recordRealityCeremonyOutcome(state, nomination({ nominationStage: stage }))
      expect(state.relationships).toEqual(before)
      expect(alliance.memberCommitment).toEqual(commitments)
      expect(state.promises.promise.status).toBe('VOID')
      expect(betrayals(state)).toHaveLength(0)
    }
  )

  it.each(['wrong-day', 'wrong-stage'])('does not reuse %s consent', (variant) => {
    const state = createInitialRealityDomainState()
    pact(state)
    facade(
      state,
      variant === 'wrong-stage' ? 'REPLACEMENT' : 'INITIAL_NOMINATION',
      variant === 'wrong-day' ? 2 : 3
    )
    recordRealityCeremonyOutcome(state, nomination())
    expect(betrayals(state)).toHaveLength(1)
  })

  it('records deliberate same-day betrayal once and does not stack a broken promise penalty', () => {
    const state = createInitialRealityDomainState()
    const alliance = pact(state)
    promise(state)
    recordRealityCeremonyOutcome(state, nomination())
    const commitments = structuredClone(alliance.memberCommitment)
    const relationships = structuredClone(state.relationships)
    recordRealityCeremonyOutcome(state, nomination())
    expect(betrayals(state)).toHaveLength(1)
    expect(alliance.status).toBe('FRACTURED')
    expect(state.promises.promise.status).toBe('BROKEN')
    expect(alliance.memberCommitment).toEqual(commitments)
    expect(state.relationships).toEqual(relationships)
    const withoutPromise = createInitialRealityDomainState()
    const plainAlliance = pact(withoutPromise)
    recordRealityCeremonyOutcome(withoutPromise, nomination())
    expect(alliance.memberCommitment).toEqual(plainAlliance.memberCommitment)
  })

  it('limits equally protected forced nominations to hurt, while preserving stronger-bond protection', () => {
    const state = createInitialRealityDomainState()
    const alliance = pact(state, 'group', ['other-ally'])
    const tags = { ally: ['alliance'], 'other-ally': ['alliance'] }
    recordRealityCeremonyOutcome(
      state,
      nomination({ eligibleAlternativeIds: ['other-ally'], relationshipTagsByTarget: tags })
    )
    expect(betrayals(state)).toHaveLength(1) // A core ally was bypassed for a peripheral ally.
    const equal = createInitialRealityDomainState()
    pact(equal, 'pair-one')
    createRealityAlliance(equal, {
      id: 'pair-two',
      founderIds: ['loh', 'other-ally'],
      memberIds: [],
      purpose: 'Work together',
      at: { day: 3, phase: 'social_1' },
    }).status = 'ACTIVE'
    recordRealityCeremonyOutcome(equal, nomination({ eligibleAlternativeIds: ['other-ally'] }))
    expect(betrayals(equal)).toHaveLength(0)
    expect(alliance.memberIds).toContain('ally')
  })

  it('ignores old alliance and romance tags when the formal bonds ended', () => {
    const state = createInitialRealityDomainState()
    pact(state).status = 'DISSOLVED'
    expect(
      getDecisionRelationshipTags(state, 'loh', 'ally', [
        'alliance',
        'primary_alliance',
        'ride_or_die',
        'romance',
      ])
    ).toEqual([])
    recordRealityCeremonyOutcome(state, nomination())
    expect(betrayals(state)).toHaveLength(0)
  })

  it('does not turn a proposed promise into betrayal during a forced choice', () => {
    const state = createInitialRealityDomainState()
    pact(state)
    promise(state, 'protect', 'PROPOSED')
    recordRealityCeremonyOutcome(state, nomination({ eligibleAlternativeIds: [] }))
    expect(state.promises.promise.status).toBe('PROPOSED')
    expect(betrayals(state)).toHaveLength(0)
  })

  it.each(['SAFETY_USED', 'SAFETY_DECLINED'] as const)(
    'assesses abandoning an ally during %s',
    (kind) => {
      const state = createInitialRealityDomainState()
      pact(state)
      promise(state, 'use_safety_on_player')
      recordRealityCeremonyOutcome(
        state,
        nomination({
          kind,
          phase: 'pos_ceremony_results',
          targetIds: kind === 'SAFETY_USED' ? ['outsider'] : ['ally', 'outsider'],
          safetyEligibleTargetIds: ['ally', 'outsider'],
        })
      )
      expect(betrayals(state)).toHaveLength(1)
      expect(state.promises.promise.status).toBe('BROKEN')
    }
  )

  it('does not label a self-save as betrayal without a promise', () => {
    const state = createInitialRealityDomainState()
    pact(state)
    recordRealityCeremonyOutcome(
      state,
      nomination({
        kind: 'SAFETY_USED',
        targetIds: ['loh'],
        phase: 'pos_ceremony_results',
        safetyEligibleTargetIds: ['loh', 'ally'],
      })
    )
    expect(betrayals(state)).toHaveLength(0)
  })

  it('voids a Safety promise when its beneficiary cannot be saved', () => {
    const state = createInitialRealityDomainState()
    const alliance = pact(state)
    promise(state, 'use_safety_on_player')
    const before = structuredClone(alliance.memberCommitment)
    recordRealityCeremonyOutcome(
      state,
      nomination({
        kind: 'SAFETY_DECLINED',
        targetIds: ['outsider'],
        phase: 'pos_ceremony_results',
        safetyEligibleTargetIds: ['outsider'],
      })
    )
    expect(state.promises.promise.status).toBe('VOID')
    expect(alliance.memberCommitment).toEqual(before)
  })

  it('does not expose secret ballots; revealed evidence applies fallout once', () => {
    const state = createInitialRealityDomainState()
    const alliance = pact(state)
    const relationships = structuredClone(state.relationships)
    const commitments = structuredClone(alliance.memberCommitment)
    finalizeRealityVote(
      state,
      'loh',
      'ally',
      { day: 3, phase: 'live_vote' },
      'ballot',
      ['ally', 'outsider'],
      { revealed: false }
    )
    expect(state.voteIntents.loh.actualTargetId).toBe('ally')
    expect(state.relationships).toEqual(relationships)
    expect(alliance.memberCommitment).toEqual(commitments)
    expect(betrayals(state)).toHaveLength(0)
    finalizeRealityVote(state, 'loh', 'ally', { day: 3, phase: 'eviction_results' }, 'evidence', [
      'ally',
      'outsider',
    ])
    const after = structuredClone(state.relationships)
    finalizeRealityVote(
      state,
      'loh',
      'ally',
      { day: 3, phase: 'eviction_results' },
      'more-evidence',
      ['ally', 'outsider']
    )
    expect(betrayals(state)).toHaveLength(1)
    expect(state.relationships).toEqual(after)
  })

  it('honors an accepted request to hold Safety without accusing the ally of abandonment', () => {
    const state = createInitialRealityDomainState()
    pact(state)
    promise(state, 'hold_safety')
    const before = structuredClone(state.relationships.ally.loh)
    const event = recordRealityCeremonyOutcome(
      state,
      nomination({
        kind: 'SAFETY_DECLINED',
        phase: 'pos_ceremony_results',
        targetIds: ['ally', 'outsider'],
        safetyEligibleTargetIds: ['ally', 'outsider'],
      })
    )
    expect(state.relationships.ally.loh).toEqual(before)
    expect(state.promises.promise.status).toBe('KEPT')
    expect(event.tags).toContain('consented_safety:ally')
    expect(betrayals(state)).toHaveLength(0)
  })

  it('waits for the full multi-save decision and rewards each saved player only once', () => {
    const state = createInitialRealityDomainState()
    pact(state)
    promise(state, 'use_safety_on_player')
    const input = nomination({
      kind: 'SAFETY_USED',
      phase: 'pos_ceremony_results',
      targetIds: ['outsider'],
      safetyEligibleTargetIds: ['ally', 'outsider'],
      safetyDecisionComplete: false,
    })
    recordRealityCeremonyOutcome(state, input)
    expect(state.promises.promise.status).toBe('ACTIVE')
    expect(betrayals(state)).toHaveLength(0)
    const outsider = structuredClone(state.relationships.outsider.loh)
    recordRealityCeremonyOutcome(state, {
      ...input,
      targetIds: ['outsider', 'ally'],
      safetyDecisionComplete: true,
    })
    expect(state.promises.promise.status).toBe('KEPT')
    expect(betrayals(state)).toHaveLength(0)
    expect(state.relationships.outsider.loh).toEqual(outsider)
  })

  it.each(['vote_to_keep', 'tie_break_keep'])(
    'resolves an accepted %s promise as protection rather than a vote to evict',
    (kind) => {
      const state = createInitialRealityDomainState()
      const alliance = pact(state)
      promise(state, kind)
      finalizeRealityVote(state, 'loh', 'ally', { day: 3, phase: 'live_vote' }, 'public-vote', [
        'ally',
        'outsider',
      ])
      expect(state.promises.promise.status).toBe('BROKEN')
      expect(betrayals(state)).toHaveLength(1)
      const withoutPromise = createInitialRealityDomainState()
      const plain = pact(withoutPromise)
      finalizeRealityVote(
        withoutPromise,
        'loh',
        'ally',
        { day: 3, phase: 'live_vote' },
        'public-vote',
        ['ally', 'outsider']
      )
      expect(alliance.memberCommitment).toEqual(plain.memberCommitment)
    }
  )

  it('voids public vote promises when the beneficiary was not a legal choice', () => {
    const state = createInitialRealityDomainState()
    const alliance = pact(state)
    promise(state, 'vote_to_keep')
    const before = structuredClone(alliance.memberCommitment)
    finalizeRealityVote(state, 'loh', 'outsider', { day: 3, phase: 'live_vote' }, 'public-vote', [
      'outsider',
      'other',
    ])
    expect(state.promises.promise.status).toBe('VOID')
    expect(alliance.memberCommitment).toEqual(before)
  })

  it('keeps secret vote truth out of the juror goodbye evaluation', () => {
    const state = createInitialRealityDomainState()
    pact(state)
    recordRealityCeremonyOutcome(
      state,
      nomination({ kind: 'EVICTION', actorId: undefined, phase: 'eviction_results' })
    )
    const before = computeRealityJuryEvaluation(state, 'ally', 'loh', false)
    finalizeRealityVote(
      state,
      'loh',
      'ally',
      { day: 3, phase: 'live_vote' },
      'ballot',
      ['ally', 'outsider'],
      { revealed: false }
    )
    expect(computeRealityJuryEvaluation(state, 'ally', 'loh', false)).toEqual(before)
  })

  it('updates overlapping pacts without multiplying pair relationship damage', () => {
    const single = createInitialRealityDomainState()
    pact(single)
    const overlap = structuredClone(single)
    pact(overlap, 'second-pact')
    const input = {
      actorId: 'loh',
      targetId: 'ally',
      kind: 'NOMINATION' as const,
      at: { day: 3, phase: 'nomination_results' },
      sourceEventId: 'choice',
    }
    const singleBefore = single.relationships.ally.loh.trust
    recordRealityAllianceBetrayal(single, input)
    const before = overlap.relationships.ally.loh.trust
    recordRealityAllianceBetrayal(overlap, input)
    expect(before - overlap.relationships.ally.loh.trust).toBeCloseTo(
      singleBefore - single.relationships.ally.loh.trust
    )
    expect(betrayals(overlap)).toHaveLength(2)
  })
})

describe('production middleware attribution', () => {
  function makeStore(
    publicModeEnabled = true,
    options: {
      withPromises?: boolean
      setup?: (game: ReturnType<typeof createInitialGameState>, reality: RealityDomainState) => void
    } = {}
  ) {
    const game = createInitialGameState({ seed: 7 })
    const ids = ['loh', 'ally', 'one', 'two', 'spare']
    game.players = game.players.slice(0, 5).map((player, index) => ({
      ...player,
      id: ids[index],
      name: ids[index],
      isUser: index === 0,
      status: index === 0 ? ('loh' as const) : ('active' as const),
    }))
    Object.assign(game, {
      week: 3,
      phase: 'nomination_results',
      lohId: 'loh',
      nomineeIds: [],
      publicModeEnabled,
      dramaSocialMode: true,
      awaitingNominations: true,
      lastHohCompFinisherId: 'ally',
    })
    const reality = createInitialRealityDomainState()
    pact(reality)
    if (options.withPromises !== false) promise(reality)
    options.setup?.(game, reality)
    let social = socialReducer(undefined, { type: 'init' })
    social = socialReducer(social, replaceRealityDomain(reality))
    if (options.withPromises !== false)
      social = socialReducer(
        social,
        addSocialCommitment({
          id: 'legacy-promise',
          interactionId: 'request',
          kind: 'protect_from_nomination',
          promisorId: 'loh',
          beneficiaryId: 'ally',
          createdWeek: 3,
          dueWeek: 3,
          status: 'pending',
        })
      )
    return configureStore({
      reducer: { game: gameReducer, social: socialReducer },
      preloadedState: { game, social },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false }).concat(
          socialMiddleware,
          realityIntegrityMiddleware
        ),
    })
  }

  it('preserves the last-place ally through real nominations, both promise systems, and replay', () => {
    const store = makeStore()
    const before = structuredClone(store.getState().social.reality.relationships)
    before.loh.ally.activePromiseIds = []
    store.dispatch(commitNominees(['one', 'two']))
    const state = store.getState()
    expect(state.game.nominationContext?.autoNomineeId).toBe('ally')
    expect(state.social.reality.relationships.ally.loh).toEqual(before.ally.loh)
    expect(state.social.reality.relationships.loh.ally).toEqual(before.loh.ally)
    expect(state.social.reality.alliances.pact.status).toBe('ACTIVE')
    expect(state.social.reality.promises.promise.status).toBe('VOID')
    expect(state.social.commitments[0].status).toBe('void')
    expect(betrayals(state.social.reality)).toHaveLength(0)
    const after = structuredClone(state.social.reality)
    store.dispatch(commitNominees(['one', 'two']))
    expect(store.getState().social.reality).toEqual(after)
  })

  it('keeps both allies and protection promises intact when the automatic nominee leaves exactly two legal LOH choices', () => {
    const store = makeStore(true, {
      setup(game, reality) {
        game.players = game.players.filter((player) => player.id !== 'two')
        game.lastHohCompFinisherId = 'spare'
        createRealityAlliance(reality, {
          id: 'second-pact',
          founderIds: ['loh', 'one'],
          memberIds: [],
          purpose: 'Work together',
          at: { day: 3, phase: 'social_1' },
        }).status = 'ACTIVE'
      },
    })
    const before = structuredClone(store.getState().social.reality.relationships)

    store.dispatch(commitNominees(['ally', 'one']))
    const state = store.getState()
    expect(state.game.nominationContext?.autoNomineeId).toBe('spare')
    expect(state.game.nominationDecisionReasons?.['3:loh:INITIAL:ally']?.forcedChoice).toBe(true)
    expect(state.game.nominationDecisionReasons?.['3:loh:INITIAL:one']?.forcedChoice).toBe(true)
    expect(state.social.reality.relationships.ally.loh).toEqual(before.ally.loh)
    expect(state.social.reality.relationships.one.loh).toEqual(before.one.loh)
    expect(state.social.reality.alliances.pact.status).toBe('ACTIVE')
    expect(state.social.reality.alliances['second-pact'].status).toBe('ACTIVE')
    expect(state.social.reality.promises.promise.status).toBe('VOID')
    expect(state.social.commitments[0].status).toBe('void')
    expect(betrayals(state.social.reality)).toHaveLength(0)
  })

  it('keeps the sole eligible allied backup intact when a nominee saves themself', () => {
    const store = makeStore(false, {
      setup(game) {
        game.players = game.players.filter((player) => player.id !== 'spare')
        Object.assign(game, {
          phase: 'pos_ceremony_results',
          nomineeIds: ['one'],
          posWinnerId: 'two',
          povSavedId: 'two',
          povProtectedIds: ['two'],
          replacementNeeded: true,
        })
      },
    })
    const before = structuredClone(store.getState().social.reality.relationships.ally.loh)

    store.dispatch(setReplacementNominee('ally'))
    const state = store.getState()
    expect(state.game.nominationDecisionReasons?.['3:loh:REPLACEMENT:ally']?.forcedChoice).toBe(
      true
    )
    expect(state.social.reality.relationships.ally.loh).toEqual(before)
    expect(state.social.reality.alliances.pact.status).toBe('ACTIVE')
    expect(state.social.reality.promises.promise.status).toBe('VOID')
    expect(betrayals(state.social.reality)).toHaveLength(0)
  })

  it('does not manufacture a Safety decision from a rejected action', () => {
    const store = makeStore()
    const before = structuredClone(store.getState().social.reality)
    store.dispatch(submitPovDecision(false))
    expect(store.getState().social.reality).toEqual(before)
  })

  it('does not count an immune outsider as an available nomination alternative', () => {
    const store = makeStore(false, {
      withPromises: false,
      setup(game, reality) {
        createRealityAlliance(reality, {
          id: 'equal-pact',
          founderIds: ['loh', 'two'],
          memberIds: [],
          purpose: 'Work together',
          at: { day: 3, phase: 'social_1' },
        }).status = 'ACTIVE'
        game.storeNominationProtections = [{ productKey: 'immunity', targetId: 'spare', week: 3 }]
      },
    })
    store.dispatch(commitNominees(['ally', 'one']))
    expect(store.getState().game.nomineeIds).toContain('ally')
    expect(betrayals(store.getState().social.reality)).toHaveLength(0)
    expect(store.getState().social.reality.alliances.pact.status).toBe('ACTIVE')
  })

  it('excludes the Safety holder and saved player from replacement alternatives', () => {
    const store = makeStore(false, {
      withPromises: false,
      setup(game) {
        Object.assign(game, {
          phase: 'pos_ceremony_results',
          nomineeIds: ['two'],
          posWinnerId: 'spare',
          povSavedId: 'one',
          povProtectedIds: ['one'],
          replacementNeeded: true,
        })
      },
    })
    store.dispatch(setReplacementNominee('ally'))
    expect(store.getState().game.nomineeIds).toContain('ally')
    expect(betrayals(store.getState().social.reality)).toHaveLength(0)
  })

  it('attributes a Diamond replacement to its holder and leaves the LOH relationship alone', () => {
    const store = makeStore(false, {
      withPromises: false,
      setup(game, reality) {
        Object.assign(game, {
          phase: 'pos_ceremony_results',
          nomineeIds: ['two'],
          posWinnerId: 'spare',
        })
        game.specialVeto!.activeType = 'diamond'
        game.specialVeto!.awaitingHolderReplacement = true
        createRealityAlliance(reality, {
          id: 'holder-pact',
          founderIds: ['spare', 'ally'],
          memberIds: [],
          purpose: 'Work together',
          at: { day: 3, phase: 'social_1' },
        }).status = 'ACTIVE'
      },
    })
    const before = structuredClone(store.getState().social.reality.relationships.ally.loh)
    store.dispatch(submitDiamondReplacement('ally'))
    expect(store.getState().game.nomineeIds).toContain('ally')
    expect(betrayals(store.getState().social.reality).map((event) => event.actorId)).toEqual([
      'spare',
    ])
    expect(store.getState().social.reality.relationships.ally.loh).toEqual(before)
    expect(store.getState().social.reality.alliances.pact.status).toBe('ACTIVE')
  })

  it('uses Detox holder authority and includes legally targetable co-LOHs as alternatives', () => {
    const store = makeStore(false, {
      withPromises: false,
      setup(game, reality) {
        Object.assign(game, {
          phase: 'pos_ceremony_results',
          nomineeIds: [],
          posWinnerId: 'spare',
          coLohIds: ['loh', 'one'],
          coLohNomineeByCoLohId: { loh: 'ally' },
        })
        game.specialVeto!.activeType = 'coup'
        game.specialVeto!.awaitingCoupReplacement1 = true
        createRealityAlliance(reality, {
          id: 'holder-pact',
          founderIds: ['spare', 'ally'],
          memberIds: [],
          purpose: 'Work together',
          at: { day: 3, phase: 'social_1' },
        }).status = 'ACTIVE'
      },
    })
    store.dispatch(submitCoupReplacement('ally'))
    expect(betrayals(store.getState().social.reality)).toHaveLength(0)
    store.dispatch(submitCoupReplacement('two'))
    expect(store.getState().game.nomineeIds).toEqual(['ally', 'two'])
    expect(betrayals(store.getState().social.reality).map((event) => event.actorId)).toEqual([
      'spare',
    ])
    expect(store.getState().social.reality.alliances.pact.status).toBe('ACTIVE')
  })

  it('attributes a co-LOH nomination only to the co-LOH who selected it', () => {
    const store = makeStore(false, {
      withPromises: false,
      setup(game, reality) {
        Object.assign(game, { coLohIds: ['loh', 'spare'], awaitingCoLohNomination: true })
        game.players.forEach((player) => {
          player.isUser = player.id === 'spare'
        })
        createRealityAlliance(reality, {
          id: 'second-loh-pact',
          founderIds: ['spare', 'ally'],
          memberIds: [],
          purpose: 'Work together',
          at: { day: 3, phase: 'social_1' },
        }).status = 'ACTIVE'
      },
    })
    store.dispatch(submitCoLohNomination({ coLohId: 'spare', nomineeId: 'ally' }))
    expect(store.getState().game.nomineeIds).toContain('ally')
    expect(betrayals(store.getState().social.reality).map((event) => event.actorId)).toEqual([
      'spare',
    ])
    expect(store.getState().social.reality.alliances.pact.status).toBe('ACTIVE')
  })
})

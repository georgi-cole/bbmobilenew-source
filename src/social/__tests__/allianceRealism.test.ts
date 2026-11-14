import { describe, expect, it, vi } from 'vitest'
import type { RootState } from '../../store/store'
import type { GameState, Player, StrategicAllianceSnapshot } from '../../types'
import {
  chooseAiEvictionVote,
  getNominationTargetScore,
  getStrategicAllianceDecisionRead,
} from '../../store/gameSlice'
import socialReducer, { commitRealityDomainUpdate, replaceRealityDomain } from '../socialSlice'
import { allianceManagementMiddleware } from '../allianceManagementMiddleware'
import { buildStrategicRelationshipSnapshot } from '../socialMiddleware'
import { getSocialExperienceRead } from '../socialDecisionPreferences'
import type { SocialActionLogEntry } from '../types'
import {
  selectCanonicalRelationshipView,
  getCanonicalRelationshipLabel,
} from '../relationshipSemantics'
import { buildAllianceConsultationPlan } from '../reality/humanFlow'
import { manageAlliance } from '../reality/allianceManagement'
import { recordRealityCeremonyOutcome } from '../reality/ceremonies'
import { getDecisionRelationshipTags } from '../reality/decisionRelationships'
import { getRealityBetrayalStatus, hasRealityRomanticBond } from '../reality/relationshipFacts'
import { getObservedRelationshipSignals } from '../reality/relationshipSignals'
import { createInitialRealityDomainState, ensureRealityActors } from '../reality/state'
import { deriveRelationshipLabel } from '../reality/relationships'
import {
  applyRealityApology,
  createRealityAlliance,
  recordRealityAllianceBetrayal,
  removeRealityAllianceMember,
  signalRealityRomance,
} from '../reality/relationshipForms'

const at = { day: 4, phase: 'social_1' }
const ids = ['human', 'ali', 'ash', 'outsider', 'other']
const name = (id: string) =>
  ({ human: 'You', ali: 'Ali', ash: 'Ash', outsider: 'Outsider' })[id] ?? id

function fixture(withPact = false) {
  const domain = createInitialRealityDomainState()
  ensureRealityActors(domain, ids)
  createRealityAlliance(domain, {
    id: 'group',
    kind: 'GROUP',
    founderIds: ['human', 'ali', 'ash'],
    memberIds: [],
    purpose: 'Mutual protection',
    name: 'The Three',
    at,
    leaderId: 'ash',
  }).status = 'ACTIVE'
  if (withPact)
    createRealityAlliance(domain, {
      id: 'personal',
      founderIds: ['human', 'ali'],
      memberIds: [],
      purpose: 'Mutual protection',
      at,
    }).status = 'ACTIVE'
  signalRealityRomance(domain, {
    actorId: 'human',
    targetId: 'ali',
    at,
    acceptedByTarget: true,
    settings: { enabled: true },
  })
  for (const [source, target] of [
    ['human', 'ali'],
    ['ali', 'human'],
  ]) {
    const edge = domain.relationships[source][target]
    Object.assign(edge, {
      warmth: 75,
      trust: 70,
      loyalty: 75,
      attraction: 75,
      intimacy: 65,
      strategicValue: 65,
      reliability: 70,
    })
    edge.perceivedLabel = deriveRelationshipLabel(edge)
  }
  return domain
}

function nominate(domain: ReturnType<typeof fixture>) {
  return recordRealityCeremonyOutcome(domain, {
    kind: 'NOMINATIONS_LOCKED',
    actorId: 'ash',
    targetIds: ['human'],
    day: 4,
    phase: 'nomination_results',
    witnessIds: ids,
    eligibleAlternativeIds: ['outsider'],
    publicEligible: false,
  })
}

function leave(domain: ReturnType<typeof fixture>) {
  return removeRealityAllianceMember(domain, {
    allianceId: 'group',
    memberId: 'human',
    actorId: 'human',
    kind: 'VOLUNTARY',
    at: { day: 4, phase: 'social_2' },
  })
}

function pactSnapshot(): StrategicAllianceSnapshot {
  return {
    id: 'pact',
    memberIds: ['ali', 'human'],
    leaderIds: ['ali'],
    status: 'ACTIVE',
    cohesion: 0.9,
    fractureRisk: 0.05,
    currentTargetIds: [],
    fallbackTargetIds: [],
    memberCommitment: { ali: 0.95, human: 0.95 },
    memberPerceivedStatus: { ali: 'CORE', human: 'CORE' },
    memberPlanBeliefs: { ali: [], human: [] },
    infiltratorIds: [],
  }
}

function gameFixture(): GameState {
  const player = (id: string) =>
    ({
      id,
      name: name(id),
      isUser: id === 'human',
      status: id === 'human' || id === 'outsider' ? 'nominated' : 'active',
      stats: { lohWins: 0, posWins: 0, timesNominated: 1 },
    }) as Player
  return {
    week: 4,
    phase: 'social_2',
    mode: 'classic',
    lohId: 'ash',
    seed: 17,
    dramaSocialMode: true,
    nomineeIds: ['human', 'outsider'],
    players: ids.map(player),
    strategicAlliances: [pactSnapshot()],
    strategicRelationships: {
      ali: {
        human: {
          affinity: 75,
          tags: ['alliance', 'romance'],
          reality: {
            trust: 70,
            loyalty: 75,
            resentment: 0,
            suspicion: 0,
            fear: 0,
          },
        },
        outsider: { affinity: 0, tags: [] },
      },
    },
  } as unknown as GameState
}

describe('alliance realism across commitments and decisions', () => {
  it('keeps Ali separate from Ash when a betrayed member leaves their group', () => {
    const domain = fixture(true)
    const trust = domain.relationships.ali.human.trust
    const loyalty = domain.relationships.ali.human.loyalty
    const trustInAsh = domain.relationships.ali.ash.trust
    nominate(domain)
    expect(domain.relationships.ali.ash.trust).toBeLessThan(trustInAsh)
    expect(
      domain.events.some(
        (event) =>
          event.type === 'ALLIANCE_BETRAYAL_REACTION' &&
          event.actorId === 'ali' &&
          event.tags.includes('SUPPORTS_TARGET')
      )
    ).toBe(true)
    leave(domain)
    expect(domain.relationships.ali.human.trust).toBe(trust)
    expect(domain.relationships.ali.human.loyalty).toBe(loyalty)
    expect(domain.alliances.personal.status).toBe('ACTIVE')
    expect(domain.events.find((event) => event.type === 'ALLIANCE_MEMBER_LEFT')?.tags).toContain(
      'JUSTIFIED_EXIT'
    )
    const social = socialReducer(undefined, replaceRealityDomain(domain))
    const view = selectCanonicalRelationshipView({
      reality: social.reality,
      relationships: social.relationships,
      actorId: 'human',
      targetId: 'ali',
    })
    expect(view.visibleTags.has('alliance')).toBe(true)
    expect(view.visibleTags.has('betrayal')).toBe(false)
    expect(view.visibleTags.has('broken_alliance')).toBe(false)
    expect(hasRealityRomanticBond(social.reality, 'human', 'ali')).toBe(true)
  })

  it('describes a departed group without announcing a broken romance or personal pact', () => {
    const domain = fixture()
    nominate(domain)
    leave(domain)
    const social = socialReducer(undefined, replaceRealityDomain(domain))
    const tags = social.relationships.human.ali.tags
    expect(tags).toContain('former_group')
    expect(tags).toContain('romance')
    expect(tags).not.toContain('broken_alliance')
    expect(tags).not.toContain('betrayal')
    const signals = getObservedRelationshipSignals({
      state: social.reality,
      viewerId: 'human',
      targetId: 'ali',
      day: 4,
      name,
    })
    expect(signals.join(' ')).toContain('Ali backed you')
    expect(signals.join(' ')).toContain('Your romance continues')
    expect(signals.join(' ')).toContain('no separate personal protection pact')
  })

  it('allows a bystander to defend the betrayer when their existing allegiance favors them', () => {
    const domain = fixture()
    Object.assign(domain.relationships.ali.human, { trust: 0, loyalty: 0 })
    Object.assign(domain.relationships.ali.ash, { trust: 80, loyalty: 85 })
    nominate(domain)
    const signals = getObservedRelationshipSignals({
      state: domain,
      viewerId: 'human',
      targetId: 'ali',
      day: 4,
      name,
    })
    expect(signals.join(' ')).toContain("Ali defended Ash's decision")
  })

  it('does not multiply witness fallout across overlapping alliances or replayed ceremonies', () => {
    const domain = fixture()
    createRealityAlliance(domain, {
      id: 'overlap',
      kind: 'GROUP',
      founderIds: ['human', 'ali', 'ash', 'other'],
      memberIds: [],
      purpose: 'Protection',
      at,
    }).status = 'ACTIVE'
    const input = {
      actorId: 'ash',
      targetId: 'human',
      kind: 'NOMINATION' as const,
      at,
      sourceEventId: 'one-nomination',
    }
    recordRealityAllianceBetrayal(domain, input)
    const trust = domain.relationships.ali.ash.trust
    recordRealityAllianceBetrayal(domain, input)
    expect(domain.relationships.ali.ash.trust).toBe(trust)
    expect(
      domain.events.filter(
        (event) => event.type === 'ALLIANCE_BETRAYAL_REACTION' && event.actorId === 'ali'
      )
    ).toHaveLength(1)
  })

  it.each(['VOLUNTARY', 'EXPELLED', 'DISSOLVE'] as const)(
    'does not turn %s membership loss into a betrayal by the human',
    (kind) => {
      const domain = fixture()
      nominate(domain)
      let social = socialReducer(undefined, replaceRealityDomain(structuredClone(domain)))
      if (kind === 'VOLUNTARY') leave(domain)
      else if (kind === 'EXPELLED')
        removeRealityAllianceMember(domain, {
          allianceId: 'group',
          memberId: 'human',
          actorId: 'ash',
          kind,
          at,
        })
      else
        manageAlliance(
          domain,
          { type: 'DISSOLVE', actorId: 'ash', allianceId: 'group' },
          { at, activeActorIds: ids, humanActorIds: ['human'], seed: 17 }
        )
      const game = gameFixture()
      const dispatch = vi.fn((action: unknown) => action)
      const invoke = allianceManagementMiddleware({
        getState: () => ({ game, social }),
        dispatch,
      } as never)(((action: Parameters<typeof socialReducer>[1]) => {
        social = socialReducer(social, action)
        return action
      }) as never)
      invoke(replaceRealityDomain(domain))
      const logged = dispatch.mock.calls
        .map(([action]) => action as ReturnType<typeof import('../socialSlice').recordSocialAction>)
        .find((action) => action.type === 'social/recordSocialAction')?.payload.entry
      expect(logged?.actionId).toBe('alliance_membership_ended')
      expect(
        getSocialExperienceRead('ali', 'human', { recentActions: logged ? [logged] : [], week: 4 })
          .betrayal
      ).toBe(0)
    }
  )

  it('keeps real manual pact-breaking distinct from a mislabelled receipt in an old save', () => {
    const old = {
      actionId: 'break_alliance',
      actorId: 'human',
      targetId: 'ali',
      targetIds: ['ali'],
      source: 'system',
      delta: 0,
      outcome: 'success',
      week: 4,
      narrative: 'The last alliance connection through the selected commitment has ended.',
    } as SocialActionLogEntry
    expect(
      getSocialExperienceRead('ali', 'human', { recentActions: [old], week: 4 }).betrayal
    ).toBe(0)
    expect(
      getSocialExperienceRead('ali', 'human', {
        recentActions: [{ ...old, source: 'manual' }],
        week: 4,
      }).betrayal
    ).toBeGreaterThan(0)
  })

  it('directs an expulsion grievance toward the leader without automatically blaming the expelled member', () => {
    const domain = fixture()
    const trustInLeader = domain.relationships.human.ash.trust
    const bystanderTrust = domain.relationships.ali.human.trust
    removeRealityAllianceMember(domain, {
      allianceId: 'group',
      memberId: 'human',
      actorId: 'ash',
      kind: 'EXPELLED',
      at,
    })
    expect(domain.relationships.human.ash.trust).toBeLessThan(trustInLeader)
    expect(domain.relationships.ali.human.trust).toBe(bystanderTrust)
    expect(Object.values(domain.grievances)).toEqual(
      expect.arrayContaining([expect.objectContaining({ holderId: 'human', againstId: 'ash' })])
    )
  })

  it('preserves uninvolved personal loyalty when a third member fractures the group', () => {
    const domain = fixture()
    nominate(domain)
    expect(domain.alliances.group.status).toBe('FRACTURED')
    expect(getDecisionRelationshipTags(domain, 'ali', 'human')).toContain('alliance')
    const social = socialReducer(undefined, replaceRealityDomain(domain))
    const game = gameFixture()
    game.strategicRelationships = social.relationships
    game.strategicAlliances = [social.reality.alliances.group]
    expect(getStrategicAllianceDecisionRead(game, 'ali', 'human').sharedProtection).toBeGreaterThan(
      0
    )
    expect(getStrategicAllianceDecisionRead(game, 'human', 'ash').sharedProtection).toBe(0)
  })

  it('keeps retaliation directional and removes it after genuine repair, including partial projection', () => {
    const domain = fixture()
    nominate(domain)
    let social = socialReducer(undefined, replaceRealityDomain(structuredClone(domain)))
    expect(social.relationships.human.ash.tags).toContain('betrayal')
    expect(social.relationships.ash.human.tags).not.toContain('betrayal')
    expect(social.relationships.ash.human.tags).toContain('betrayed_them')
    const grievance = Object.values(domain.grievances).find(
      (entry) => entry.holderId === 'human' && entry.againstId === 'ash'
    )!
    for (let i = 0; i < 30 && grievance.status !== 'RESOLVED'; i++)
      applyRealityApology(domain, {
        grievanceId: grievance.id,
        apologyEventId: `repair:${i}`,
        sincerity: 1,
        accountability: 1,
        at: { day: 5 + i, phase: 'social_1' },
      })
    expect(getRealityBetrayalStatus(domain, 'human', 'ash')).toBe('REPAIRED')
    social = socialReducer(
      social,
      commitRealityDomainUpdate({
        domain,
        changedRelationshipPairs: [{ sourceId: 'human', targetId: 'ash' }],
      })
    )
    expect(social.relationships.human.ash.tags).not.toContain('betrayal')
    expect(social.relationships.ash.human.tags).not.toContain('betrayed_them')
    expect(social.relationships.ash.human.tags).toContain('repaired_betrayal')
  })

  it('uses one romance fact for protection, including mutual old saves but excluding ended romance', () => {
    const domain = fixture()
    domain.romances = {}
    expect(hasRealityRomanticBond(domain, 'human', 'ali')).toBe(true)
    expect(getDecisionRelationshipTags(domain, 'human', 'ali')).toContain('romance')
    const romantic = fixture()
    Object.values(romantic.romances)[0].status = 'ENDED'
    expect(hasRealityRomanticBond(romantic, 'human', 'ali')).toBe(false)
    expect(getDecisionRelationshipTags(romantic, 'human', 'ali', ['romance'])).not.toContain(
      'romance'
    )
    const projected = socialReducer(undefined, replaceRealityDomain(romantic))
    expect(projected.relationships.human.ali.tags).not.toContain('romance')
  })

  it('does not promote one-sided attraction to a mutual Power pair promise', () => {
    const domain = fixture()
    const edge = domain.relationships.human.ali
    expect(getCanonicalRelationshipLabel(edge, false, 4, false, false, false)).toBe(
      'Romantic interest'
    )
    expect(getCanonicalRelationshipLabel(edge, false, 4, false, false, true)).toBe('Romance')
    expect(getCanonicalRelationshipLabel(edge, true, 4, false, true, true)).toBe('Power pair')
    domain.romances = {}
    domain.relationships.ali.human.perceivedLabel = 'FRIENDLY'
    expect(hasRealityRomanticBond(domain, 'human', 'ali')).toBe(false)
  })

  it('rebuilds a resumed Reality decision snapshot instead of trusting old symmetric betrayal tags', () => {
    const domain = fixture()
    nominate(domain)
    const social = structuredClone(socialReducer(undefined, replaceRealityDomain(domain)))
    social.relationships.ash.human.tags = ['alliance', 'betrayal']
    social.relationships.ali.human.reality = {
      trust: 0,
      loyalty: 0,
      resentment: 0,
      suspicion: 0,
      fear: 0,
    }
    const state = { game: gameFixture(), social } as unknown as RootState
    const snapshot = buildStrategicRelationshipSnapshot(state)
    expect(snapshot.ash.human.tags).not.toContain('betrayal')
    expect(snapshot.human.ash.tags).toContain('betrayal')
    expect(snapshot.ali.human.reality?.trust).toBe(70)
    expect(social.relationships.ash.human.tags).toContain('betrayal')
  })

  it('preserves Normal mode relationships when building its strategic snapshot', () => {
    const game = gameFixture()
    game.dramaSocialMode = false
    const social = socialReducer(undefined, replaceRealityDomain(fixture()))
    const snapshot = buildStrategicRelationshipSnapshot({ game, social } as unknown as RootState)
    expect(snapshot).toEqual(social.relationships)
  })

  it('keeps responsibility after old event detail has been trimmed from a save', () => {
    const domain = fixture()
    nominate(domain)
    domain.events = []
    expect(getRealityBetrayalStatus(domain, 'human', 'ash')).toBe('UNRESOLVED')
    const social = socialReducer(undefined, replaceRealityDomain(domain))
    expect(social.relationships.human.ash.tags).toContain('betrayal')
    expect(social.relationships.ash.human.tags).toContain('betrayed_them')
    expect(social.relationships.ash.human.tags).not.toContain('betrayal')
  })

  it("carries each actor's own romantic intent into decisions without copying their partner's intent", () => {
    const domain = fixture()
    const romance = Object.values(domain.romances)[0]
    romance.genuineIntent.ali = 0.2
    romance.strategicIntent.ali = 0.9
    romance.genuineIntent.human = 0.95
    romance.strategicIntent.human = 0.05
    const social = socialReducer(undefined, replaceRealityDomain(domain))
    expect(social.relationships.ali.human.reality).toMatchObject({
      romanticSincerity: 0.2,
      romanticStrategy: 0.9,
    })
    expect(social.relationships.human.ali.reality).toMatchObject({
      romanticSincerity: 0.95,
      romanticStrategy: 0.05,
    })
  })

  it('does not invent a romance backstab when no conflicting motive exists', () => {
    const game = gameFixture()
    for (let seed = 0; seed < 500; seed++)
      expect(chooseAiEvictionVote(game, 'ali', ['human', 'outsider'], seed)).toBe('outsider')
    const noPact = { ...game, strategicAlliances: [] }
    for (let seed = 0; seed < 100; seed++)
      expect(chooseAiEvictionVote(noPact, 'ali', ['human', 'outsider'], seed)).toBe('outsider')
  })

  it('retains uncertain betrayal under real trust damage and competing allegiance', () => {
    const game = gameFixture()
    game.strategicRelationships!.ali.human = {
      affinity: 10,
      tags: ['romance', 'alliance'],
      reality: { trust: -5, loyalty: 15, resentment: 55, suspicion: 65, fear: 20 },
    }
    const competing = pactSnapshot()
    Object.assign(competing, {
      id: 'other-allegiance',
      memberIds: ['ali', 'other'],
      currentTargetIds: ['human'],
      memberPlanBeliefs: { ali: ['target:human'], other: ['target:human'] },
      memberCommitment: { ali: 0.8, other: 0.8 },
    })
    game.strategicAlliances = [competing]
    const votes = Array.from({ length: 500 }, (_, seed) =>
      chooseAiEvictionVote(game, 'ali', game.nomineeIds, seed)
    )
    const betrayed = votes.filter((target) => target === 'human').length
    expect(betrayed).toBeGreaterThan(0)
    expect(betrayed).toBeLessThan(votes.length)
    game.strategicAlliances.push(pactSnapshot())
    const protectedVotes = Array.from({ length: 500 }, (_, seed) =>
      chooseAiEvictionVote(game, 'ali', game.nomineeIds, seed)
    )
    expect(protectedVotes.filter((target) => target === 'human').length).toBeLessThanOrEqual(
      betrayed
    )
  })

  it('keeps consultation advice aligned with the same ballot inputs, withholding a false group commitment', () => {
    const domain = fixture(true)
    const game = gameFixture()
    game.strategicRelationships!.ali.human = {
      affinity: -30,
      tags: ['romance'],
      reality: { trust: -30, loyalty: 0, resentment: 80, suspicion: 70, fear: 0 },
    }
    const state = { game, social: { reality: domain } } as unknown as RootState
    const outcomes = new Set<string>()
    for (let seed = 0; seed < 100; seed++) {
      game.seed = seed
      const target = chooseAiEvictionVote(game, 'ali', game.nomineeIds, game.seed)
      outcomes.add(target)
      const plan = buildAllianceConsultationPlan(state, domain.alliances.group, 'human', ['ali'])
      expect(plan).not.toBeNull()
      if (target === 'human') expect(plan?.summary).toContain('Ali would not commit')
      else expect(plan?.summary).toContain('Outsider')
    }
    expect(outcomes.size).toBe(2)
  })

  it('does not expose an unseen alliance reaction or future events as a warning', () => {
    const domain = fixture()
    nominate(domain)
    const reaction = domain.events.find(
      (event) => event.type === 'ALLIANCE_BETRAYAL_REACTION' && event.actorId === 'ali'
    )!
    reaction.visibility = 'PRIVATE'
    reaction.participantIds = ['ali', 'ash']
    reaction.witnessIds = []
    expect(
      getObservedRelationshipSignals({
        state: domain,
        viewerId: 'human',
        targetId: 'ali',
        day: 4,
        name,
      }).join(' ')
    ).not.toContain('Ali backed')
    reaction.visibility = 'GROUP_VISIBLE'
    reaction.participantIds = ['human', 'ali', 'ash']
    reaction.day = 5
    expect(
      getObservedRelationshipSignals({
        state: domain,
        viewerId: 'human',
        targetId: 'ali',
        day: 4,
        name,
      }).join(' ')
    ).not.toContain('Ali backed')
  })

  it('does not make a repaired victim a revenge target of their own betrayer', () => {
    const domain = fixture()
    nominate(domain)
    const social = socialReducer(undefined, replaceRealityDomain(domain))
    const game = gameFixture()
    game.strategicRelationships = social.relationships
    const victim = game.players.find((player) => player.id === 'human')!
    const score = getNominationTargetScore(game, 'ash', victim)
    const contaminated = structuredClone(game)
    contaminated.strategicRelationships!.ash.human.tags.push('betrayal')
    expect(getNominationTargetScore(contaminated, 'ash', victim)).toBeGreaterThan(score + 100)
  })
})

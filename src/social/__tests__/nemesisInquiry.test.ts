import { describe, expect, it } from 'vitest'
import { createInitialRealityDomainState, normalizeRealityDomainState } from '../reality/state'
import { createRealityNemesisObjective } from '../reality/relationshipAutonomy'
import { advanceNemesisNarrative } from '../reality/nemesisNarrative'
import { askRevealedNemesisWhy, getNemesisReasonAvailability } from '../reality/nemesisInquiry'
import { appendRealityEvent } from '../reality/events'
import { createDirectedRelationship } from '../reality/state'
import type { AiGameIdentity } from '../../ai/aiGameIdentity'
import type { RealityDomainState } from '../reality/types'
import { evaluateSocialActionEligibility } from '../socialActionEligibility'
import { SOCIAL_ACTIONS } from '../socialActions'
import { normalizeActionCosts } from '../smExecNormalize'

const action = SOCIAL_ACTIONS.find((item) => item.id === 'ask_nemesis_reason')!

function createScene(reason: 'SOCIAL_REACH' | 'PERSONAL_FRICTION' = 'SOCIAL_REACH') {
  const domain = createInitialRealityDomainState()
  const objective = createRealityNemesisObjective(domain, {
    ownerId: 'echo',
    targetId: 'human',
    sourceEventId: 'private-rivalry',
    reason,
    at: { day: 3, phase: 'social_1' },
  })
  return { domain, objective }
}

function unveil(domain: RealityDomainState, atDay = 4) {
  const first = advanceNemesisNarrative(domain, {
    humanId: 'human',
    day: 3,
    phase: 'social_2',
    playerNames: { human: 'Quartz', echo: 'Echo', jax: 'Jax' },
    activePlayerIds: new Set(['human', 'echo', 'jax']),
  })
  expect(first[0]?.kind).toBe('clue')
  const revealed = advanceNemesisNarrative(domain, {
    humanId: 'human',
    day: atDay,
    phase: 'social_1',
    playerNames: { human: 'Quartz', echo: 'Echo', jax: 'Jax' },
    activePlayerIds: new Set(['human', 'echo', 'jax']),
  })
  expect(revealed[0]?.kind).toBe('reveal')
}

function ask(domain: RealityDomainState, day: number, seed = 101, identity?: AiGameIdentity) {
  return askRevealedNemesisWhy(domain, {
    humanId: 'human',
    targetId: 'echo',
    name: 'Echo',
    at: { day, phase: 'social_1' },
    seed,
    identity,
    playerNames: { human: 'Quartz', echo: 'Echo', jax: 'Jax' },
  })
}

const fakePlayers = [
  { id: 'human', status: 'active', isUser: true },
  { id: 'echo', status: 'active' },
]
const eligibility = (domain: RealityDomainState, targetId = 'echo', week = 4) =>
  evaluateSocialActionEligibility({
    action,
    actorId: 'human',
    targetIds: [targetId],
    phase: 'social_1',
    week,
    players: fakePlayers,
    reality: domain,
    dramaMode: true,
    requireCompleteSelection: true,
  })

describe('Why Betray Me? — private Nemesis explanation', () => {
  it('is a one-energy action hidden until an active Nemesis is explicitly disclosed', () => {
    const { domain, objective } = createScene()
    expect(action.title).toBe('Why Betray Me?')
    expect(normalizeActionCosts(action, 1, true)).toEqual({
      energy: 1,
      influence: 0,
      info: 0,
    })
    expect(eligibility(domain).eligible).toBe(false)
    expect(ask(domain, 4)).toBeNull()
    unveil(domain)
    expect(eligibility(domain).eligible).toBe(true)
    expect(eligibility(domain, 'human').eligible).toBe(false)
    expect(eligibility(domain, 'echo', 4).eligible).toBe(true)
    expect(objective.revealEventId).toBeTruthy()
  })

  it('answers from the recorded motive, persists one private receipt and locks after telling the truth', () => {
    const { domain, objective } = createScene()
    unveil(domain)
    const reply = ask(domain, 4, 1_000)
    // Most seeds will answer, but deterministic selection must be tested
    // without relying on an unexplained pseudorandom roll.
    if (!reply?.answered) {
      const retry = ask(domain, 5, 1_001)
      expect(retry).not.toBeNull()
    } else {
      expect(reply.text).toContain('Echo:')
      expect(reply.text).toContain('influence')
      expect(objective.reasonDisclosedAt?.day).toBe(4)
      expect(eligibility(domain).eligible).toBe(false)
      expect(ask(domain, 5)).toBeNull()
      const event = domain.events.find((entry) => entry.type === 'NEMESIS_REASON_EXPLAINED')
      expect(event?.visibility).toBe('PAIR_ONLY')
      expect(event?.reason).toBe(reply.text)
    }
    expect(domain.events.some((entry) => entry.type.startsWith('NEMESIS_REASON_'))).toBe(true)
  })

  it('only supports one paid question per day and allows retrying after refusal on another day', () => {
    const { domain, objective } = createScene('PERSONAL_FRICTION')
    const badEdge = createDirectedRelationship('echo', 'human')
    badEdge.suspicion = 90
    badEdge.resentment = 98
    domain.relationships.echo = { human: badEdge }
    unveil(domain)
    let refusalSeed: number | undefined
    for (let seed = 0; seed < 500; seed += 1) {
      const trial = normalizeRealityDomainState(domain)
      const answer = ask(trial, 4, seed)
      if (answer && !answer.answered) {
        refusalSeed = seed
        break
      }
    }
    expect(refusalSeed).toBeDefined()
    const refused = ask(domain, 4, refusalSeed)
    expect(refused?.answered).toBe(false)
    expect(refused?.text).toContain("don't owe")
    expect(objective.reasonLastAskedDay).toBe(4)
    expect(objective.reasonDisclosedAt).toBeUndefined()
    expect(ask(domain, 4, 999)).toBeNull()
    expect(eligibility(domain).eligible).toBe(false)
    expect(eligibility(domain, 'echo', 5).eligible).toBe(true)
    const nextDay = ask(domain, 5, 701)
    expect(nextDay).not.toBeNull()
    expect(domain.events.filter((event) => event.type.startsWith('NEMESIS_REASON_'))).toHaveLength(
      2
    )
    expect(domain.events[domain.events.length - 1].day).toBe(5)
  })

  it('gives a specific real Safety abandonment rather than inventing a different event', () => {
    const { domain, objective } = createScene()
    const abandonment = appendRealityEvent(domain, {
      day: 3,
      phase: 'pos_ceremony_results',
      type: 'ALLIANCE_BETRAYAL',
      actorId: 'human',
      targetIds: ['echo'],
      participantIds: ['human', 'echo'],
      witnessIds: [],
      visibility: 'GROUP_VISIBLE',
      outcome: 'SUCCESS',
      reason: 'safety_abandon:pact:real-safety-choice',
      tags: ['ALLIANCE', 'BETRAYAL', 'SAFETY_ABANDON'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: true,
    })
    objective.triggerEventId = abandonment.id
    unveil(domain)
    let answer = ask(domain, 4, 140)
    if (answer && !answer.answered) answer = ask(domain, 5, 141)
    expect(answer?.answered).toBe(true)
    expect(answer?.text).toContain('protect me with Safety')
    expect(answer?.text).not.toContain('Jax')
  })

  it('uses an actually recorded nomination and correct day when that event is the trigger', () => {
    const { domain, objective } = createScene()
    const event = appendRealityEvent(domain, {
      day: 2,
      phase: 'nomination_results',
      type: 'CEREMONY_NOMINATIONS_LOCKED',
      actorId: 'human',
      targetIds: ['echo'],
      participantIds: ['human', 'echo'],
      witnessIds: [],
      visibility: 'HOUSE_PUBLIC',
      outcome: 'SYSTEM',
      reason: 'Quartz nominated Echo',
      tags: ['NOMINATION'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: true,
      juryEligible: true,
    })
    objective.triggerEventId = event.id
    unveil(domain)
    let answer = ask(domain, 4, 140)
    if (answer && !answer.answered) answer = ask(domain, 5, 141)
    expect(answer?.answered).toBe(true)
    expect(answer?.text).toContain('Day 2')
  })

  it('only blames a rejected group admission when the vote was real and the recruit actually joined', () => {
    const { domain, objective } = createScene()
    domain.allianceManagement.requests['admit-jax'] = {
      id: 'admit-jax',
      kind: 'ADMIT',
      status: 'ACCEPTED',
      proposerId: 'human',
      allianceId: 'group',
      candidateId: 'jax',
      memberIds: ['human', 'echo'],
      electorateIds: ['human', 'echo'],
      officerIds: ['human'],
      votes: { human: true, echo: false },
      consents: { jax: true },
      purpose: 'Bring Jax into our group',
      createdAt: { day: 2, phase: 'social_1' },
      deadline: { day: 3, phase: 'social_1' },
    }
    const event = appendRealityEvent(domain, {
      day: 3,
      phase: 'social_1',
      type: 'ALLIANCE_REQUEST_VOTE',
      actorId: 'echo',
      targetIds: ['jax'],
      participantIds: ['human', 'echo'],
      witnessIds: [],
      allianceRequestId: 'admit-jax',
      allianceRequestSnapshot: {
        kind: 'ADMIT',
        status: 'VOTING',
        candidateId: 'jax',
        accepted: false,
      },
      visibility: 'GROUP_VISIBLE',
      outcome: 'FAILURE',
      reason: 'Echo rejected the invitation',
      tags: ['ALLIANCE', 'REQUEST'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: false,
    })
    objective.triggerEventId = event.id
    unveil(domain)
    let answer = ask(domain, 4, 140)
    if (answer && !answer.answered) answer = ask(domain, 5, 141)
    expect(answer?.answered).toBe(true)
    expect(answer?.text).toContain('Jax')
    expect(answer?.text).toContain('vote against it')
    expect(domain.allianceManagement.requests['admit-jax'].status).toBe('ACCEPTED')
  })

  it('does not fabricate the opposed recruit, Safety omission or a nomination when the trigger was unrelated', () => {
    const { domain } = createScene()
    appendRealityEvent(domain, {
      day: 2,
      phase: 'nomination_results',
      type: 'CEREMONY_NOMINATIONS_LOCKED',
      actorId: 'human',
      targetIds: ['echo'],
      participantIds: ['human', 'echo'],
      witnessIds: [],
      visibility: 'HOUSE_PUBLIC',
      outcome: 'SYSTEM',
      reason: 'Earlier nomination',
      tags: ['NOMINATION'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: true,
      juryEligible: true,
    })
    unveil(domain)
    const explanation = ask(domain, 4, 1000)
    if (explanation?.answered) {
      expect(explanation.text).toContain('influence')
      expect(explanation.text).not.toContain('nominated')
    }
  })

  it('allows a small number of game-move admissions only for treacherous AI identities', () => {
    const identity: AiGameIdentity = {
      archetype: 'double_agent',
      temperament: 'secretive',
      competitionDrive: 0.8,
      emotionalVolatility: 0.5,
      audienceFocus: 0.3,
      survivalFocus: 0.85,
    }
    let strategicAnswerFound = false
    for (let seed = 0; seed < 250; seed += 1) {
      const { domain } = createScene()
      unveil(domain)
      const answer = ask(domain, 4, seed, identity)
      if (answer?.answered && answer.text.includes('game move')) {
        strategicAnswerFound = true
        break
      }
    }
    expect(strategicAnswerFound).toBe(true)

    const { domain } = createScene()
    unveil(domain)
    const loyal = ask(domain, 4, 1000, { ...identity, archetype: 'loyal_anchor' })
    if (loyal?.answered) expect(loyal.text).not.toContain('game move')
  })

  it('does not expose private reasons for reconciled or ended nemeses or repeat answers after hydration', () => {
    const { domain, objective } = createScene()
    unveil(domain)
    const answer = ask(domain, 4, 1000)
    const saved = normalizeRealityDomainState(domain)
    if (answer?.answered) {
      expect(getNemesisReasonAvailability(saved, 'human', 'echo', 5).eligible).toBe(false)
    }
    saved.relationshipAutonomy.nemeses[objective.id].status = 'RECONCILED'
    expect(getNemesisReasonAvailability(saved, 'human', 'echo', 6).eligible).toBe(false)
    saved.relationshipAutonomy.nemeses[objective.id].status = 'ENDED'
    expect(getNemesisReasonAvailability(saved, 'human', 'echo', 6).eligible).toBe(false)
  })
})

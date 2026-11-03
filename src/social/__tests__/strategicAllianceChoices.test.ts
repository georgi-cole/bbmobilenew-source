import { afterAll, describe, expect, it } from 'vitest'
import { evaluateAllianceStrategicFit } from '../reality/allianceStrategicFit'
import {
  advanceAllianceRequests,
  manageAlliance,
  type AllianceManagementContext,
} from '../reality/allianceManagement'
import { resolveStrategicModeContext } from '../strategicModeContext'
import { createInitialRealityDomainState, ensureRealityActors } from '../reality/state'
import { getRealityRelationship } from '../reality/relationships'
import { appendRealityEvent } from '../reality/events'
import {
  createRealityAlliance,
  recordRealityAlliancePlanDefiance,
} from '../reality/relationshipForms'
import { evaluateAllianceAutonomy } from '../reality/allianceAutonomy'
import { normalizeAllianceManagement } from '../reality/allianceIdentity'
import { upsertRealityPromise } from '../reality/commitments'

const calibration: Array<Record<string, unknown>> = []
afterAll(() => console.info('STRATEGIC_CALIBRATION', JSON.stringify(calibration)))

const ids = ['human', 'actor', 'friend', 'other', 'third', 'fourth']
function context(vox: boolean, seed = 1): AllianceManagementContext {
  return {
    at: { day: 3, phase: 'social_1' },
    activeActorIds: ids,
    humanActorIds: ['human'],
    seed,
    classicGame: !vox,
    atRiskActorIds: ['actor'],
    identityByActorId: {
      actor: {
        archetype: 'loyal_anchor',
        temperament: 'calm',
        audienceFocus: 0.95,
        survivalFocus: 0.6,
        competitionDrive: 0.5,
        emotionalVolatility: 0.4,
      },
    },
    strategicMode: resolveStrategicModeContext({
      mode: 'classic',
      week: 3,
      phase: 'social_1',
      lohId: 'human',
      posWinnerId: null,
      players: ids.map((id) => ({ id, status: 'active' as const })),
      nomineeIds: ['actor'],
      publicModeEnabled: false,
      ...(vox
        ? {
            voxPopuli: {
              status: 'active',
              immunityWinnerId: 'human',
              autoNomineeId: 'actor',
            } as const,
          }
        : {}),
    }),
  }
}
function setup(publicConflict = true) {
  const domain = createInitialRealityDomainState()
  ensureRealityActors(domain, ids)
  const edge = getRealityRelationship(domain, 'actor', 'human')
  edge.trust = -20
  edge.resentment = 30
  if (publicConflict)
    appendRealityEvent(domain, {
      day: 3,
      phase: 'social_1',
      type: 'SOCIAL_ACTION',
      actionId: 'startFight',
      actorId: 'human',
      targetIds: ['friend'],
      participantIds: ['human', 'friend'],
      witnessIds: ['actor'],
      visibility: 'HOUSE_PUBLIC',
      outcome: 'SUCCESS',
      reason: 'witnessed public argument',
      tags: ['CONFLICT'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: true,
      juryEligible: true,
    })
  return domain
}
function offer(
  vox: boolean,
  seed: number,
  group = false,
  persona: 'loyal_anchor' | 'opportunist' | 'antihero' = 'loyal_anchor'
) {
  const domain = setup()
  const ctx = context(vox, seed)
  if (persona !== 'loyal_anchor')
    ctx.identityByActorId = {
      actor: {
        ...ctx.identityByActorId!.actor,
        archetype: persona,
        audienceFocus: persona === 'opportunist' ? 0.2 : 0.65,
        survivalFocus: persona === 'opportunist' ? 0.9 : 0.5,
      },
    }
  if (group) ctx.humanActorIds = ['human', 'friend']
  const result = manageAlliance(
    domain,
    group
      ? {
          type: 'PROPOSE',
          kind: 'FOUND',
          actorId: 'human',
          memberIds: ['human', 'actor', 'friend'],
        }
      : { type: 'PROPOSE', kind: 'PACT', actorId: 'human', candidateId: 'actor' },
    ctx
  )
  return { domain, ctx, request: domain.allianceManagement.requests[result.requestId!] }
}

describe('mode-aware alliance decisions', () => {
  it.each([false, true])(
    'changes paired pact/group odds without forced outcomes (group=%s)',
    (group) => {
      let classic = 0,
        vox = 0
      for (let seed = 1; seed <= 256; seed++) {
        if (offer(false, seed, group).request.consents.actor === true) classic++
        if (offer(true, seed, group).request.consents.actor === true) vox++
      }
      calibration.push({
        scenario: group ? 'group' : 'pact',
        persona: 'loyal_anchor',
        seeds: 256,
        classicAccepted: classic,
        voxAccepted: vox,
      })
      expect(classic).toBeGreaterThan(vox + 15)
      expect(classic).toBeLessThan(256)
      expect(vox).toBeGreaterThan(0)
    }
  )

  it('retains persona overlap and fear-driven cooperation in both formats', () => {
    const domain = setup()
    getRealityRelationship(domain, 'actor', 'human').fear = 100
    for (const vox of [false, true]) {
      const ctx = context(vox)
      const calm = evaluateAllianceStrategicFit(domain, ctx, 'actor', ['human'])
      ctx.identityByActorId = {
        actor: {
          ...ctx.identityByActorId!.actor,
          archetype: 'opportunist',
          audienceFocus: 0.15,
          survivalFocus: 0.95,
        },
      }
      const calculated = evaluateAllianceStrategicFit(domain, ctx, 'actor', ['human'])
      expect(calculated.modifier).toBeGreaterThan(calm.modifier)
      expect(calculated.tactical).toBe(true)
      expect(calculated.modifier).toBeGreaterThan(0)
    }
  })

  it('does not infer audience risk from private events or unknown promises', () => {
    const domain = setup()
    domain.events[0].visibility = 'PAIR_ONLY'
    const ctx = context(true)
    const before = evaluateAllianceStrategicFit(domain, ctx, 'actor', ['human'])
    upsertRealityPromise(domain, {
      id: 'unknown',
      kind: 'protect',
      promisorId: 'human',
      beneficiaryIds: ['other'],
      witnessIds: [],
      createdAt: ctx.at,
      stakes: 1,
      scope: {},
      status: 'BROKEN',
      visibility: 'PAIR_ONLY',
    })
    expect(evaluateAllianceStrategicFit(domain, ctx, 'actor', ['human'])).toEqual(before)
    expect(before.factors.audienceConcern).toBe(0)
    domain.promises.unknown.witnessIds.push('actor')
    expect(evaluateAllianceStrategicFit(domain, ctx, 'actor', ['human']).modifier).toBeLessThan(
      before.modifier
    )
  })

  it('never consents for human founders and pins new requests without upgrading old pending requests', () => {
    const current = offer(true, 13, true)
    expect(current.request.strategicPolicyVersion).toBe(1)
    expect(current.request.consents.friend).toBeUndefined()
    expect(current.request.status).not.toBe('ACCEPTED')
    const domain = setup()
    const oldContext = {
      ...context(false),
      strategicMode: undefined,
      humanActorIds: ['human', 'actor'],
    }
    const result = manageAlliance(
      domain,
      { type: 'PROPOSE', kind: 'PACT', actorId: 'human', candidateId: 'actor' },
      oldContext
    )
    const legacyVox = structuredClone(domain),
      legacyClassic = structuredClone(domain)
    normalizeAllianceManagement(legacyVox)
    advanceAllianceRequests(legacyVox, context(true))
    advanceAllianceRequests(legacyClassic, context(false))
    expect(
      legacyVox.allianceManagement.requests[result.requestId!].strategicPolicyVersion
    ).toBeUndefined()
    expect(legacyVox.allianceManagement.requests[result.requestId!].consents).toEqual(
      legacyClassic.allianceManagement.requests[result.requestId!].consents
    )
  })

  it('replays saved request decisions without rerolls or duplicate events', () => {
    const first = offer(true, 33)
    const saved = JSON.parse(JSON.stringify(first.domain))
    const before = JSON.stringify(saved)
    advanceAllianceRequests(saved, first.ctx)
    advanceAllianceRequests(saved, first.ctx)
    expect(JSON.stringify(saved)).toBe(before)
  })

  it('discusses nomination cover in Vox without house-vote targets, promises or human agreement', () => {
    const domain = setup(false),
      ctx = context(true)
    ctx.atRiskActorIds = []
    const group = createRealityAlliance(domain, {
      id: 'group',
      kind: 'GROUP',
      founderIds: ['actor', 'friend', 'human'],
      memberIds: [],
      purpose: 'mutual support',
      at: ctx.at,
      leaderId: 'actor',
    })
    group.cohesion = 0.8
    group.fractureRisk = 0.1
    const promises = JSON.stringify(domain.promises)
    evaluateAllianceAutonomy(domain, ctx)
    expect(group.currentTargetIds).toEqual([])
    expect(group.memberPlanBeliefs.human).toEqual([])
    expect(
      domain.events.find((event) => event.type === 'ALLIANCE_STRATEGY_MEETING')?.reason
    ).toContain('NOMINATION_COVER')
    expect(JSON.stringify(domain.promises)).toBe(promises)
    const after = JSON.stringify(domain)
    expect(evaluateAllianceAutonomy(domain, ctx)).toBe(false)
    expect(JSON.stringify(domain)).toBe(after)
  })

  it('does not punish declared dissent as a broken group promise', () => {
    const domain = setup(false),
      ctx = context(false)
    const group = createRealityAlliance(domain, {
      id: 'group',
      kind: 'GROUP',
      founderIds: ['actor', 'friend', 'third'],
      memberIds: [],
      purpose: 'support',
      at: ctx.at,
      leaderId: 'friend',
    })
    group.currentTargetIds = ['other']
    group.memberPlanBeliefs.actor = ['dissent:other']
    const before = JSON.stringify(domain)
    expect(
      recordRealityAlliancePlanDefiance(domain, {
        actorId: 'actor',
        actualTargetId: 'fourth',
        at: ctx.at,
        sourceEventId: 'vote',
      })
    ).toEqual([])
    expect(JSON.stringify(domain)).toBe(before)
  })
})

describe('strategy rollback and saved requests', () => {
  it('does not pin new weights when disabled, while existing pinned requests keep their policy', () => {
    const domain = setup(),
      ctx = {
        ...context(true),
        strategicPreferencesEnabled: false,
        humanActorIds: ['human', 'actor'],
      }
    const result = manageAlliance(
      domain,
      { type: 'PROPOSE', kind: 'PACT', actorId: 'human', candidateId: 'actor' },
      ctx
    )
    expect(
      domain.allianceManagement.requests[result.requestId!].strategicPolicyVersion
    ).toBeUndefined()
    const pending = setup()
    const pendingId = manageAlliance(
      pending,
      { type: 'PROPOSE', kind: 'PACT', actorId: 'human', candidateId: 'actor' },
      { ...context(true), humanActorIds: ['human', 'actor'] }
    ).requestId!
    expect(pending.allianceManagement.requests[pendingId].strategicPolicyVersion).toBe(1)
    const enabledCopy = structuredClone(pending)
    advanceAllianceRequests(pending, { ...context(true), strategicPreferencesEnabled: false })
    advanceAllianceRequests(enabledCopy, context(true))
    expect(pending).toEqual(enabledCopy)
    const pinned = offer(true, 9)
    expect(pinned.request.strategicPolicyVersion).toBe(1)
    const before = JSON.stringify(pinned.domain)
    advanceAllianceRequests(pinned.domain, { ...pinned.ctx, strategicPreferencesEnabled: false })
    expect(JSON.stringify(pinned.domain)).toBe(before)
  })
})

describe('matched personality calibration cohorts', () => {
  it.each(['opportunist', 'antihero'] as const)(
    'records overlapping %s decisions in both formats',
    (persona) => {
      for (const group of [false, true]) {
        let classic = 0,
          vox = 0,
          discordant = 0
        for (let seed = 1; seed <= 256; seed++) {
          const c = offer(false, seed, group, persona).request.consents.actor === true
          const v = offer(true, seed, group, persona).request.consents.actor === true
          if (c) classic++
          if (v) vox++
          if (c !== v) discordant++
        }
        expect(classic).toBeGreaterThan(0)
        expect(classic).toBeLessThan(256)
        expect(vox).toBeGreaterThan(0)
        expect(vox).toBeLessThan(256)
        calibration.push({
          scenario: group ? 'group' : 'pact',
          persona,
          seeds: 256,
          classicAccepted: classic,
          voxAccepted: vox,
          discordant,
        })
      }
    }
  )
})

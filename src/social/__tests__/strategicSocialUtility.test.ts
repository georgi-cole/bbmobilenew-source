import { afterEach, describe, expect, it, vi } from 'vitest'
import { strategicSocialAdjustment } from '../strategicSocialUtility'
import { withStrategicPlanningContext } from '../strategicPlanningContext'
import { chooseActionFor, chooseTargetsFor } from '../SocialPolicy'
import type { RealitySocialEvent } from '../reality/types'

const identity = {
  archetype: 'loyal_anchor' as const,
  temperament: 'calm' as const,
  audienceFocus: 0.9,
  survivalFocus: 0.7,
  emotionalVolatility: 0.4,
  competitionDrive: 0.5,
}
const players = [
  { id: 'finn', status: 'nominated', aiGameIdentity: identity },
  { id: 'rae', status: 'loh' },
  { id: 'other', status: 'active' },
  { id: 'third', status: 'active' },
  { id: 'fourth', status: 'active' },
]
function planning(vox: boolean, safety = false) {
  return withStrategicPlanningContext(
    { players, relationships: {}, week: 3 },
    {
      mode: 'classic',
      phase: 'social_1',
      week: 3,
      players: players.map((p) => ({
        id: p.id,
        status: p.status as 'active' | 'nominated' | 'loh',
      })),
      lohId: 'rae',
      posWinnerId: safety ? 'rae' : null,
      nomineeIds: ['finn'],
      ...(vox
        ? {
            voxPopuli: {
              status: 'active',
              immunityWinnerId: 'rae',
              autoNomineeId: 'finn',
            } as const,
          }
        : {}),
    },
    'finn'
  ).strategicContext
}
function event(visibility: RealitySocialEvent['visibility'] = 'HOUSE_PUBLIC'): RealitySocialEvent {
  return {
    id: 'harm',
    sequence: 1,
    day: 3,
    phase: 'social_1',
    type: 'SOCIAL_ACTION',
    actionId: 'startFight',
    actorId: 'rae',
    targetIds: ['finn'],
    participantIds: ['rae', 'finn'],
    witnessIds: ['other'],
    visibility,
    outcome: 'SUCCESS',
    reason: 'recorded incident',
    tags: [],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: visibility === 'HOUSE_PUBLIC',
    juryEligible: true,
  }
}
const input = {
  actorId: 'finn',
  targetId: 'rae',
  actionId: 'confront',
  week: 3,
  identity,
  enabled: true,
}

describe('strategic social preferences', () => {
  it('requires an observed grievance and preserves diagnostic/legacy calls', () => {
    expect(strategicSocialAdjustment({ ...input, planning: planning(true) }).multiplier).toBe(0)
    expect(
      strategicSocialAdjustment({ ...input, planning: planning(true), enabled: false }).multiplier
    ).toBe(1)
    expect(
      strategicSocialAdjustment({
        ...input,
        planning: planning(true),
        events: [
          {
            ...event('PAIR_ONLY'),
            targetIds: ['other'],
            participantIds: ['rae', 'other'],
            witnessIds: [],
          },
        ],
      }).multiplier
    ).toBe(0)
  })
  it('makes warranted Vox resistance more attractive while preserving Classic resistance', () => {
    const classic = strategicSocialAdjustment({
      ...input,
      planning: planning(false),
      events: [event()],
    })
    const vox = strategicSocialAdjustment({ ...input, planning: planning(true), events: [event()] })
    expect(vox.multiplier).toBeGreaterThan(classic.multiplier)
    expect(classic.multiplier).toBeGreaterThan(0)
    expect(vox.reason).toBe('WITNESSED_PUBLIC_CONDUCT')
  })
  it('distinguishes private boundaries from publicly evidenced challenges', () => {
    const privateRead = strategicSocialAdjustment({
      ...input,
      actionId: 'public_callout',
      planning: planning(true),
      events: [event('PAIR_ONLY')],
    })
    const publicRead = strategicSocialAdjustment({
      ...input,
      actionId: 'public_callout',
      planning: planning(true),
      events: [event()],
    })
    expect(privateRead.multiplier).toBeLessThan(publicRead.multiplier)
    expect(privateRead.reason).toBe('PERSONAL_BOUNDARY_WITH_UNCERTAIN_PUBLIC_READ')
  })
  it('does not invent Vox LOH leverage; fear can favor diplomacy toward actual Safety', () => {
    const base = { ...input, actionId: 'compliment' }
    expect(strategicSocialAdjustment({ ...base, planning: planning(true) }).multiplier).toBe(1)
    expect(
      strategicSocialAdjustment({ ...base, planning: planning(false) }).multiplier
    ).toBeGreaterThan(1)
    expect(
      strategicSocialAdjustment({ ...base, planning: planning(true, true) }).multiplier
    ).toBeGreaterThan(1)
    expect(
      strategicSocialAdjustment({ ...input, actionId: 'pitch_target', planning: planning(true) })
        .multiplier
    ).toBe(0)
    expect(
      strategicSocialAdjustment({ ...input, actionId: 'plant_lie', planning: planning(true) })
        .multiplier
    ).toBe(1)
  })
  it('keeps actual Classic nomination grievances separate from automatic nominees and Vox', () => {
    const nomination = { ...event(), type: 'CEREMONY_NOMINATIONS_LOCKED', actionId: undefined }
    expect(
      strategicSocialAdjustment({ ...input, planning: planning(false), events: [nomination] })
        .multiplier
    ).toBeGreaterThan(0)
    expect(
      strategicSocialAdjustment({
        ...input,
        planning: planning(false),
        events: [{ ...nomination, tags: ['automatic_nominee:finn'] }],
      }).multiplier
    ).toBe(0)
    expect(
      strategicSocialAdjustment({ ...input, planning: planning(true), events: [nomination] })
        .multiplier
    ).toBe(0)
  })
  it('changes aggregate action choices while replaying each fixed seed exactly', () => {
    let changed = 0
    const observedEvents = [event()]
    for (let seed = 1; seed <= 128; seed++) {
      const base = {
        players,
        relationships: { finn: { rae: { affinity: -80, tags: [] } } },
        week: 3,
        seed,
        phase: 'social_1',
        observedEvents,
        availableActionIds: ['compliment', 'confront', 'whisper'],
        strategicWeightsEnabled: true,
      }
      const classic = { ...base, strategicContext: planning(false) },
        vox = { ...base, strategicContext: planning(true) }
      const selected = chooseActionFor('finn', classic)
      expect(chooseActionFor('finn', classic)).toBe(selected)
      if (selected !== chooseActionFor('finn', vox)) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })
  it('never consults the Safety holder private preferences to select a request subject', () => {
    const state = {
      players: [
        { id: 'actor', status: 'active' },
        { id: 'holder', status: 'pos' },
        { id: 'a', status: 'nominated' },
        { id: 'b', status: 'nominated' },
      ],
      relationships: {
        actor: { a: { affinity: 80, tags: [] }, b: { affinity: -50, tags: [] } },
        holder: { a: { affinity: -90, tags: [] }, b: { affinity: 90, tags: [] } },
      },
      seed: 1,
    }
    const first = chooseTargetsFor('actor', 'ask_use_safety', state)
    state.relationships.holder.a.affinity = 100
    state.relationships.holder.b.affinity = -100
    expect(chooseTargetsFor('actor', 'ask_use_safety', state)).toEqual(first)
    expect(first).toEqual(['holder', 'a'])
  })
})

describe('preference rollback', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('restores legacy preference weights while keeping Vox legality', () => {
    vi.stubEnv('VITE_STRATEGIC_PREFERENCES', 'false')
    expect(
      strategicSocialAdjustment({ ...input, planning: planning(true), events: [event()] })
        .multiplier
    ).toBe(1)
    expect(
      strategicSocialAdjustment({ ...input, actionId: 'pitch_target', planning: planning(true) })
        .multiplier
    ).toBe(0)
  })
  it('uses legacy weight for invalid new numeric preferences', () => {
    expect(
      strategicSocialAdjustment({
        ...input,
        actionId: 'public_callout',
        identity: { ...identity, audienceFocus: NaN },
        planning: planning(true),
        events: [event()],
      })
    ).toEqual({ multiplier: 1, reason: 'INVALID_PREFERENCE_FALLBACK' })
  })
})

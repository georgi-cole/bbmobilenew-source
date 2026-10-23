import { describe, expect, it } from 'vitest'
import {
  appendRealityEvent,
  createInitialRealityDomainState,
  createRealityAlliance,
} from '../reality'
import type { RealitySocialEvent } from '../reality/types'
import type { SocialActionLogEntry } from '../types'
import { composePulseChronicle, getPulseChronicleIdentity } from '../pulseChronicle'

const roster = [
  { id: 'human', name: 'Player' },
  { id: 'alex', name: 'Alex' },
  { id: 'maya', name: 'Maya' },
  { id: 'zara', name: 'Zara' },
]
function setup() {
  const reality = createInitialRealityDomainState()
  const base = {
    gameId: 'episode-fixture',
    season: 1,
    day: 2,
    humanId: 'human',
    players: roster,
    reality,
    actionHistory: [] as SocialActionLogEntry[],
  }
  function event(
    type: string,
    actorId?: string,
    targetIds: string[] = [],
    tags: string[] = [],
    visibility: RealitySocialEvent['visibility'] = 'CEREMONY_PUBLIC'
  ) {
    return appendRealityEvent(reality, {
      day: 2,
      phase:
        type === 'CEREMONY_POWER_WON' && tags.includes('safety')
          ? 'pos_results'
          : type.includes('EVICTION')
            ? 'eviction_results'
            : type.includes('NOMINATION')
              ? 'nomination_results'
              : type.includes('SAFETY')
                ? 'pos_ceremony_results'
                : 'loh_results',
      type,
      actorId,
      targetIds,
      participantIds: [actorId, ...targetIds].filter((id): id is string => !!id),
      witnessIds: visibility === 'CEREMONY_PUBLIC' ? roster.map((player) => player.id) : [],
      visibility,
      outcome: 'SYSTEM',
      reason: 'Fixture',
      tags,
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: true,
      juryEligible: true,
    })
  }
  return { reality, base, event }
}

describe('The Hub Chronicles', () => {
  it('connects observed competitions, nominations, saves and evictions without assuming vote counts', () => {
    const { base, event } = setup()
    event('CEREMONY_POWER_WON', 'alex', [], ['loh'])
    event('CEREMONY_NOMINATIONS_LOCKED', 'alex', ['maya', 'zara'])
    event('CEREMONY_POWER_WON', 'maya', [], ['safety'])
    event('CEREMONY_SAFETY_USED', 'maya', ['maya'])
    event(
      'CEREMONY_NOMINATIONS_LOCKED',
      'alex',
      ['human'],
      ['replacement_nominee', 'nomination_stage:REPLACEMENT']
    )
    event('CEREMONY_EVICTION', undefined, ['zara'])
    const chapter = composePulseChronicle({ ...base, complete: true, weather: 'rainy' })
    const text = chapter.paragraphs.join(' ')
    expect(text).toMatch(/rain|wet/i)
    expect(text).toContain('Alex')
    expect(text).toContain('Maya')
    expect(text).toContain('Zara')
    expect(text).toMatch(/Safety/)
    expect(text).not.toMatch(/unanimous|10 votes|secret alliance/i)
    expect(chapter.complete).toBe(true)
    expect(chapter.sourceEventIds.length).toBeGreaterThan(2)
    expect(composePulseChronicle({ ...base, complete: true, weather: 'rainy' })).toEqual(chapter)
  })

  it('keeps unwitnessed private events and undiscovered alliances out of Today', () => {
    const { base, event } = setup()
    event('ALLIANCE_FORMED', 'alex', ['zara'], [], 'PRIVATE')
    const chapter = composePulseChronicle(base)
    expect(chapter.paragraphs.join(' ')).not.toContain('Zara')
    expect(chapter.sourceEventIds).toHaveLength(0)
  })

  it('frames a Vox audience exit with the format while preserving the actual event', () => {
    const { base, event } = setup()
    event('CEREMONY_EVICTION', undefined, ['zara'], ['public_vote'])

    const chapter = composePulseChronicle({
      ...base,
      theme: { format: 'voxPopuli' },
      complete: true,
    })
    const text = chapter.paragraphs.join(' ')

    expect(text).toMatch(/Vox Populi|ballots|audience/i)
    expect(text).toContain('The audience had the final word')
    expect(text).not.toMatch(/housemates?|houseguests?/i)
  })

  it('shows the user a grounded success and failure without inventing additional agreements', () => {
    const { base } = setup()
    const actionHistory = [
      {
        id: 'flirt',
        actionId: 'flirt',
        actorId: 'human',
        targetId: 'maya',
        outcome: 'failure',
        source: 'manual',
        week: 2,
        phase: 'social_1',
        timestamp: 1,
        cost: 1,
        delta: -1,
        newEnergy: 4,
      },
      {
        id: 'pact',
        actionId: 'proposeAlliance',
        actorId: 'human',
        targetId: 'alex',
        outcome: 'success',
        source: 'manual',
        week: 2,
        phase: 'social_2',
        timestamp: 2,
        cost: 1,
        delta: 1,
        newEnergy: 3,
      },
    ] as SocialActionLogEntry[]
    const chapter = composePulseChronicle({ ...base, actionHistory })
    expect(chapter.paragraphs.join(' ')).toMatch(/Maya/)
    expect(chapter.paragraphs.join(' ')).toMatch(/Alex/)
    expect(chapter.note).toContain('Maya')
    expect(chapter.note).toContain('Alex')
    expect(chapter.sourceEventIds).toHaveLength(2)
  })

  it('does not narrate rejected safety as a successful save', () => {
    const { base, event } = setup()
    event('CEREMONY_SAFETY_DECLINED', 'alex', ['maya'])
    const chapter = composePulseChronicle(base)
    expect(chapter.paragraphs.join(' ')).toMatch(/unused/)
    expect(chapter.paragraphs.join(' ')).not.toMatch(/rescue/)
  })

  it('narrates a self-save without claiming a contestant rescued another person', () => {
    const { base, event } = setup()
    event('CEREMONY_SAFETY_USED', 'maya', ['maya'])
    const chapter = composePulseChronicle(base)
    expect(chapter.paragraphs.join(' ')).toContain('Maya used Safety to escape the block')
    expect(chapter.paragraphs.join(' ')).not.toContain('rescue Maya')
  })

  it('does not repeat a ceremony event merely because it appears again', () => {
    const { base, event, reality } = setup()
    const first = event('CEREMONY_POWER_WON', 'alex', [], ['loh'])
    reality.events.push(first)
    const chapter = composePulseChronicle(base)
    expect(chapter.sourceEventIds).toHaveLength(1)
  })

  it('uses action-specific copy for rumors and strategic asks', () => {
    const { base } = setup()
    const actionHistory = [
      {
        id: 'rumor',
        actionId: 'rumor',
        actorId: 'human',
        targetId: 'alex',
        subjectId: 'maya',
        outcome: 'success',
        source: 'manual',
        week: 2,
        phase: 'social_1',
        timestamp: 1,
        cost: 1,
        delta: 1,
        newEnergy: 3,
      },
      {
        id: 'safety-plan',
        actionId: 'ask_use_safety',
        actorId: 'human',
        targetId: 'zara',
        outcome: 'success',
        source: 'manual',
        week: 2,
        phase: 'social_2',
        timestamp: 2,
        cost: 1,
        delta: 1,
        newEnergy: 2,
      },
    ] as SocialActionLogEntry[]
    const text = composePulseChronicle({ ...base, actionHistory }).paragraphs.join(' ')
    expect(text).toContain('rumor about Maya to Alex')
    expect(text).toContain('You asked Zara to use Safety')
    expect(text).not.toContain('reading the room')
  })

  it('keeps private intel, information trades, and Safety promises distinct', () => {
    const { base } = setup()
    const narrate = (actionId: string) =>
      composePulseChronicle({
        ...base,
        actionHistory: [
          {
            actionId,
            actorId: 'human',
            targetId: 'maya',
            outcome: 'success',
            source: 'manual',
            week: 2,
            timestamp: 1,
            cost: 1,
            delta: 1,
            newEnergy: 3,
          },
        ],
      }).paragraphs.join(' ')

    expect(narrate('whisper')).toContain('shared private information')
    expect(narrate('whisper')).not.toContain('rumor')
    expect(narrate('share_intel')).toContain('traded information')
    expect(narrate('share_intel')).not.toContain('reading the room')
    expect(narrate('protect')).toContain('offered Maya protection')
    expect(narrate('ask_safety_plan')).toContain('what they planned to do with Safety')
    expect(narrate('ask_hold_safety')).toContain('asked Maya to leave the nominations unchanged')
  })

  it('keeps the player’s own move in a crowded story while preserving the eviction', () => {
    const { base, event } = setup()
    for (let index = 0; index < 7; index += 1)
      event('ALLIANCE_BETRAYAL', 'human', ['player-' + index], [], 'CEREMONY_PUBLIC')
    const eviction = event('CEREMONY_EVICTION', undefined, ['maya'])
    const actionHistory = [
      {
        id: 'my-move',
        actionId: 'compliment',
        actorId: 'human',
        targetId: 'zara',
        outcome: 'success',
        source: 'manual',
        week: 2,
        phase: 'social_2',
        timestamp: 100,
        cost: 1,
        delta: 1,
        newEnergy: 3,
      },
    ] as SocialActionLogEntry[]
    const chronicle = composePulseChronicle({ ...base, actionHistory })
    expect(chronicle.sourceEventIds).toContain('my-move')
    expect(chronicle.sourceEventIds).toContain(eviction.id)
    expect(chronicle.sourceEventIds.length).toBeLessThanOrEqual(8)
  })

  it('separates weekend episodes from the numbered day and carries an action cutoff', () => {
    const { base } = setup()
    const actionHistory = [
      {
        id: 'day-action',
        actionId: 'compliment',
        actorId: 'human',
        targetId: 'alex',
        outcome: 'success',
        source: 'manual',
        week: 2,
        phase: 'week_end',
        timestamp: 100,
        cost: 1,
        delta: 1,
        newEnergy: 3,
      },
      {
        id: 'weekend-action',
        actionId: 'reassure',
        actorId: 'human',
        targetId: 'maya',
        outcome: 'success',
        source: 'manual',
        week: 2,
        phase: 'week_end',
        timestamp: 200,
        cost: 1,
        delta: 1,
        newEnergy: 2,
      },
    ] as SocialActionLogEntry[]
    const weekend = { afterDay: 2, weekendNumber: 1, weekendDay: 1 }
    const episode = getPulseChronicleIdentity(2, weekend)
    const chronicle = composePulseChronicle({
      ...base,
      actionHistory,
      episode,
      actionHistoryAfterTimestamp: 100,
    })
    expect(episode.key).toBe('weekend:1:2:1')
    expect(chronicle.episodeKey).toBe(episode.key)
    expect(chronicle.sourceEventIds).toEqual(['weekend-action'])
  })

  it('reads retained alliance milestones after the rolling event window advances', () => {
    const { base } = setup()
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'persistent-alliance',
      founderIds: ['human', 'alex'],
      memberIds: [],
      purpose: 'Work together',
      at: { day: 2, phase: 'social_1' },
    })
    appendRealityEvent(reality, {
      day: 2,
      phase: 'social_1',
      type: 'ALLIANCE_FORMED',
      actorId: 'human',
      targetIds: ['alex'],
      participantIds: ['human', 'alex'],
      witnessIds: ['human'],
      visibility: 'HOUSE_PUBLIC',
      allianceId: alliance.id,
      outcome: 'SYSTEM',
      reason: 'Formation',
      tags: [],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: true,
      juryEligible: true,
    })
    for (let index = 0; index < 510; index += 1)
      appendRealityEvent(reality, {
        day: 2,
        phase: 'social_1',
        type: 'SOCIAL_INTERACTION_RESOLVED',
        actorId: 'alex',
        targetIds: ['maya'],
        participantIds: ['alex', 'maya'],
        witnessIds: [],
        visibility: 'PRIVATE',
        outcome: 'SYSTEM',
        reason: 'Rolling event',
        tags: [],
        relatedFactIds: [],
        relatedPromiseIds: [],
        relatedThreadIds: [],
        publicEligible: false,
        juryEligible: false,
      })
    const chronicle = composePulseChronicle({ ...base, reality })
    expect(chronicle.paragraphs.join(' ')).toContain('A new alliance entered your story')
  })

  it('does not pull future or prior-day actions into the current episode', () => {
    const { base, event } = setup()
    event('CEREMONY_EVICTION', undefined, ['zara']).day = 1
    const chapter = composePulseChronicle(base)
    expect(chapter.sourceEventIds).toHaveLength(0)
  })
})

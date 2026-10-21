import { describe, expect, it } from 'vitest'
import { appendRealityEvent, createInitialRealityDomainState } from '../reality'
import type { RealitySocialEvent } from '../reality/types'
import type { SocialActionLogEntry } from '../types'
import { composePulseChronicle } from '../pulseChronicle'

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
      day: 2, phase: type.includes('EVICTION') ? 'eviction_results' :
        type.includes('NOMINATION') ? 'nomination_results' :
          type.includes('SAFETY') ? 'pos_ceremony_results' : 'loh_results',
      type, actorId, targetIds,
      participantIds: [actorId, ...targetIds].filter((id): id is string => !!id),
      witnessIds: visibility === 'CEREMONY_PUBLIC' ? roster.map((player) => player.id) : [],
      visibility, outcome: 'SYSTEM', reason: 'Fixture',
      tags, relatedFactIds: [], relatedPromiseIds: [], relatedThreadIds: [],
      publicEligible: true, juryEligible: true,
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
    event('CEREMONY_NOMINATIONS_LOCKED', 'alex', ['human'], ['replacement_nominee', 'nomination_stage:REPLACEMENT'])
    event('CEREMONY_EVICTION', undefined, ['zara'])
    const chapter = composePulseChronicle({ ...base, complete: true, weather: 'rainy' })
    const text = chapter.paragraphs.join(' ')
    expect(text).toMatch(/rain/i)
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

  it('shows the user a grounded success and failure without inventing additional agreements', () => {
    const { base } = setup()
    const actionHistory = [
      { id: 'flirt', actionId: 'flirt', actorId: 'human', targetId: 'maya',
        outcome: 'failure', source: 'manual', week: 2, phase: 'social_1', timestamp: 1,
        cost: 1, delta: -1, newEnergy: 4 },
      { id: 'pact', actionId: 'propose_pact', actorId: 'human', targetId: 'alex',
        outcome: 'success', source: 'manual', week: 2, phase: 'social_2', timestamp: 2,
        cost: 1, delta: 1, newEnergy: 3 },
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

  it('does not repeat a ceremony event merely because it appears again', () => {
    const { base, event, reality } = setup()
    const first = event('CEREMONY_POWER_WON', 'alex', [], ['loh'])
    reality.events.push(first)
    const chapter = composePulseChronicle(base)
    expect(chapter.sourceEventIds).toHaveLength(1)
  })

  it('does not pull future or prior-day actions into the current episode', () => {
    const { base, event } = setup()
    event('CEREMONY_EVICTION', undefined, ['zara']).day = 1
    const chapter = composePulseChronicle(base)
    expect(chapter.sourceEventIds).toHaveLength(0)
  })
})

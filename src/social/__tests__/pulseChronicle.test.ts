import { describe, expect, it } from 'vitest'
import {
  appendRealityEvent,
  createInitialRealityDomainState,
  createRealityAlliance,
} from '../reality'
import type { RealitySocialEvent } from '../reality/types'
import type { SocialActionLogEntry } from '../types'
import { createInitialDramaSocialNetwork } from '../dramaModeEngine'
import { composePulseChronicle, getPulseChronicleIdentity } from '../pulseChronicle'

const roster = [
  { id: 'human', name: 'Player' },
  { id: 'alex', name: 'Alex' },
  { id: 'maya', name: 'Maya' },
  { id: 'zara', name: 'Zara' },
  { id: 'mimi', name: 'Mimi' },
  { id: 'kian', name: 'Kian' },
  { id: 'kai', name: 'Kai' },
]
function setup(day = 2) {
  const reality = createInitialRealityDomainState()
  const base = {
    gameId: 'episode-fixture',
    season: 1,
    day,
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
      day,
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
  it('connects observed competitions, nominations, saves and evictions without inventing vote counts', () => {
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
    const chapter = composePulseChronicle({ ...base, complete: true })
    const text = chapter.paragraphs.join(' ')
    expect(text).toContain('Alex')
    expect(text).toContain('Maya')
    expect(text).toContain('Zara')
    expect(text).toMatch(/Safety/)
    expect(text).not.toMatch(/unanimous|\d+ votes|secret alliance|camera|housemate/i)
    expect(chapter.note).toBe('')
    expect(chapter.complete).toBe(true)
    expect(chapter.sourceEventIds.length).toBeGreaterThan(2)
    expect(composePulseChronicle({ ...base, complete: true })).toEqual(chapter)
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
    expect(chapter.paragraphs).toHaveLength(1)
    expect(chapter.paragraphs[0]).toContain(
      'You tried to flirt with Maya, but they did not return the feeling.'
    )
    expect(chapter.paragraphs[0]).toContain('You pitched an alliance to Alex.')
    expect(chapter.note).toBe('')
    expect(chapter.sourceEventIds).toHaveLength(2)
  })

  it('does not narrate rejected safety as a successful save', () => {
    const { base, event } = setup()
    event('CEREMONY_SAFETY_DECLINED', 'alex', ['maya'])
    const chapter = composePulseChronicle(base)
    expect(chapter.paragraphs.join(' ')).toMatch(/unused/)
    expect(chapter.paragraphs.join(' ')).not.toMatch(/rescue/)
  })

  it('distinguishes a chosen nominee from an automatic nominee', () => {
    const { base, event } = setup()
    event('CEREMONY_NOMINATIONS_LOCKED', 'alex', ['maya', 'zara'], ['automatic_nominee:zara'])
    const text = composePulseChronicle(base).paragraphs.join(' ')
    expect(text).toContain('Alex nominated Maya.')
    expect(text).toContain('Zara was automatically nominated.')
    expect(text).not.toContain('Alex nominated Maya and Zara.')
  })

  it('narrates a self-save without claiming a contestant rescued another person', () => {
    const { base, event } = setup()
    event('CEREMONY_SAFETY_USED', 'maya', ['maya'])
    const chapter = composePulseChronicle(base)
    expect(chapter.paragraphs.join(' ')).toContain('Maya used Safety to save themselves.')
    expect(chapter.paragraphs.join(' ')).not.toContain('rescue Maya')
  })

  it('does not repeat a ceremony event merely because it appears again', () => {
    const { base, event, reality } = setup()
    const first = event('CEREMONY_POWER_WON', 'alex', [], ['loh'])
    reality.events.push(first)
    const chapter = composePulseChronicle(base)
    expect(chapter.sourceEventIds).toHaveLength(1)
  })

  it('includes a public vote tally in the eviction beat when the result is available', () => {
    const { base, event } = setup()
    event('CEREMONY_VOTES_REVEALED', undefined, ['maya', 'zara'])
    event('CEREMONY_EVICTION', undefined, ['zara'])
    const chapter = composePulseChronicle({
      ...base,
      voteResult: { mode: 'house', counts: { maya: 2, zara: 4 } },
    })
    expect(chapter.paragraphs).toContain(
      'Zara was eliminated. The vote was 4–2 (4 votes to evict Zara, 2 votes to evict Maya).'
    )
  })

  it('does not attach a public tally that conflicts with the recorded eviction', () => {
    const { base, event } = setup()
    event('CEREMONY_EVICTION', undefined, ['zara'])
    const chapter = composePulseChronicle({
      ...base,
      voteResult: { mode: 'house', counts: { maya: 4, zara: 2 } },
    })

    expect(chapter.paragraphs).toContain('Zara was voted out of the Hub.')
    expect(chapter.paragraphs.join(' ')).not.toContain('The vote was 4–2')
  })

  it('collapses identical action records into one readable beat', () => {
    const { base } = setup()
    const action = {
      actionId: 'compliment',
      actorId: 'human',
      targetId: 'maya',
      outcome: 'success',
      source: 'manual',
      week: 2,
      phase: 'social_1',
      cost: 1,
      delta: 1,
      newEnergy: 3,
    }
    const chapter = composePulseChronicle({
      ...base,
      actionHistory: [
        { ...action, id: 'first', timestamp: 1 },
        { ...action, id: 'duplicate', timestamp: 2 },
      ] as SocialActionLogEntry[],
    })
    expect(chapter.paragraphs).toEqual(['You had a good conversation with Maya.'])
    expect(chapter.sourceEventIds).toEqual(['first'])
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
    expect(text).toContain('You told Alex what you had heard about Maya.')
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
    expect(narrate('protect')).toContain('promised to protect Maya')
    expect(narrate('ask_safety_plan')).toContain('what they planned to do with Safety')
    expect(narrate('ask_hold_safety')).toContain('asked Maya to leave the nominations unchanged')
  })

  it('keeps a specific player-facing reaction from the action receipt', () => {
    const { base } = setup()
    const chapter = composePulseChronicle({
      ...base,
      actionHistory: [
        {
          id: 'mimi-declines',
          actionId: 'proposeAlliance',
          actorId: 'human',
          targetId: 'maya',
          outcome: 'failure',
          source: 'manual',
          week: 2,
          phase: 'social_1',
          timestamp: 1,
          cost: 1,
          delta: -1,
          newEnergy: 3,
          receipt: {
            summary: 'Maya said she does not see a strong ally in you.',
            outcomeLabel: 'Declined',
            tone: 'negative',
          },
        },
      ],
    })

    expect(chapter.paragraphs.join(' ')).toContain(
      'Maya said she does not see a strong ally in you.'
    )
    expect(chapter.paragraphs.join(' ')).not.toMatch(/relationship\s*[+-]\s*\d/i)
  })

  it('adds a shared pet detail only when both profiles confirm the same animal', () => {
    const { base } = setup()
    const chapter = composePulseChronicle({
      ...base,
      players: [...roster, { id: 'mimi', name: 'Mimi' }],
      humanPets: 'Cat named Miso',
      actionHistory: [
        {
          actionId: 'compliment',
          actorId: 'human',
          targetId: 'mimi',
          outcome: 'success',
          source: 'manual',
          week: 2,
          phase: 'social_1',
          timestamp: 1,
          cost: 1,
          delta: 1,
          newEnergy: 3,
        },
      ],
    })

    expect(chapter.paragraphs.join(' ')).toContain('It turns out you both have cats.')
  })

  it('recaps a public rumor exposure but omits private rumor movement', () => {
    const { base } = setup()
    const network = createInitialDramaSocialNetwork()
    network.rumours.push({
      id: 'exposed-rumour',
      kind: 'secret_romance',
      originatorId: 'alex',
      subjectId: 'maya',
      truth: 'true',
      claim: 'Maya has been keeping a relationship quiet.',
      evidence: 'confirmed',
      createdWeek: 1,
      expiresWeek: 4,
      listeners: [],
      status: 'exposed',
      exposureWeek: 2,
    })
    network.events.push({
      id: 'public-exposure',
      type: 'exposure',
      week: 2,
      phase: 'eviction_results',
      participantIds: ['alex', 'maya'],
      text: 'HUB EXPOSED: a rumor became public',
      relatedRumourId: 'exposed-rumour',
      public: true,
      severity: 'major',
      createdAt: 1,
    })
    network.events.push({
      id: 'private-spread',
      type: 'rumour_spread',
      week: 2,
      phase: 'social_2',
      participantIds: ['alex', 'maya'],
      text: 'A private rumor moved to one more listener.',
      public: false,
      severity: 'quiet',
      createdAt: 2,
    })

    const text = composePulseChronicle({ ...base, dramaNetwork: network }).paragraphs.join(' ')
    expect(text).toContain("Maya's secret romance came to light.")
    expect(text).not.toContain('private rumor moved')
    expect(composePulseChronicle({ ...base, dramaNetwork: network }).title).toBe(
      'A Secret Comes to Light'
    )
  })

  it('summarizes a rumour only on a day the player heard it', () => {
    const { base } = setup()
    const network = createInitialDramaSocialNetwork()
    network.rumours.push({
      id: 'next-target-rumour',
      kind: 'targeting',
      originatorId: 'alex',
      subjectId: 'zara',
      truth: 'uncertain',
      claim: 'Zara may be the next target.',
      evidence: 'weak',
      createdWeek: 2,
      expiresWeek: 4,
      listeners: [
        { playerId: 'human', sourceId: 'alex', confidence: 0.5, believed: true, heardWeek: 2 },
      ],
      status: 'circulating',
    })

    const chapter = composePulseChronicle({ ...base, dramaNetwork: network })
    expect(chapter.title).toBe('A Rumour Reaches You')
    expect(chapter.paragraphs).toEqual(['You heard that Zara might be the next target.'])

    network.rumours[0].listeners = []
    const unseenRumour = composePulseChronicle({ ...base, dramaNetwork: network })
    expect(unseenRumour.paragraphs).toEqual(['No major developments reached you today.'])
  })

  it('adds a Producer’s Note only when a recorded retaliation move supports it', () => {
    const { base, event } = setup()
    event('CEREMONY_NOMINATIONS_LOCKED', 'alex', ['human', 'maya'])
    const chapter = composePulseChronicle({
      ...base,
      actionHistory: [
        {
          id: 'rally-against-alex',
          actionId: 'rally_votes_against',
          actorId: 'human',
          targetId: 'maya',
          subjectId: 'alex',
          outcome: 'success',
          source: 'manual',
          week: 2,
          phase: 'social_2',
          timestamp: 2,
          cost: 1,
          delta: 1,
          newEnergy: 3,
        },
      ],
    })

    expect(chapter.note).toBe(
      'After Alex nominated you, you started lining up votes against them. Payback may already be in motion.'
    )
  })

  it('describes a unanimous house vote and uses rain as a quiet scene detail', () => {
    const { base, event } = setup()
    event('CEREMONY_EVICTION', undefined, ['zara'])
    const chapter = composePulseChronicle({
      ...base,
      weather: 'heavy_rain',
      voteResult: { mode: 'house', counts: { zara: 6, maya: 0 } },
    })

    expect(chapter.paragraphs.join(' ')).toContain(
      'With rain pouring outside, the Hub voted Zara out unanimously, 6–0.'
    )
  })

  it('reads a full save-and-eviction day as one connected episode recap', () => {
    const { base, event } = setup(1)
    const leader = event('CEREMONY_POWER_WON', 'mimi', [], ['loh'])
    const nominations = event('CEREMONY_NOMINATIONS_LOCKED', 'mimi', ['human', 'kian'])
    const safety = event('CEREMONY_POWER_WON', 'human', [], ['safety'])
    const saved = event('CEREMONY_SAFETY_USED', 'human', ['human'])
    const replacement = event(
      'CEREMONY_NOMINATIONS_LOCKED',
      'mimi',
      ['kai'],
      ['replacement_nominee', 'nomination_stage:REPLACEMENT']
    )
    replacement.phase = 'pos_ceremony_results'
    const eviction = event('CEREMONY_EVICTION', undefined, ['kai'])
    const actionHistory = [
      {
        id: 'first-chat',
        actionId: 'group_chat',
        actorId: 'human',
        targetId: 'mimi',
        outcome: 'success',
        source: 'manual',
        week: 1,
        phase: 'social_1',
        timestamp: 1,
        cost: 1,
        delta: 1,
        newEnergy: 4,
      },
      {
        id: 'alliance-no',
        actionId: 'proposeAlliance',
        actorId: 'human',
        targetId: 'mimi',
        outcome: 'failure',
        source: 'manual',
        week: 1,
        phase: 'social_1',
        timestamp: 2,
        cost: 1,
        delta: -1,
        newEnergy: 3,
        receipt: {
          summary: 'Mimi said she does not see a strong ally in you.',
          outcomeLabel: 'Declined',
          tone: 'negative',
        },
      },
      {
        id: 'retaliation',
        actionId: 'rally_votes_against',
        actorId: 'human',
        targetId: 'kian',
        subjectId: 'mimi',
        outcome: 'success',
        source: 'manual',
        week: 1,
        phase: 'social_2',
        timestamp: 3,
        cost: 1,
        delta: 1,
        newEnergy: 2,
      },
    ] as SocialActionLogEntry[]
    const chapter = composePulseChronicle({
      ...base,
      actionHistory,
      weather: 'heavy_rain',
      voteResult: { mode: 'house', counts: { kai: 6, kian: 0 } },
    })
    const output = chapter.paragraphs.join('\n\n')

    expect(
      [leader.id, nominations.id, safety.id, saved.id, replacement.id, eviction.id].every((id) =>
        chapter.sourceEventIds.includes(id)
      )
    ).toBe(true)
    expect(chapter.title).toBe('A Save and a Goodbye')
    expect(output).toContain(
      'You and Mimi got along in your first conversation. When you asked to work together, Mimi said she does not see a strong ally in you.'
    )
    expect(output).toContain(
      'Mimi nominated you and Kian. You won Safety and saved yourself. Mimi named Kai as the replacement nominee.'
    )
    expect(output).toContain('With rain pouring outside, the Hub voted Kai out unanimously, 6–0.')
    expect(chapter.note).toContain(
      'After Mimi nominated you, you started lining up votes against them.'
    )
    expect(output).not.toMatch(/housemate|housemates|Hubmate|relationship\s*[+-]\s*\d/i)
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
    expect(chronicle.paragraphs.join(' ')).toContain('You formed a pact with Alex.')
  })

  it('does not pull future or prior-day actions into the current episode', () => {
    const { base, event } = setup()
    event('CEREMONY_EVICTION', undefined, ['zara']).day = 1
    const chapter = composePulseChronicle(base)
    expect(chapter.sourceEventIds).toHaveLength(0)
  })
})

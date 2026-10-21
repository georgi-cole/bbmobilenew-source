import type { PulseChronicle, Player } from '../types'
import type { SocialActionLogEntry } from './types'
import type { RealityDomainState, RealitySocialEvent } from './reality/types'
import { canReadAllianceEvent, visibleRealityEvents } from './reality'

export interface ChronicleInput {
  gameId: string
  season: number
  day: number
  humanId: string
  players: readonly Pick<Player, 'id' | 'name'>[]
  reality: RealityDomainState
  actionHistory: readonly SocialActionLogEntry[]
  weather?: string | null
  complete?: boolean
}

type Category = 'power' | 'nominations' | 'safety' | 'social' | 'eviction'
interface StoryMoment {
  id: string
  category: Category
  sequence: number
  importance: number
  text: string
  actorId?: string
  targetId?: string
  outcome?: 'success' | 'failure'
}

const phaseOrder: Record<string, number> = {
  week_start: 0,
  loh_results: 1,
  social_1: 2,
  nominations: 3,
  nomination_results: 4,
  pos_results: 5,
  pos_ceremony_results: 6,
  social_2: 7,
  live_vote: 8,
  eviction_results: 9,
  week_end: 10,
}
const wetWeather = new Set([
  'rainy',
  'heavy_rain',
  'drizzle',
  'light_showers',
  'sun_showers',
  'stormy',
])
const descriptors: Record<string, string> = {
  sunny: 'sunshine',
  mostly_sunny: 'sunshine',
  cloudy: 'clouds',
  overcast: 'grey skies',
  misty: 'mist',
  foggy: 'fog',
  snowy: 'snow',
  snow_showers: 'snow',
}
const safeName = (name: string) =>
  name
    .replace(/[\r\n<>]/g, '')
    .trim()
    .slice(0, 48) || 'a housemate'

function hash(value: string): number {
  let result = 2166136261
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619)
  return result >>> 0
}

function choose(variants: readonly string[], seed: string): string {
  return variants[hash(seed) % variants.length]
}

function describeAction(action: SocialActionLogEntry, target: string, seed: string): string | null {
  const success = action.outcome === 'success'
  const move = action.actionId.toLowerCase()
  if (
    /flirt|charm|seduc|romanc|kiss|cuddle|makeout|spend_night|late_night_talk|go_public/.test(move)
  )
    return choose(
      success
        ? [
            'Your charm found a willing audience in ' +
              target +
              '. Perhaps there is chemistry after all.',
            'Things warmed up between you and ' + target + '. The cameras certainly noticed.',
          ]
        : [
            'You tried to charm ' + target + ', but the sparks refused to fly.',
            'Cupid had other plans when you approached ' +
              target +
              '. Rejection is part of the game, apparently.',
          ],
      seed
    )
  if (/alliance|pact|deal|promise|trust|recruit|ride_or_die/.test(move))
    return choose(
      success
        ? [
            'Your proposal to ' +
              target +
              ' found a receptive audience. A new understanding could prove useful.',
            'You made headway with ' +
              target +
              '. In the Hub, even a promising agreement has to survive tomorrow.',
          ]
        : [
            'You tried to win ' + target + ' over, but they were not convinced.',
            'Your pitch to ' + target + ' did not land. Back to the drawing board.',
          ],
      seed
    )
  if (/apolog|repair|make_amends|reconcile/.test(move))
    return success
      ? 'You made some peace with ' + target + '. Old wounds may finally be healing.'
      : 'You tried to patch things up with ' +
          target +
          ', but the damage was not so easily forgotten.'
  if (/confront|threaten|insult|accuse|argue|fight|public_callout|stir_rivalry/.test(move))
    return success
      ? 'You confronted ' + target + ', and your words made an impression. So much for a quiet day.'
      : 'Your confrontation with ' +
          target +
          ' did not go quite as planned. The tension, however, was real.'
  if (/compliment|bond|befriend|support|chat|encourage|rapport/.test(move))
    return success
      ? 'You found common ground with ' +
          target +
          '. Even in this house, a little goodwill goes a long way.'
      : 'You reached out to ' + target + ', but the connection never quite clicked.'
  if (/gossip|rumou?r|snoop|eavesdrop|spy|observe|intel|whisper|trade_secrets/.test(move))
    return success
      ? 'You spent some time reading the room. Knowledge is power, provided you know what to do with it.'
      : 'Your attempt to learn more about the house came up short. Not every whisper is yours to hear.'
  return null
}

function chronicleEvent(
  event: RealitySocialEvent,
  name: (id: string | undefined) => string,
  humanId: string,
  seed: string
): StoryMoment | null {
  const actor = event.actorId === humanId ? 'you' : name(event.actorId)
  const target = name(event.targetIds[0])
  const targets = event.targetIds.map(name).join(' and ')
  const base = {
    id: event.id,
    sequence: (phaseOrder[event.phase] ?? 5) * 1000000 + event.sequence,
    actorId: event.actorId,
    targetId: event.targetIds[0],
  }
  switch (event.type) {
    case 'CEREMONY_POWER_WON':
      if (event.tags.includes('loh'))
        return {
          ...base,
          category: 'power',
          importance: 100,
          text:
            actor === 'you'
              ? choose(
                  [
                    'You claimed the Leader of the Hub crown. Suddenly, everybody had a reason to be nice to you.',
                    'The LOH title landed in your hands. Power looks good on you. Responsibility may be another matter.',
                  ],
                  seed
                )
              : choose(
                  [
                    name(event.actorId) +
                      ' captured the LOH crown, leaving the rest of the Hub to reconsider their plans.',
                    'Power changed hands when ' +
                      name(event.actorId) +
                      ' won LOH. The real game was about to begin.',
                  ],
                  seed
                ),
        }
      if (event.tags.includes('immunity'))
        return {
          ...base,
          category: 'power',
          importance: 95,
          text:
            actor === 'you'
              ? 'You won immunity, buying yourself another day beyond the reach of the vote.'
              : name(event.actorId) + ' earned immunity. One name the vote could not touch.',
        }
      if (event.tags.includes('safety'))
        return {
          ...base,
          category: 'safety',
          importance: 92,
          text:
            actor === 'you'
              ? 'You won the Power of Safety. You could change someone’s fate, including your own.'
              : name(event.actorId) +
                ' won the Power of Safety, and the nominations were no longer set in stone.',
        }
      return null
    case 'CEREMONY_NOMINATIONS_LOCKED': {
      if (!event.targetIds.length) return null
      const replacement =
        event.tags.includes('replacement_nominee') ||
        event.tags.includes('nomination_stage:REPLACEMENT')
      const automatic = event.tags.some((tag) => tag.startsWith('automatic_nominee:'))
      return {
        ...base,
        category: 'nominations',
        importance: replacement ? 98 : 96,
        text: replacement
          ? event.actorId === humanId
            ? 'You had to name ' +
              targets +
              ' as a replacement. Another difficult choice, another set of eyes on you.'
            : actor === 'you'
              ? 'The block shifted again, and ' + targets + ' landed in danger.'
              : name(event.actorId) + ' put ' + targets + ' on the block as the replacement.'
          : event.tags.includes('secret_ballot')
            ? 'The secret ballots landed ' + targets + ' on the block. The Hub had made its choice.'
            : automatic || !event.actorId
              ? targets + ' ended up on the block as the nominations became official.'
              : event.actorId === humanId
                ? 'You nominated ' + targets + '. The first real test of power had arrived.'
                : name(event.actorId) +
                  ' nominated ' +
                  targets +
                  '. Friendships suddenly felt rather fragile.',
      }
    }
    case 'CEREMONY_SAFETY_USED':
      if (event.tags.includes('safety_decision:partial')) return null
      return {
        ...base,
        category: 'safety',
        importance: 96,
        text:
          event.targetIds.length === 1 && event.targetIds[0] === event.actorId
            ? actor === 'you'
              ? 'You used Safety to save yourself. Sometimes the smartest rescue is your own.'
              : name(event.actorId) + ' used Safety to escape the block. One less reason to panic.'
            : event.targetIds.length
              ? actor === 'you'
                ? 'You used Safety to pull ' +
                  targets +
                  ' out of danger. Someone owes you a very good thank-you.'
                : name(event.actorId) +
                  ' used Safety to rescue ' +
                  targets +
                  '. The block was no longer what it seemed.'
              : 'Safety changed the nominations, forcing everyone to rethink the vote.',
      }
    case 'CEREMONY_SAFETY_DECLINED':
      if (event.tags.includes('safety_decision:partial')) return null
      return {
        ...base,
        category: 'safety',
        importance: 65,
        text:
          actor === 'you'
            ? 'You chose not to use Safety. Sometimes doing nothing is the loudest decision.'
            : name(event.actorId) + ' kept the Power of Safety unused. The block stayed put.',
      }
    case 'CEREMONY_EVICTION':
      if (!event.targetIds.length) return null
      return {
        ...base,
        category: 'eviction',
        importance: 120,
        text: event.tags.includes('administrative_removal')
          ? target +
            ' was removed from the competition by the Big Eye. An unexpected and abrupt goodbye.'
          : event.tags.includes('self_eviction')
            ? target + ' decided their Hub journey was over and left on their own terms.'
            : event.tags.includes('public_vote')
              ? 'The audience had the final word, and ' +
                target +
                ' was eliminated. A dream ended under the brightest lights.'
              : choose(
                  [
                    target +
                      ' was voted out of the Hub. One fewer housemate, and plenty more unfinished business.',
                    'The votes were in, and ' +
                      target +
                      ' was sent packing. The Hub does not wait for anyone.',
                  ],
                  seed
                ),
      }
    case 'ALLIANCE_FORMED':
      if (!event.participantIds.includes(humanId) && event.actorId !== humanId) return null
      return {
        ...base,
        category: 'social',
        importance: 88,
        text: 'A new alliance entered your story. Promises have been made; keeping them may be the harder part.',
      }
    case 'ALLIANCE_MEMBER_RECRUITED':
      if (!event.participantIds.includes(humanId)) return null
      return {
        ...base,
        category: 'social',
        importance: 68,
        text:
          target + ' joined an alliance you know. The circle is growing, and so are the stakes.',
      }
    case 'ALLIANCE_BETRAYAL':
    case 'ALLIANCE_MEMBER_DEFECTED':
      if (!event.participantIds.includes(humanId)) return null
      return {
        ...base,
        category: 'social',
        importance: 105,
        text: 'Trouble reached an alliance close to you. In the Hub, loyalty can have a very short shelf life.',
      }
    case 'ALLIANCE_ENDED':
    case 'ALLIANCE_DISSOLVED':
      if (!event.participantIds.includes(humanId)) return null
      return {
        ...base,
        category: 'social',
        importance: 90,
        text:
          safeName(event.allianceSnapshot?.name ?? 'An alliance') +
          ' came to an end. Even strong partnerships have an expiry date in the Hub.',
      }
    case 'ALLIANCE_REQUEST_ACCEPTED':
      if (!event.participantIds.includes(humanId)) return null
      return {
        ...base,
        category: 'social',
        importance: 72,
        text: 'A new alliance request was accepted. A quiet agreement today could change tomorrow’s vote.',
      }
    case 'ALLIANCE_STRATEGY_MEETING':
      if (!event.participantIds.includes(humanId)) return null
      return {
        ...base,
        category: 'social',
        importance: 35,
        text: 'You and your allies compared plans behind the scenes. The conversation may matter when the next decision arrives.',
      }
    default:
      return null
  }
}

function headline(moments: StoryMoment[], seed: string): string {
  const has = (category: Category) => moments.some((moment) => moment.category === category)
  if (has('eviction') && has('safety'))
    return choose(['Power, Panic & a Final Goodbye', 'Safety, Schemes & a Sudden Exit'], seed)
  if (has('eviction'))
    return choose(
      ['A Day of Deals and Goodbyes', 'One Less Housemate, More Unfinished Business'],
      seed
    )
  if (has('nominations'))
    return choose(['The Block Is Open for Business', 'Big Decisions, Bigger Consequences'], seed)
  if (has('power'))
    return choose(['The Crown Changes Everything', 'Power Has Entered the Chat'], seed)
  if (has('social'))
    return choose(['Whispers in the Hub', 'Friends, Favors & Question Marks'], seed)
  return 'The Story Is Still Unfolding'
}

/** Pure, bounded, deterministic storytelling. Never invents events or reads undiscovered secrets. */
export function composePulseChronicle(input: ChronicleInput): PulseChronicle {
  const seed = input.gameId + ':' + input.season + ':' + input.day
  const byId = new Map(input.players.map((player) => [player.id, safeName(player.name)]))
  const name = (id: string | undefined) =>
    id ? (id === input.humanId ? 'you' : (byId.get(id) ?? 'a housemate')) : 'a housemate'
  const events = visibleRealityEvents(input.reality, { actorId: input.humanId })
    .filter((event) => event.day === input.day && canReadAllianceEvent(event, input.humanId))
    .sort((a, b) => a.sequence - b.sequence)
  const moments = events
    .map((event) => chronicleEvent(event, name, input.humanId, seed + ':' + event.id))
    .filter((moment): moment is StoryMoment => moment !== null)
  const actionMoments = input.actionHistory
    .filter(
      (action) =>
        action.week === input.day &&
        action.actorId === input.humanId &&
        action.targetId &&
        (action.source === 'manual' || !action.source)
    )
    .map((action, index) => {
      const text = describeAction(
        action,
        name(action.targetId),
        seed + ':action:' + (action.id ?? String(index))
      )
      if (!text) return null
      return {
        id: action.id ?? 'action:' + index,
        category: 'social' as const,
        importance: 78,
        sequence: (phaseOrder[action.phase ?? ''] ?? 4) * 1000000 + 500000 + index,
        text,
        actorId: action.actorId,
        targetId: action.targetId,
        outcome: action.outcome,
      }
    })
    .filter((moment): moment is NonNullable<typeof moment> => moment !== null)
  moments.push(...actionMoments)

  // Favour big beats while preserving the actual ceremony order in the final story.
  const unique = new Map<string, StoryMoment>()
  for (const moment of moments) {
    const signature =
      moment.category +
      ':' +
      moment.actorId +
      ':' +
      moment.targetId +
      ':' +
      (moment.category === 'social' ? moment.text : moment.id)
    if (!unique.has(signature)) unique.set(signature, moment)
  }
  const all = [...unique.values()]
  const priority = [...all].sort((a, b) => b.importance - a.importance || a.sequence - b.sequence)
  const featured = priority
    .filter(
      (item, index) =>
        index < 8 &&
        (item.category !== 'social' ||
          priority.slice(0, index).filter((prev) => prev.category === 'social').length < 3)
    )
    .sort((a, b) => a.sequence - b.sequence)
  const known = featured.length > 0
  let introduction = ''
  if (known && input.weather && wetWeather.has(input.weather))
    introduction = choose(
      [
        'The rain came down, but the real storm was brewing inside the Hub.',
        'It was wet outside. Inside, the forecast called for drama.',
      ],
      seed
    )
  else if (known && input.weather && descriptors[input.weather])
    introduction =
      'The day opened under ' +
      descriptors[input.weather] +
      ', and the Hub had its own weather to contend with.'
  else if (known)
    introduction = choose(
      [
        'Another day in the Hub, and peace was apparently not on the schedule.',
        'The cameras were rolling, and the housemates wasted little time giving them something to watch.',
      ],
      seed
    )
  const paragraphs: string[] = []
  if (introduction) paragraphs.push(introduction)
  const group: StoryMoment[][] = []
  for (const moment of featured) {
    const latest = group[group.length - 1]
    if (latest && latest.length < 2 && latest[0].category === moment.category) latest.push(moment)
    else group.push([moment])
  }
  paragraphs.push(...group.map((section) => section.map((beat) => beat.text).join(' ')))

  let note = ''
  const personals = all.filter(
    (moment) => moment.category === 'social' && moment.actorId === input.humanId
  )
  const exits = all.filter((moment) => moment.category === 'eviction')
  if (
    personals.some((moment) => moment.outcome === 'failure') &&
    personals.some((moment) => moment.outcome === 'success')
  ) {
    const failed = personals.find((moment) => moment.outcome === 'failure')
    const succeeded = personals.find((moment) => moment.outcome === 'success')
    note =
      'Your move involving ' +
      name(failed?.targetId) +
      ' fell flat, while things went better with ' +
      name(succeeded?.targetId) +
      '. The Hub rarely gives every plan the same welcome.'
  } else if (personals.length >= 2)
    note =
      'You have been busy working on your place in the Hub. The results of those efforts may matter tomorrow.'
  else if (
    all.some((moment) => moment.category === 'nominations' && moment.actorId === input.humanId)
  )
    note = 'You held the power today. Now comes the tricky part: living with the choices you made.'
  else if (all.some((moment) => moment.category === 'safety' && moment.actorId === input.humanId))
    note = 'You had a hand in someone’s fate today. That kind of moment tends to be remembered.'
  else if (exits.some((moment) => moment.targetId === input.humanId))
    note = 'Your place inside the Hub may have changed, but your journey is not necessarily over.'
  else if (exits.length)
    note = 'Another face is gone, and the remaining players have one fewer place to hide.'
  else if (featured.length)
    note = 'The pieces are moving. Which of today’s choices will matter most tomorrow?'

  return {
    season: input.season,
    day: input.day,
    title: headline(featured, seed + ':headline'),
    paragraphs: paragraphs.length
      ? paragraphs
      : ['Not much has reached your radar yet. Even the cameras need a quiet moment sometimes.'],
    note,
    sourceEventIds: featured.map((beat) => beat.id),
    complete: input.complete === true,
  }
}

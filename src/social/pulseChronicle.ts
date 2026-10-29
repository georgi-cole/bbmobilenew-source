import type { PulseChronicle, Player } from '../types'
import type { SocialActionLogEntry } from './types'
import type { RealityDomainState, RealitySocialEvent } from './reality/types'
import { canReadAllianceEvent, visibleRealityEvents } from './reality'
import { getPulseChronicleOpening, type PulseChronicleTheme } from './pulseChronicleCopy'
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
  episode?: PulseChronicleIdentity
  actionHistoryAfterTimestamp?: number
  realityEventsAfterSequence?: number
  theme?: PulseChronicleTheme
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
  eventType?: string
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
    .slice(0, 48) || 'a hubmate'
function hash(value: string): number {
  let result = 2166136261
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619)
  return result >>> 0
}
function choose(variants: readonly string[], seed: string): string {
  return variants[hash(seed) % variants.length]
}
type ActionStoryKind =
  | 'bond'
  | 'romance'
  | 'alliance'
  | 'consultation'
  | 'private-intel'
  | 'rumor'
  | 'intel'
  | 'intel-trade'
  | 'apology'
  | 'conflict'
  | 'protection-promise'
  | 'safety-request'
  | 'safety-hold-request'
  | 'safety-intel'
  | 'warning'
  | 'nomination-plan'
  | 'vote-plan'
  | 'favor'
const actionStoryKinds: Record<string, ActionStoryKind> = {
  compliment: 'bond',
  group_chat: 'bond',
  build_quiet_bond: 'bond',
  share_personal_story: 'bond',
  flirt: 'romance',
  reassure: 'bond',
  apologize: 'apology',
  whisper: 'private-intel',
  rumor: 'rumor',
  observe: 'intel',
  read_the_room: 'intel',
  share_intel: 'intel-trade',
  proposeAlliance: 'alliance',
  ally: 'alliance',
  consult_alliance: 'consultation',
  protect: 'protection-promise',
  ask_use_safety: 'safety-request',
  ask_safety_plan: 'safety-intel',
  ask_hold_safety: 'safety-hold-request',
  betray: 'conflict',
  startFight: 'conflict',
  confront: 'conflict',
  favor_request: 'favor',
  pitch_target: 'nomination-plan',
  suggest_replacement: 'nomination-plan',
  warn_about_danger: 'warning',
  ask_why_nominated: 'nomination-plan',
  ask_loh_target: 'nomination-plan',
  warn_about_player: 'nomination-plan',
  rally_votes_against: 'vote-plan',
  vote_rally: 'vote-plan',
  nominate: 'nomination-plan',
}
const actionStoryCopy: Record<ActionStoryKind, { success: string; failure: string }> = {
  bond: {
    success: 'You took time to connect with {target}. A little goodwill can go a long way.',
    failure: 'You tried to connect with {target}, but the moment did not quite land.',
  },
  romance: {
    success: 'You made a romantic gesture toward {target}. The next move is theirs.',
    failure: 'You tried to flirt with {target}, but the sparks did not catch.',
  },
  alliance: {
    success: 'You put an alliance idea to {target}. Any agreement still has to survive the game.',
    failure: '{target} was not persuaded by your alliance pitch.',
  },
  consultation: {
    success: 'You asked your alliance for a read on the next move. The decision is still yours.',
    failure: 'Your attempt to get an alliance read did not produce a clear answer.',
  },
  'private-intel': {
    success:
      'You shared private information with {target}. Trust may grow, but the secret is no longer yours alone.',
    failure: 'You tried to share private information with {target}, but it did not build trust.',
  },
  rumor: {
    success:
      'You passed a rumor about {subject} to {target}. A whisper can travel further than intended.',
    failure: 'Your rumor about {subject} did not get the reaction you hoped for from {target}.',
  },
  intel: {
    success: 'You spent time reading the room around {target}. What you learned may matter later.',
    failure: 'You tried to learn more from {target}, but came away without a clear read.',
  },
  'intel-trade': {
    success:
      'You traded information with {target} to gain leverage. What you told them is now out of your hands.',
    failure:
      'Your attempt to trade information with {target} did not earn the leverage you wanted.',
  },
  apology: {
    success:
      'You tried to make peace with {target}. Old wounds may take more than one conversation.',
    failure: 'You tried to make peace with {target}, but the damage was not so easily forgotten.',
  },
  conflict: {
    success: 'You challenged {target}, and the tension between you was out in the open.',
    failure: 'Your confrontation with {target} did not go as planned. The tension remained.',
  },
  'protection-promise': {
    success:
      'You offered {target} protection if the chance comes. Now they know where your loyalties may lie.',
    failure: '{target} was not convinced by your offer of protection.',
  },
  'safety-request': {
    success: 'You asked {target} to use Safety. The final call was theirs.',
    failure: 'You asked {target} to use Safety, but they were not persuaded.',
  },
  'safety-hold-request': {
    success: 'You asked {target} to leave the nominations unchanged. The final call was theirs.',
    failure: '{target} was not persuaded to leave the nominations as they were.',
  },
  'safety-intel': {
    success:
      'You asked {target} what they planned to do with Safety. The answer gave you a read, not a guarantee.',
    failure: '{target} kept their Safety intentions close.',
  },
  warning: {
    success:
      'You warned {target} that they may be in danger. The warning could help them, or expose your hand.',
    failure: 'Your warning did not land with {target}.',
  },
  'nomination-plan': {
    success: 'You made your case to {target} about the nominations. The final call was theirs.',
    failure: '{target} was not convinced by your nomination pitch.',
  },
  'vote-plan': {
    success:
      'You tried to build support against {subject}. The votes would decide whether it held.',
    failure: 'Your attempt to build support against {subject} did not take hold.',
  },
  favor: {
    success: 'You asked {target} for a favor. Now the two of you know where you stand.',
    failure: '{target} turned down your request. That answer may shape what comes next.',
  },
}
function describeAction(
  action: SocialActionLogEntry,
  name: (id: string | undefined) => string
): string | null {
  const kind = actionStoryKinds[action.actionId]
  if (!kind || action.actionId === 'idle') return null
  const copy = actionStoryCopy[kind]
  const subjectName = (id: string | undefined) => name(id)
  return (action.outcome === 'success' ? copy.success : copy.failure)
    .replaceAll('{target}', subjectName(action.targetId))
    .replaceAll('{subject}', subjectName(action.subjectId ?? action.targetId))
}
export interface PulseChronicleWeekend {
  afterDay: number
  weekendNumber?: number
  weekendDay: number
  finaleWeekend?: boolean
}
export interface PulseChronicleIdentity {
  key: string
  label: string
}
export function getPulseChronicleIdentity(
  day: number,
  weekend?: PulseChronicleWeekend | null
): PulseChronicleIdentity {
  if (!weekend?.weekendDay) return { key: `day:${day}`, label: `Day ${day}` }
  const weekendNumber = weekend.weekendNumber ?? 'special'
  const label = weekend.finaleWeekend
    ? `Finale weekend · Day ${weekend.weekendDay}`
    : `Weekend ${weekendNumber} · Day ${weekend.weekendDay}`
  return {
    key: `weekend:${weekendNumber}:${weekend.afterDay}:${weekend.weekendDay}`,
    label,
  }
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
        text: event.targetIds.includes(humanId)
          ? 'You were eliminated from the Hub. The game moved on without you.'
          : event.tags.includes('administrative_removal')
            ? target +
              ' was removed from the competition by the Big Eye. An unexpected and abrupt goodbye.'
            : event.tags.includes('self_eviction')
              ? target + ' decided their Hub journey was over and left on their own terms.'
              : event.tags.includes('public_vote')
                ? 'The audience had the final word, and ' +
                  target +
                  ' was eliminated. A dream ended under the brightest lights.'
                : event.tags.includes('finale_choice')
                  ? 'The Final LOH chose ' +
                    target +
                    ' to leave, setting the stage for the Final Two.'
                  : choose(
                      [
                        target +
                          ' was voted out of the Hub. One fewer hubmate, and plenty more unfinished business.',
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
      ['A Day of Deals and Goodbyes', 'One Less Hubmate, More Unfinished Business'],
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
  const daySeed = input.gameId + ':' + input.season + ':' + input.day
  const seed = input.episode ? daySeed + ':' + input.episode.key : daySeed
  const byId = new Map(input.players.map((player) => [player.id, safeName(player.name)]))
  const name = (id: string | undefined) =>
    id ? (id === input.humanId ? 'you' : (byId.get(id) ?? 'a hubmate')) : 'a hubmate'
  const eventSources = [
    ...visibleRealityEvents(input.reality, { actorId: input.humanId }),
    ...Object.values(input.reality.alliances).flatMap((alliance) => alliance.history ?? []),
    ...Object.values(input.reality.allianceManagement?.requests ?? {}).flatMap(
      (request) => request.history ?? []
    ),
  ]
  const events = [...new Map(eventSources.map((event) => [event.id, event])).values()]
    .filter(
      (event) =>
        event.day === input.day &&
        event.sequence > (input.realityEventsAfterSequence ?? -1) &&
        canReadAllianceEvent(event, input.humanId)
    )
    .sort((a, b) => a.sequence - b.sequence)
  const moments = events
    .map((event) => chronicleEvent(event, name, input.humanId, seed + ':' + event.id))
    .filter((moment): moment is StoryMoment => moment !== null)
  const actionMoments = input.actionHistory
    .filter(
      (action) =>
        action.week === input.day &&
        action.timestamp > (input.actionHistoryAfterTimestamp ?? 0) &&
        action.actorId === input.humanId &&
        action.targetId &&
        (action.source === 'manual' || !action.source)
    )
    .map((action, index) => {
      const text = describeAction(action, name)
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
        eventType: 'MANUAL_ACTION',
      }
    })
    .filter((moment): moment is NonNullable<typeof moment> => moment !== null)
  const allianceOutcomes = events.filter((event) =>
    ['ALLIANCE_FORMED', 'ALLIANCE_REQUEST_ACCEPTED'].includes(event.type)
  )
  const strategyMeetings = events.filter((event) => event.type === 'ALLIANCE_STRATEGY_MEETING')
  const distinctActionMoments = actionMoments.filter((moment) => {
    const action = input.actionHistory.find((entry) => entry.id === moment.id)
    if (!action) return true
    if (
      ['proposeAlliance', 'ally'].includes(action.actionId) &&
      allianceOutcomes.some(
        (event) =>
          event.actorId === action.actorId &&
          (event.targetIds.includes(action.targetId) ||
            event.participantIds.includes(action.targetId))
      )
    )
      return false
    if (
      action.actionId === 'consult_alliance' &&
      strategyMeetings.some(
        (event) =>
          event.actorId === action.actorId && (!action.phase || event.phase === action.phase)
      )
    )
      return false
    return true
  })
  moments.push(...distinctActionMoments)
  for (const event of events) {
    if (event.type !== 'ALLIANCE_REQUEST_ACCEPTED') continue
    const superseded = events.some(
      (candidate) =>
        candidate.type === 'ALLIANCE_FORMED' &&
        candidate.day === event.day &&
        candidate.allianceId === event.allianceId
    )
    if (superseded) {
      const index = moments.findIndex((moment) => moment.id === event.id)
      if (index >= 0) moments.splice(index, 1)
    }
  }
  // Favour big beats while preserving the actual ceremony order in the final story.
  const unique = new Map<string, StoryMoment>()
  for (const moment of moments) {
    const signature =
      moment.category + ':' + moment.actorId + ':' + moment.targetId + ':' + moment.id
    if (!unique.has(signature)) unique.set(signature, moment)
  }
  const all = [...unique.values()]
  const priorityScore = (moment: StoryMoment) =>
    moment.importance +
    (moment.actorId === input.humanId ? 24 : 0) +
    (moment.targetId === input.humanId ? 36 : 0)
  const priority = [...all].sort(
    (a, b) => priorityScore(b) - priorityScore(a) || a.sequence - b.sequence
  )
  const ceremonyHighlights = priority.filter((moment) => moment.category !== 'social').slice(0, 6)
  const socialSlots = Math.min(3, Math.max(0, 8 - ceremonyHighlights.length))
  const socialPriority = priority.filter((moment) => moment.category === 'social')
  const playerAction = socialPriority.find((moment) => moment.eventType === 'MANUAL_ACTION')
  const personalHighlights = [
    ...(playerAction ? [playerAction] : []),
    ...socialPriority
      .filter((moment) => moment !== playerAction)
      .slice(0, Math.max(0, socialSlots - (playerAction ? 1 : 0))),
  ]
  const featured = [...ceremonyHighlights, ...personalHighlights].sort(
    (a, b) => a.sequence - b.sequence
  )
  const known = featured.length > 0
  let introduction = ''
  const themeOpening = getPulseChronicleOpening(input.theme ?? { format: 'classic' }, seed)
  if (themeOpening) introduction = themeOpening
  else if (known && input.weather && wetWeather.has(input.weather))
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
        'The cameras were rolling, and the hubmates wasted little time giving them something to watch.',
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
  if (exits.some((moment) => moment.targetId === input.humanId))
    note =
      'You were eliminated from the game today. Take a moment to regroup before deciding what comes next.'
  else if (
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
  else if (exits.length)
    note = 'Another face is gone, and the remaining players have one fewer place to hide.'
  else if (featured.length)
    note = 'The pieces are moving. Which of today’s choices will matter most tomorrow?'
  return {
    season: input.season,
    day: input.day,
    episodeKey: input.episode?.key ?? `day:${input.day}`,
    episodeLabel: input.episode?.label ?? `Day ${input.day}`,
    title: headline(featured, seed + ':headline'),
    paragraphs: paragraphs.length
      ? paragraphs
      : ['Not much has reached your radar yet. Even the cameras need a quiet moment sometimes.'],
    note,
    sourceEventIds: featured.map((beat) => beat.id),
    complete: input.complete === true,
  }
}

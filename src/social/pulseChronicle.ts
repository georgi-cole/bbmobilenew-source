import type { PulseChronicle, Player } from '../types'
import type { DramaSocialNetwork, SocialActionLogEntry } from './types'
import type { RealityDomainState, RealitySocialEvent } from './reality/types'
import { canReadAllianceEvent, visibleRealityEvents } from './reality'
import { findByName, getById } from '../data/houseguests'
export interface ChronicleInput {
  gameId: string
  season: number
  day: number
  humanId: string
  players: readonly Pick<Player, 'id' | 'name'>[]
  reality: RealityDomainState
  actionHistory: readonly SocialActionLogEntry[]
  dramaNetwork?: Pick<DramaSocialNetwork, 'events' | 'rumours' | 'arcs'>
  weather?: string | null
  humanPets?: string | null
  complete?: boolean
  episode?: PulseChronicleIdentity
  actionHistoryAfterTimestamp?: number
  realityEventsAfterSequence?: number
  voteResult?: ChronicleVoteResult | null
}
export interface ChronicleVoteResult {
  mode: 'house' | 'audience'
  counts: Readonly<Record<string, number>>
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
  actionId?: string
  allianceId?: string
  replacementNomination?: boolean
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
// Decorative copy only: the seeded scene never changes game state or outcomes.
const rainyEvictionScenes = [
  {
    lead: 'Rain tapped at the windows as',
    after: 'The remaining players stayed inside for a drink afterward.',
  },
  {
    lead: 'With rain sweeping over the Hub,',
    after: 'After the vote, the players who stayed behind shared a drink indoors.',
  },
  {
    lead: 'Rain kept the evening indoors as',
    after: 'Once the vote was over, the remaining players settled in with a drink.',
  },
]
const safeName = (name: string) =>
  name
    .replace(/[\r\n<>]/g, '')
    .trim()
    .slice(0, 48) || 'another player'
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
    success: 'You had a good conversation with {target}.',
    failure: 'You tried to connect with {target}, but it did not go as hoped.',
  },
  romance: {
    success: 'You made a romantic gesture toward {target}.',
    failure: 'You tried to flirt with {target}, but they did not return the feeling.',
  },
  alliance: {
    success: 'You pitched an alliance to {target}.',
    failure: '{target} turned down your alliance pitch.',
  },
  consultation: {
    success: 'You asked your alliance for advice on the next move.',
    failure: 'Your alliance could not give you a clear answer.',
  },
  'private-intel': {
    success: 'You shared private information with {target}.',
    failure: 'You tried to share private information with {target}, but they did not trust it.',
  },
  rumor: {
    success: 'You told {target} what you had heard about {subject}.',
    failure: '{target} was not convinced by what you said about {subject}.',
  },
  intel: {
    success: 'You got a better read on {target}.',
    failure: 'You tried to get a read on {target}, but came away unsure.',
  },
  'intel-trade': {
    success: 'You traded information with {target}.',
    failure: 'Your information trade with {target} did not pay off.',
  },
  apology: {
    success: 'You apologized to {target}.',
    failure: 'You apologized to {target}, but they were not ready to make peace.',
  },
  conflict: {
    success: 'You confronted {target}.',
    failure: 'You tried to confront {target}, but the conversation did not go your way.',
  },
  'protection-promise': {
    success: 'You promised to protect {target}.',
    failure: '{target} turned down your offer of protection.',
  },
  'safety-request': {
    success: 'You asked {target} to use Safety.',
    failure: 'You asked {target} to use Safety, but they said no.',
  },
  'safety-hold-request': {
    success: 'You asked {target} to leave the nominations unchanged.',
    failure: '{target} did not agree to leave the nominations unchanged.',
  },
  'safety-intel': {
    success: 'You asked {target} what they planned to do with Safety.',
    failure: '{target} kept their plans for Safety to themselves.',
  },
  warning: {
    success: 'You warned {target} they might be in danger.',
    failure: '{target} did not take your warning seriously.',
  },
  'nomination-plan': {
    success: 'You made your case to {target} about the nominations.',
    failure: '{target} was not convinced by your nomination pitch.',
  },
  'vote-plan': {
    success: 'You tried to build support to vote out {subject}.',
    failure: 'You could not build enough support to vote out {subject}.',
  },
  favor: {
    success: 'You asked {target} for a favor.',
    failure: '{target} turned down your request.',
  },
}
function describeAction(
  action: SocialActionLogEntry,
  name: (id: string | undefined) => string,
  sharedPet?: string
): string | null {
  const kind = actionStoryKinds[action.actionId]
  if (!kind || action.actionId === 'idle') return null
  const isBond = [
    'compliment',
    'group_chat',
    'build_quiet_bond',
    'share_personal_story',
    'reassure',
  ].includes(action.actionId)
  const personalDetail =
    isBond && action.outcome === 'success' && sharedPet
      ? ` It turns out you both have ${sharedPet}.`
      : ''
  const recordedSummary = action.receipt?.summary ?? action.narrative
  const cleanedSummary = recordedSummary
    ?.replace(/[\r\n<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    cleanedSummary &&
    cleanedSummary.length <= 220 &&
    !/relationship\s*[+-]\s*\d|\b(?:energy|influence|info)\s*[+-]?\d|spent\s+\d|landed exactly as intended|struck the right chord|paid off socially/i.test(
      cleanedSummary
    )
  )
    return cleanedSummary + personalDetail
  const copy = actionStoryCopy[kind]
  const subjectName = (id: string | undefined) => name(id)
  return (
    (action.outcome === 'success' ? copy.success : copy.failure)
      .replaceAll('{target}', subjectName(action.targetId))
      .replaceAll('{subject}', subjectName(action.subjectId ?? action.targetId)) + personalDetail
  )
}

function sharedPetKind(input: ChronicleInput, targetId: string): string | undefined {
  if (!input.humanPets) return undefined
  const target = input.players.find((player) => player.id === targetId)
  if (!target) return undefined
  const targetPets = (getById(target.id) ?? findByName(target.name))?.pets ?? ''
  const kinds = [
    { label: 'dogs', pattern: /\bdogs?\b/i },
    { label: 'cats', pattern: /\bcats?\b/i },
    { label: 'rabbits', pattern: /\brabbits?\b/i },
    { label: 'birds', pattern: /\b(?:birds?|canary|parrot)\b/i },
    { label: 'fish', pattern: /\bfish\b/i },
    { label: 'horses', pattern: /\bhorses?\b/i },
    { label: 'ferrets', pattern: /\bferrets?\b/i },
  ]
  return kinds.find(({ pattern }) => pattern.test(input.humanPets!) && pattern.test(targetPets))
    ?.label
}

function voteOutcome(
  event: RealitySocialEvent,
  name: (id: string | undefined) => string,
  voteResult?: ChronicleVoteResult | null
): string | undefined {
  if (!voteResult || event.tags.includes('finale_choice')) return undefined
  const entries = Object.entries(voteResult.counts)
    .filter(([, count]) => Number.isFinite(count) && count >= 0)
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
  if (entries.length === 0) return undefined
  const leaders = new Set(
    entries.filter((entry) => entry.count === entries[0].count).map((entry) => entry.id)
  )
  if (!event.targetIds.some((id) => leaders.has(id))) return undefined

  if (voteResult.mode === 'house' && event.targetIds.length === 1) {
    const evictedId = event.targetIds[0]
    const votesForEvictee = voteResult.counts[evictedId] ?? 0
    const votesForOthers = entries.reduce(
      (total, entry) => total + (entry.id === evictedId ? 0 : entry.count),
      0
    )
    if (votesForEvictee > 0 && votesForOthers === 0)
      return `The Hub voted ${name(evictedId)} out unanimously, ${votesForEvictee}–0.`
  }

  const formatCount = (count: number) =>
    voteResult.mode === 'audience'
      ? `${Number(count.toFixed(1))}%`
      : `${count} ${count === 1 ? 'vote' : 'votes'}`
  const details = entries.map((entry) =>
    voteResult.mode === 'audience'
      ? `${formatCount(entry.count)} of votes to evict ${name(entry.id)}`
      : `${formatCount(entry.count)} to evict ${name(entry.id)}`
  )

  if (voteResult.mode === 'audience') return `The audience vote was ${details.join(', ')}`

  const score = entries.map((entry) => entry.count).join('–')
  const isTied = entries[0].count === entries[1].count
  return `The vote ${isTied ? 'tied' : 'was'} ${score} (${details.join(', ')})`
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
  seed: string,
  voteResult?: ChronicleVoteResult | null
): StoryMoment | null {
  const actor = event.actorId === humanId ? 'you' : name(event.actorId)
  const target = name(event.targetIds[0])
  const targets = event.targetIds.map(name).join(' and ')
  const base = {
    id: event.id,
    sequence: (phaseOrder[event.phase] ?? 5) * 1000000 + event.sequence,
    actorId: event.actorId,
    targetId: event.targetIds[0],
    eventType: event.type,
    allianceId: event.allianceId ?? event.allianceSnapshot?.id,
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
              ? 'You won Leader of the Hub.'
              : choose(
                  [
                    name(event.actorId) + ' won Leader of the Hub.',
                    name(event.actorId) + ' won the LOH competition.',
                  ],
                  seed
                ),
        }
      if (event.tags.includes('immunity'))
        return {
          ...base,
          category: 'power',
          importance: 95,
          text: actor === 'you' ? 'You won immunity.' : name(event.actorId) + ' won immunity.',
        }
      if (event.tags.includes('safety'))
        return {
          ...base,
          category: 'safety',
          importance: 92,
          text:
            actor === 'you'
              ? 'You won the Power of Safety.'
              : name(event.actorId) + ' won the Power of Safety.',
        }
      return null
    case 'CEREMONY_NOMINATIONS_LOCKED': {
      if (!event.targetIds.length) return null
      const replacement =
        event.tags.includes('replacement_nominee') ||
        event.tags.includes('nomination_stage:REPLACEMENT')
      const automaticIds = new Set(
        event.tags
          .filter((tag) => tag.startsWith('automatic_nominee:'))
          .map((tag) => tag.slice('automatic_nominee:'.length))
      )
      const automaticTargets = event.targetIds.filter((id) => automaticIds.has(id))
      const selectedTargets = event.targetIds.filter((id) => !automaticIds.has(id))
      const selectedNames = selectedTargets.map(name).join(' and ')
      const automaticNames = automaticTargets.map(name).join(' and ')
      const automaticCount = automaticTargets.length
      const automaticLine = automaticCount
        ? `${automaticNames} ${automaticCount === 1 ? 'was' : 'were'} automatically nominated.`
        : ''
      return {
        ...base,
        category: 'nominations',
        importance: replacement ? 98 : 96,
        replacementNomination: replacement,
        text: replacement
          ? event.actorId === humanId
            ? 'You named ' + targets + ' as the replacement nominee.'
            : actor === 'you'
              ? targets + ' became the replacement nominee.'
              : name(event.actorId) + ' named ' + targets + ' as the replacement nominee.'
          : event.tags.includes('secret_ballot')
            ? targets + ' were voted onto the block.'
            : [
                selectedTargets.length
                  ? !event.actorId
                    ? `${selectedNames} were nominated.`
                    : event.actorId === humanId
                      ? `You nominated ${selectedNames}.`
                      : `${name(event.actorId)} nominated ${selectedNames}.`
                  : '',
                automaticLine,
              ]
                .filter(Boolean)
                .join(' '),
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
              ? 'You used Safety to save yourself.'
              : name(event.actorId) + ' used Safety to save themselves.'
            : event.targetIds.length
              ? actor === 'you'
                ? 'You used Safety to save ' + targets + '.'
                : name(event.actorId) + ' used Safety to save ' + targets + '.'
              : 'Safety was used, changing the nominations.',
      }
    case 'CEREMONY_SAFETY_DECLINED':
      if (event.tags.includes('safety_decision:partial')) return null
      return {
        ...base,
        category: 'safety',
        importance: 65,
        text:
          actor === 'you'
            ? 'You chose not to use Safety; the nominations stayed the same.'
            : name(event.actorId) + ' left Safety unused; the nominations stayed the same.',
      }
    case 'CEREMONY_EVICTION': {
      if (!event.targetIds.length) return null
      const tally = voteOutcome(event, name, voteResult)
      return {
        ...base,
        category: 'eviction',
        importance: 120,
        text: event.targetIds.includes(humanId)
          ? `You were eliminated from the Hub.${tally ? ` ${tally}.` : ''}`
          : event.tags.includes('administrative_removal')
            ? target + ' was removed from the competition by the Big Eye.'
            : event.tags.includes('self_eviction')
              ? target + ' chose to leave the Hub.'
              : event.tags.includes('finale_choice')
                ? 'The Final LOH chose ' + target + ' to leave.'
                : (() => {
                    const departed = event.targetIds.map(name).join(' and ')
                    if (event.tags.includes('public_vote')) {
                      const audienceTally =
                        voteResult?.mode === 'audience' && tally
                          ? ` (${tally.replace(/^The audience vote was /, '')})`
                          : ''
                      return `The audience vote sent ${departed} home${audienceTally}.`
                    }
                    const verb = event.targetIds.length === 1 ? 'was' : 'were'
                    const departure =
                      event.targetIds.length === 1
                        ? `${departed} was eliminated.`
                        : `${departed} were eliminated.`
                    return tally?.startsWith('The Hub voted ')
                      ? tally
                      : tally
                        ? `${departure} ${tally}.`
                        : `${departed} ${verb} voted out of the Hub.`
                  })(),
      }
    }
    case 'ALLIANCE_FORMED':
      if (!event.participantIds.includes(humanId) && event.actorId !== humanId) return null
      {
        const allianceName = safeName(
          event.allianceSnapshot?.name ??
            (event.allianceSnapshot?.kind === 'PACT' ? 'a pact' : 'an alliance')
        )
        const otherMembers = event.participantIds
          .filter((id) => id !== event.actorId && id !== humanId)
          .map(name)
        const company = [humanId === event.actorId ? '' : 'you', ...otherMembers]
          .filter(Boolean)
          .join(' and ')
        const formedWith = company ? ` with ${company}` : ''
        return {
          ...base,
          category: 'social',
          importance: 88,
          text:
            event.actorId === humanId
              ? `You formed ${allianceName}${
                  otherMembers.length ? ` with ${otherMembers.join(' and ')}` : ''
                }.`
              : `${name(event.actorId)} formed ${allianceName}${formedWith}.`,
        }
      }
    case 'ALLIANCE_MEMBER_RECRUITED':
      if (!event.participantIds.includes(humanId)) return null
      return {
        ...base,
        category: 'social',
        importance: 68,
        text: `${event.targetIds[0] === humanId ? 'You' : target} joined ${safeName(event.allianceSnapshot?.name ?? 'your alliance')}.`,
      }
    case 'ALLIANCE_BETRAYAL':
    case 'ALLIANCE_MEMBER_DEFECTED':
      if (!event.participantIds.includes(humanId)) return null
      return {
        ...base,
        category: 'social',
        importance: 105,
        text:
          event.type === 'ALLIANCE_MEMBER_DEFECTED'
            ? `${event.targetIds[0] === humanId ? 'You' : target} left ${safeName(event.allianceSnapshot?.name ?? 'your alliance')}.`
            : `${event.actorId === humanId ? 'You' : name(event.actorId)} betrayed ${event.targetIds[0] === humanId ? 'you' : target} in ${safeName(event.allianceSnapshot?.name ?? 'your alliance')}.`,
      }
    case 'ALLIANCE_ENDED':
    case 'ALLIANCE_DISSOLVED':
      if (!event.participantIds.includes(humanId)) return null
      return {
        ...base,
        category: 'social',
        importance: 90,
        text: safeName(event.allianceSnapshot?.name ?? 'Your alliance') + ' ended.',
      }
    case 'ALLIANCE_REQUEST_ACCEPTED':
      // Approval is not the same as membership; the confirmed formation or
      // recruitment event carries the user-facing outcome when it happens.
      return null
    case 'ALLIANCE_STRATEGY_MEETING':
      if (!event.participantIds.includes(humanId)) return null
      return {
        ...base,
        category: 'social',
        importance: 35,
        text: 'You and your allies discussed the next move.',
      }
    default:
      return null
  }
}
function headline(moments: StoryMoment[], seed: string): string {
  const has = (category: Category) => moments.some((moment) => moment.category === category)
  const safetyUsed = moments.some((moment) => moment.eventType === 'CEREMONY_SAFETY_USED')
  if (has('eviction') && safetyUsed) return 'A Save and a Goodbye'
  if (moments.some((moment) => moment.eventType === 'PUBLIC_EXPOSURE'))
    return 'A Secret Comes to Light'
  if (moments.some((moment) => moment.eventType === 'HEARD_RUMOUR')) return 'A Rumour Reaches You'
  if (has('nominations') && has('social')) return 'A Promising Start, a Sudden Turn'
  if (has('eviction')) return 'A Goodbye in the Hub'
  if (has('nominations')) return choose(['The Nominations Are Set', 'The Block Took Shape'], seed)
  if (has('power')) {
    const leadershipChanged = moments.some(
      (moment) =>
        moment.eventType === 'CEREMONY_POWER_WON' &&
        (moment.text.includes('Leader of the Hub') || moment.text.includes('LOH competition'))
    )
    return leadershipChanged ? 'A New Leader in the Hub' : 'Immunity Is in Play'
  }
  if (has('social'))
    return choose(['A Conversation Could Change Things', 'Alliances and Open Questions'], seed)
  return 'The Story Is Still Unfolding'
}

function publicExposureMoments(
  input: ChronicleInput,
  name: (id: string | undefined) => string
): StoryMoment[] {
  const network = input.dramaNetwork
  if (!network) return []
  const rumoursById = new Map(network.rumours.map((rumour) => [rumour.id, rumour]))
  const arcsById = new Map(network.arcs.map((arc) => [arc.id, arc]))
  return network.events.flatMap((event, index) => {
    if (event.week !== input.day || !event.public || event.type !== 'exposure') return []
    const rumour = event.relatedRumourId ? rumoursById.get(event.relatedRumourId) : undefined
    const exposedRumour =
      rumour?.status === 'exposed' && rumour.exposureWeek === input.day ? rumour : undefined
    const arc = event.relatedArcId ? arcsById.get(event.relatedArcId) : undefined
    let text = 'A private story became public.'
    let targetId: string | undefined
    if (exposedRumour) {
      targetId = exposedRumour.subjectId
      const subject = name(exposedRumour.subjectId)
      const source = name(exposedRumour.originatorId)
      if (exposedRumour.truth === 'false') {
        text = `The Hub learned the rumour about ${subject} was false, putting ${source} under suspicion.`
      } else if (exposedRumour.truth !== 'true') {
        text = `A rumour about ${subject} reached the Hub, but its truth remains unclear.`
      } else {
        const exposedSecret: Record<typeof exposedRumour.kind, string> = {
          secret_alliance: `${subject}'s hidden alliance came to light.`,
          secret_romance: `${subject}'s secret romance came to light.`,
          targeting: `The campaign against ${subject} became public.`,
          fake_deal: `${subject}'s conflicting deals became public.`,
          personal_comment: `A private comment involving ${subject} reached the whole Hub.`,
        }
        text = exposedSecret[exposedRumour.kind]
      }
    } else if (arc) {
      const pair = arc.participantIds.map(name).join(' and ')
      targetId = arc.participantIds.find((id) => id !== input.humanId)
      if (event.title === 'No more hiding') {
        text = `${pair} made their ${arc.type === 'romance' ? 'romance' : 'close bond'} public.`
      } else {
        text = `The Hub learned that ${pair} had been keeping their ${arc.type === 'romance' ? 'romance' : 'relationship'} private.`
      }
    }
    return [
      {
        id: `drama:${event.id}`,
        category: 'social',
        sequence: (phaseOrder[event.phase] ?? 5) * 1000000 + 900000 + index,
        importance: 112,
        text,
        targetId,
        eventType: 'PUBLIC_EXPOSURE',
      },
    ]
  })
}

function heardRumourMoments(
  input: ChronicleInput,
  name: (id: string | undefined) => string
): StoryMoment[] {
  const network = input.dramaNetwork
  if (!network) return []
  const copy = {
    secret_alliance: (subject: string) => `You heard that ${subject} may have a hidden alliance.`,
    secret_romance: (subject: string) =>
      `You heard that ${subject} may be keeping a romance quiet.`,
    targeting: (subject: string) => `You heard that ${subject} might be the next target.`,
    fake_deal: (subject: string) =>
      `You heard that ${subject} may have offered different deals around the Hub.`,
    personal_comment: (subject: string) =>
      `You heard that a private comment involving ${subject} has started to circulate.`,
  } satisfies Record<(typeof network.rumours)[number]['kind'], (subject: string) => string>
  return network.rumours.flatMap((rumour, index) => {
    if (
      rumour.status !== 'circulating' ||
      !rumour.listeners.some(
        (listener) => listener.playerId === input.humanId && listener.heardWeek === input.day
      )
    )
      return []
    return [
      {
        id: `heard-rumour:${rumour.id}`,
        category: 'social',
        sequence: phaseOrder.social_2 * 1000000 + 800000 + index,
        importance: 88,
        text: copy[rumour.kind](name(rumour.subjectId)),
        targetId: rumour.subjectId,
        eventType: 'HEARD_RUMOUR',
      },
    ]
  })
}

function joinNarrativeMoments(moments: readonly StoryMoment[]): string {
  if (!moments.length) return ''
  const stories: string[] = []
  for (let index = 0; index < moments.length; index += 1) {
    const moment = moments[index]
    const next = moments[index + 1]
    const bondTarget = moment.text.match(/^You had a good conversation with ([^.]+)\./)?.[1]
    const isBond = [
      'compliment',
      'group_chat',
      'build_quiet_bond',
      'share_personal_story',
      'reassure',
    ].includes(moment.actionId ?? '')
    if (
      isBond &&
      bondTarget &&
      next?.actionId &&
      ['proposeAlliance', 'ally'].includes(next.actionId) &&
      moment.targetId === next.targetId &&
      moment.outcome === 'success' &&
      next.outcome === 'failure'
    ) {
      const target = bondTarget
      const sharedDetail = moment.text.match(/( It turns out you both have [^.]+\.)$/)?.[1] ?? ''
      const fallback = `${target} turned down your alliance pitch.`
      const allianceText = next.text === fallback ? `${target} turned down the offer.` : next.text
      const rejection =
        allianceText === next.text
          ? `When you asked to work together, ${next.text}`
          : `When you asked to work together, ${allianceText}`
      stories.push(
        `You and ${target} got along in your first conversation.${sharedDetail} ${rejection}`
      )
      index += 1
      continue
    }
    stories.push(moment.text)
  }
  return stories.join(' ')
}

function buildCeremonyParagraph(moments: readonly StoryMoment[], humanId: string): string {
  const nominations = moments.filter(
    (moment) => moment.category === 'nominations' && !moment.replacementNomination
  )
  const replacement = moments.find((moment) => moment.replacementNomination)
  const safetyWin = moments.find(
    (moment) => moment.eventType === 'CEREMONY_POWER_WON' && moment.category === 'safety'
  )
  const safetyUse = moments.find((moment) => moment.eventType === 'CEREMONY_SAFETY_USED')
  const safetyDeclined = moments.find((moment) => moment.eventType === 'CEREMONY_SAFETY_DECLINED')
  const parts = nominations.map((moment) => moment.text)

  if (safetyUse) {
    if (safetyWin && safetyUse.actorId === humanId && safetyUse.targetId === humanId) {
      parts.push('You won Safety and saved yourself.')
    } else {
      parts.push(safetyUse.text)
    }
  } else if (safetyWin) {
    parts.push(safetyWin.text)
  } else if (safetyDeclined) {
    parts.push(safetyDeclined.text)
  }

  if (replacement) {
    parts.push(replacement.text)
  }
  return parts.join(' ')
}

function producerNote(
  moments: readonly StoryMoment[],
  actions: ReadonlyMap<string, SocialActionLogEntry>,
  humanId: string,
  day: number,
  name: (id: string | undefined) => string
): string {
  const nominatedBy = moments.find(
    (moment) =>
      moment.category === 'nominations' &&
      !moment.replacementNomination &&
      moment.actorId &&
      moment.targetId !== undefined
  )
  if (!nominatedBy) return ''
  const retaliation = moments
    .filter((moment) => moment.eventType === 'MANUAL_ACTION')
    .map((moment) => actions.get(moment.id))
    .find(
      (action) =>
        action?.actorId === humanId &&
        action.week === day &&
        ['rally_votes_against', 'vote_rally'].includes(action.actionId) &&
        (action.subjectId ?? action.targetId) === nominatedBy.actorId
    )
  if (!retaliation) return ''
  return retaliation.outcome === 'success'
    ? `After ${name(nominatedBy.actorId)} nominated you, you started lining up votes against them. Payback may already be in motion.`
    : `After ${name(nominatedBy.actorId)} nominated you, you tried to rally votes against them, but the pitch did not land.`
}

function storyParagraphs(
  featured: readonly StoryMoment[],
  humanId: string,
  weather: string | null | undefined,
  seed: string
): string[] {
  const ceremony = featured.filter(
    (moment) =>
      moment.category === 'nominations' ||
      moment.category === 'safety' ||
      (moment.category === 'power' &&
        moment.eventType === 'CEREMONY_POWER_WON' &&
        moment.text.includes('Safety'))
  )
  const closingMoments = featured
    .filter((moment) => moment.category === 'eviction' || moment.eventType === 'PUBLIC_EXPOSURE')
    .sort((a, b) => a.sequence - b.sequence)
  const narrativeMoments = featured
    .filter((moment) => !ceremony.includes(moment) && !closingMoments.includes(moment))
    .sort((a, b) => a.sequence - b.sequence)
  const ceremonyStart = ceremony.length
    ? Math.min(...ceremony.map((moment) => moment.sequence))
    : Infinity
  const opening = ceremony.length
    ? narrativeMoments.filter((moment) => moment.sequence < ceremonyStart)
    : narrativeMoments
  const later = ceremony.length
    ? narrativeMoments.filter((moment) => moment.sequence >= ceremonyStart)
    : []
  const paragraphs = [
    joinNarrativeMoments(opening),
    buildCeremonyParagraph(ceremony, humanId),
    joinNarrativeMoments(later),
  ]
  for (const moment of closingMoments) {
    if (moment.category === 'eviction' && weather && wetWeather.has(weather)) {
      const scene = rainyEvictionScenes[hash(seed + ':rainy-eviction') % rainyEvictionScenes.length]
      const eviction = moment.text.replace(/^([A-Z])/, (firstLetter) => firstLetter.toLowerCase())
      paragraphs.push(`${scene.lead} ${eviction} ${scene.after}`)
    } else {
      paragraphs.push(moment.text)
    }
  }
  return paragraphs.filter(Boolean)
}
/** Pure, bounded, deterministic storytelling. Never invents events or reads undiscovered secrets. */
export function composePulseChronicle(input: ChronicleInput): PulseChronicle {
  const daySeed = input.gameId + ':' + input.season + ':' + input.day
  const seed = input.episode ? daySeed + ':' + input.episode.key : daySeed
  const byId = new Map(input.players.map((player) => [player.id, safeName(player.name)]))
  const name = (id: string | undefined) =>
    id ? (id === input.humanId ? 'you' : (byId.get(id) ?? 'another player')) : 'another player'
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
    .map((event) =>
      chronicleEvent(event, name, input.humanId, seed + ':' + event.id, input.voteResult)
    )
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
      const text = describeAction(action, name, sharedPetKind(input, action.targetId))
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
        actionId: action.actionId,
      }
    })
    .filter((moment): moment is NonNullable<typeof moment> => moment !== null)
  const actionById = new Map(
    input.actionHistory
      .filter((action): action is typeof action & { id: string } => Boolean(action.id))
      .map((action) => [action.id, action])
  )
  const allianceOutcomes = events.filter((event) =>
    ['ALLIANCE_FORMED', 'ALLIANCE_MEMBER_RECRUITED'].includes(event.type)
  )
  const strategyMeetings = events.filter((event) => event.type === 'ALLIANCE_STRATEGY_MEETING')
  const distinctActionMoments = actionMoments.filter((moment) => {
    const action = actionById.get(moment.id)
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
  moments.push(...heardRumourMoments(input, name))
  moments.push(...publicExposureMoments(input, name))
  // Favour big beats while preserving the actual ceremony order in the final story.
  const unique = new Map<string, StoryMoment>()
  for (const moment of moments) {
    const signature =
      moment.eventType === 'ALLIANCE_FORMED' && moment.allianceId
        ? `alliance-formation:${moment.allianceId}`
        : moment.category + ':' + moment.text.trim().replace(/\s+/g, ' ').toLowerCase()
    const current = unique.get(signature)
    if (
      !current ||
      (moment.eventType === 'ALLIANCE_FORMED' && moment.targetId && !current.targetId)
    )
      unique.set(signature, moment)
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
  const personalHighlights = socialPriority.slice(0, socialSlots)
  if (playerAction && !personalHighlights.includes(playerAction) && personalHighlights.length)
    personalHighlights[personalHighlights.length - 1] = playerAction
  const featured = [...ceremonyHighlights, ...personalHighlights].sort(
    (a, b) => a.sequence - b.sequence
  )
  const paragraphs = storyParagraphs(featured, input.humanId, input.weather, seed)
  return {
    season: input.season,
    day: input.day,
    episodeKey: input.episode?.key ?? `day:${input.day}`,
    episodeLabel: input.episode?.label ?? `Day ${input.day}`,
    title: headline(featured, seed + ':headline'),
    paragraphs: paragraphs.length ? paragraphs : ['No major developments reached you today.'],
    note: producerNote(all, actionById, input.humanId, input.day, name),
    sourceEventIds: featured.map((beat) => beat.id),
    complete: input.complete === true,
  }
}

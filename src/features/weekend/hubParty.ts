import type { GameState, WeekendPartyBeat } from '../../types'
import type { SocialState } from '../../social/types'

type WeekendPartySocialState = Pick<SocialState, 'relationships' | 'dramaNetwork' | 'reality'>

function hash32(value: string): number {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function playerName(state: GameState, playerId: string): string {
  return state.players.find((player) => player.id === playerId)?.name ?? 'a Hub player'
}

function activePlayerIds(state: GameState): Set<string> {
  return new Set(
    state.players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id)
  )
}

function renderSecretSpill(
  game: GameState,
  speakerId: string,
  secret: WeekendPartySocialState['reality']['secrets'][string],
  fact: WeekendPartySocialState['reality']['facts'][string]
): string {
  const speaker = playerName(game, speakerId)
  const subjectNames = fact.subjectIds.map((id) => playerName(game, id))
  const objectName =
    fact.objectId && game.players.some((player) => player.id === fact.objectId)
      ? playerName(game, fact.objectId)
      : null
  const normalizedKind = secret.kind.toUpperCase()
  const normalizedProposition = fact.propositionType.toUpperCase()

  if (normalizedProposition === 'SECRET_ALLIANCE' || normalizedKind.includes('ALLIANCE')) {
    const names = subjectNames.slice(0, 3).join(' and ')
    return `${speaker}: “Okay, don't tell anyone I told you this… ${names} are working together. It's more than a vibe.”`
  }

  if (normalizedProposition === 'TARGETING_PLAN' && subjectNames[0] && objectName) {
    return `${speaker}: “Keep this between us… ${subjectNames[0]} has been talking about targeting ${objectName}.”`
  }

  if (normalizedKind.includes('ROMANCE') || normalizedProposition.includes('ROMANTIC')) {
    const names = subjectNames.slice(0, 2).join(' and ')
    return `${speaker}: “I probably shouldn't say this, but there is definitely something private going on between ${names}.”`
  }

  if (subjectNames.length > 0) {
    return `${speaker}: “There is something about ${subjectNames.slice(0, 2).join(' and ')} that isn't public yet. I know enough to take it seriously.”`
  }

  return `${speaker}: “I know something the rest of the Hub doesn't. Tonight is making it very hard to keep quiet.”`
}

function buildPrivateSpill(
  game: GameState,
  social: WeekendPartySocialState
): WeekendPartyBeat | null {
  const activeIds = activePlayerIds(game)
  const human = game.players.find((player) => player.isUser && activeIds.has(player.id))
  if (!human) return null

  const eligible = Object.values(social.reality.secrets)
    .map((secret) => {
      const fact = social.reality.facts[secret.truthFactId]
      const speakerIds = secret.knowerIds.filter((id) => id !== human.id && activeIds.has(id))
      return { secret, fact, speakerIds }
    })
    .filter(
      (entry) =>
        Boolean(entry.fact) &&
        entry.speakerIds.length > 0 &&
        !entry.secret.knowerIds.includes(human.id) &&
        entry.secret.status !== 'EXPOSED' &&
        entry.secret.status !== 'OBSOLETE' &&
        entry.fact.publicVisible !== true
    )
    .sort(
      (left, right) =>
        hash32(`${game.gameId}|party-secret|${left.secret.id}`) -
          hash32(`${game.gameId}|party-secret|${right.secret.id}`) ||
        left.secret.id.localeCompare(right.secret.id)
    )

  const selected = eligible[0]
  if (!selected?.fact) return null

  const speakerId = [...selected.speakerIds].sort(
    (left, right) =>
      hash32(`${game.gameId}|party-speaker|${selected.secret.id}|${left}`) -
        hash32(`${game.gameId}|party-speaker|${selected.secret.id}|${right}`) ||
      left.localeCompare(right)
  )[0]
  if (!speakerId) return null

  return {
    id: `party:${game.season}:10:1:${selected.secret.id}`,
    weekendDay: 1,
    kind: 'secret_spill',
    text: renderSecretSpill(game, speakerId, selected.secret, selected.fact),
    visibility: 'private',
    speakerId,
    subjectIds: [...selected.fact.subjectIds],
    secretId: selected.secret.id,
    factId: selected.fact.id,
  }
}

function buildOpinionSpill(
  game: GameState,
  social: WeekendPartySocialState,
  weekendDay: 1 | 2
): WeekendPartyBeat | null {
  const active = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  const speakers = active.filter((player) => !player.isUser)
  if (speakers.length === 0 || active.length < 2) return null

  const pairs = speakers.flatMap((speaker) =>
    active
      .filter((target) => target.id !== speaker.id)
      .map((target) => {
        const affinity = social.relationships[speaker.id]?.[target.id]?.affinity ?? 0
        return { speaker, target, affinity }
      })
  )
  const previousOpinions =
    game.weekendInterlude?.party?.beats.filter(
      (beat) => beat.kind === 'opinion_spill' && beat.weekendDay !== weekendDay
    ) ?? []
  const freshPairs = pairs.filter(
    ({ speaker, target }) =>
      !previousOpinions.some(
        (beat) => beat.speakerId === speaker.id && beat.subjectIds.includes(target.id)
      )
  )
  const selected = (freshPairs.length > 0 ? freshPairs : pairs).sort(
    (left, right) =>
      Math.abs(right.affinity) - Math.abs(left.affinity) ||
      hash32(`${game.gameId}|party-opinion|${weekendDay}|${left.speaker.id}|${left.target.id}`) -
        hash32(`${game.gameId}|party-opinion|${weekendDay}|${right.speaker.id}|${right.target.id}`)
  )[0]
  if (!selected) return null

  const speakerName = selected.speaker.name
  const targetName = selected.target.name
  const quote =
    weekendDay === 2
      ? selected.affinity >= 45
        ? `${speakerName}: “I'm glad I got to spend more time with ${targetName}. It feels easy with them.”`
        : selected.affinity <= -30
          ? `${speakerName}: “I can enjoy the party and still keep my distance from ${targetName}.”`
          : `${speakerName}: “I'd like a proper conversation with ${targetName} before this weekend ends.”`
      : selected.affinity >= 45
        ? `${speakerName}: “Honestly? ${targetName} is one of the very few people here I genuinely feel good around.”`
        : selected.affinity <= -30
          ? `${speakerName}: “Fine. I've never really trusted ${targetName}. Not once.”`
          : `${speakerName}: “I still don't really know where I stand with ${targetName}. That's the truth.”`

  return {
    id: `party:${game.season}:10:${weekendDay}:opinion:${selected.speaker.id}:${selected.target.id}`,
    weekendDay,
    kind: 'opinion_spill',
    text: quote,
    visibility: weekendDay === 1 ? 'private' : 'house',
    speakerId: selected.speaker.id,
    subjectIds: [selected.target.id],
  }
}

function buildContextualMoment(
  game: GameState,
  social: WeekendPartySocialState
): WeekendPartyBeat | null {
  const activeIds = activePlayerIds(game)
  const arcs = social.dramaNetwork.arcs
    .filter(
      (arc) =>
        arc.status === 'active' && arc.participantIds.every((playerId) => activeIds.has(playerId))
    )
    .sort(
      (left, right) =>
        right.intensity - left.intensity ||
        hash32(`${game.gameId}|party-arc|${left.id}`) -
          hash32(`${game.gameId}|party-arc|${right.id}`)
    )

  const arc = arcs[0]
  if (arc) {
    const [firstId, secondId] = arc.participantIds
    const first = playerName(game, firstId)
    const second = playerName(game, secondId)
    const base = {
      id: `party:${game.season}:10:2:arc:${arc.id}`,
      weekendDay: 2 as const,
      visibility: 'house' as const,
      subjectIds: [firstId, secondId],
    }

    if (arc.type === 'romance') {
      return {
        ...base,
        kind: 'romance_moment',
        text: `${first} and ${second} drift away from the group for a long private conversation. Nobody misses how naturally it happens.`,
      }
    }
    if (arc.type === 'bromance') {
      return {
        ...base,
        kind: 'bromance_moment',
        text: `${first} and ${second} end up laughing together long after everyone else has moved on. Their bond is hard to miss tonight.`,
      }
    }
    if (arc.type === 'rivalry') {
      return {
        ...base,
        kind: 'rivalry_moment',
        text: `The tension between ${first} and ${second} finally surfaces near the kitchen. The room gets noticeably quieter.`,
      }
    }
    return {
      ...base,
      kind: 'betrayal_moment',
      text: `An old issue between ${first} and ${second} comes back up in front of the group. Neither of them laughs it off.`,
    }
  }

  const alliances = Object.values(social.reality.alliances)
    .filter(
      (alliance) =>
        alliance.status !== 'DISSOLVED' &&
        alliance.status !== 'FRACTURED' &&
        alliance.memberIds.filter((id) => activeIds.has(id)).length >= 2
    )
    .sort(
      (left, right) =>
        right.cohesion - left.cohesion ||
        hash32(`${game.gameId}|party-alliance|${left.id}`) -
          hash32(`${game.gameId}|party-alliance|${right.id}`)
    )
  const alliance = alliances[0]
  if (alliance) {
    const members = alliance.memberIds.filter((id) => activeIds.has(id)).slice(0, 3)
    return {
      id: `party:${game.season}:10:2:alliance:${alliance.id}`,
      weekendDay: 2,
      kind: 'alliance_huddle',
      text: `${members.map((id) => playerName(game, id)).join(', ')} pull into a quiet corner while the rest of the party carries on. It is subtle, but not invisible.`,
      visibility: 'house',
      subjectIds: members,
    }
  }

  return buildOpinionSpill(game, social, 2)
}

export function resolveWeekendPartyBeat(
  game: GameState,
  social: WeekendPartySocialState,
  weekendDay: 1 | 2
): WeekendPartyBeat | null {
  if (weekendDay === 1) {
    return buildPrivateSpill(game, social) ?? buildOpinionSpill(game, social, 1)
  }
  return buildContextualMoment(game, social)
}

import type { Player } from '../types'
import type { RealityDomainState } from './reality/types'
import type { RelationshipsMap } from './types'

export interface TieBreakerRecommendation {
  nomineeId: string
  nomineeName: string
  reason: string
  score: number
}

export interface TieBreakerAllianceAdvice {
  advisorId: string
  advisorName: string
  nomineeId: string
  nomineeName: string
  reason: string
}

export interface TieBreakerCampaignPitch {
  offer: 'safety' | 'loyalty' | 'alliance' | 'intel' | 'romance' | 'bromance'
  text: string
}

interface TieBreakerStrategyInput {
  decisionMakerId: string
  tiedNominees: readonly Pick<Player, 'id' | 'name'>[]
  players: readonly Pick<Player, 'id' | 'name' | 'status'>[]
  relationships: RelationshipsMap
  reality?: RealityDomainState
  week: number
}

function affinity(relationships: RelationshipsMap, leftId: string, rightId: string): number {
  return (
    (relationships[leftId]?.[rightId]?.affinity ?? 0) +
    (relationships[rightId]?.[leftId]?.affinity ?? 0)
  ) / 2
}

function tags(relationships: RelationshipsMap, leftId: string, rightId: string): Set<string> {
  return new Set([
    ...(relationships[leftId]?.[rightId]?.tags ?? []),
    ...(relationships[rightId]?.[leftId]?.tags ?? []),
  ])
}

function sharesAlliance(
  input: TieBreakerStrategyInput,
  leftId: string,
  rightId: string
): boolean {
  return (
    Object.values(input.reality?.alliances ?? {}).some(
      (alliance) =>
        ['ACTIVE', 'PROBATIONARY'].includes(alliance.status) &&
        alliance.memberIds.includes(leftId) &&
        alliance.memberIds.includes(rightId)
    ) || tags(input.relationships, leftId, rightId).has('alliance')
  )
}

function stableHash(value: string): number {
  let result = 2166136261
  for (const character of value) {
    result = Math.imul(result ^ character.charCodeAt(0), 16777619)
  }
  return result >>> 0
}

function assessNominee(
  input: TieBreakerStrategyInput,
  nominee: Pick<Player, 'id' | 'name'>,
  decisionMakerId = input.decisionMakerId
): TieBreakerRecommendation {
  const relationshipTags = tags(input.relationships, decisionMakerId, nominee.id)
  const sharedAlliance = sharesAlliance(input, decisionMakerId, nominee.id)
  const affinityScore = affinity(input.relationships, decisionMakerId, nominee.id)
  const hasOutsideAlliance = Object.values(input.reality?.alliances ?? {}).some(
    (alliance) =>
      ['ACTIVE', 'PROBATIONARY'].includes(alliance.status) &&
      alliance.memberIds.includes(nominee.id) &&
      !alliance.memberIds.includes(decisionMakerId)
  )
  let score = -affinityScore
  if (relationshipTags.has('target')) score += 32
  if (relationshipTags.has('betrayal') || relationshipTags.has('broken_promise')) score += 36
  if (relationshipTags.has('rivalry') || relationshipTags.has('suspicious')) score += 18
  if (hasOutsideAlliance) score += 14
  if (sharedAlliance) score -= 42
  if (
    relationshipTags.has('protection') ||
    relationshipTags.has('safety_promise') ||
    relationshipTags.has('shield')
  ) {
    score -= 24
  }
  if (relationshipTags.has('romance')) score -= 52
  if (relationshipTags.has('bromance')) score -= 40

  const reason =
    relationshipTags.has('betrayal') || relationshipTags.has('broken_promise')
      ? 'Their history of broken trust makes them the riskier person to keep.'
      : relationshipTags.has('target') ||
          relationshipTags.has('rivalry') ||
          relationshipTags.has('suspicious')
        ? 'They already pose a strategic risk to your game.'
        : hasOutsideAlliance
          ? 'They have cover in a competing alliance, which could strengthen that side.'
          : affinityScore <= -18
            ? 'The relationship is already working against you, with little loyalty to preserve.'
            : sharedAlliance
              ? 'They are tied to your alliance, so this would be a difficult strategic cut.'
              : 'They are the less-protected option, leaving more room for your game after tonight.'
  return { nomineeId: nominee.id, nomineeName: nominee.name, reason, score }
}

export function getTieBreakerRecommendation(
  input: TieBreakerStrategyInput
): TieBreakerRecommendation | null {
  return (
    [...input.tiedNominees]
      .map((nominee) => assessNominee(input, nominee))
      .sort(
        (left, right) =>
          right.score - left.score ||
          stableHash(`${input.week}:${input.decisionMakerId}:${right.nomineeId}`) -
            stableHash(`${input.week}:${input.decisionMakerId}:${left.nomineeId}`)
      )[0] ?? null
  )
}

export function getTieBreakerAllianceAdvice(
  input: TieBreakerStrategyInput
): TieBreakerAllianceAdvice[] {
  const activeIds = new Set(
    input.players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id)
  )
  return input.players
    .filter(
      (player) =>
        player.id !== input.decisionMakerId &&
        activeIds.has(player.id) &&
        !input.tiedNominees.some((nominee) => nominee.id === player.id) &&
        sharesAlliance(input, input.decisionMakerId, player.id)
    )
    .sort(
      (left, right) =>
        affinity(input.relationships, input.decisionMakerId, right.id) -
          affinity(input.relationships, input.decisionMakerId, left.id) ||
        left.name.localeCompare(right.name)
    )
    .slice(0, 3)
    .flatMap((advisor) => {
      const advice = getTieBreakerRecommendation({ ...input, decisionMakerId: advisor.id })
      return advice
        ? [
            {
              advisorId: advisor.id,
              advisorName: advisor.name,
              nomineeId: advice.nomineeId,
              nomineeName: advice.nomineeName,
              reason: advice.reason,
            },
          ]
        : []
    })
}

export function buildTieBreakerCampaignPitch({
  decisionMakerId,
  nominee,
  relationships,
  reality,
  week,
}: {
  decisionMakerId: string
  nominee: Pick<Player, 'id' | 'name'>
  relationships: RelationshipsMap
  reality?: RealityDomainState
  week: number
}): TieBreakerCampaignPitch {
  const relationshipTags = tags(relationships, decisionMakerId, nominee.id)
  const sharedAlliance = Object.values(reality?.alliances ?? {}).some(
    (alliance) =>
      ['ACTIVE', 'PROBATIONARY'].includes(alliance.status) &&
      alliance.memberIds.includes(decisionMakerId) &&
      alliance.memberIds.includes(nominee.id)
  ) || relationshipTags.has('alliance')

  if (relationshipTags.has('romance')) {
    return {
      offer: 'romance',
      text: `Before you cast the deciding vote: what we have is real to me. Keep me tonight and I will protect our connection instead of letting this game end it.`,
    }
  }
  if (relationshipTags.has('bromance')) {
    return {
      offer: 'bromance',
      text: `Before you cast the deciding vote: do not let this house split us up. Keep me, and you have my loyalty and my shield from here on out.`,
    }
  }
  if (sharedAlliance) {
    return {
      offer: 'alliance',
      text: `Before you cast the deciding vote: our alliance needs me. Keep me tonight and I will vote with you, protect your name, and keep our side solid.`,
    }
  }

  const outsideAlliance = Object.values(reality?.alliances ?? {}).some(
    (alliance) =>
      ['ACTIVE', 'PROBATIONARY'].includes(alliance.status) &&
      alliance.memberIds.includes(nominee.id) &&
      !alliance.memberIds.includes(decisionMakerId)
  )
  const pitches: TieBreakerCampaignPitch[] = [
    {
      offer: 'safety',
      text: `Before you cast the deciding vote: keep me, and I will not put your name forward the next time I have power. You will have safety with me.`,
    },
    {
      offer: 'loyalty',
      text: `Before you cast the deciding vote: keep me tonight and I will be a number for you. My vote, my loyalty, and my word are yours when the house turns again.`,
    },
    {
      offer: 'alliance',
      text: `Before you cast the deciding vote: save me and we can make this official. I will work with you, not against you, from the moment this vote is over.`,
    },
    {
      offer: 'intel',
      text: outsideAlliance
        ? `Before you cast the deciding vote: keep me and I will tell you where the other alliance stands and who has been positioning against you.`
        : `Before you cast the deciding vote: keep me and I will tell you the names being whispered around this house. You will not be blindsided by the next move.`,
    },
  ]
  return pitches[stableHash(`${week}:${decisionMakerId}:${nominee.id}:tie-break-campaign`) % pitches.length]
}

import type { Player, StrategicAllianceSnapshot } from '../types'
import type { StrategicThreatSnapshot } from './strategicThreat'
import type { RelationshipsMap } from './types'

export interface FinalThreeDecisionRead {
  competitionThreat: number
  estimatedTribunalAppeal: number
  tribunalReadConfidence: number
  affinity: number
  inwardAffinity: number
  tags: string[]
  expectedFinalTwo: boolean
  pactStrength: number
  resentment: number
  comparison: string
  reason: string
}

export interface FinalThreeDecisionInput {
  holderId: string | null
  holder?: Player
  nominees: readonly Player[]
  relationships?: RelationshipsMap
  alliances?: StrategicAllianceSnapshot[]
  threatReads?: StrategicThreatSnapshot
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function relationshipRecap(affinity: number, tags: string[]): string {
  const beats: string[] = []

  if (tags.includes('romance')) {
    beats.push('Romance — this became more than a game relationship')
  } else if (tags.includes('bromance')) {
    beats.push('Deep bond — you became one of each other’s closest people')
  }

  if (tags.includes('betrayal')) {
    beats.push('Betrayal — trust between you was broken')
  } else if (tags.includes('alliance')) {
    beats.push('Alliance — you worked together when it mattered')
  } else if (tags.includes('protection')) {
    beats.push('Support — they protected or backed you in the game')
  }

  if (tags.includes('rivalry') || tags.includes('target')) {
    beats.push('Rivalry — you spent part of the season on opposite sides')
  } else if (
    tags.includes('strained') ||
    tags.includes('suspicious') ||
    tags.includes('unreliable')
  ) {
    beats.push('Strained — the trust between you never fully settled')
  }

  if (beats.length > 0) return beats.slice(0, 2).join(' · ')
  if (affinity >= 55) return 'Close bond — they consistently felt like someone in your corner'
  if (affinity >= 25) return 'Warm history — you generally trusted and supported each other'
  if (affinity <= -45) return 'Bad blood — the relationship ended with very little trust'
  if (affinity <= -20) return 'Tense history — there has been real friction between you'
  return 'No defining pact or feud — this is mostly a game decision between you'
}

function getPactStrength(
  holderId: string | null,
  nomineeId: string,
  alliances: StrategicAllianceSnapshot[] | undefined
): number {
  if (!holderId) return 0
  return Math.max(
    0,
    ...(alliances ?? [])
      .filter(
        (alliance) =>
          alliance.status === 'ACTIVE' &&
          alliance.memberIds.includes(holderId) &&
          alliance.memberIds.includes(nomineeId)
      )
      .map((alliance) =>
        Math.min(
          alliance.memberCommitment[holderId] ?? 0,
          alliance.memberCommitment[nomineeId] ?? 0
        )
      )
  )
}

export function readFinalThreeDecision(
  input: Omit<FinalThreeDecisionInput, 'nominees'>,
  nominee: Player
): FinalThreeDecisionRead {
  const { holderId, relationships, alliances, threatReads } = input
  const lohWins = nominee.stats?.lohWins ?? 0
  const posWins = nominee.stats?.posWins ?? 0
  const timesNominated = nominee.stats?.timesNominated ?? 0
  const outward = holderId ? relationships?.[holderId]?.[nominee.id] : undefined
  const inward = holderId ? relationships?.[nominee.id]?.[holderId] : undefined
  const affinity = outward?.affinity ?? inward?.affinity ?? 0
  const inwardAffinity = inward?.affinity ?? outward?.affinity ?? 0
  const tags = [...new Set([...(outward?.tags ?? []), ...(inward?.tags ?? [])])]
  const pactStrength = getPactStrength(holderId, nominee.id, alliances)
  const expectedFinalTwo =
    inwardAffinity >= 38 ||
    pactStrength >= 0.65 ||
    tags.some((tag) =>
      ['alliance', 'protection', 'romance', 'bromance', 'safety_promise'].includes(tag)
    )

  const threatRead = holderId ? threatReads?.[holderId]?.[nominee.id] : undefined
  const publicSocialSignal = threatRead
    ? threatRead.persuasion * 0.35 + threatRead.networkReach * 0.3 + threatRead.publicRespect * 0.35
    : 0
  // Use the holder's observer-specific read where available. Older saves and
  // seasons without Reality evidence get only a modest, low-confidence proxy.
  const estimatedTribunalAppeal = clamp(
    threatRead
      ? threatRead.juryAppeal * 0.72 + publicSocialSignal * 0.28
      : 0.28 + Math.min(lohWins + posWins, 4) * 0.035 + Math.min(timesNominated, 3) * 0.015,
    0,
    1
  )
  const tribunalReadConfidence = threatRead ? 0.7 : 0.25
  const competitionThreat = lohWins * 3 + posWins * 2 + Math.min(timesNominated, 3)
  const resentment =
    (tags.includes('betrayal') ? 1 : 0) +
    (tags.includes('target') ? 0.6 : 0) +
    (tags.includes('rivalry') ? 0.8 : 0)
  const tribunalSummary = threatRead
    ? estimatedTribunalAppeal >= 0.65
      ? 'Tribunal read — visible signs point to strong support for their game'
      : estimatedTribunalAppeal >= 0.4
        ? 'Tribunal read — their support looks mixed'
        : 'Tribunal read — you have seen little evidence of strong support'
    : 'Tribunal read — hard to judge, so this estimate is uncertain'
  const comparison = `${relationshipRecap(affinity, tags)} · ${tribunalSummary}`
  const reason =
    resentment > 0
      ? 'our game was never settled'
      : estimatedTribunalAppeal >= 0.65
        ? 'the Tribunal may already see you as the stronger finalist'
        : competitionThreat >= 5
          ? 'you have built too strong a competition case to sit beside'
          : timesNominated >= 2
            ? 'you have survived every time the Hub put you in danger'
            : 'this is the move I can live with'

  return {
    competitionThreat,
    estimatedTribunalAppeal,
    tribunalReadConfidence,
    affinity,
    inwardAffinity,
    tags,
    expectedFinalTwo,
    pactStrength,
    resentment,
    comparison,
    reason,
  }
}

function decisionStyle(holder: Player | undefined) {
  const identity = holder?.aiGameIdentity
  const archetype = identity?.archetype
  const calculated = [
    'strategic_operator',
    'puppet_master',
    'media_strategist',
    'double_agent',
    'opportunist',
    'aggressive_competitor',
  ].includes(archetype ?? '')
  const juryFocused =
    archetype === 'jury_artisan' ||
    archetype === 'audience_darling' ||
    archetype === 'public_pleaser'
  const loyal = ['loyal_anchor', 'romantic_loyalist', 'social_butterfly'].includes(archetype ?? '')
  const impulsive =
    identity?.temperament === 'impulsive' ||
    identity?.temperament === 'emotional' ||
    archetype === 'chaos_agent' ||
    archetype === 'antihero'

  return {
    strategicWeight: calculated ? 1.5 : juryFocused ? 1.25 : loyal ? 0.72 : 0.95,
    loyaltyWeight: loyal ? 1.45 : calculated ? 0.55 : 1,
    emotionalWeight: impulsive ? 1.5 : (identity?.emotionalVolatility ?? 0.45) * 0.8,
  }
}

function scoreEviction(
  read: FinalThreeDecisionRead,
  style: ReturnType<typeof decisionStyle>
): number {
  const positiveBond = Math.max(0, read.affinity) / 100
  const negativeBond = Math.max(0, -read.affinity) / 100
  const promiseCost = Math.max(read.pactStrength, read.expectedFinalTwo ? 0.35 : 0)
  return (
    read.estimatedTribunalAppeal * 30 * style.strategicWeight +
    read.competitionThreat * 2.1 * style.strategicWeight +
    Math.max(0, read.estimatedTribunalAppeal - 0.35) * 16 * style.strategicWeight -
    positiveBond * 26 * style.loyaltyWeight -
    promiseCost * 24 * style.loyaltyWeight +
    negativeBond * 8 * style.emotionalWeight +
    read.resentment * 11 * style.emotionalWeight
  )
}

export function chooseFinalThreeEvictee(input: FinalThreeDecisionInput): {
  player: Player
  reason: string
} | null {
  if (input.nominees.length === 0) return null
  const style = decisionStyle(input.holder)
  const ranked = input.nominees
    .map((player) => {
      const read = readFinalThreeDecision(input, player)
      return { player, read, score: scoreEviction(read, style) }
    })
    .sort(
      (left, right) => right.score - left.score || left.player.id.localeCompare(right.player.id)
    )
  const choice = ranked[0]
  const kept = ranked[1]

  if (!choice) return null
  let reason = choice.read.reason
  if (
    kept &&
    kept.read.pactStrength >= 0.65 &&
    kept.read.pactStrength > choice.read.pactStrength &&
    style.loyaltyWeight >= 1
  ) {
    reason = 'I promised someone else I would take them to the end'
  } else if (choice.read.resentment > 0 && style.emotionalWeight >= 1) {
    reason = 'I cannot ignore what happened between us this season'
  } else if (choice.read.estimatedTribunalAppeal >= 0.65) {
    reason = 'the Tribunal may already see you as the stronger finalist'
  }

  return { player: choice.player, reason }
}

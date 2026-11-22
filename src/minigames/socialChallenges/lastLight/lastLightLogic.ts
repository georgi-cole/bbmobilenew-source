import { challengeRng, pickWeighted, shuffle } from '../shared'

export const STARTING_FLAMES = 3
export const BALLOT_LIMIT = 8

type Flames = Record<string, number>
type Votes = Record<string, string>

export interface LastLightBallot {
  round: number
  votes: Votes
  flames: Flames
  unprotected: string[]
  eliminated: string[]
  savedEveryone: boolean
  preventedWipe: boolean
}

type BallotResult =
  | { kind: 'next-ballot' }
  | { kind: 'winner'; winnerId: string }
  | { kind: 'dice'; finalists: string[] }

export function initialFlames(ids: readonly string[]): Flames {
  return Object.fromEntries(ids.map((id) => [id, STARTING_FLAMES]))
}

export function getActivePlayers(flames: Flames): string[] {
  return Object.keys(flames).filter((id) => flames[id] > 0)
}

export function getDonationTargets(flames: Flames, donor: string): string[] {
  if (!(flames[donor] >= 2)) return []
  return Object.keys(flames).filter((id) => id !== donor && flames[id] === 1)
}

export function resolveLastLightDonations({
  flames,
  round,
  seed,
  preference,
  human,
}: {
  flames: Flames
  round: number
  seed?: number
  preference: (from: string, to: string) => number
  human?: { id: string; target?: string }
}): { flames: Flames; accepted: Votes } {
  const selections: Votes = {}
  for (const donor of getActivePlayers(flames).sort()) {
    const eligible = getDonationTargets(flames, donor)
    if (!eligible.length) continue
    const rng = challengeRng(seed, 'last-light-offer', round, donor)
    const affinity = (target: string) => Math.max(0, Math.min(1, preference(donor, target)))
    const target =
      donor === human?.id
        ? human.target
        : pickWeighted(
            [undefined, ...eligible],
            (target) =>
              target === undefined ? (flames[donor] === 2 ? 6 : 3) : 0.01 + affinity(target) * 0.85,
            rng
          )
    if (target) selections[donor] = target
  }
  return settleLastLightDonations(flames, selections, round, seed)
}

export function settleLastLightDonations(
  flames: Flames,
  selections: Votes,
  round: number,
  seed?: number
): { flames: Flames; accepted: Votes } {
  const offers = new Map<string, string[]>()
  for (const donor of Object.keys(selections).sort()) {
    const target = selections[donor]
    if (!getDonationTargets(flames, donor).includes(target)) continue
    const competing = offers.get(target) ?? []
    competing.push(donor)
    offers.set(target, competing)
  }
  if (!offers.size) return { flames, accepted: {} }
  const updated = { ...flames }
  const accepted: Votes = {}
  for (const [recipient, donors] of offers) {
    const chosen = randomTarget(donors, challengeRng(seed, 'last-light-gift', round, recipient))
    if (!chosen) continue
    updated[chosen] -= 1
    updated[recipient] += 1
    accepted[chosen] = recipient
  }
  return { flames: updated, accepted }
}

export function getProtectionTargets(
  active: readonly string[],
  actor: string,
  previousTarget?: string
): string[] {
  return active.filter((id) => id !== actor && id !== previousTarget)
}

function randomTarget(ids: readonly string[], rng: () => number): string | undefined {
  return ids[Math.floor(rng() * ids.length)]
}

export function chooseAiProtection({
  actor,
  active,
  flames,
  previousVotes,
  round,
  seed,
  preference,
}: {
  actor: string
  active: readonly string[]
  flames: Flames
  previousVotes: Votes
  round: number
  seed?: number
  preference: (from: string, to: string) => number
}): string | undefined {
  const targets = getProtectionTargets(active, actor, previousVotes[actor])
  const rng = challengeRng(seed, 'last-light-ballot', round, actor)
  if (rng() < 0.18) return randomTarget(targets, rng)

  const disposition = challengeRng(seed, 'last-light-disposition', actor)()
  const highestFlames = Math.max(...active.map((id) => flames[id]))
  return pickWeighted(
    targets,
    (id) => {
      const reciprocal = previousVotes[id] === actor ? 0.3 + disposition * 0.38 : 0
      const competitiveRisk =
        highestFlames > flames[actor] && flames[id] === highestFlames ? (1 - disposition) * 0.8 : 0
      const protectEndangered = flames[id] === 1 ? 0.25 + (1 - disposition) * 0.2 : 0
      return Math.exp(
        preference(actor, id) * 0.95 + reciprocal + protectEndangered - competitiveRisk
      )
    },
    rng
  )
}

export function collectLastLightSelections({
  flames,
  previousVotes,
  round,
  seed,
  preference,
  human,
}: {
  flames: Flames
  previousVotes: Votes
  round: number
  seed?: number
  preference: (from: string, to: string) => number
  human?: { id: string; target?: string }
}): Votes {
  const active = getActivePlayers(flames)
  const selections: Votes = {}
  for (const actor of active) {
    const choice =
      actor === human?.id
        ? human.target
        : chooseAiProtection({ actor, active, flames, previousVotes, round, seed, preference })
    if (choice) selections[actor] = choice
  }
  return selections
}

export function resolveLastLightBallot({
  flames,
  selections,
  previousVotes = {},
  round,
  seed,
}: {
  flames: Flames
  selections: Partial<Votes>
  previousVotes?: Readonly<Votes>
  round: number
  seed?: number
}): LastLightBallot {
  const active = getActivePlayers(flames)
  const votes: Votes = {}
  for (const voter of active) {
    const requested = selections[voter]
    const targets = getProtectionTargets(active, voter, previousVotes[voter])
    const target =
      requested && targets.includes(requested)
        ? requested
        : randomTarget(targets, challengeRng(seed, 'last-light-timeout', round, voter))
    if (target) votes[voter] = target
  }

  const protectedPlayers = new Set(Object.values(votes))
  const unprotected = active.filter((id) => !protectedPlayers.has(id))
  const nextFlames = { ...flames }
  for (const id of unprotected) nextFlames[id] -= 1
  const eliminated = active.filter((id) => nextFlames[id] === 0)
  const preventedWipe = active.length > 0 && eliminated.length === active.length

  return {
    round,
    votes,
    flames: preventedWipe ? flames : nextFlames,
    unprotected,
    eliminated: preventedWipe ? [] : eliminated,
    savedEveryone: unprotected.length === 0,
    preventedWipe,
  }
}

export function evaluateLastLightBallot(ballot: LastLightBallot): BallotResult {
  const active = getActivePlayers(ballot.flames)
  if (active.length === 1) return { kind: 'winner', winnerId: active[0] }

  const highest = Math.max(...active.map((id) => ballot.flames[id]))
  const leaders = active.filter((id) => ballot.flames[id] === highest)
  if ((active.length <= 3 || ballot.round >= BALLOT_LIMIT) && leaders.length > 1) {
    return { kind: 'dice', finalists: leaders }
  }
  if ((active.length === 2 || ballot.round >= BALLOT_LIMIT) && leaders.length === 1) {
    return { kind: 'winner', winnerId: leaders[0] }
  }
  return { kind: 'next-ballot' }
}

export function createDicePicks({
  finalists,
  human,
  face,
  seed,
  round,
}: {
  finalists: readonly string[]
  human?: string
  face?: number
  seed?: number
  round: number
}): Record<string, number> {
  const sides = getLastLightDieSides(finalists.length)
  const choices = shuffle(
    Array.from({ length: sides }, (_, index) => index + 1),
    challengeRng(seed, 'last-light-dice-picks', round)
  )
  if (
    human &&
    finalists.includes(human) &&
    face !== undefined &&
    Number.isInteger(face) &&
    face >= 1 &&
    face <= sides
  ) {
    const unclaimed = choices.filter((number) => number !== face)
    return Object.fromEntries(finalists.map((id) => [id, id === human ? face : unclaimed.shift()!]))
  }
  return Object.fromEntries(finalists.map((id, index) => [id, choices[index]]))
}

export function getLastLightDieSides(finalistCount: number): 6 | 8 {
  return finalistCount > 6 ? 8 : 6
}

export function rollLastLightDie(
  picks: Readonly<Record<string, number>>,
  rollIndex: number,
  round: number,
  seed?: number
): { face: number; winnerId?: string } {
  const sides = getLastLightDieSides(Object.keys(picks).length)
  const rng = challengeRng(seed, 'last-light-shared-die', round, rollIndex)
  const face = Math.floor(rng() * sides) + 1
  return { face, winnerId: Object.keys(picks).find((id) => picks[id] === face) }
}

export function rankLastLight(
  winnerId: string,
  flames: Flames,
  eliminations: readonly string[][]
): string[][] {
  const surviving = getActivePlayers(flames).filter((id) => id !== winnerId)
  const flameCounts = [...new Set(surviving.map((id) => flames[id]))].sort(
    (left, right) => right - left
  )
  return [
    [winnerId],
    ...flameCounts.map((count) => surviving.filter((id) => flames[id] === count)),
    ...eliminations.slice().reverse(),
  ]
}

export function runLastLightSimulation({
  participants,
  seed,
  preference = () => 0,
}: {
  participants: readonly string[]
  seed?: number
  preference?: (from: string, to: string) => number
}): { rankedGroups: string[][]; rawResults: Record<string, number> } {
  let flames = initialFlames(participants)
  const eliminations: string[][] = []
  let previousVotes: Votes = {}
  if (participants.length < 2) {
    return { rankedGroups: participants.map((id) => [id]), rawResults: flames }
  }

  for (let round = 1; ; round += 1) {
    flames = resolveLastLightDonations({ flames, round, seed, preference }).flames
    const selections = collectLastLightSelections({
      flames,
      previousVotes,
      round,
      seed,
      preference,
    })
    const ballot = resolveLastLightBallot({ flames, selections, previousVotes, round, seed })
    flames = ballot.flames
    previousVotes = ballot.votes
    if (ballot.eliminated.length) eliminations.push(ballot.eliminated)

    const result = evaluateLastLightBallot(ballot)
    if (result.kind === 'next-ballot') continue

    let winnerId: string | undefined
    if (result.kind === 'winner') {
      winnerId = result.winnerId
    } else {
      const picks = createDicePicks({ finalists: result.finalists, seed, round })
      for (let rollIndex = 0; winnerId === undefined; rollIndex += 1) {
        winnerId = rollLastLightDie(picks, rollIndex, round, seed).winnerId
      }
    }
    return { rankedGroups: rankLastLight(winnerId, flames, eliminations), rawResults: flames }
  }
}

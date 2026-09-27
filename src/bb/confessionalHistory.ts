import type { GameHistoryEvent, TvEvent } from '../types'

type HistoricalRecord = GameHistoryEvent & { data: Record<string, unknown> }

function recordNumber(text: string): number | null {
  const match = text.match(/\b(?:day|week|round)\s*(\d+)\b/i)
  return match ? Number(match[1]) : null
}

function asNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )
  )
}

function namesFor(
  ids: unknown,
  storedNames: unknown,
  currentNames: Record<string, string>
): string[] {
  if (!Array.isArray(ids)) return []
  const names =
    storedNames && typeof storedNames === 'object' ? (storedNames as Record<string, unknown>) : {}
  return ids
    .filter((id): id is string => typeof id === 'string')
    .map((id) => (typeof names[id] === 'string' ? (names[id] as string) : (currentNames[id] ?? id)))
}

function listNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? 'no one'
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Returns only facts matching this question. This is deliberately called per turn,
 * so the complete season log never becomes routine model context.
 */
export function retrieveHistoricalFacts(input: {
  question: string
  playerId: string
  playerName: string
  history?: GameHistoryEvent[]
  tvFeed?: TvEvent[]
  currentNames?: Record<string, string>
}): string[] {
  const question = input.question.toLowerCase()
  const requestedWeek = recordNumber(question)
  const currentNames = input.currentNames ?? {}
  const history = (input.history ?? []) as HistoricalRecord[]
  const atRequestedWeek = (record: HistoricalRecord) =>
    requestedWeek == null || record.week === requestedWeek
  const isPublicVote = /public vote|audience vote|public ballot/.test(question)
  const isFavoriteVote = /favorite player|favourite player|fan vote/.test(question)
  const isNomination = /nominat|nominee|nomination ballot/.test(question)
  const isHouseVote = /house vote|elimination vote|who received.*votes|vote count/.test(question)
  const facts: string[] = []

  if (isFavoriteVote) {
    const result = [...history]
      .reverse()
      .find((record) => atRequestedWeek(record) && record.type === 'favoritePlayer:winner')
    if (result) {
      const votes = asNumberMap(result.data.votes)
      const value = votes[input.playerId]
      if (value !== undefined) {
        facts.push(
          `Day ${result.week} Public’s Favorite vote: ${input.playerName} received ${value}% of the vote.`
        )
      } else {
        facts.push(
          `Day ${result.week} Public’s Favorite result is recorded, but there is no vote share recorded for ${input.playerName}.`
        )
      }
    }
  } else if (isPublicVote) {
    const result = [...history]
      .reverse()
      .find(
        (record) =>
          atRequestedWeek(record) &&
          (record.type === 'voxAudienceVoteResult' || record.type === 'seasonExit') &&
          (record.type === 'voxAudienceVoteResult' || record.data.voxPopuli === true) &&
          Object.keys(asNumberMap(record.data.publicVotePercentages ?? record.data.percentages))
            .length > 0
      )
    if (result) {
      const percentages = asNumberMap(result.data.publicVotePercentages ?? result.data.percentages)
      const value = percentages[input.playerId]
      if (value !== undefined) {
        facts.push(
          `Day ${result.week} public audience vote: ${input.playerName} received ${value.toFixed(1)}%.`
        )
      } else {
        const names = namesFor(
          result.data.rankedIds ?? result.data.nomineeIds,
          result.data.playerNamesById,
          currentNames
        )
        facts.push(
          `Day ${result.week} public audience vote: recorded results exist, but there is no percentage recorded for ${input.playerName}${names.length ? `; ballot participants were ${listNames(names)}` : ''}.`
        )
      }
    }
  } else if (isNomination) {
    const result = [...history]
      .reverse()
      .find((record) => atRequestedWeek(record) && record.type === 'voxNominationResult')
    if (result) {
      const counts = asNumberMap(result.data.voteCounts)
      const nominees = namesFor(result.data.nomineeIds, result.data.playerNamesById, currentNames)
      const tally = Object.entries(counts).map(
        ([id, count]) =>
          `${namesFor([id], result.data.playerNamesById, currentNames)[0]} received ${count} nomination vote${count === 1 ? '' : 's'}`
      )
      facts.push(
        `Day ${result.week} Vox nominations: ${listNames(nominees)} were nominated${tally.length ? `; ${tally.join(', ')}` : ''}.`
      )
    }
  } else if (isHouseVote) {
    const result = [...history]
      .reverse()
      .find(
        (record) =>
          atRequestedWeek(record) &&
          (record.type === 'houseVoteResult' || record.type === 'seasonExit')
      )
    if (result) {
      const counts = asNumberMap(result.data.voteCounts)
      const tally = Object.entries(counts).map(
        ([id, count]) =>
          `${namesFor([id], result.data.playerNamesById, currentNames)[0]} received ${count} vote${count === 1 ? '' : 's'}`
      )
      const nominees = namesFor(result.data.nomineeIds, result.data.playerNamesById, currentNames)
      if (tally.length)
        facts.push(
          `Day ${result.week} ${result.data.mode === 'cupid' ? 'Cupid' : 'Classic'} elimination vote: ${tally.join(', ')}${nominees.length ? `. Nominees: ${listNames(nominees)}` : ''}.`
        )
    }
  }

  if (
    facts.length === 0 &&
    requestedWeek != null &&
    !isPublicVote &&
    !isNomination &&
    !isHouseVote &&
    !isFavoriteVote
  ) {
    const records = history.filter((record) => atRequestedWeek(record))
    for (const record of records) {
      if (record.type === 'voxAudienceVoteResult') {
        const ranked = namesFor(record.data.rankedIds, record.data.playerNamesById, currentNames)
        if (ranked.length)
          facts.push(
            `Day ${record.week} Vox audience vote: ${listNames(ranked)} were the recorded ballot order.`
          )
      } else if (record.type === 'voxNominationResult') {
        const nominees = namesFor(record.data.nomineeIds, record.data.playerNamesById, currentNames)
        if (nominees.length)
          facts.push(`Day ${record.week} Vox nominations: ${listNames(nominees)} were nominated.`)
      } else if (record.type === 'houseVoteResult') {
        const tally = asNumberMap(record.data.voteCounts)
        const summary = Object.entries(tally).map(
          ([id, count]) =>
            `${namesFor([id], record.data.playerNamesById, currentNames)[0]} received ${count} vote${count === 1 ? '' : 's'}`
        )
        if (summary.length)
          facts.push(
            `Day ${record.week} ${record.data.mode === 'cupid' ? 'Cupid' : 'Classic'} elimination: ${summary.join(', ')}.`
          )
      }
      if (facts.length >= 3) break
    }
  }

  if (facts.length || isPublicVote || isNomination || isHouseVote || isFavoriteVote)
    return facts.slice(0, 3)

  const publicEvents = (input.tvFeed ?? [])
    .filter((event) => ['game', 'vote', 'twist'].includes(event.type))
    .filter((event) => requestedWeek == null || event.meta?.week === requestedWeek)
    .slice(-30)
    .slice(-3)
    .map((event) => `Day ${event.meta?.week ?? '?'}: ${event.text.slice(0, 240)}`)
  return publicEvents
}

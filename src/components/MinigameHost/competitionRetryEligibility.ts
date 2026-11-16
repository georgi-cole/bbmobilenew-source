import type { ReactMinigameCompletion } from '../../minigames/competitionResult'

export interface RetryParticipant {
  id: string
  precomputedScore: number
}

/** Metric games sometimes return only the human result. Keep the complete field
 * used by the season ranking available before deciding whether to offer a retry. */
export function completeRetryMetrics(
  completion: ReactMinigameCompletion | undefined,
  participants: RetryParticipant[] | undefined,
  humanId: string | undefined,
  value: number
): ReactMinigameCompletion | undefined {
  if (
    !humanId ||
    !participants?.some((player) => player.id === humanId) ||
    !Number.isFinite(value) ||
    !participants.every((player) => Number.isFinite(player.precomputedScore))
  )
    return completion
  return {
    ...completion,
    rawValue: completion?.rawValue ?? value,
    rawResults: {
      ...Object.fromEntries(participants.map((player) => [player.id, player.precomputedScore])),
      ...completion?.rawResults,
      [humanId]: completion?.rawResults?.[humanId] ?? completion?.rawValue ?? value,
    },
  }
}

/** Resolve the complete last-place group without relying on rendered row order. */
export function selectCompetitionLastPlaceIds(
  completion: ReactMinigameCompletion | undefined,
  participants: RetryParticipant[] | undefined,
  lowerBetter: boolean
): string[] {
  if (!completion || !participants?.length) return []
  const participantIds = new Set(participants.map((participant) => participant.id))
  const winners = new Set([
    ...(completion.authoritativeWinnerId ? [completion.authoritativeWinnerId] : []),
    ...(completion.authoritativeWinnerIds ?? []),
  ])
  const validLastPlaces = (ids: string[]) =>
    [...new Set(ids)].filter((id) => participantIds.has(id) && !winners.has(id))

  if (completion.authoritativeLastPlaceIds !== undefined)
    return validLastPlaces(completion.authoritativeLastPlaceIds)
  if (completion.authoritativeLastPlaceId)
    return validLastPlaces([completion.authoritativeLastPlaceId])

  const rankedIds = completion.authoritativeRankedIds
  if (
    rankedIds?.length === participants.length &&
    rankedIds.every((id) => participantIds.has(id))
  ) {
    const finalTieGroup = completion.authoritativeTiedGroups?.find((group) =>
      group.includes(rankedIds[rankedIds.length - 1])
    )
    if (finalTieGroup) return validLastPlaces(finalTieGroup)
    // An explicit empty tie-group list certifies a unique final rank. A bare
    // ordered ID list alone cannot establish whether last place was tied.
    if (completion.authoritativeTiedGroups?.length === 0)
      return validLastPlaces([rankedIds[rankedIds.length - 1]])
  }

  if (!completion.rawResults) return []
  const ranked = participants
    .map((participant) => ({
      id: participant.id,
      score: completion.rawResults?.[participant.id] ?? participant.precomputedScore,
    }))
    .sort((a, b) => (lowerBetter ? a.score - b.score : b.score - a.score))
  const worstScore = ranked[ranked.length - 1]?.score
  // A fully tied field is also tied for first, so there is no losing result to retry.
  if (ranked.every((entry) => entry.score === worstScore)) return []
  return validLastPlaces(
    ranked.filter((entry) => entry.score === worstScore).map((entry) => entry.id)
  )
}

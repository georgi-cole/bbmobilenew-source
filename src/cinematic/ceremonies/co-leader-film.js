import { replacementDuration } from './replacement-timing.js'
export function coLeaderOutcome(cast, details) {
  if (!(details.coLohAssignments?.length > 1)) return null
  const assignments = details.coLohAssignments
  const nominees = [...new Set(assignments.map((a) => a.nomineeId))]
  if (details.nomineeCount > nominees.length)
    for (const slot of ['a', 'b', 'c']) {
      const id = cast[slot]?.playerId ?? cast[slot]?.id
      if (id && !nominees.includes(id) && nominees.length < details.nomineeCount) nominees.push(id)
    }
  const leaders = assignments.map((a) => a.coLohId)
  const outcome = {
    owner: 'replacement',
    eventKey: 'co-leader-nominations',
    variant: 'coLoh',
    initialNomination: true,
    openingNomineeIds: [],
    nomineeIds: nominees,
    replacementIds: nominees,
    continuingNomineeIds: [],
    savedIds: [],
    chooserId: leaders[0],
    powerHolderId: null,
    priorAuthorityId: leaders[0],
    coLohIds: leaders,
    leaderIds: leaders,
    coLohAssignments: assignments,
    pairUnits: [],
    authorityPairs: [],
    slotCount: nominees.length,
    actionHistory: nominees.map((id, index) => ({
      kind: 'replacement',
      playerId: id,
      actorId: assignments.find((a) => a.nomineeId === id)?.coLohId ?? null,
      actorRole: assignments.some((a) => a.nomineeId === id) ? 'coLoh' : 'ballot',
      slotIndex: index,
    })),
  }
  outcome.durationMs = replacementDuration(outcome)
  return outcome
}

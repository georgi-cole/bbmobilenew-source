// One readable shot and consequence per committed action. Linked partners and
// Detox's simultaneous clearing share a beat; separate choices never do.
export function replacementBeats(outcome) {
  const actions = outcome.actionHistory?.length
    ? outcome.actionHistory
    : (outcome.replacementIds ?? []).map((playerId, slotIndex) => ({
        kind: 'replacement',
        playerId,
        actorId: outcome.chooserId,
        slotIndex,
      }))
  const groups = []
  for (const action of actions) {
    const prior = groups.at(-1)
    const samePair = outcome.pairUnits?.some(
      (pair) =>
        pair.memberIds.includes(action.playerId) &&
        prior?.actions.some((a) => pair.memberIds.includes(a.playerId))
    )
    if (
      prior &&
      prior.kind === action.kind &&
      prior.actorId === action.actorId &&
      ((['detox', 'coup'].includes(outcome.powerType ?? outcome.variant) &&
        action.kind === 'save') ||
        samePair)
    ) {
      prior.actions.push(action)
    } else groups.push({ kind: action.kind, actorId: action.actorId, actions: [action] })
  }
  let cursor = outcome.segment ? 160 : 350
  return groups.map((group, index) => {
    const shotStart = cursor
    const shotEnd = cursor + (group.actorId ? 1650 : 850)
    const revealAt = shotEnd + 280
    const end = revealAt + (group.kind === 'save' ? 1450 : 1650)
    cursor = end + 180
    return { ...group, index, shotStart, shotEnd, revealAt, end }
  })
}
export function replacementDuration(outcome) {
  if (outcome.decisionOnly) return 2200
  return Math.max(
    3800,
    (replacementBeats(outcome).at(-1)?.end ?? 2500) + (outcome.segment ? 360 : 650)
  )
}

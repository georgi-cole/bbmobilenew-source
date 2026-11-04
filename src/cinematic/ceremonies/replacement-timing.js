// One continuous scene for a committed batch. Multiple choices by the same
// authority share one introduction; partners and simultaneous clearings stay units.
export function authorityIds(outcome, id) {
  if (!id) return []
  const leaders =
    outcome.leaderIds ?? [outcome.priorAuthorityId, ...(outcome.coLohIds ?? [])].filter(Boolean)
  if (!leaders.includes(id)) return [id]
  return outcome.authorityPairs?.find((pair) => pair.memberIds.includes(id))?.memberIds ?? [id]
}
export function isRoyalAuthority(outcome, id) {
  return (outcome.leaderIds ?? [outcome.priorAuthorityId, ...(outcome.coLohIds ?? [])]).includes(id)
}
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
    const paired = outcome.pairUnits?.some(
      (pair) =>
        pair.memberIds.includes(action.playerId) &&
        prior?.actions.some((a) => pair.memberIds.includes(a.playerId))
    )
    const clearing =
      ['detox', 'coup'].includes(outcome.powerType ?? outcome.variant) && action.kind === 'save'
    const consecutive =
      action.kind === 'replacement' &&
      prior?.kind === 'replacement' &&
      prior.actorId === action.actorId &&
      (outcome.variant === 'vox' ||
        ['detox', 'coup'].includes(outcome.powerType ?? outcome.variant))
    if (
      prior &&
      prior.kind === action.kind &&
      prior.actorId === action.actorId &&
      (paired || clearing || consecutive)
    )
      prior.actions.push(action)
    else groups.push({ kind: action.kind, actorId: action.actorId, actions: [action] })
  }
  let cursor = 0,
    previousAuthority = outcome.skipAuthority
      ? authorityIds(outcome, groups[0]?.actorId).join('|')
      : null
  return groups.map((group, index) => {
    const identity = authorityIds(outcome, group.actorId).join('|')
    const repeat = group.actorId && identity === previousAuthority
    const showAuthority = Boolean(group.actorId && !repeat)
    const royal = Boolean(group.actorId && isRoyalAuthority(outcome, group.actorId))
    const shotStart = cursor
    // A composed decision shot has a quiet hold before its consequence.
    const shotEnd = cursor + (showAuthority ? 2600 : group.actorId ? 850 : 1500)
    const reveals = []
    const sameUnit = group.kind === 'save' || pairedActions(outcome, group.actions)
    let revealAt = shotEnd + (showAuthority && royal ? 420 : 180)
    for (const action of group.actions) {
      reveals.push({ action, at: revealAt })
      if (!sameUnit) revealAt += 1650
    }
    const lastReveal = reveals.at(-1)?.at ?? revealAt
    const end = lastReveal + (group.kind === 'save' ? 1550 : 1900)
    previousAuthority = identity || null
    cursor = end + 400
    return {
      ...group,
      index,
      royal,
      showAuthority,
      shotStart,
      shotEnd,
      revealAt: reveals[0]?.at ?? revealAt,
      reveals,
      end,
    }
  })
}
function pairedActions(outcome, actions) {
  return (
    actions.length > 1 &&
    outcome.pairUnits?.some((pair) =>
      actions.every((action) => pair.memberIds.includes(action.playerId))
    )
  )
}
export function replacementDuration(outcome) {
  if (outcome.decisionOnly) return 2700
  return Math.max(3600, (replacementBeats(outcome).at(-1)?.end ?? 2500) + 600)
}

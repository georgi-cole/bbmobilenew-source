export interface LohNominationPlanCopySource {
  targetId: string
  backupTargetId: string | null
  initialNomineeIds: readonly string[]
  eliminationPriorityIds?: readonly string[]
  preferredSurvivorId?: string | null
  replacementTargetId?: string | null
  replacementTargetOverrideId?: string | null
  strategy: 'direct' | 'backdoor'
  isDoubleElimination?: boolean
}

/**
 * Resolve the LOH's two intended exits against the live block. A saved or
 * replacement nominee can invalidate one of the original preferences, so
 * fill the open priority from the remaining nominees while respecting the
 * nominee the LOH most wants to keep.
 */
export function getLohEliminationPriorityIds(
  plan: LohNominationPlanCopySource,
  eligibleNomineeIds?: readonly string[]
): string[] {
  const limit = plan.isDoubleElimination ? 2 : 1
  const eligible = eligibleNomineeIds ? new Set(eligibleNomineeIds) : null
  const priorities = (
    plan.eliminationPriorityIds?.length ? plan.eliminationPriorityIds : [plan.targetId]
  ).filter((id, index, ids) => ids.indexOf(id) === index && (!eligible || eligible.has(id)))

  if (eligibleNomineeIds && plan.isDoubleElimination) {
    for (const nomineeId of eligibleNomineeIds) {
      if (priorities.length >= limit) break
      if (nomineeId === plan.preferredSurvivorId || priorities.includes(nomineeId)) continue
      priorities.push(nomineeId)
    }
  }

  return priorities.slice(0, limit)
}

function formatNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? 'the eligible nominees'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

/**
 * Describe the saved LOH plan without implying that the LOH controls the vote.
 * The same formatter is used by direct questions, alliance consultations, and
 * AI-initiated alliance conversations so they cannot invent different slates.
 */
export function formatLohNominationPlanCopy(
  plan: LohNominationPlanCopySource,
  resolveName: (playerId: string) => string
): string {
  const openingNominees = formatNames(plan.initialNomineeIds.map(resolveName))
  const replacementId =
    plan.replacementTargetOverrideId ??
    plan.replacementTargetId ??
    (plan.strategy === 'backdoor' ? plan.targetId : plan.backupTargetId)
  const replacementName = replacementId ? resolveName(replacementId) : null
  const targetIsOnOpeningBlock = plan.initialNomineeIds.includes(plan.targetId)
  const lines = [`My planned opening nominees are ${openingNominees}.`]

  if (plan.isDoubleElimination) {
    const priorities = getLohEliminationPriorityIds(plan).map(resolveName)
    if (priorities.length > 0) {
      const dependsOnSafety = plan.strategy === 'backdoor' && !targetIsOnOpeningBlock
      const survivorClause = plan.preferredSurvivorId
        ? `, with ${resolveName(plan.preferredSurvivorId)} as the person I most want to keep`
        : ''
      const preference =
        `My preference is for ${formatNames(priorities)} to leave${survivorClause}. ` +
        'I cannot guarantee how the votes will land.'
      lines.push(dependsOnSafety ? `If Safety opens a replacement seat, ${preference}` : preference)
    }
  } else if (plan.strategy === 'backdoor' && !targetIsOnOpeningBlock) {
    const target = resolveName(plan.targetId)
    lines.push(
      `If Safety changes the block, ${target} is my replacement option. ` +
        'I want to try to get them out, but Safety and the vote decide what happens.'
    )
  } else {
    const target = resolveName(plan.targetId)
    lines.push(`I want ${target} to leave, but I cannot guarantee how the votes will land.`)
  }

  if (
    replacementName &&
    replacementId !== plan.targetId &&
    !(plan.strategy === 'backdoor' && !targetIsOnOpeningBlock && !plan.isDoubleElimination)
  ) {
    lines.push(`If Safety changes the block, ${replacementName} is my replacement option.`)
  } else if (
    replacementName &&
    replacementId === plan.targetId &&
    plan.strategy === 'backdoor' &&
    plan.isDoubleElimination
  ) {
    lines.push(`If Safety opens a seat, ${replacementName} is my replacement option.`)
  }

  return lines.join(' ')
}

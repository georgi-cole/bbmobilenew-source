import type { GameState } from '../../types'
import type { ReplacementPresentation } from './replacementPresentation'
import { replacementBeats, replacementDuration } from './replacement-timing.js'

export type ReplacementDecision = NonNullable<ReplacementPresentation['decision']>
const liveHuman = (game: GameState, id: string | null | undefined) => {
  const human = game.players.find((p) => p.isUser && !['evicted', 'jury'].includes(p.status))
  if (!human || !id) return null
  if (human.id === id) return human.id
  return game.cupidArrow?.status === 'active' &&
    game.cupidArrow.pairs.some(
      (pair) => pair.memberIds.includes(id) && pair.memberIds.includes(human.id)
    )
    ? human.id
    : null
}
export function replacementDecision(
  game: GameState,
  progress: ReplacementPresentation | null
): ReplacementDecision | null {
  if (
    game.phase !== 'pos_ceremony_results' ||
    game.awaitingMissionImmunityOffer ||
    game.twinShock?.promptStage
  )
    return null
  const mission = game.missionPowers?.decision
  if (mission) {
    if (
      !['pickBackup', 'backupTarget', 'vetoSafety', 'noAmbush', 'storeConflict'].includes(
        mission.kind
      )
    )
      return null
    const human = game.players.find((p) => p.isUser && !['evicted', 'jury'].includes(p.status))
    return human ? { actorId: human.id, kind: 'mission' } : null
  }
  if (game.missionPowers?.safetyIntent) return null
  const holder = liveHuman(game, game.posWinnerId)
  if (holder) {
    if (game.specialVeto?.awaitingVipSecondUseDecision)
      return { actorId: holder, kind: 'secondUse' }
    if (game.awaitingPovDecision) return { actorId: holder, kind: 'use' }
    if (game.awaitingPovSaveTarget || game.specialVeto?.awaitingVipSecondSaveTarget)
      return { actorId: holder, kind: 'save' }
  }
  const chooser = liveHuman(
    game,
    progress?.chooserId ??
      game.missionPowers?.backupChooserId ??
      game.coLohReplacementOwnerId ??
      (['coup', 'diamond'].includes(game.specialVeto?.activeType ?? '')
        ? game.posWinnerId
        : game.lohId)
  )
  if (
    chooser &&
    (game.replacementNeeded ||
      game.specialVeto?.awaitingHolderReplacement ||
      game.specialVeto?.awaitingCoupReplacement1 ||
      game.specialVeto?.awaitingCoupReplacement2)
  ) {
    return { actorId: chooser, kind: 'replacement' }
  }
  return null
}

export function nextReplacementStep(progress: ReplacementPresentation, consumed: number) {
  const groups = replacementBeats(progress)
  let cursor = 0
  for (const group of groups) {
    const end = cursor + group.actions.length
    if (end > consumed) {
      // Restored receipts may start between paired actions: never replay the
      // already-presented half of a choice.
      const actions = group.actions.slice(Math.max(0, consumed - cursor))
      const opening = [...progress.openingNomineeIds]
      const openingSlots = Object.fromEntries(opening.map((id, index) => [id, index]))
      for (const action of progress.actionHistory.slice(0, Math.max(consumed, cursor))) {
        if (action.kind === 'save') {
          const index = opening.indexOf(action.playerId)
          if (index >= 0) opening.splice(index, 1)
          delete openingSlots[action.playerId]
        } else if (action.kind === 'replacement' && !opening.includes(action.playerId)) {
          opening.push(action.playerId)
          openingSlots[action.playerId] = action.slotIndex
        }
      }
      const final = [...opening]
      for (const action of actions) {
        if (action.kind === 'save') {
          const index = final.indexOf(action.playerId)
          if (index >= 0) final.splice(index, 1)
        } else if (action.kind === 'replacement' && !final.includes(action.playerId))
          final.push(action.playerId)
      }
      const step: ReplacementPresentation = {
        ...progress,
        eventKey: `${progress.eventKey}:step:${cursor}:${end}`,
        openingNomineeIds: opening,
        nomineeIds: final,
        continuingNomineeIds: opening.filter((id) => final.includes(id)),
        replacementIds: actions.filter((a) => a.kind === 'replacement').map((a) => a.playerId),
        savedIds: actions.filter((a) => a.kind === 'save').map((a) => a.playerId),
        actionHistory: actions,
        decision: undefined,
        decisionOnly: false,
        segment: true,
        safetyUseNumber: groups.slice(0, group.index + 1).filter((beat) => beat.kind === 'save')
          .length,
        openingSlots,
        slotCount: progress.openingNomineeIds.length,
      }
      // Keep original physical slot indices even when a previous save left a hole.
      step.durationMs = replacementDuration(step)
      return { outcome: step, end }
    }
    cursor = end
  }
  return null
}

/** Only explicit intermediate reducer steps may be advanced by presentation. */
export function canAdvanceReplacementStep(game: GameState) {
  if (game.awaitingMissionImmunityOffer || game.twinShock?.promptStage) return false
  // The human already confirmed this target. Middleware staged it so an earned
  // power could intervene; advancing commits that exact intent, not a new choice.
  if (
    game.phase === 'pos_ceremony_results' &&
    !game.missionPowers?.decision &&
    game.missionPowers?.safetyIntent
  )
    return true
  return (
    game.phase === 'pos_ceremony_results' &&
    !game.missionPowers?.decision &&
    !game.replacementNeeded &&
    !game.awaitingPovDecision &&
    !game.awaitingPovSaveTarget &&
    !game.specialVeto?.awaitingVipSecondUseDecision &&
    !game.specialVeto?.awaitingVipSecondSaveTarget &&
    !game.specialVeto?.awaitingHolderReplacement &&
    !game.specialVeto?.awaitingCoupReplacement1 &&
    !game.specialVeto?.awaitingCoupReplacement2 &&
    (Boolean(game.aiReplacementStep) ||
      (game.specialVeto?.activeType === 'vip' && game.specialVeto.vipUseStage === 2))
  )
}

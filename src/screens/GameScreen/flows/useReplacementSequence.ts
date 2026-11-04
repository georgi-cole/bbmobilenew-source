import { useCallback, useEffect, useState } from 'react'
import { useStore } from 'react-redux'
import { advance, aiReplacementRendered } from '../../../store/gameSlice'
import type { RootState } from '../../../store/store'
import type { GameState } from '../../../types'
import { usePersistedGameScreenKey } from '../gameScreenPersistence'
import { getReplacementProgress } from '../../../cinematic/ceremonies/replacementPresentationMiddleware'
import { selectReplacementPresentation } from '../../../cinematic/ceremonies/replacementPresentation'
import {
  canAdvanceReplacementStep,
  nextReplacementStep,
  replacementDecision,
  replacementBlockAt,
} from '../../../cinematic/ceremonies/replacementSequence'
import {
  authorityIds,
  replacementDuration,
} from '../../../cinematic/ceremonies/replacement-timing.js'

export function useReplacementSequence(game: GameState, enabled: boolean) {
  const store = useStore<RootState>()
  const scope = `${game.gameId ?? game.season}:w${game.week}`
  const tracked = getReplacementProgress(game)
  const [receipt, setReceipt] = usePersistedGameScreenKey(
    'replacement-decisions',
    `${scope}:${tracked?.sequenceKey ?? 'restored'}`
  )
  const consumed = Number(receipt) || 0
  const [failure, setFailure] = useState('')
  const [seenAuthority, setSeenAuthority] = usePersistedGameScreenKey(
    'replacement-authority',
    scope
  )
  const progress = tracked ?? selectReplacementPresentation(game, game, [], true)
  const decision = replacementDecision(game, progress)
  const available =
    enabled &&
    failure !== scope &&
    game.phase === 'pos_ceremony_results' &&
    progress?.owner === 'replacement' &&
    !game.awaitingMissionImmunityOffer &&
    !game.twinShock?.promptStage &&
    (!game.missionPowers?.decision || decision?.kind === 'mission')
  const candidate = available && tracked ? nextReplacementStep(tracked, consumed) : null
  const batchKey = `${scope}:${tracked?.sequenceKey ?? 'restored'}:${consumed}`
  const [batch, setBatch] = useState<{ key: string; step: NonNullable<typeof candidate> } | null>(
    null
  )
  let next = candidate ? (batch?.key === batchKey ? batch.step : candidate) : null
  if (candidate && batch?.key !== batchKey) {
    setBatch({ key: batchKey, step: candidate })
    next = candidate
  }
  // The established Ambush director owns its target reveal, including while its
  // nested normalization dispatch is still resolving.
  const ambushTarget =
    game.lohNominationPlan?.strategy === 'backdoor' &&
    !['failed', 'compromised'].includes(game.lohNominationPlan.status)
      ? game.lohNominationPlan.targetId
      : null
  const delegatedAmbush = Boolean(next?.outcome.replacementIds.includes(ambushTarget ?? ''))
  const first = next?.outcome.actionHistory[0]?.actorId
  const presentedOutcome = next
    ? {
        ...next.outcome,
        skipAuthority: Boolean(
          first && seenAuthority === authorityIds(next.outcome, first).join('|')
        ),
      }
    : null
  if (presentedOutcome) presentedOutcome.durationMs = replacementDuration(presentedOutcome)
  const playing =
    !delegatedAmbush && next && presentedOutcome ? { ...next, outcome: presentedOutcome } : null
  const aiStep = Boolean(available && !playing && canAdvanceReplacementStep(game))
  const active = Boolean(available && !delegatedAmbush && (playing || decision || aiStep))
  const onDone = () => {
    if (playing) {
      setReceipt(String(playing.end))
      const last = playing.outcome.actionHistory.at(-1)?.actorId
      setSeenAuthority(last ? authorityIds(playing.outcome, last).join('|') : '')
    }
  }
  const onError = useCallback(() => setFailure(scope), [scope, setFailure])
  useEffect(() => {
    // Choices already presented natively must not replay when Cinematic is
    // switched on halfway through this ceremony.
    if (!enabled && tracked && consumed < tracked.actionHistory.length)
      setReceipt(String(tracked.actionHistory.length))
  }, [enabled, tracked, consumed, setReceipt])
  useEffect(() => {
    if (!aiStep || delegatedAmbush) return
    const current = store.getState().game
    if (current !== game || !canAdvanceReplacementStep(current)) return
    // Preserve the reducer's normal staged progression and RNG behavior.
    if (current.aiReplacementStep === 2 && current.aiReplacementWaiting)
      store.dispatch(aiReplacementRendered())
    store.dispatch(advance())
  }, [aiStep, delegatedAmbush, game, store])
  const held =
    active && !playing && decision && progress
      ? {
          ...progress,
          openingNomineeIds: replacementBlockAt(progress, consumed).ids,
          nomineeIds: replacementBlockAt(progress, consumed).ids,
          continuingNomineeIds: replacementBlockAt(progress, consumed).ids,
          openingSlots: replacementBlockAt(progress, consumed).slots,
          slotCount: Math.max(progress.openingNomineeIds.length, progress.nomineeIds.length),
          eventKey: `${progress.eventKey}:decision:${game.missionPowers?.decision?.id ?? ''}:${game.missionPowers?.decision?.kind ?? ''}`,
          variant: decision.kind === 'mission' ? ('mission' as const) : progress.variant,
          chooserId: decision.kind === 'mission' ? decision.actorId : progress.chooserId,
          actionHistory: [],
          replacementIds: [],
          decision,
          decisionOnly: true,
          durationMs: 2700,
          skipAuthority: seenAuthority === authorityIds(progress, decision.actorId).join('|'),
        }
      : null
  return {
    active,
    handled: Boolean(
      enabled &&
      failure !== scope &&
      game.phase === 'pos_ceremony_results' &&
      ((available && (tracked?.actionHistory.length || decision)) || consumed > 0)
    ),
    playing: playing?.outcome ?? null,
    held,
    decision: !playing && available ? decision : null,
    interceptDecision: Boolean(available && decision),
    decisionReceiptCount: tracked?.actionHistory.length ?? 0,
    onDecisionPresented: () => {
      if (decision && progress) setSeenAuthority(authorityIds(progress, decision.actorId).join('|'))
    },
    onDone,
    onError,
  }
}

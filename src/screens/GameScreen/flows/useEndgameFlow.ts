import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advance,
  completeFinalThreeBlockReveal,
  completeFinalThreeOpening,
  completeSpectatorFinalPowerReveal,
  consumeBroadcastEvents,
} from '../../../store/gameSlice'
import type { AppDispatch, RootState } from '../../../store/store'
import type { ChatLine } from '../../../components/ChatOverlay/ChatOverlay'
import type { Player } from '../../../types'
import { NOMINEE_PLEA_TEMPLATES, pickPhrase } from '../../../utils/juryUtils'
import {
  finalThreePhaseIdentity,
  getFinalThreeSpectatorRound,
  type FinalThreeCompetitionPart,
} from './finalThreeSpectatorFlow'

export type Final4Stage = 'idle' | 'pleas' | 'announcement' | 'splash' | 'done'

interface UseEndgameFlowOptions {
  game: RootState['game']
  alivePlayers: Player[]
  humanPlayer: Player | undefined
  humanIsPosHolder: boolean
  spectatorReactEnabled: boolean
  spectatorMode: boolean
  dispatch: AppDispatch
}

/**
 * Owns Final 4, Final 3, spectator, and jury presentation state machines.
 * Store actions continue to own all placements and authoritative outcomes.
 */
export function useEndgameFlow({
  game,
  alivePlayers,
  humanPlayer,
  humanIsPosHolder,
  spectatorReactEnabled,
  spectatorMode,
  dispatch,
}: UseEndgameFlowOptions) {
  const finalThreePart1WinnerId = game.finalThree?.part1?.winnerId ?? game.f3Part1WinnerId
  const finalThreePart2WinnerId = game.finalThree?.part2?.winnerId ?? game.f3Part2WinnerId

  // The opening and block setup are presentation gates only. Their completion
  // is persisted before advance() so a reload resumes the next real game beat.
  const debugFinaleWeekendPreviewActive = Boolean(
    game.weekendInterlude?.active &&
    game.weekendInterlude.debug &&
    game.weekendInterlude.finaleWeekend
  )
  const finalPowerBattleIntroActive =
    game.phase === 'final3' &&
    game.finalThree?.openingSeen !== true &&
    !debugFinaleWeekendPreviewActive

  const phaseIdentity = finalThreePhaseIdentity(game)
  const completedPresentations = useRef(new Set<string>())
  const spectatorEnabled = spectatorReactEnabled && spectatorMode
  const part1Round = spectatorEnabled ? getFinalThreeSpectatorRound(game, 1) : null
  const part2Round = spectatorEnabled ? getFinalThreeSpectatorRound(game, 2) : null
  const part3Round = spectatorEnabled ? getFinalThreeSpectatorRound(game, 3) : null
  // Deriving eligibility from the current run also resumes saved rounds and
  // removes the overlay immediately if the phase, cast or season is replaced.
  const spectatorF3Part1Active = Boolean(part1Round)
  const spectatorF3Part1CompetitorIds = part1Round?.competitorIds ?? []
  const spectatorF3Part2Active = Boolean(part2Round)
  const spectatorF3Part2CompetitorIds = part2Round?.competitorIds ?? []
  const spectatorF3Active = Boolean(part3Round)
  const spectatorF3CompetitorIds = part3Round?.competitorIds ?? []

  const handleFinalPowerBattleIntroDone = useCallback(() => {
    const completionKey = `${phaseIdentity}:opening`
    dispatch((commit, getState) => {
      const current = getState().game
      if (
        current.phase !== 'final3' ||
        finalThreePhaseIdentity(current) !== phaseIdentity ||
        completedPresentations.current.has(completionKey)
      )
        return
      completedPresentations.current.add(completionKey)
      commit(completeFinalThreeOpening())
      if (spectatorEnabled && getFinalThreeSpectatorRound(getState().game, 1)) return
      commit(advance())
      // Classic has one internal routing phase before the actual competition.
      if (current.voxPopuli?.status !== 'active' && getState().game.phase === 'final3_comp1')
        commit(advance())
    })
  }, [dispatch, phaseIdentity, spectatorEnabled])

  const completeSpectatorRound = useCallback(
    (part: FinalThreeCompetitionPart, roundKey: string | undefined) => {
      if (!roundKey || !spectatorEnabled) return
      dispatch((commit, getState) => {
        const before = getState().game
        if (
          getFinalThreeSpectatorRound(before, part)?.key !== roundKey ||
          completedPresentations.current.has(roundKey) ||
          before.spectatorActive ||
          before.cfg?.enableSpectatorReact === false ||
          !getState().settings.gameUX.spectatorMode
        )
          return
        completedPresentations.current.add(roundKey)
        const previousEventIds = new Set(before.tvFeed.map((event) => event.id))
        if (part === 3 && before.voxPopuli?.status !== 'active')
          commit(completeSpectatorFinalPowerReveal())
        commit(advance())
        // A legacy save can already be at final3_comp1. It needs only one
        // advance; an ordinary Classic opening needs both existing steps.
        if (
          part === 1 &&
          before.phase === 'final3' &&
          before.voxPopuli?.status !== 'active' &&
          getState().game.phase === 'final3_comp1'
        )
          commit(advance())
        // The film already showed this exact result. Consume only the new
        // result card it represents; keep every historical and unrelated event.
        const resultMajor =
          before.voxPopuli?.status === 'active'
            ? 'vox_final3_result'
            : part === 1
              ? 'final3_part1_result'
              : part === 2
                ? 'final3_part2_result'
                : null
        const after = getState().game
        const resultEventIds = after.tvFeed
          .filter(
            (event) =>
              resultMajor !== null &&
              !previousEventIds.has(event.id) &&
              event.meta?.major === resultMajor &&
              event.meta?.week === after.week &&
              event.meta?.phase === after.phase
          )
          .map((event) => event.id)
        if (resultEventIds.length) commit(consumeBroadcastEvents(resultEventIds))
      })
    },
    [dispatch, spectatorEnabled]
  )
  const handleSpectatorF3Part1Done = useCallback(
    () => completeSpectatorRound(1, part1Round?.key),
    [completeSpectatorRound, part1Round?.key]
  )
  const handleSpectatorF3Part2Done = useCallback(
    () => completeSpectatorRound(2, part2Round?.key),
    [completeSpectatorRound, part2Round?.key]
  )
  const handleSpectatorF3Done = useCallback(
    () => completeSpectatorRound(3, part3Round?.key),
    [completeSpectatorRound, part3Round?.key]
  )

  const finalThreeBlockPlayer = game.players.find(
    (player) =>
      game.phase === 'final3_comp3' &&
      game.nomineeIds.includes(player.id) &&
      player.status !== 'evicted' &&
      player.status !== 'jury'
  )
  const finalThreeBlockCompetitors = [finalThreePart1WinnerId, finalThreePart2WinnerId]
    .map((id) => game.players.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player))
  const finalThreeBlockRevealActive =
    game.voxPopuli?.status !== 'active' &&
    game.phase === 'final3_comp3' &&
    game.finalThree?.blockRevealSeen !== true &&
    Boolean(finalThreeBlockPlayer) &&
    finalThreeBlockCompetitors.length === 2
  const handleFinalThreeBlockRevealDone = useCallback(() => {
    const completionKey = `${phaseIdentity}:block`
    dispatch((commit, getState) => {
      const current = getState().game
      if (
        current.phase !== 'final3_comp3' ||
        finalThreePhaseIdentity(current) !== phaseIdentity ||
        completedPresentations.current.has(completionKey)
      )
        return
      completedPresentations.current.add(completionKey)
      commit(completeFinalThreeBlockReveal())
      if (spectatorEnabled && getFinalThreeSpectatorRound(getState().game, 3)) return
      commit(advance())
    })
  }, [dispatch, phaseIdentity, spectatorEnabled])

  // ── Final 4 cinematic flow ───────────────────────────────────────────────────
  // Stage machine drives the full Final 4 eviction sequence:
  //   idle         → not yet started (or reset after leaving final4/final3)
  //   pleas        → plea chat and, for a human POS holder, public vote choices
  //   announcement → eviction announcement ChatOverlay (blocks FAB)
  //   splash       → EvictionSplash animation (blocks FAB)
  //   done         → complete; FAB visible so user can advance to final3 comps
  const [final4Stage, setFinal4Stage] = useState<Final4Stage>('idle')
  const [final4PleaLines, setFinal4PleaLines] = useState<ChatLine[]>([])
  const [final4AnnounceLines, setFinal4AnnounceLines] = useState<ChatLine[]>([])

  // Reset all Final 4 state when the game leaves the final4/final3 region
  // (e.g. game reset, debug jump to a different phase).
  useEffect(() => {
    if (game.phase === 'final4_eviction' || game.phase === 'final3') return
    if (final4Stage === 'idle') return
    const id = window.setTimeout(() => {
      setFinal4Stage('idle')
      setFinal4PleaLines([])
      setFinal4AnnounceLines([])
    }, 0)
    return () => window.clearTimeout(id)
  }, [game.phase, final4Stage])

  // Enter final4_eviction → build enriched plea lines and start the overlay.
  // For human POS: also dispatch advance() now so plea events are emitted to
  // tvFeed and awaitingPovDecision is set before the public choice appears.
  // This sequence must start in QA/debug sessions too: Play is blocked for the
  // entire Final 4 phase while the presentation owns progression.
  useEffect(() => {
    if (game.phase !== 'final4_eviction' || final4Stage !== 'idle') return
    const povHolder = alivePlayers.find((p) => p.id === game.posWinnerId)
    const nominees = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))
    if (!povHolder || nominees.length === 0) return
    const lines: ChatLine[] = [
      {
        id: 'f4-intro',
        role: 'host',
        text: `${povHolder.name} holds the sole vote to eliminate. Nominees, it's time to make your pleas. 🎤`,
      },
      ...nominees.flatMap((nominee, idx): ChatLine[] => [
        {
          id: `f4-prompt-${nominee.id}`,
          role: 'pos',
          player: povHolder,
          text: `${nominee.name}, the floor is yours. Make your case.`,
        },
        {
          id: `f4-plea-${nominee.id}`,
          role: 'nominee',
          player: nominee,
          text: pickPhrase(NOMINEE_PLEA_TEMPLATES, game.seed, idx),
        },
        {
          id: `f4-thanks-${nominee.id}`,
          role: 'pos',
          player: povHolder,
          text:
            idx < nominees.length - 1
              ? `Thank you, ${nominee.name}.`
              : `Thank you both. I'll take a moment to think. 🤔`,
        },
      ]),
      {
        id: 'f4-thinking',
        role: 'pov-thinking',
        player: povHolder,
        text: '• • •',
      },
      ...(humanIsPosHolder
        ? [
            {
              id: 'f4-public-vote-prompt',
              role: 'host',
              text: 'The Hub has heard both pleas. It is time to make your decision, in front of everyone.',
            },
          ]
        : []),
    ]
    const id = window.setTimeout(() => {
      setFinal4PleaLines(lines)
      setFinal4Stage('pleas')
      if (humanIsPosHolder) dispatch(advance())
    }, 0)
    return () => window.clearTimeout(id)
  }, [
    game.phase,
    final4Stage,
    alivePlayers,
    game.posWinnerId,
    game.nomineeIds,
    game.seed,
    humanIsPosHolder,
    dispatch,
  ])

  // Plea overlay complete:
  //   AI POS    → dispatch advance() (AI evicts; phase transitions to final3)
  const handleFinal4PleaComplete = useCallback(() => {
    if (humanIsPosHolder) return
    dispatch(advance())
    // Stage transitions to 'announcement' via effect below once phase === 'final3'
  }, [humanIsPosHolder, dispatch])

  // Detect eviction: pendingEviction was set while in pleas/decision stage.
  // With the deferred-commit approach, the phase stays at final4_eviction until
  // finalizePendingEviction runs (after the overlay). Build eviction announcement
  // lines from pendingEviction and move to the announcement stage.
  useEffect(() => {
    if (!game.pendingEviction) return
    if (game.phase !== 'final4_eviction') return
    if (final4Stage !== 'pleas') return
    const evicted = game.players.find((p) => p.id === game.pendingEviction?.evicteeId)
    const povHolder = game.players.find((p) => p.id === game.posWinnerId)
    const id = window.setTimeout(() => {
      if (!evicted) {
        setFinal4Stage('done')
        return
      }
      setFinal4AnnounceLines([
        {
          id: 'f4-evict-decision',
          role: 'pos',
          player: povHolder,
          text: `I vote to eliminate… ${evicted.name}. 🗳️`,
        },
        {
          id: 'f4-evict-bb',
          role: 'host',
          text: `${evicted.name}, by a vote of 1 to 0, you have been eliminated from the Hub. Please take a moment to say your goodbyes. 👋`,
        },
      ])
      setFinal4Stage('announcement')
    }, 0)
    return () => window.clearTimeout(id)
  }, [game.pendingEviction, game.phase, final4Stage, game.players, game.posWinnerId])

  const handleFinal4AnnounceComplete = useCallback(() => {
    setFinal4Stage('splash')
  }, [])

  const showFinal4Chat = game.phase === 'final4_eviction' && final4Stage === 'pleas'
  const showFinal4PublicVote =
    game.phase === 'final4_eviction' &&
    Boolean(game.awaitingPovDecision) &&
    Boolean(humanIsPosHolder) &&
    final4Stage === 'pleas' &&
    game.nomineeIds.length > 0
  // Announcement: show during final4_eviction (pending commit) OR after final3 transition.
  const showFinal4AnnounceChat =
    (game.phase === 'final4_eviction' || game.phase === 'final3') && final4Stage === 'announcement'
  // Splash is driven by showEvictionSplash (pendingEviction + final4Stage === 'splash')
  // defined in the Eviction Splash section below.

  const final4Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  // ── Final 3 human Final LOH eviction ─────────────────────────────────────
  // Shown when phase is final3_decision and the human player is the Final LOH.
  const humanIsFinalLoh = Boolean(humanPlayer && game.lohId === humanPlayer.id)
  const showFinal3Modal =
    game.awaitingFinal3Eviction === true && game.phase === 'final3_decision' && humanIsFinalLoh

  const final3Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  // ── Jury reveal overlay ───────────────────────────────────────────────────
  // JuryPhaseRevealOverlay handles its own animation sequence (no-animations
  // and prefers-reduced-motion fast-paths are handled inside the component).
  // The no-animations fast-path below advances both jury_announcement and
  // jury_cinematic directly — bypassing the overlay — when body.no-animations
  // is set, and also guards jury_cinematic if it is entered directly (e.g.
  // after a store rehydration).
  useEffect(() => {
    const noAnimations =
      typeof document !== 'undefined' &&
      !!document.body &&
      document.body.classList.contains('no-animations')
    if (!noAnimations) return
    if (game.phase === 'jury_announcement' || game.phase === 'jury_cinematic') {
      dispatch(advance())
    }
  }, [game.phase, dispatch])

  /** Advance jury_announcement → jury_cinematic → jury in one step. No-op in any other phase. */
  const handleEnterJuryVote = useCallback(() => {
    if (game.phase !== 'jury_announcement' && game.phase !== 'jury_cinematic') return
    if (game.phase === 'jury_announcement') {
      dispatch(advance()) // jury_announcement → jury_cinematic
    }
    dispatch(advance()) // jury_cinematic → jury
  }, [dispatch, game.phase])

  const handleSpyJury = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[tribunal-phase] Spy Tribunal tapped — Tribunal module coming soon')
    }
  }, [])

  return {
    finalPowerBattleIntroActive,
    handleFinalPowerBattleIntroDone,
    spectatorF3Part1Active,
    spectatorF3Part1Key: part1Round?.key,
    spectatorF3Part1CompetitorIds,
    handleSpectatorF3Part1Done,
    finalThreeBlockRevealActive,
    finalThreeBlockPlayer,
    finalThreeBlockCompetitors,
    handleFinalThreeBlockRevealDone,
    spectatorF3Active,
    spectatorF3Key: part3Round?.key,
    spectatorF3CompetitorIds,
    handleSpectatorF3Done,
    spectatorF3Part2Active,
    spectatorF3Part2Key: part2Round?.key,
    spectatorF3Part2CompetitorIds,
    handleSpectatorF3Part2Done,
    final4Stage,
    setFinal4Stage,
    final4PleaLines,
    final4AnnounceLines,
    showFinal4Chat,
    showFinal4PublicVote,
    showFinal4AnnounceChat,
    final4Options,
    handleFinal4PleaComplete,
    handleFinal4AnnounceComplete,
    humanIsFinalLoh,
    showFinal3Modal,
    final3Options,
    handleEnterJuryVote,
    handleSpyJury,
  }
}

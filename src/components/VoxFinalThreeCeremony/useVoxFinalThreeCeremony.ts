import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useStore } from 'react-redux'
import {
  isCinematicSceneAllowed,
  shouldPlayCinematic,
} from '../../cinematic/ceremonies/runtime.mjs'
import type { ExitSoundtrackContinuation } from '../../cinematic/ceremonies/exit'
import { usePresentationForeground } from '../../services/presentation/presentationOwnership'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import {
  consumeBroadcastEvents,
  resolvePendingVoxAudienceVote,
  submitVoxFinalThreeAppeal,
} from '../../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type { RootState } from '../../store/store'
import { selectIsVipActive } from '../../store/vipSlice'
import type { Player } from '../../types'
import type { FinalDecisionAudioController } from '../Final3Ceremony/finalDecisionAudio'
import type {
  FinalAudienceVoteResult,
  FinalDecisionOutcome,
} from '../Final3Ceremony/finalDecisionScene.mjs'
import type { VoxFinalAppeal } from '../VoxFinalThreeAppeal/VoxFinalThreeAppeal'
import {
  buildVoxFinalThreeAppealChoices,
  buildVoxFinalThreePleas,
  getVoxFinalThreeCast,
  getVoxFinalThreeResult,
  isVoxFinalThreeAppealRequired,
} from './voxFinalThreeData'

export interface VoxFinalThreeCeremonyProps {
  sceneId: string
  holder: Player
  nominees: [Player, Player]
  viewerId?: string
  pleas: Record<string, string>
  appeal?: {
    playerId: string
    choices: ReturnType<typeof buildVoxFinalThreeAppealChoices>
  }
  result: FinalAudienceVoteResult | null
  onAppeal: (appeal: VoxFinalAppeal) => void
  onVoteRequested: () => boolean
  onPresented: () => void
  onComplete: (outcome: FinalDecisionOutcome, soundtrack: FinalDecisionAudioController) => void
  onFallback: () => void
}

function subscribeViewport(listener: () => void) {
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}

function viewportTooShort() {
  return typeof window !== 'undefined' && window.innerHeight < 540
}

function sceneIdentity(game: RootState['game'], cast = getVoxFinalThreeCast(game)) {
  if (!cast || game.voxPopuli?.publicVoteContext !== 'final3') return null
  return `${game.gameId ?? `seed-${game.seed}`}:${game.season}:vox-final-three:${game.week}:${cast.holder.id}:${cast.nominees.map((player) => player.id).join(':')}`
}

/** Keep a single session mounted while the real appeal updates the public vote. */
export function useVoxFinalThreeCeremony(onResultsDone: () => void) {
  const store = useStore<RootState>()
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const preferences = useAppSelector((state) => state.settings.audio)
  const eligible = useAppSelector(
    (state) =>
      shouldPlayCinematic(state, selectIsVipActive(state)) &&
      isCinematicSceneAllowed(state.game, 'voxResults')
  )
  const reducedMotion = usePresentationReducedMotion()
  const shortViewport = useSyncExternalStore(subscribeViewport, viewportTooShort, () => false)
  const foreground = usePresentationForeground()
  const cast = getVoxFinalThreeCast(game)
  const result = cast
    ? getVoxFinalThreeResult(
        game,
        cast.nominees.map((player) => player.id)
      )
    : null
  const inWindow = Boolean(
    cast &&
    game.voxPopuli?.publicVoteContext === 'final3' &&
    !game.awaitingTieBreak &&
    (game.voxPopuli.awaitingPublicVote || (game.voteResults && result))
  )
  const castSceneId = sceneIdentity(game, cast)
  const sceneId = inWindow ? `${castSceneId}` : null
  const canPresent = eligible && !reducedMotion && !shortViewport && inWindow
  const canStart = canPresent && game.voxPopuli?.awaitingPublicVote === true && !game.voteResults
  const [session, setSession] = useState(() => ({ sceneId, enabled: canStart }))
  // A new window can start once. Later eligibility changes only yield to native
  // UI; they cannot restart appeals or replace an already-running result film.
  const current = session.sceneId === sceneId ? session : { sceneId, enabled: canStart }
  if (session.sceneId !== sceneId) setSession(current)
  else if (session.enabled && !canPresent) setSession({ sceneId, enabled: false })
  const active = current.enabled && canPresent
  const currentGameForScene = useCallback(() => {
    const currentGame = store.getState().game
    return sceneId && sceneIdentity(currentGame) === sceneId ? currentGame : null
  }, [sceneId, store])
  const fallBack = useCallback(() => {
    if (!currentGameForScene()) return
    setSession((value) => (value.sceneId === sceneId ? { ...value, enabled: false } : value))
  }, [currentGameForScene, sceneId])
  const completedScene = useRef<string | null>(null)
  const [retained, setRetained] = useState<{
    sceneId: string
    evicteeId: string
    audio: FinalDecisionAudioController
  } | null>(null)
  const retainedRef = useRef(retained)
  useLayoutEffect(() => {
    retainedRef.current = retained
  }, [retained])
  useEffect(() => {
    retained?.audio.setPreferences(preferences)
  }, [preferences, retained])
  useEffect(() => {
    if (!foreground) retained?.audio.setActive(false)
  }, [foreground, retained])
  useEffect(
    () => () => {
      retainedRef.current?.audio.dispose()
    },
    [game.gameId, game.season]
  )
  const soundtrackContinuation = useMemo<ExitSoundtrackContinuation | undefined>(
    () =>
      retained
        ? {
            presentationGroupId: `vox-final-three:${retained.sceneId}`,
            setActive: (value) => retained.audio.setActive(value),
            finish: () => retained.audio.finish(),
          }
        : undefined,
    [retained]
  )
  const consumePresentedBroadcasts = useCallback(
    (closed: boolean) => {
      const currentGame = currentGameForScene()
      if (!currentGame) return
      const ids = currentGame.tvFeed
        .filter(
          (event) =>
            event.meta?.week === currentGame.week &&
            event.meta?.broadcastConsumed !== true &&
            (closed
              ? ['vox_populi_public_vote_closed', 'vox_final_three_appeal'].includes(
                  event.meta?.major ?? ''
                )
              : event.meta?.finalThreePacingKey === 'public_decision')
        )
        .map((event) => event.id)
      if (ids.length) dispatch(consumeBroadcastEvents(ids))
    },
    [currentGameForScene, dispatch]
  )
  const onAppeal = useCallback(
    (appeal: VoxFinalAppeal) => {
      const currentGame = currentGameForScene()
      const currentCast = currentGame && getVoxFinalThreeCast(currentGame)
      if (!currentGame || !currentCast || !isVoxFinalThreeAppealRequired(currentGame, currentCast))
        return
      if (['underdog', 'loyalty', 'resume'].includes(appeal))
        dispatch(submitVoxFinalThreeAppeal(appeal))
    },
    [currentGameForScene, dispatch]
  )
  const onVoteRequested = useCallback(() => {
    const currentGame = currentGameForScene()
    if (!currentGame) return false
    const currentCast = getVoxFinalThreeCast(currentGame)
    if (!currentCast || isVoxFinalThreeAppealRequired(currentGame, currentCast)) {
      fallBack()
      return false
    }
    dispatch(resolvePendingVoxAudienceVote())
    const committed = getVoxFinalThreeResult(
      store.getState().game,
      currentCast.nominees.map((player) => player.id)
    )
    if (!committed) fallBack()
    return Boolean(committed)
  }, [currentGameForScene, dispatch, fallBack, store])
  const onPresented = useCallback(
    () => consumePresentedBroadcasts(false),
    [consumePresentedBroadcasts]
  )
  const onComplete = useCallback(
    (outcome: FinalDecisionOutcome, soundtrack: FinalDecisionAudioController) => {
      const currentGame = currentGameForScene()
      const currentCast = currentGame && getVoxFinalThreeCast(currentGame)
      const committed =
        currentGame && currentCast
          ? getVoxFinalThreeResult(
              currentGame,
              currentCast.nominees.map((player) => player.id)
            )
          : null
      if (
        !sceneId ||
        completedScene.current === sceneId ||
        outcome.sceneId !== sceneId ||
        outcome.evicteeId !== committed?.evicteeId
      ) {
        if (retainedRef.current?.audio !== soundtrack) soundtrack.dispose()
        return
      }
      completedScene.current = sceneId
      retainedRef.current?.audio.dispose()
      const continuation = { sceneId, evicteeId: outcome.evicteeId, audio: soundtrack }
      retainedRef.current = continuation
      setRetained(continuation)
      consumePresentedBroadcasts(true)
      setSession({ sceneId, enabled: false })
      // This only dismisses results. The existing exit still commits third place.
      onResultsDone()
    },
    [consumePresentedBroadcasts, currentGameForScene, onResultsDone, sceneId]
  )
  const human = game.players.find((player) => player.isUser)
  const sceneProps: VoxFinalThreeCeremonyProps | null =
    active && cast && sceneId
      ? {
          sceneId,
          holder: cast.holder,
          nominees: cast.nominees,
          viewerId: cast.viewerId,
          pleas: buildVoxFinalThreePleas(game, cast),
          appeal:
            human && isVoxFinalThreeAppealRequired(game, cast)
              ? { playerId: human.id, choices: buildVoxFinalThreeAppealChoices(human) }
              : undefined,
          result,
          onAppeal,
          onVoteRequested,
          onPresented,
          onComplete,
          onFallback: fallBack,
        }
      : null
  return {
    active,
    sceneProps,
    soundtrackContinuation:
      retained?.sceneId === castSceneId && retained?.evicteeId === game.pendingEviction?.evicteeId
        ? soundtrackContinuation
        : undefined,
  }
}

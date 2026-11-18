/** The Tribunal opening, season archive, and final ballot reveal. */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type { Player } from '../../types'
import useSound from '../../hooks/useSound'
import {
  startFinale,
  collectTribunalBallots,
  castVote,
  finalizeFinale,
  dismissFinale,
  selectFinale,
  selectRevealedJurors,
  PUBLIC_JUROR_ID,
} from '../../store/finaleSlice'
import { finalizeGame, startWinnerCinematic } from '../../store/gameSlice'
import { selectSettings } from '../../store/settingsSlice'
import { setMusicScene } from '../../store/uiSlice'
import {
  PRESENTATION_PRIORITY,
  usePresentationForeground,
  usePresentationOwner,
} from '../../services/presentation/presentationOwnership'
import { usePresentationSound } from '../../services/presentation/usePresentationSound'
import { usePresentationTimeline } from '../../services/presentation/usePresentationTimeline'
import { tallyVotes } from '../../utils/juryUtils'
import {
  resolveAvatarCandidates,
  resolveFormalCutout,
  resolveInformalCutoutCandidates,
  resolveSilhouetteFallback,
} from '../../utils/avatar'
import { preloadImages } from '../../utils/preload'
import { resolveSkinAssetPath } from '../../utils/skinAssets'
import { selectPublicOpinion } from '../../publicOpinion'
import { SOCIAL_INITIAL_STATE } from '../../social/constants'
import { getVoteSpotlightCount } from './finaleBallotReveal'
import FinaleControls from './FinaleControls'
import FinalTallyPanel from './FinalTallyPanel'
import SeasonRecapCinematic from '../SeasonRecapCinematic/SeasonRecapCinematic'
import TribunalMemberStage from '../TribunalMemberStage/TribunalMemberStage'
import TribunalBallotFlight from './TribunalBallotFlight'
import { splitFinalePlayers } from './finaleEligibility'
import { getTribunalMembers } from '../../rules/tribunalPolicy'
import {
  BALLOT_BEAT_MS,
  type BallotBeat,
  VOTE_REVEAL_INITIAL_DELAY_MS,
  VOTE_REVEAL_STAGGER_MS,
  winnerHandoffDelayMs,
} from './finaleTiming'
import './FinalFaceoff.css'

export default function FinalFaceoff({ presentation = 'v2' }: { presentation?: 'v1' | 'v2' }) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const finale = useAppSelector(selectFinale)
  const revealed = useAppSelector(selectRevealedJurors)
  const settings = useAppSelector(selectSettings)
  const publicOpinion = useAppSelector(selectPublicOpinion)
  const socialReality = useAppSelector((s) => s.social?.reality ?? SOCIAL_INITIAL_STATE.reality)
  const { isOwner } = usePresentationOwner(
    'season-finale',
    PRESENTATION_PRIORITY.finale,
    finale.isActive
  )
  const foreground = usePresentationForeground()
  const presentationActive = isOwner && foreground
  const { play: playRawSound } = useSound()

  useEffect(() => {
    const sources = game.players.flatMap((player) => [
      resolveAvatarCandidates(player)[0],
      ...resolveInformalCutoutCandidates(player),
      resolveFormalCutout(player),
      resolveSilhouetteFallback(player),
    ])
    sources.push(resolveSkinAssetPath('thegirls.webp'), resolveSkinAssetPath('the boys.webp'))

    // Start warming every tribunal and recap portrait as soon as the finale
    // mounts so their images are ready for the archive and the ballot reveal.
    void preloadImages([...new Set(sources.filter((source): source is string => Boolean(source)))])
  }, [game.players])

  const [archiveComplete, setArchiveComplete] = useState(false)
  const [tribunalOpeningReady, setTribunalOpeningReady] = useState(false)
  const [spotlightCount, setSpotlightCount] = useState(0)
  const [ballotBeat, setBallotBeat] = useState<BallotBeat>('rules')
  const ballotOrigin = useRef<HTMLElement>(null)
  const ballotDestination = useRef<HTMLElement>(null)
  const sequential = presentation === 'v2'
  const waitingForOpeningCue =
    !tribunalOpeningReady && finale.revealedCount === 0 && !finale.awaitingHumanJurorId
  const ballotsReady =
    !waitingForOpeningCue &&
    !finale.awaitingHumanJurorId &&
    finale.revealedCount >= finale.revealOrder.length
  const phase =
    finale.isComplete || archiveComplete ? 'revealVotes' : ballotsReady ? 'recap' : 'opening'
  const winnerPersistedRef = useRef(false)
  const { play, cancel: cancelPresentationSound } = usePresentationSound(
    presentationActive,
    `${game.gameId ?? game.seed}:${phase}`,
    playRawSound
  )

  const persistWinnerToSeasonFinale = useCallback(() => {
    if (winnerPersistedRef.current) return
    if (!finale.winnerId || !finale.runnerUpId) return

    winnerPersistedRef.current = true
    cancelPresentationSound()

    const publicFavoriteEnabled = settings.sim.enableFavoritePlayer && settings.sim.enableTwists
    const winnerAlreadyMarked = game.players.some(
      (player) => player.id === finale.winnerId && player.isWinner
    )
    const runnerUpAlreadyMarked = game.players.some(
      (player) => player.id === finale.runnerUpId && player.finalRank === 2
    )

    dispatch(setMusicScene('none'))
    if (!winnerAlreadyMarked || !runnerUpAlreadyMarked) {
      dispatch(finalizeGame({ winnerId: finale.winnerId, runnerUpId: finale.runnerUpId }))
    }
    // A resumed run may already be in the winner presentation. Preserve its
    // progress instead of restarting the cinematic after restoring the ballot.
    if (game.seasonFinale?.winnerId !== finale.winnerId) {
      dispatch(
        startWinnerCinematic({
          winnerId: finale.winnerId,
          seed: game.seed,
          publicFavoriteEnabled,
        })
      )
    }
    dispatch(dismissFinale())
  }, [
    cancelPresentationSound,
    dispatch,
    finale.runnerUpId,
    finale.winnerId,
    game.players,
    game.seed,
    game.seasonFinale?.winnerId,
    settings.sim.enableFavoritePlayer,
    settings.sim.enableTwists,
  ])

  const handleRecapComplete = useCallback(() => {
    setArchiveComplete(true)
  }, [])

  useEffect(
    () => () => {
      if (!winnerPersistedRef.current) dispatch(setMusicScene('none'))
    },
    [dispatch]
  )

  useEffect(() => {
    if (!presentationActive) {
      dispatch(setMusicScene('none'))
      return
    }
    dispatch(
      setMusicScene(
        phase === 'recap'
          ? 'season_recap'
          : phase === 'revealVotes'
            ? 'jury_voting'
            : 'tribunal_part1'
      )
    )
  }, [dispatch, presentationActive, phase])

  // ── Initialise finale on first render ──────────────────────────────────
  useEffect(() => {
    if (finale.hasStarted) return

    const { finalists, jurors } = splitFinalePlayers(game.players)
    const humanIds = game.players.filter((p) => p.isUser).map((p) => p.id)

    const hasPublicProfiles = Object.keys(publicOpinion.profiles).length > 0

    dispatch(
      startFinale({
        finalistIds: finalists.map((p) => p.id),
        jurorIds: jurors.map((p) => p.id),
        humanPlayerIds: humanIds,
        seed: game.seed,
        cfg: {
          publicFinalVoteEnabled: game.cfg?.publicFinalVoteEnabled ?? game.cfg?.americasVoteEnabled,
        },
        publicApprovalProfiles: hasPublicProfiles ? publicOpinion.profiles : undefined,
        reality: socialReality,
      })
    )
  }, [
    dispatch,
    finale.hasStarted,
    game.players,
    game.seed,
    game.cfg,
    publicOpinion.profiles,
    socialReality,
  ])

  const humanIds = useMemo(
    () => game.players.filter((player) => player.isUser).map((player) => player.id),
    [game.players]
  )
  useEffect(() => {
    if (phase !== 'opening' || !presentationActive || !waitingForOpeningCue) return

    const beginTribunal = (event: Event) => {
      event.preventDefault()
      setTribunalOpeningReady(true)
    }

    window.addEventListener('ui:playPressed', beginTribunal, { capture: true })
    return () => window.removeEventListener('ui:playPressed', beginTribunal, { capture: true })
  }, [phase, presentationActive, waitingForOpeningCue])

  useEffect(() => {
    if (phase !== 'opening' || !presentationActive || waitingForOpeningCue) return
    if (finale.awaitingHumanJurorId) return

    dispatch(collectTribunalBallots(humanIds))
  }, [
    dispatch,
    phase,
    presentationActive,
    finale.awaitingHumanJurorId,
    finale.revealedCount,
    finale.revealOrder.length,
    humanIds,
    waitingForOpeningCue,
  ])

  const ballots = useMemo(
    () => revealed.filter((vote) => finale.finalistIds.includes(vote.finalistId)),
    [revealed, finale.finalistIds]
  )
  const spotlightLimit = getVoteSpotlightCount(ballots, finale.finalistIds)
  const remainingBallots =
    finale.isComplete && spotlightCount === spotlightLimit && spotlightCount > 0
      ? ballots.slice(spotlightCount)
      : []
  const visibleVoteCount = finale.isComplete ? ballots.length : spotlightCount

  const voteBeat = useMemo(() => {
    const ballot = spotlightCount < spotlightLimit ? ballots[spotlightCount] : undefined
    const delay = sequential
      ? BALLOT_BEAT_MS[ballotBeat]
      : spotlightCount === 0
        ? VOTE_REVEAL_INITIAL_DELAY_MS
        : VOTE_REVEAL_STAGGER_MS
    const run = () => {
      if (ballot) {
        if (sequential && ballotBeat !== 'flight') {
          setBallotBeat(
            ballotBeat === 'lead' ? 'recipient' : ballotBeat === 'recipient' ? 'flight' : 'lead'
          )
          return
        }
        play('ui:tribunal_vote_reveal')
        setSpotlightCount(spotlightCount + 1)
        if (sequential) setBallotBeat('counted')
        return
      }
      dispatch(finalizeFinale({ seed: game.seed }))
    }
    return [{ atMs: delay, run }]
  }, [ballotBeat, ballots, dispatch, game.seed, play, sequential, spotlightCount, spotlightLimit])
  const cancelVoteBeat = usePresentationTimeline(
    presentationActive && phase === 'revealVotes' && !finale.isComplete,
    voteBeat,
    `${phase}:${spotlightCount}:${ballotBeat}`
  )

  const winnerCue = useMemo(
    () => [
      { atMs: winnerHandoffDelayMs(remainingBallots.length), run: persistWinnerToSeasonFinale },
    ],
    [remainingBallots.length, persistWinnerToSeasonFinale]
  )
  usePresentationTimeline(
    presentationActive &&
      phase === 'revealVotes' &&
      finale.isComplete &&
      Boolean(finale.winnerId && finale.runnerUpId),
    winnerCue,
    `${game.gameId ?? game.seed}:${finale.winnerId ?? ''}`
  )

  // Recovery path: if jury voting already completed and the game is still on the
  // jury screen without an active finale overlay or season-finale flow, bridge
  // directly into the winner cinematic instead of leaving the player stuck.
  useEffect(() => {
    if (game.phase !== 'jury') return
    if (!finale.isComplete || !finale.winnerId || !finale.runnerUpId) return
    if (game.seasonFinale?.winnerId === finale.winnerId) {
      persistWinnerToSeasonFinale()
      return
    }
    if (game.seasonFinale != null || finale.isActive) return

    persistWinnerToSeasonFinale()
  }, [
    finale.isActive,
    finale.isComplete,
    finale.runnerUpId,
    finale.winnerId,
    game.phase,
    game.seasonFinale,
    persistWinnerToSeasonFinale,
  ])

  if (!finale.isActive) return null

  // ── ACT 2: Season recap cinematic ────────────────────────────────────
  if (phase === 'recap') {
    return (
      <SeasonRecapCinematic
        season={game.season}
        week={game.week}
        players={game.players}
        history={game.history}
        publicOpinion={publicOpinion}
        onComplete={handleRecapComplete}
      />
    )
  }

  // Build finalists with type safety
  const finalists: Player[] = []
  for (const id of finale.finalistIds) {
    const player = game.players.find((p) => p.id === id)
    if (player) finalists.push(player)
  }

  const tally = tallyVotes(
    Object.fromEntries(
      ballots.slice(0, visibleVoteCount).map((vote) => [vote.jurorId, vote.finalistId])
    )
  )
  const isOpening = phase === 'opening'
  const playerById = new Map(game.players.map((player) => [player.id, player]))
  const ballotName = (id: string) =>
    id === PUBLIC_JUROR_ID ? 'The Public' : (playerById.get(id)?.name ?? 'Tribunal member')
  const isPending = sequential && ['lead', 'recipient', 'flight'].includes(ballotBeat)
  const focusedBallot = ballots[spotlightCount - Number(!isPending)]
  const showRule =
    sequential && !isOpening && !finale.isComplete && ballotBeat === 'rules' && ballots.length > 0
  const majority = Math.floor(ballots.length / 2) + 1
  const awaitingHumanPlayer = finale.awaitingHumanJurorId
    ? playerById.get(finale.awaitingHumanJurorId)
    : undefined

  function handleBeginTribunal() {
    setTribunalOpeningReady(true)
  }

  function handleCastVote(finalistId: string) {
    if (!finale.awaitingHumanJurorId) return
    dispatch(castVote({ jurorId: finale.awaitingHumanJurorId, finalistId }))
  }

  function handleSkipAll() {
    cancelVoteBeat()
    cancelPresentationSound()
    setSpotlightCount(0)
    dispatch(finalizeFinale({ seed: game.seed }))
  }

  return (
    <div
      className={`fo-overlay fo-overlay--${isOpening ? 'deliberation' : 'verdict'}${finale.isComplete ? ' fo-overlay--settled' : ''}${sequential ? ' fo-overlay--sequential' : ''}`}
      data-presentation-root="final-tribunal"
      data-presentation-suspended={!presentationActive || undefined}
      aria-hidden={!presentationActive || undefined}
      inert={!presentationActive || undefined}
      role="dialog"
      aria-label="Tribunal Finale"
    >
      <div className="fo-chamber" aria-hidden="true" />
      <div className="fo-chamber__light" aria-hidden="true" />
      <div className="fo-chamber__grain" aria-hidden="true" />
      {/* Header */}
      <div className="fo-header">
        {sequential ? (
          <h2 className="fo-header__eyebrow">Season {game.season} · Final decision</h2>
        ) : (
          <>
            <p className="fo-header__eyebrow">Season {game.season} · Final decision</p>
            <h2 className="fo-title">
              <span>The Final</span> Tribunal
            </h2>
          </>
        )}
        {!isOpening && (
          <>
            <p className="fo-subtitle" data-rule={showRule || undefined} key={Number(showRule)}>
              {showRule
                ? `The first finalist to reach ${majority} ${majority === 1 ? 'vote' : 'votes'} wins`
                : finale.isComplete
                  ? 'Final tally'
                  : `${visibleVoteCount} / ${ballots.length} votes revealed`}
            </p>
            {!finale.isComplete && !showRule && (
              <div className="fo-header__progress" aria-hidden="true">
                <span
                  style={{
                    transform: `scaleX(${ballots.length ? visibleVoteCount / ballots.length : 0})`,
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {finale.isComplete && finale.tieBreakReason && (
        <div className="fo-tie-break" role="status">
          <span>Tiebreak</span>
          {finale.tieBreakReason === 'tribunal_majority'
            ? 'The public ballot tied the total. The Tribunal-only majority decides the winner.'
            : finale.tieBreakReason === 'season_evaluation'
              ? 'A tied Tribunal was resolved by the season-long Tribunal evaluations.'
              : finale.tieBreakReason === 'public_final_vote'
                ? 'The public finalist ballot resolved an otherwise tied Tribunal.'
                : 'A malformed legacy finale was resolved by stable recovery rules.'}
        </div>
      )}

      {isOpening ? (
        <TribunalMemberStage
          mode="opening"
          tribunalMembers={getTribunalMembers(game.players)}
          awaitingHumanPlayer={awaitingHumanPlayer}
          finalists={finalists}
          onCastVote={handleCastVote}
          waitingForOpeningCue={waitingForOpeningCue && presentationActive}
          paired={sequential}
        />
      ) : (
        <>
          {!finale.isComplete && !showRule && (
            <TribunalMemberStage
              mode="reveal"
              beat={sequential ? ballotBeat : undefined}
              ballotOrigin={ballotOrigin}
              ballot={
                focusedBallot && {
                  voter: playerById.get(focusedBallot.jurorId),
                  voterId: focusedBallot.jurorId,
                  voterName: ballotName(focusedBallot.jurorId),
                  finalistName: ballotName(focusedBallot.finalistId),
                  number: spotlightCount + Number(isPending),
                  tone: focusedBallot.finalistId === finalists[0]?.id ? 'gold' : 'violet',
                }
              }
            />
          )}
          <FinalTallyPanel
            finalists={finalists}
            tally={tally}
            introducingFinalists={showRule}
            latestFinalistId={
              finale.isComplete || isPending ? undefined : focusedBallot?.finalistId
            }
            pendingFinalistId={
              !finale.isComplete && ballotBeat === 'flight' ? focusedBallot?.finalistId : undefined
            }
            ballotDestination={ballotDestination}
            remainingBallots={
              finale.isComplete
                ? remainingBallots.map((vote) => ({ ...vote, name: ballotName(vote.jurorId) }))
                : undefined
            }
          />
          {!finale.isComplete && ballotBeat === 'flight' && focusedBallot && (
            <TribunalBallotFlight
              active={presentationActive}
              origin={ballotOrigin}
              destination={ballotDestination}
              name={ballotName(focusedBallot.finalistId)}
              tone={focusedBallot.finalistId === finalists[0]?.id ? 'gold' : 'violet'}
            />
          )}
        </>
      )}

      <FinaleControls
        opening={isOpening}
        showOpeningCue={isOpening && waitingForOpeningCue}
        isComplete={finale.isComplete}
        onSkipAll={handleSkipAll}
        onDismiss={persistWinnerToSeasonFinale}
        onPlay={handleBeginTribunal}
      />
    </div>
  )
}

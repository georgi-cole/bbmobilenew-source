import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import { isEmoji, resolveAvatarCandidates } from '../../utils/avatar'
import { resolvePresentationAvatar } from '../../utils/presentationAvatar'
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin'
import { mulberry32 } from '../../store/rng'
import { store } from '../../store/store'
import { updateRelationship } from '../../social/socialSlice'
import {
  CHAMBER_ROUNDS,
  CHAMBER_FORBIDDEN_OPENINGS,
  chooseChamberAiAction,
  chooseChamberExecutionTarget,
  createChamberState,
  getChamberActionInfo,
  getChamberActionNeedsTarget,
  getChamberActionTitle,
  getChamberActor,
  getChamberTargetPlayers,
  getChamberRelationshipLabel,
  getChamberRound,
  getEffectiveChamberAction,
  isChamberFinished,
  resolveChamberAction,
  resolveChamberBoxTarget,
  skipEliminatedTurn,
  type ChamberAction,
  type ChamberPlayer,
  type ChamberState,
} from './chamberGame'
import './GridOfLuck.css'

function ChamberAvatar({ player }: { player: Pick<ChamberPlayer, 'id' | 'name' | 'avatar'> }) {
  const candidates = resolveAvatarCandidates({ ...player, avatar: player.avatar ?? '' }).map(
    resolvePresentationAvatar
  )
  const [candidateIdx, setCandidateIdx] = useState(0)
  const [showFallback, setShowFallback] = useState(false)

  if (showFallback) {
    return (
      <span className="grid-of-luck__avatar-fallback" aria-hidden="true">
        {isEmoji(player.avatar ?? '') ? player.avatar : player.name.charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      className="grid-of-luck__avatar"
      src={candidates[candidateIdx] ?? ''}
      alt={player.name}
      onError={() => {
        if (candidateIdx < candidates.length - 1) {
          setCandidateIdx((index) => index + 1)
          return
        }
        setShowFallback(true)
      }}
    />
  )
}
type ChamberView =
  | 'choice'
  | 'target'
  | 'confirm'
  | 'activation'
  | 'box-reveal'
  | 'box-target'
  | 'result'
  | 'round-break'
  | 'eliminated-choice'
  | 'finished'

const DEFAULT_CHAMBER_PARTICIPANTS = [
  { id: 'human', name: 'You', isHuman: true, avatar: '🜂' },
  { id: 'ai-1', name: 'Nyx', isHuman: false, avatar: '🌙' },
  { id: 'ai-2', name: 'Vex', isHuman: false, avatar: '⚡' },
  { id: 'ai-3', name: 'Mara', isHuman: false, avatar: '🕯️' },
  { id: 'ai-4', name: 'Orion', isHuman: false, avatar: '☄️' },
]

const AI_CHOICE_DELAY_MS = 1900
const AI_AUTO_ADVANCE_DELAY_MS = 5600
const POWER_ACTIVATION_DELAY_MS = 1800
const BOX_OPENING_DELAY_MS = 2600
const BOX_REVEAL_DELAY_MS = 1800
const BOX_IMPACT_DELAY_MS = 1900

function getActionTargetPreview(
  action: ChamberAction,
  actor: ChamberPlayer,
  target: ChamberPlayer,
  state: ChamberState
): string {
  const effect = getEffectiveChamberAction(action, state)
  const prefix = action === 'echo' ? `Echo ${getChamberActionTitle(effect).toLowerCase()}: ` : ''
  if (effect === 'share')
    return prefix + `${actor.name} and ${target.name} each gain up to 60 Power.`
  if (effect === 'siphon') {
    if (target.immune) return prefix + `${target.name}'s immunity blocks the Siphon.`
    if (target.ward) return prefix + `${target.name}'s Ward blocks the Siphon and fades.`
    return prefix + `${target.name} loses up to 80 Power; ${actor.name} gains that amount.`
  }
  if (effect === 'ward') {
    return target.ward
      ? `${target.name}'s existing Ward becomes 70 Power.`
      : `${target.name} will block one hostile power effect.`
  }
  return prefix
}

function getBoxExchangePreview(actor: ChamberPlayer, target: ChamberPlayer): string {
  if (actor.power === target.power)
    return 'Your Power totals are equal, so the exchange changes nothing.'
  const higher = actor.power > target.power ? actor : target
  const lower = actor.power > target.power ? target : actor
  const amount = Math.min(120, Math.floor(Math.abs(actor.power - target.power) / 2))
  if (higher.immune) return `${higher.name}'s immunity blocks the exchange.`
  if (higher.ward) return `${higher.name}'s Ward blocks the exchange and fades.`
  return `${higher.name} loses ${amount} Power; ${lower.name} gains the same amount.`
}

export default function MysticChamber(props: GenericMinigameProps) {
  const [sessionSeed] = useState(() =>
    typeof props.seed === 'number' && props.seed !== 0 ? props.seed : cryptoSeed()
  )
  const rngRef = useRef<() => number>(mulberry32(sessionSeed >>> 0))
  const participants = useMemo(() => {
    if (props.participants?.length) {
      return props.participants.slice(0, 5).map((player) => ({
        id: player.id,
        name: player.name,
        isHuman: player.isHuman,
        avatar: player.avatar,
      }))
    }
    if (props.participantIds?.length) {
      return props.participantIds.slice(0, 5).map((id, index) => ({
        id,
        name: index === 0 ? 'You' : `Player ${index + 1}`,
        isHuman: index === 0,
        avatar: undefined,
      }))
    }
    return DEFAULT_CHAMBER_PARTICIPANTS
  }, [props.participantIds, props.participants])
  const [state, setState] = useState<ChamberState>(() =>
    createChamberState(participants, sessionSeed)
  )
  const [view, setView] = useState<ChamberView>('choice')
  const [autoplay, setAutoplay] = useState(false)
  const [selectedAction, setSelectedAction] = useState<ChamberAction | null>(null)
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{
    action: ChamberAction
    targetId?: string
  } | null>(null)
  const [pendingBoxTargetId, setPendingBoxTargetId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [completed, setCompleted] = useState(false)

  const actor = getChamberActor(state)
  const round = getChamberRound(state)
  const totalTurns = state.players.length * CHAMBER_ROUNDS
  const humanPlayer = state.players.find((player) => player.isHuman)
  const targetablePlayers = selectedAction ? getChamberTargetPlayers(state, selectedAction) : []
  const pendingBoxActor = state.pendingBox
    ? (state.players.find((player) => player.id === state.pendingBox?.actorId) ?? null)
    : null
  const boxTargetablePlayers = pendingBoxActor
    ? state.players.filter((player) => !player.eliminated && player.id !== pendingBoxActor.id)
    : []
  const selectedTarget =
    (view === 'box-target' ? boxTargetablePlayers : targetablePlayers).find(
      (player) => player.id === selectedTargetId
    ) ?? null
  const roundLabel =
    state.lastEvent && (view === 'result' || view === 'round-break' || view === 'finished')
      ? state.lastEvent.round
      : round

  const rankedPlayers = useMemo(() => {
    const finalRoundGain = new Map<string, number>()
    state.players.forEach((player) => finalRoundGain.set(player.id, 0))
    state.events
      .filter((event) => event.round === CHAMBER_ROUNDS)
      .forEach((event) => {
        event.changes.forEach((change) => {
          finalRoundGain.set(
            change.playerId,
            (finalRoundGain.get(change.playerId) ?? 0) + change.after - change.before
          )
        })
      })
    return [...state.players].sort((left, right) => {
      if (left.id === state.winnerId) return -1
      if (right.id === state.winnerId) return 1
      if (left.eliminated !== right.eliminated) return left.eliminated ? 1 : -1
      return (
        right.power - left.power ||
        (finalRoundGain.get(right.id) ?? 0) - (finalRoundGain.get(left.id) ?? 0)
      )
    })
  }, [state.events, state.players, state.winnerId])

  const startAction = useCallback(
    (action: ChamberAction, targetId?: string) => {
      if ((view !== 'choice' && view !== 'target' && view !== 'confirm') || actor.eliminated) return
      setPendingAction({ action, targetId })
      setPendingBoxTargetId(null)
      setView('activation')
    },
    [actor.eliminated, view]
  )

  useEffect(() => {
    if (view !== 'choice' || isChamberFinished(state)) return undefined
    if (actor.eliminated) {
      const timer = window.setTimeout(() => {
        const nextState = skipEliminatedTurn(state, rngRef.current)
        setState(nextState)
        if (isChamberFinished(nextState)) setView('finished')
        else if (nextState.completedTurns % nextState.players.length === 0) setView('round-break')
      }, 280)
      return () => window.clearTimeout(timer)
    }
    if (actor.isHuman) return undefined
    const timer = window.setTimeout(() => {
      const choice = chooseChamberAiAction(state, props.relationships, rngRef.current)
      startAction(choice.action, choice.targetId)
    }, AI_CHOICE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [actor.eliminated, actor.isHuman, props.relationships, state, startAction, view])

  useEffect(() => {
    if (view !== 'activation') return undefined
    const isBoxImpact = Boolean(state.pendingBox)
    const isOpeningBox = pendingAction?.action === 'forbidden' && !isBoxImpact
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const delay = reducedMotion
      ? 80
      : isBoxImpact
        ? BOX_IMPACT_DELAY_MS
        : isOpeningBox
          ? BOX_OPENING_DELAY_MS
          : POWER_ACTIVATION_DELAY_MS
    const timer = window.setTimeout(() => {
      if (isBoxImpact) {
        if (!pendingBoxTargetId) {
          setView('box-target')
          return
        }
        const nextState = resolveChamberBoxTarget(state, pendingBoxTargetId, rngRef.current)
        setState(nextState)
        setPendingBoxTargetId(null)
        setPendingAction(null)
        setSelectedAction(null)
        setSelectedTargetId(null)
        setView('result')
        return
      }
      if (!pendingAction) {
        setView('choice')
        return
      }

      const nextState = resolveChamberAction(
        state,
        pendingAction.action,
        pendingAction.targetId,
        rngRef.current
      )
      if (nextState.pendingBox) {
        setState(nextState)
        setPendingAction(null)
        setSelectedAction(null)
        setSelectedTargetId(null)
        if (actor.isHuman) {
          setView('box-target')
          return
        }
        const target = chooseChamberExecutionTarget(nextState, props.relationships)
        if (target) {
          setPendingBoxTargetId(target.id)
          setView('box-reveal')
          return
        }
      }
      setState(nextState)
      setPendingAction(null)
      setSelectedAction(null)
      setSelectedTargetId(null)
      setView('result')
    }, delay)
    return () => window.clearTimeout(timer)
  }, [actor.isHuman, pendingAction, pendingBoxTargetId, props.relationships, state, view])

  useEffect(() => {
    if (view !== 'box-reveal') return undefined
    const timer = window.setTimeout(() => setView('activation'), BOX_REVEAL_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [view])

  const advanceAfterResult = useCallback(() => {
    if (view !== 'result') return
    if (isChamberFinished(state)) {
      setHistoryOpen(false)
      setView('finished')
    } else if (humanPlayer?.eliminated) {
      setView('eliminated-choice')
    } else if (state.completedTurns % state.players.length === 0) {
      setView('round-break')
    } else {
      setView('choice')
    }
    setSelectedAction(null)
    setSelectedTargetId(null)
  }, [humanPlayer?.eliminated, state, view])

  const continueAsSpectator = useCallback(() => {
    if (isChamberFinished(state)) {
      setHistoryOpen(false)
      setView('finished')
    } else if (state.completedTurns % state.players.length === 0) setView('round-break')
    else setView('choice')
  }, [state])

  const skipToResults = useCallback(() => {
    let simulatedState = state
    let safety = simulatedState.players.length * CHAMBER_ROUNDS + 2
    while (!isChamberFinished(simulatedState) && safety > 0) {
      safety -= 1
      const currentActor = getChamberActor(simulatedState)
      if (currentActor.eliminated) {
        simulatedState = skipEliminatedTurn(simulatedState, rngRef.current)
        continue
      }
      const choice = chooseChamberAiAction(simulatedState, props.relationships, rngRef.current)
      simulatedState = resolveChamberAction(
        simulatedState,
        choice.action,
        choice.targetId,
        rngRef.current
      )
      if (simulatedState.pendingBox) {
        const target = chooseChamberExecutionTarget(simulatedState, props.relationships)
        if (target)
          simulatedState = resolveChamberBoxTarget(simulatedState, target.id, rngRef.current)
      }
    }
    setState(simulatedState)
    setSelectedAction(null)
    setSelectedTargetId(null)
    setHistoryOpen(false)
    setView('finished')
  }, [props.relationships, state])

  useEffect(() => {
    if (!autoplay || view !== 'result' || state.lastEvent?.actorId === humanPlayer?.id)
      return undefined
    const timer = window.setTimeout(advanceAfterResult, AI_AUTO_ADVANCE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [advanceAfterResult, autoplay, humanPlayer?.id, state.lastEvent?.actorId, view])

  const finishMinigame = () => {
    if (!props.onFinish || completed || !rankedPlayers[0]) return
    setCompleted(true)
    const latestHumanSocialChoice = new Map<string, 'positive' | 'negative'>()
    state.events.forEach((event) => {
      const choice = event.action === 'echo' ? event.copiedAction : event.action
      if (
        event.actorId === humanPlayer?.id &&
        event.targetId &&
        event.targetId !== humanPlayer?.id &&
        (choice === 'share' ||
          choice === 'ward' ||
          choice === 'siphon' ||
          choice === 'drain' ||
          event.action === 'forbidden')
      ) {
        latestHumanSocialChoice.set(
          event.targetId,
          choice === 'siphon' || choice === 'drain' || event.action === 'forbidden'
            ? 'negative'
            : 'positive'
        )
      }
    })
    const seasonPlayerIds = new Set(store.getState().game.players.map((player) => player.id))
    latestHumanSocialChoice.forEach((action, targetId) => {
      if (!humanPlayer || !seasonPlayerIds.has(humanPlayer.id) || !seasonPlayerIds.has(targetId))
        return
      if (action === 'negative') {
        store.dispatch(
          updateRelationship({
            source: targetId,
            target: humanPlayer.id,
            delta: -4,
            actionSource: 'system',
            realityMeaningful: true,
          })
        )
      } else {
        store.dispatch(
          updateRelationship({
            source: humanPlayer!.id,
            target: targetId,
            delta: 3,
            actionSource: 'system',
            realityMeaningful: true,
          })
        )
        store.dispatch(
          updateRelationship({
            source: targetId,
            target: humanPlayer!.id,
            delta: 2,
            actionSource: 'system',
            realityMeaningful: true,
          })
        )
      }
    })
    const winnerId = state.winnerId ?? rankedPlayers[0].id
    const rankedIds = [
      winnerId,
      ...rankedPlayers.map((player) => player.id).filter((id) => id !== winnerId),
    ]
    props.onFinish(rankedPlayers[0].power, undefined, {
      authoritativeWinnerId: winnerId,
      authoritativeLastPlaceId: rankedPlayers[rankedPlayers.length - 1]?.id ?? null,
      authoritativeRankedIds: rankedIds,
      rawValue: rankedPlayers[0].power,
      rawResults: Object.fromEntries(state.players.map((player) => [player.id, player.power])),
    })
  }

  const relationshipLabel = (player: ChamberPlayer) =>
    getChamberRelationshipLabel(props.relationships, humanPlayer?.id, player.id)
  const resultActorId = view === 'result' ? state.lastEvent?.actorId : actor.id
  const phase = roundLabel <= 2 ? 'opening' : roundLabel <= 4 ? 'midgame' : 'finale'
  const winner = state.players.find((player) => player.id === state.winnerId) ?? rankedPlayers[0]
  const lastEventMagnitude =
    state.lastEvent?.changes.reduce(
      (largest, change) => Math.max(largest, Math.abs(change.after - change.before)),
      0
    ) ?? 0
  const dramaticResult =
    view === 'result' &&
    Boolean(
      state.lastEvent &&
      (state.lastEvent.eliminatedPlayerId ||
        state.lastEvent.boxOutcome === 'execution' ||
        state.lastEvent.boxOutcome === 'backfire' ||
        state.lastEvent.boxOutcome === 'wipe' ||
        lastEventMagnitude >= 180)
    )
  const stageClass =
    view === 'activation'
      ? state.pendingBox
        ? 'is-box-impact'
        : pendingAction?.action === 'forbidden'
          ? 'is-box-opening'
          : 'is-power-casting'
      : view === 'box-target' || view === 'box-reveal'
        ? 'is-box-reveal'
        : view === 'result'
          ? `is-power-impact${dramaticResult ? ' is-dramatic-impact' : ''}`
          : ''
  const winnerReason =
    state.tieBreak?.method === 'round-gain'
      ? `The final Power score was tied, so Round ${CHAMBER_ROUNDS} gains decided it.`
      : state.tieBreak?.method === 'sigil'
        ? 'Power and final-round gains were tied, so the chamber drew unique sigils.'
        : 'The highest final Power score wins.'
  const chamberHistory = (
    <details
      className="mystic-chamber__history"
      open={historyOpen}
      onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
    >
      <summary>
        Chamber history{' '}
        <span>
          {state.events.length} of {totalTurns} actions
        </span>
      </summary>
      {state.events.length === 0 ? (
        <p className="mystic-chamber__empty-history">
          The history will record every choice and score change.
        </p>
      ) : (
        <ol>
          {state.events.map((event, index) => {
            const name =
              state.players.find((player) => player.id === event.actorId)?.name ?? 'Player'
            const changes = event.changes.map((change) => {
              const player = state.players.find((entry) => entry.id === change.playerId)
              return `${player?.name ?? 'Player'} ${change.after - change.before > 0 ? '+' : ''}${change.after - change.before}`
            })
            return (
              <li key={`${event.round}-${event.actorId}-${index}`}>
                <span>R{event.round}</span>
                <span>
                  {name}: {event.message}
                </span>
                <small>{changes.join(' · ') || 'No score change'}</small>
              </li>
            )
          })}
        </ol>
      )}
    </details>
  )

  return (
    <main
      className={`mystic-chamber is-${phase} ${stageClass}`}
      data-phase={phase}
      data-box-effect={state.pendingBox?.effect ?? ''}
      data-box-outcome={
        view === 'result' && state.lastEvent?.action === 'forbidden'
          ? (state.lastEvent.boxOutcome ?? '')
          : ''
      }
      data-testid="mystic-chamber"
    >
      <header className="mystic-chamber__header">
        <div>
          <p className="mystic-chamber__eyebrow">A social strategy game</p>
          <h1>Mystic Chamber</h1>
        </div>
        <div className="mystic-chamber__header-tools">
          <label className="mystic-chamber__autoplay">
            <input
              type="checkbox"
              checked={autoplay}
              onChange={(event) => setAutoplay(event.target.checked)}
            />
            Auto-advance AI turns
          </label>
          <span className="mystic-chamber__round">
            Round {roundLabel} of {CHAMBER_ROUNDS}
          </span>
        </div>
      </header>

      <section className="mystic-chamber__roster" aria-label="Players and Power standings">
        {state.players.map((player) => {
          const active = player.id === resultActorId && view !== 'finished' && !player.eliminated
          const scoreChange =
            view === 'result'
              ? state.lastEvent?.changes.find((change) => change.playerId === player.id)
              : undefined
          const scoreDelta = scoreChange ? scoreChange.after - scoreChange.before : 0
          const resolvedAction =
            state.lastEvent?.action === 'echo'
              ? state.lastEvent.copiedAction
              : state.lastEvent?.action
          const protectedByWard =
            view === 'result' &&
            state.lastEvent?.targetId === player.id &&
            resolvedAction === 'ward'
          const activatedStatus =
            view === 'result' &&
            state.lastEvent?.actorId === player.id &&
            (resolvedAction === 'double' || resolvedAction === 'immunity')
          const canChooseTarget =
            (view === 'target' && targetablePlayers.some((entry) => entry.id === player.id)) ||
            (view === 'box-target' && boxTargetablePlayers.some((entry) => entry.id === player.id))
          const relation = relationshipLabel(player)
          const effects = [
            player.ward ? 'Ward' : '',
            player.immune ? 'Veil' : '',
            player.doubleGain ? 'Primed' : '',
            player.doubleLoss ? 'Hexed' : '',
            player.eliminated ? 'Out' : '',
          ].filter(Boolean)
          return (
            <button
              className={`mystic-chamber__player${active ? ' is-active' : ''}${canChooseTarget ? ' is-targetable' : ''}${selectedTargetId === player.id ? ' is-selected' : ''}${scoreDelta > 0 ? ' is-power-gain' : scoreDelta < 0 ? ' is-power-loss' : ''}${view === 'result' && state.lastEvent?.targetId === player.id && !protectedByWard ? ' is-power-target' : ''}${protectedByWard ? ' is-power-protected' : ''}${activatedStatus ? ' is-power-activation' : ''}`}
              key={player.id}
              type="button"
              disabled={!canChooseTarget}
              onClick={() => setSelectedTargetId(player.id)}
              aria-label={`${player.name}, ${player.power} Power${player.ward ? ', Ward ready' : ''}${relation ? `, ${relation}` : ''}${active ? ', current turn' : ''}`}
            >
              <span className="mystic-chamber__avatar">
                <ChamberAvatar player={player} />
              </span>
              <span className="mystic-chamber__player-info">
                <strong>
                  {player.name === 'You'
                    ? 'You'
                    : `${player.name}${player.isHuman ? ' · You' : ''}`}
                </strong>
                <span>{player.power} Power</span>
                {relation && <small className={`is-${relation.toLowerCase()}`}>{relation}</small>}
                {effects.length > 0 && (
                  <small className="mystic-chamber__effects">{effects.join(' · ')}</small>
                )}
              </span>
              {player.ward && (
                <span className="mystic-chamber__ward" title="Ward blocks one hostile power effect">
                  Ward
                </span>
              )}
              {active && <span className="mystic-chamber__active-mark">Up</span>}
              {scoreChange && scoreDelta !== 0 && (
                <span
                  className={`mystic-chamber__power-float ${scoreDelta > 0 ? 'is-gain' : 'is-loss'}`}
                  aria-hidden="true"
                >
                  {scoreDelta > 0 ? '+' : ''}
                  {scoreDelta}
                </span>
              )}
            </button>
          )
        })}
      </section>

      <section className="mystic-chamber__play-area" aria-live="polite">
        {view === 'choice' && actor.isHuman && !actor.eliminated && (
          <div className="mystic-chamber__decision">
            <p className="mystic-chamber__eyebrow">Your turn · Round {round}</p>
            <h2>Choose a power</h2>
            <div className="mystic-chamber__offers">
              {state.offers.map((action) => {
                const offer = getChamberActionInfo(action, state)
                const openingsLeft = CHAMBER_FORBIDDEN_OPENINGS - state.forbiddenOpeningsUsed
                const used = action === 'forbidden' && openingsLeft <= 0
                return (
                  <button
                    className={`mystic-chamber__offer${action === 'forbidden' ? ' is-forbidden' : ''}${action === 'gamble' ? ' is-gamble' : ''}${used ? ' is-spent' : ''}`}
                    key={action}
                    type="button"
                    disabled={used}
                    onClick={() => {
                      setSelectedAction(action)
                      setView(getChamberActionNeedsTarget(action, state) ? 'target' : 'confirm')
                    }}
                  >
                    <span className="mystic-chamber__offer-symbol" aria-hidden="true">
                      {offer.symbol}
                    </span>
                    <span className="mystic-chamber__offer-copy">
                      <strong>{used ? 'Forbidden Box · opened' : offer.title}</strong>
                      <span>{used ? 'Spent' : offer.description}</span>
                    </span>
                    {action === 'forbidden' && (
                      <small className="mystic-chamber__offer-tag">
                        {used
                          ? 'No openings left'
                          : `${openingsLeft} of ${CHAMBER_FORBIDDEN_OPENINGS} openings left`}
                      </small>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {view === 'choice' && !actor.isHuman && (
          <div className="mystic-chamber__status-card">
            <p className="mystic-chamber__eyebrow">Round {round} · AI turn</p>
            <h2>{actor.name} is weighing the offers…</h2>
            <p>Their choice will appear here before the next turn.</p>
          </div>
        )}

        {view === 'target' && selectedAction && (
          <div className="mystic-chamber__decision">
            <p className="mystic-chamber__eyebrow">Your turn · Round {round}</p>
            <h2>Choose who receives the effect</h2>
            <p>
              {getChamberActionInfo(selectedAction, state).title}:{' '}
              {getChamberActionInfo(selectedAction, state).description}
            </p>
            <p className="mystic-chamber__hint">
              Select a player above to preview the result. You can change your choice before
              confirming.
            </p>
            {selectedTarget && (
              <div className="mystic-chamber__preview">
                <strong>Preview for {selectedTarget.name}</strong>
                <span>{getActionTargetPreview(selectedAction, actor, selectedTarget, state)}</span>
              </div>
            )}
            <div className="mystic-chamber__actions">
              <button
                type="button"
                className="is-secondary"
                onClick={() => {
                  setSelectedAction(null)
                  setSelectedTargetId(null)
                  setView('choice')
                }}
              >
                Back to powers
              </button>
              <button
                type="button"
                disabled={!selectedTarget}
                onClick={() => selectedTarget && startAction(selectedAction, selectedTarget.id)}
              >
                Confirm choice
              </button>
            </div>
          </div>
        )}

        {view === 'confirm' && selectedAction && (
          <div className="mystic-chamber__decision">
            <p className="mystic-chamber__eyebrow">Your turn · Round {round}</p>
            <h2>Confirm {getChamberActionInfo(selectedAction, state).title.toLowerCase()}?</h2>
            <p>{getChamberActionInfo(selectedAction, state).description}</p>
            <p className="mystic-chamber__hint">
              {selectedAction === 'forbidden'
                ? 'Once opened, the box cannot be closed.'
                : 'The chamber answers as soon as you confirm.'}
            </p>
            <div className="mystic-chamber__actions">
              <button
                type="button"
                className="is-secondary"
                onClick={() => {
                  setSelectedAction(null)
                  setView('choice')
                }}
              >
                Change power
              </button>
              <button type="button" onClick={() => startAction(selectedAction)}>
                Confirm power
              </button>
            </div>
          </div>
        )}

        {view === 'activation' && (
          <div
            className={`mystic-chamber__activation${stageClass === 'is-box-opening' || stageClass === 'is-box-reveal' ? ' is-box' : ''}${stageClass === 'is-box-impact' ? ' is-impact' : ''}`}
            role="status"
            aria-live="assertive"
          >
            <span className="mystic-chamber__activation-orbit" aria-hidden="true">
              ✦
            </span>
            <p className="mystic-chamber__eyebrow">
              {stageClass === 'is-box-opening' || stageClass === 'is-box-impact'
                ? 'The Forbidden Box stirs'
                : `Power awakening · ${pendingAction ? getChamberActionInfo(pendingAction.action, state).title : 'Chamber power'}`}
            </p>
            <h2>
              {stageClass === 'is-box-impact'
                ? 'The chamber strikes'
                : stageClass === 'is-box-opening'
                  ? 'The seal is breaking'
                  : `${actor.name} calls on the chamber`}
            </h2>
            <p>
              {stageClass === 'is-box-impact'
                ? 'A force surges toward its target…'
                : stageClass === 'is-box-opening'
                  ? 'Light gathers behind the seal…'
                  : pendingAction?.targetId
                    ? `Target: ${state.players.find((player) => player.id === pendingAction.targetId)?.name ?? 'chosen player'}`
                    : 'The chamber gathers its energy…'}
            </p>
          </div>
        )}

        {view === 'box-reveal' && state.pendingBox && pendingBoxActor && (
          <div className="mystic-chamber__activation is-box" role="status" aria-live="assertive">
            <span className="mystic-chamber__activation-orbit" aria-hidden="true">
              ✦
            </span>
            <p className="mystic-chamber__eyebrow">Forbidden Box · Revealed</p>
            <h2>
              {state.pendingBox.effect === 'execution'
                ? 'An execution seal'
                : state.pendingBox.effect === 'steal'
                  ? 'A power theft'
                  : state.pendingBox.effect === 'hex'
                    ? 'A rival hex'
                    : 'A power exchange'}
            </h2>
            <p>
              {pendingBoxActor.name} sets the revealed force on{' '}
              {state.players.find((player) => player.id === pendingBoxTargetId)?.name ?? 'a rival'}…
            </p>
          </div>
        )}

        {view === 'box-target' && state.pendingBox && pendingBoxActor && (
          <div className="mystic-chamber__decision">
            <p className="mystic-chamber__eyebrow">Forbidden Box · Choose a rival</p>
            <h2>
              {state.pendingBox.effect === 'execution'
                ? 'The box revealed an execution'
                : state.pendingBox.effect === 'steal'
                  ? 'The box revealed a theft'
                  : state.pendingBox.effect === 'hex'
                    ? 'The box revealed a rival hex'
                    : 'The box revealed a Power exchange'}
            </h2>
            <p>Choose a rival to receive the revealed effect.</p>
            {selectedTarget && (
              <div className="mystic-chamber__preview">
                <strong>Preview for {selectedTarget.name}</strong>
                <span>
                  {state.pendingBox.effect === 'execution'
                    ? selectedTarget.ward || selectedTarget.immune
                      ? `${selectedTarget.name} is protected and will survive.`
                      : `${selectedTarget.name} will be eliminated.`
                    : state.pendingBox.effect === 'steal'
                      ? selectedTarget.ward || selectedTarget.immune
                        ? `${selectedTarget.name}'s protection will stop the theft.`
                        : `${selectedTarget.name} loses up to 140 Power; you gain the same amount.`
                      : state.pendingBox.effect === 'hex'
                        ? selectedTarget.immune
                          ? `${selectedTarget.name}'s immunity repels the curse.`
                          : selectedTarget.ward
                            ? `${selectedTarget.name}'s Ward absorbs the curse and fades.`
                            : `Hex ${selectedTarget.name}; their next Power loss will be doubled.`
                        : getBoxExchangePreview(pendingBoxActor, selectedTarget)}
                </span>
              </div>
            )}
            <div className="mystic-chamber__actions">
              <button
                type="button"
                disabled={!selectedTarget}
                onClick={() => {
                  if (!selectedTarget) return
                  setPendingBoxTargetId(selectedTarget.id)
                  setView('activation')
                }}
              >
                Release power
              </button>
            </div>
          </div>
        )}

        {view === 'result' && state.lastEvent && (
          <div className="mystic-chamber__result">
            <p className="mystic-chamber__eyebrow">
              Round {state.lastEvent.round} ·{' '}
              {state.players.find((player) => player.id === state.lastEvent?.actorId)?.name}'s
              action
            </p>
            <h2>{getChamberActionTitle(state.lastEvent.action, state.lastEvent.copiedAction)}</h2>
            <p className="mystic-chamber__result-message">{state.lastEvent.message}</p>
            {state.lastEvent.changes.length > 0 && (
              <ul className="mystic-chamber__changes">
                {state.lastEvent.changes.map((change) => {
                  const player = state.players.find((entry) => entry.id === change.playerId)
                  const difference = change.after - change.before
                  return (
                    <li key={change.playerId}>
                      <strong>{player?.name}</strong>
                      <span>
                        {change.before} → {change.after} Power
                      </span>
                      <b className={difference >= 0 ? 'is-gain' : 'is-loss'}>
                        {difference > 0 ? '+' : ''}
                        {difference}
                      </b>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="mystic-chamber__next-turn">
              {state.completedTurns < totalTurns
                ? `Next up: ${getChamberActor(state).name}`
                : 'All six rounds are complete.'}
            </p>
            <button type="button" onClick={advanceAfterResult}>
              {state.completedTurns < totalTurns ? 'Continue' : 'Show final standings'}
            </button>
            {autoplay && state.lastEvent.actorId !== humanPlayer?.id && (
              <p className="mystic-chamber__autoplay-hint">
                AI auto-advance is on. Pause it or continue now.
              </p>
            )}
          </div>
        )}

        {view === 'round-break' && (
          <div className="mystic-chamber__result">
            <p className="mystic-chamber__eyebrow">
              Round {state.completedTurns / state.players.length} complete
            </p>
            <h2>The chamber shifts</h2>
            <p>Check the Power standings, then continue when you’re ready.</p>
            <button type="button" onClick={() => setView('choice')}>
              Start round {state.completedTurns / state.players.length + 1}
            </button>
          </div>
        )}

        {view === 'eliminated-choice' && (
          <div className="mystic-chamber__result">
            <p className="mystic-chamber__eyebrow">You were eliminated</p>
            <h2>Stay for the final rounds?</h2>
            <p>
              Your Power is now zero. You can watch the chamber finish or skip to the final
              standings.
            </p>
            <div className="mystic-chamber__actions">
              <button type="button" onClick={continueAsSpectator}>
                Watch the rest
              </button>
              <button type="button" className="is-secondary" onClick={skipToResults}>
                Skip to results
              </button>
            </div>
          </div>
        )}

        {view === 'finished' && (
          <div className="mystic-chamber__result mystic-chamber__final">
            <p className="mystic-chamber__eyebrow">Six rounds complete</p>
            <h2>{winner?.name ?? rankedPlayers[0]?.name} wins the chamber</h2>
            <p>
              {winner?.power ?? 0} Power · {winnerReason}
            </p>
            {state.tieBreak?.method === 'sigil' && state.tieBreak.sigils && (
              <p className="mystic-chamber__sigils">
                Final sigils:{' '}
                {state.tieBreak.sigils
                  .map(
                    (sigil) =>
                      `${state.players.find((player) => player.id === sigil.playerId)?.name} ${sigil.value}`
                  )
                  .join(' · ')}
              </p>
            )}
            <ol className="mystic-chamber__standings">
              {rankedPlayers.map((player, index) => (
                <li key={player.id}>
                  <span>{index + 1}</span>
                  <strong>
                    {player.name}
                    {player.id === state.winnerId
                      ? ' · Winner'
                      : player.eliminated
                        ? ' · Eliminated'
                        : ''}
                  </strong>
                  <b>{player.power} Power</b>
                </li>
              ))}
            </ol>
            <button type="button" onClick={finishMinigame}>
              Continue to results
            </button>
            {chamberHistory}
          </div>
        )}
      </section>

      {view !== 'finished' && chamberHistory}
    </main>
  )
}


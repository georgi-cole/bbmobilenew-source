import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { mulberry32 } from '../../store/rng'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper'
import { useGlassBridgeAudio } from '../../hooks/useGlassBridgeAudio'
import {
  chooseAiDoor,
  chooseRoundSeed,
  createInitialParticipants,
  drawCollapsingDoor,
  GATES_OF_THE_EYE_LIVES,
  GATES_OF_THE_EYE_ROUNDS,
  getProfileForRound,
  getShuffledProfiles,
  getStreakBonusPercent,
  getStreakReward,
  rankGateParticipants,
  resolveGateRound,
  type DoorProfile,
  type GateParticipant,
  type RoundResolution,
} from './gatesOfTheEyeLogic'
import './GatesOfTheEye.css'

type Props = GenericMinigameProps

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV']
const MINIGAME_ASSET_BASE = `${import.meta.env.BASE_URL}assets/minigames/gates-of-the-eye/`
const DOOR_ART = [1, 2, 3, 4].map((door) => `${MINIGAME_ASSET_BASE}door-${door}-card.webp`)

function DoorMark({
  index,
  collapsed,
  selected,
}: {
  index: number
  collapsed?: boolean
  selected?: boolean
}) {
  return (
    <svg
      data-door-index={index}
      className={`gate-door-mark${selected ? ' is-selected' : ''}${collapsed ? ' is-collapsed' : ''}`}
      viewBox="0 0 72 92"
      aria-hidden="true"
    >
      <path className="gate-door-mark__outer" d="M8 88V34C8 15 20 4 36 4s28 11 28 30v54H8Z" />
      <path className="gate-door-mark__inner" d="M17 88V35c0-13 8-22 19-22s19 9 19 22v53H17Z" />
      <path
        className="gate-door-mark__line"
        d="M36 14v74M18 60h36M25 88V38c0-8 4-13 11-13s11 5 11 13v50"
      />
      <circle className="gate-door-mark__seal" cx="43" cy="53" r="3" />
      <path className="gate-door-mark__base" d="M3 89h66" />
    </svg>
  )
}

function lifeLabel(player: GateParticipant): string {
  return `${player.lives} ${player.lives === 1 ? 'life' : 'lives'}`
}

function formatRoundLabel(roundOrdinal: number): string {
  return roundOrdinal <= GATES_OF_THE_EYE_ROUNDS
    ? `Round ${roundOrdinal} / ${GATES_OF_THE_EYE_ROUNDS}`
    : `Overtime ${roundOrdinal - GATES_OF_THE_EYE_ROUNDS}`
}

function getDoorIndex(profile: DoorProfile, doorId: string): number {
  return Math.max(
    0,
    profile.doors.findIndex((door) => door.id === doorId)
  )
}

export default function GatesOfTheEye({
  onFinish,
  seed = 0,
  participants: participantProps,
  participantIds,
}: Props) {
  const resolvedParticipants = useMemo(() => {
    const fromProps = participantProps?.length
      ? participantProps
      : participantIds?.map((id, index) => ({
          id,
          name: index === 0 ? 'You' : `Player ${index + 1}`,
          isHuman: index === 0,
        }))
    const seen = new Set<string>()
    const valid = fromProps
      ?.filter((participant) => {
        if (!participant.id || !participant.name || seen.has(participant.id)) return false
        seen.add(participant.id)
        return true
      })
      .slice(0, 16)
    return createInitialParticipants(valid)
  }, [participantIds, participantProps])
  const [players, setPlayers] = useState<GateParticipant[]>(resolvedParticipants)
  const [roundOrdinal, setRoundOrdinal] = useState(1)
  const [phase, setPhase] = useState<'choice' | 'reveal' | 'round-result' | 'final'>('choice')
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [collapsedDoorId, setCollapsedDoorId] = useState<string | null>(null)
  const [revealBeat, setRevealBeat] = useState<'opening' | 'collapse'>('opening')
  const [lastResolution, setLastResolution] = useState<RoundResolution | null>(null)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [showHowTo, setShowHowTo] = useState(false)
  const [resultSent, setResultSent] = useState(false)
  const { playDeath } = useGlassBridgeAudio(false)
  const resultSentRef = useRef(false)
  const deathCueRoundRef = useRef<number | null>(null)
  const gameRootRef = useRef<HTMLDivElement>(null)
  const onFinishRef = useRef(onFinish)
  const isMountedRef = useRef(true)
  const roundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const gameSeed = seed >>> 0
  const profiles = useMemo(() => getShuffledProfiles(gameSeed), [gameSeed])
  const profile = getProfileForRound(profiles, roundOrdinal)
  const activePlayers = useMemo(() => players.filter((player) => player.lives > 0), [players])
  const human = players.find((player) => player.isHuman) ?? players[0]
  const humanIsActive = Boolean(human && human.lives > 0)
  const humanCrossing = lastResolution?.crossings.find(
    (crossing) => crossing.participantId === human?.id
  )
  const humanHitAtCollapse = Boolean(
    phase === 'reveal' &&
    revealBeat === 'collapse' &&
    human &&
    choices[human.id] === collapsedDoorId
  )
  const humanHitForAnimation = Boolean(
    humanHitAtCollapse ||
    ((phase === 'round-result' || phase === 'final') && humanCrossing?.collapsed)
  )
  const humanWillBeEliminated = Boolean(
    humanHitAtCollapse ? human?.lives === 1 : humanHitForAnimation && human?.lives === 0
  )
  const humanNextStreak = (human?.streak ?? 0) + 1
  const humanNextBonusPercent = getStreakBonusPercent(humanNextStreak)
  const rankedPlayers = useMemo(
    () => (winnerId ? rankGateParticipants(players, winnerId) : []),
    [players, winnerId]
  )

  useEffect(() => {
    onFinishRef.current = onFinish
  }, [onFinish])

  useEffect(() => {
    if (!humanHitAtCollapse || deathCueRoundRef.current === roundOrdinal) return
    deathCueRoundRef.current = roundOrdinal
    playDeath()
  }, [humanHitAtCollapse, playDeath, roundOrdinal])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (roundTimerRef.current) clearTimeout(roundTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'reveal') return
    roundTimerRef.current = setTimeout(() => {
      setRevealBeat('collapse')
      roundTimerRef.current = setTimeout(() => {
        const roundProfile = getProfileForRound(profiles, roundOrdinal)
        const resolution = resolveGateRound({
          participants: players,
          choices,
          profile: roundProfile,
          collapsedDoorId: collapsedDoorId!,
          roundOrdinal,
          isOvertime: roundOrdinal > GATES_OF_THE_EYE_ROUNDS,
        })
        if (!isMountedRef.current) return
        setPlayers(resolution.participants)
        setLastResolution(resolution)
        setWinnerId(resolution.winnerId)
        setPhase(resolution.winnerId ? 'final' : 'round-result')
      }, 1500)
    }, 1150)
    return () => {
      if (roundTimerRef.current) clearTimeout(roundTimerRef.current)
      roundTimerRef.current = null
    }
  }, [choices, collapsedDoorId, phase, players, profiles, roundOrdinal])

  const beginRound = useCallback(
    (humanDoorId?: string) => {
      const active = players.filter((player) => player.lives > 0)
      if (active.length === 0) return
      const nextProfile = getProfileForRound(profiles, roundOrdinal)
      const nextChoices: Record<string, string> = {}
      for (const player of active) {
        if (player.isHuman) {
          if (humanDoorId) nextChoices[player.id] = humanDoorId
          continue
        }
        const aiRng = mulberry32(chooseRoundSeed(gameSeed, roundOrdinal, `ai-choice:${player.id}`))
        nextChoices[player.id] = chooseAiDoor({
          participant: player,
          activeParticipants: active,
          profile: nextProfile,
          roundOrdinal,
          rng: aiRng,
        })
      }
      if (humanIsActive && !humanDoorId) return
      const collapseRng = mulberry32(chooseRoundSeed(gameSeed, roundOrdinal, 'shared-collapse'))
      const collapsed = drawCollapsingDoor(nextProfile, collapseRng)
      setChoices(nextChoices)
      setSelectedDoorId(humanDoorId ?? null)
      setCollapsedDoorId(collapsed)
      setRevealBeat('opening')
      setPhase('reveal')
    },
    [gameSeed, humanIsActive, players, profiles, roundOrdinal]
  )

  const handleLockChoice = useCallback(() => {
    if (!selectedDoorId || phase !== 'choice') return
    beginRound(selectedDoorId)
  }, [beginRound, phase, selectedDoorId])

  const handleContinue = useCallback(() => {
    setRoundOrdinal((value) => value + 1)
    setSelectedDoorId(null)
    setChoices({})
    setCollapsedDoorId(null)
    setRevealBeat('opening')
    setLastResolution(null)
    setPhase('choice')
    gameRootRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleFinish = useCallback(() => {
    if (!winnerId || resultSentRef.current) return
    resultSentRef.current = true
    setResultSent(true)
    const ranked = rankGateParticipants(players, winnerId)
    const rawResults = Object.fromEntries(
      ranked.map((player, index) => [player.id, (ranked.length - index) * 1_000_000 + player.score])
    )
    const humanResult = human ? (rawResults[human.id] ?? 0) : 0
    onFinishRef.current?.(humanResult, undefined, {
      authoritativeWinnerId: winnerId,
      authoritativeLastPlaceId: ranked.at(-1)?.id ?? null,
      authoritativeRankedIds: ranked.map((player) => player.id),
      rawValue: humanResult,
      rawResults,
    })
  }, [human, players, winnerId])

  const handleSelectDoor = (doorId: string) => {
    if (phase !== 'choice' || !humanIsActive) return
    setSelectedDoorId((current) => (current === doorId ? null : doorId))
  }

  const collapsedDoorIndex = collapsedDoorId ? getDoorIndex(profile, collapsedDoorId) : -1

  if (phase === 'final' && winnerId) {
    const winner = players.find((player) => player.id === winnerId)
    const placements = rankedPlayers.map((player, index) => (
      <div className="gate-final-row" role="listitem" key={player.id}>
        <span className="gate-final-row__rank">{index + 1}</span>
        <span className="gate-final-row__name">
          {player.name}
          {player.isHuman ? ' · You' : ''}
        </span>
        <strong>{player.score}</strong>
        <span>{player.lives} ♥</span>
      </div>
    ))
    return (
      <div
        className="gate-game gate-game--final"
        style={
          {
            '--gate-temple-wide': `url("${MINIGAME_ASSET_BASE}temple.webp")`,
            '--gate-temple-mobile': `url("${MINIGAME_ASSET_BASE}temple-mobile.webp")`,
          } as CSSProperties
        }
      >
        <div className="gate-final-scene" aria-hidden="true" />
        <MinigameCompleteWrapper
          className="gate-complete gate-glass-surface"
          placementsNode={placements}
          placementsRole="list"
          placementsAriaLabel="Final standings"
          onContinue={handleFinish}
          continueLabel={resultSent ? 'Result recorded' : 'Continue'}
          continueButtonClassName="gate-primary gate-primary--complete"
        >
          <div className="gate-final-hero">
            <img
              className="gate-final-door-art"
              src={DOOR_ART[collapsedDoorIndex >= 0 ? collapsedDoorIndex : 0]}
              alt=""
              aria-hidden="true"
            />
            <div className="gate-final-eye" aria-hidden="true">
              ◉
            </div>
            <p className="gate-eyebrow">The Eye has chosen</p>
            <h1>
              {winner?.isHuman ? 'You survived the Eye' : `${winner?.name ?? 'A rival'} survived`}
            </h1>
            <p className="gate-final-subtitle">
              {winner?.score ?? 0} points · {winner?.lives ?? 0} lives remaining
            </p>
            {winner?.lives === 0 && (
              <p className="gate-final-subtitle">
                The final crossings collapsed together. Highest score wins.
              </p>
            )}
          </div>
        </MinigameCompleteWrapper>
      </div>
    )
  }

  const resultCopy = (() => {
    if (!lastResolution) return null
    if (lastResolution.reprievedIds.length > 0) {
      return {
        title: 'The Eye cannot decide',
        text: 'Everyone in the final group fell, and the top score was tied. The whole group gets one life back.',
      }
    }
    if (humanCrossing?.collapsed) {
      return {
        title: human?.lives === 0 ? 'The Eye has claimed you' : 'Your door collapsed',
        text:
          human?.lives === 0
            ? 'You are eliminated. Your banked points are safe; your streak is broken.'
            : 'You lose one life. Your banked points are safe; your streak resets to zero.',
      }
    }
    if (humanCrossing) {
      return {
        title: `Safe crossing · +${humanCrossing.pointsGained}`,
        text:
          humanCrossing.streakBonusPercent > 0
            ? `Your points are banked. A ${humanCrossing.streakBonusPercent}% streak bonus was added.`
            : humanCrossing.streakAfter === 1
              ? 'Your points are banked. Survive one more round in a row to earn a 10% bonus.'
              : 'Your points are banked. The next round brings a new set of doors.',
      }
    }
    return {
      title: 'The crossing is complete',
      text: 'Watch the remaining players face the next set of doors.',
    }
  })()

  return (
    <div
      className={`gate-game${humanHitForAnimation ? ' gate-game--hit' : ''}${humanWillBeEliminated ? ' gate-game--eliminated' : ''}`}
      ref={gameRootRef}
      style={
        {
          '--gate-temple-wide': `url("${MINIGAME_ASSET_BASE}temple.webp")`,
          '--gate-temple-mobile': `url("${MINIGAME_ASSET_BASE}temple-mobile.webp")`,
        } as CSSProperties
      }
    >
      <div className="gate-game__backdrop" aria-hidden="true" />
      {humanHitForAnimation && (
        <div
          className={`gate-impact${humanWillBeEliminated ? ' gate-impact--eliminated' : ''}`}
          aria-hidden="true"
        >
          <span className="gate-impact__label">
            {humanWillBeEliminated ? 'ELIMINATED' : 'LIFE LOST'}
          </span>
          <span className="gate-impact__shard gate-impact__shard--one" />
          <span className="gate-impact__shard gate-impact__shard--two" />
          <span className="gate-impact__shard gate-impact__shard--three" />
          <span className="gate-impact__shard gate-impact__shard--four" />
          <span className="gate-impact__shard gate-impact__shard--five" />
          <span className="gate-impact__shard gate-impact__shard--six" />
          <span className="gate-impact__shard gate-impact__shard--seven" />
          <span className="gate-impact__shard gate-impact__shard--eight" />
        </div>
      )}
      <main className="gate-game__main">
        <header className="gate-header">
          <div className="gate-header__brand">
            <button
              className="gate-header__eye"
              type="button"
              aria-label={showHowTo ? 'Close game rules' : 'Show game rules'}
              aria-expanded={showHowTo}
              title={showHowTo ? 'Close game rules' : 'Show game rules'}
              onClick={() => setShowHowTo((value) => !value)}
            >
              <span aria-hidden="true">◉</span>
            </button>
            <div>
              <p className="gate-eyebrow">The Big Eye presents</p>
              <h1>Bigg Gates</h1>
            </div>
          </div>
        </header>

        {showHowTo && (
          <section
            className="gate-howto game-ui-surface gate-glass-surface"
            aria-label="How to play"
          >
            <strong>Pick a door. Keep your streak alive.</strong>
            <span>
              Start with 3 lives. One shared door collapses: its players lose a life and reset their
              streak; everyone else scores the door’s points plus any streak bonus earned. Your
              second safe crossing in a row earns +10%, then each later one adds +5 percentage
              points. Last player standing wins, or highest score after Round 10.
            </span>
          </section>
        )}

        <section
          className="gate-status game-ui-surface gate-glass-surface"
          aria-label="Match status"
        >
          <div className="gate-status__round">
            <span className="game-ui-eyebrow">
              {roundOrdinal > 10 ? 'TIEBREAKER' : 'CURRENT ROUND'}
            </span>
            <strong>{formatRoundLabel(roundOrdinal)}</strong>
          </div>
          <div className="gate-status__your-score">
            <span className="game-ui-eyebrow">YOUR SCORE</span>
            <strong>{human?.score ?? 0}</strong>
            {human && human.streak > 0 && (
              <small className="gate-status__streak">
                {human.streak} safe · +{getStreakBonusPercent(human.streak + 1)}% next
              </small>
            )}
          </div>
          <div
            className={`gate-lives${phase === 'round-result' && humanCrossing?.collapsed ? ' is-hit' : ''}`}
            aria-label={human ? lifeLabel(human) : 'No lives'}
          >
            <span className="game-ui-eyebrow">LIVES</span>
            <strong aria-hidden="true">
              {Array.from({ length: GATES_OF_THE_EYE_LIVES }, (_, index) => (
                <span
                  className={`${index < (human?.lives ?? 0) ? 'is-lit' : ''}${phase === 'round-result' && humanCrossing?.collapsed && index === (human?.lives ?? 0) ? ' is-losing' : ''}`}
                  key={index}
                >
                  ♥
                </span>
              ))}
            </strong>
          </div>
          <div className="gate-status__active">
            <span className="game-ui-eyebrow">STILL IN</span>
            <strong>{activePlayers.length}</strong>
          </div>
        </section>

        <section
          className={`gate-stage${phase === 'choice' ? ' gate-stage--choice' : ''}`}
          aria-live="polite"
        >
          {phase === 'choice' && (
            <>
              <div className="gate-prompt">
                <div>
                  <p className="gate-eyebrow">A new set. A new gamble.</p>
                  <h2>
                    {humanIsActive ? 'Which door do you trust?' : 'The other players choose.'}
                  </h2>
                </div>
              </div>

              {humanIsActive ? (
                <>
                  <div
                    className={`gate-door-grid${selectedDoorId ? ' is-expanded' : ''}`}
                    role="radiogroup"
                    aria-label="Choose a door"
                  >
                    {profile.doors.map((door, index) => {
                      const selected = selectedDoorId === door.id
                      return (
                        <button
                          type="button"
                          key={door.id}
                          role="radio"
                          aria-checked={selected}
                          aria-hidden={Boolean(selectedDoorId && !selected)}
                          tabIndex={selectedDoorId && !selected ? -1 : 0}
                          className={`gate-door-card gate-door-card--${index + 1}${selected ? ' is-selected is-expanded' : ''}`}
                          onClick={() => handleSelectDoor(door.id)}
                        >
                          <div className="gate-door-card__visual">
                            <img className="gate-door-card__art" src={DOOR_ART[index]} alt="" />
                            <span className="gate-door-card__roman">{ROMAN_NUMERALS[index]}</span>
                          </div>
                          <div className="gate-door-card__details">
                            <div className="gate-door-card__offer">
                              <strong>+{getStreakReward(door.points, humanNextStreak)}</strong>
                              <span>points</span>
                              {humanNextBonusPercent > 0 && (
                                <em>+{humanNextBonusPercent}% streak</em>
                              )}
                            </div>
                            <div className="gate-door-card__risk">
                              <span className="gate-door-card__risk-label">RISK</span>
                              <strong>{door.collapseChance}%</strong>
                            </div>
                            <div className="gate-door-card__risk-meter" aria-hidden="true">
                              <span style={{ width: `${door.collapseChance}%` }} />
                            </div>
                          </div>
                          {selected && <span className="gate-door-card__picked">SELECTED</span>}
                        </button>
                      )
                    })}
                  </div>
                  {selectedDoorId && (
                    <div className="gate-action-dock">
                      <button
                        type="button"
                        className="gate-secondary gate-secondary--change"
                        onClick={() => setSelectedDoorId(null)}
                      >
                        Change door
                      </button>
                      <button
                        type="button"
                        className="gate-primary gate-primary--seal"
                        onClick={handleLockChoice}
                      >
                        Seal Door {ROMAN_NUMERALS[getDoorIndex(profile, selectedDoorId)]}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="gate-spectator-card game-ui-surface gate-glass-surface">
                  <div className="gate-spectator-card__icon" aria-hidden="true">
                    ◉
                  </div>
                  <div>
                    <strong>You have been eliminated</strong>
                    <p>
                      Watch the remaining players choose. Their outcomes still follow the same
                      shared odds.
                    </p>
                  </div>
                  <button type="button" className="gate-primary" onClick={() => beginRound()}>
                    Watch this round
                  </button>
                </div>
              )}
            </>
          )}

          {phase === 'reveal' && (
            <section className="gate-reveal game-ui-surface gate-glass-surface">
              <p className="gate-eyebrow">Choices sealed</p>
              <h2>The Eye is watching…</h2>
              <div className="gate-reveal__eye" aria-hidden="true">
                ◉
              </div>
              <div className="gate-reveal__doors" aria-label="The four doors opening">
                {profile.doors.map((door, index) => {
                  const choosers = activePlayers.filter((player) => choices[player.id] === door.id)
                  const isCollapsing = revealBeat === 'collapse' && door.id === collapsedDoorId
                  return (
                    <div
                      className={`gate-reveal-door gate-reveal-door--${index + 1}${isCollapsing ? ' is-collapsing' : ''}`}
                      key={door.id}
                    >
                      <img src={DOOR_ART[index]} alt="" />
                      <span className="gate-reveal-door__cracks" aria-hidden="true">
                        <svg viewBox="0 0 100 150" preserveAspectRatio="none">
                          <path d="M51 3 45 20 54 28 42 42 48 52 36 64 43 76 31 91 37 101 25 116 30 128 20 148" />
                          <path d="m45 20-13-6-8-12m30 26 14-4 9-12m-35 30-14 4-10 13m19 14 15-3 13 9m-18 8-15 1-11 11m14 6 13 6 8 13" />
                        </svg>
                      </span>
                      <span className="gate-reveal-door__number">{ROMAN_NUMERALS[index]}</span>
                      <span className="gate-reveal-door__offer">+{door.points}</span>
                      {choosers.length > 0 && (
                        <span
                          className="gate-reveal-door__players"
                          aria-label={`${choosers.length} chose this door`}
                        >
                          {choosers.slice(0, 5).map((player) => (
                            <span key={player.id} title={player.isHuman ? 'You' : player.name}>
                              {player.name.slice(0, 1).toUpperCase()}
                            </span>
                          ))}
                          {choosers.length > 5 && <i>+{choosers.length - 5}</i>}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="gate-reveal__choices">
                {activePlayers.map((player) => {
                  const doorId = choices[player.id]
                  const index = getDoorIndex(profile, doorId)
                  return (
                    <div className="gate-reveal-player" key={player.id}>
                      <span className="gate-reveal-player__avatar">
                        {player.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>{player.isHuman ? 'You' : player.name}</span>
                      <span className={`gate-mini-door gate-mini-door--${index + 1}`}>
                        {ROMAN_NUMERALS[index]}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="gate-reveal__caption">
                {revealBeat === 'collapse'
                  ? 'The Eye is choosing…'
                  : 'The sealed doors are opening…'}
              </p>
            </section>
          )}

          {phase === 'round-result' && lastResolution && resultCopy && (
            <section className="gate-round-result game-ui-surface gate-glass-surface">
              <div
                className={`gate-round-result__door${collapsedDoorIndex >= 0 ? ` gate-round-result__door--${collapsedDoorIndex + 1}` : ''}`}
              >
                {collapsedDoorIndex >= 0 && <DoorMark index={collapsedDoorIndex} collapsed />}
                <span>
                  {collapsedDoorIndex >= 0
                    ? `DOOR ${ROMAN_NUMERALS[collapsedDoorIndex]} COLLAPSED`
                    : 'THE DOORS HAVE SETTLED'}
                </span>
              </div>
              <p className="gate-eyebrow">{lastResolution.roundLabel} complete</p>
              <h2>{resultCopy.title}</h2>
              <p className="gate-round-result__copy">{resultCopy.text}</p>
              <div className="gate-round-result__players" role="list" aria-label="Round results">
                {players.map((player) => {
                  const crossing = lastResolution.crossings.find(
                    (result) => result.participantId === player.id
                  )
                  return (
                    <div
                      className={`gate-result-player${player.lives === 0 ? ' is-out' : ''}${
                        crossing?.collapsed ? ' is-hit' : ''
                      }`}
                      key={player.id}
                      role="listitem"
                    >
                      <span className="gate-result-player__name">
                        {player.isHuman ? 'You' : player.name}
                      </span>
                      <span className="gate-result-player__standing">
                        {player.score} pts <i>{player.lives} ♥</i>
                      </span>
                      <strong className="gate-result-player__outcome">
                        {crossing?.collapsed
                          ? '−1 life'
                          : crossing
                            ? `+${crossing.pointsGained}`
                            : player.lives > 0
                              ? 'Watching'
                              : 'Out'}
                        {crossing && (
                          <small>
                            {crossing.collapsed
                              ? 'Streak reset'
                              : `Streak ×${crossing.streakAfter}${crossing.streakBonusPercent > 0 ? ` · +${crossing.streakBonusPercent}%` : ''}`}
                          </small>
                        )}
                      </strong>
                      {player.lives === 0 && <em>OUT</em>}
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                className="gate-primary gate-primary--round"
                onClick={handleContinue}
              >
                Round {roundOrdinal + 1}
              </button>
            </section>
          )}
        </section>
      </main>
    </div>
  )
}

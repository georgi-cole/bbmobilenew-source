import { useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { GenericMinigameProps } from '../../reactComponents'
import { useCompetitionResultCheckpoint } from '../../competitionResultContext'
import { ChallengePortrait, ChallengeStage } from '../ChallengeStage'
import { getSocialChallengeArtwork } from '../cinematicArtwork'
import { useChallengeAudio } from '../useChallengeAudio'
import { buildChallengeCompletion, getChallengePlayers, socialPreference } from '../shared'
import type { ChallengePlayer } from '../shared'
import {
  BALLOT_LIMIT,
  STARTING_FLAMES,
  collectLastLightSelections,
  createDicePicks,
  evaluateLastLightBallot,
  getActivePlayers,
  getDonationTargets,
  getLastLightDieSides,
  getProtectionTargets,
  initialFlames,
  rankLastLight,
  resolveLastLightBallot,
  resolveLastLightDonations,
  rollLastLightDie,
  type LastLightBallot,
} from './lastLightLogic'
import { LastLightCandle, LastLightCeremony } from './LastLightCeremony'
import { LastLightPortraitWall } from './LastLightPortraitWall'
import './LastLight.css'

const CHOICE_DURATION_MS = 23_000
const DONATION_DURATION_MS = 12_000
const BALLOT_SEAL_MS = 1_550
const PROTECTION_REVEAL_MS = 2_650
const FIRST_FLAME_MS = 850
const FLAME_INTERVAL_MS = 430
const ELIMINATION_HOLD_MS = 360
const WARD_LOCK_MS = 740
const DICE_ALTAR_MS = 1_900
const DICE_LAND_WIN_MS = 2_300
const DICE_LAND_MISS_MS = 1_050
const ARTWORK = {
  background: 'last-light.webp',
  reading: 'last-light-reading.webp',
  candles: 'last-light-candles.webp',
  altar: 'last-light-altar.webp',
  candle: 'last-light-prop-candle.webp',
  flame: 'last-light-prop-flame.webp',
  ward: 'last-light-prop-protection.webp',
}

function diceRollDuration(rolls: number) {
  return rolls >= 3 ? 900 : 1_480
}

type Phase =
  | 'intro'
  | 'donation'
  | 'ballot'
  | 'sealed'
  | 'reveal'
  | 'consequence'
  | 'altar'
  | 'dice-pick'
  | 'rolling'
  | 'die-landed'
  | 'end'

interface DiceStage {
  finalists: string[]
  picks: Record<string, number>
  rolls: number
  lastFace?: number
  winnerId?: string
}

interface Match {
  phase: Phase
  round: number
  deadline: number
  flames: Record<string, number>
  eliminated: string[][]
  latestBallot?: LastLightBallot
  target?: string
  gifts?: Record<string, string>
  rejectedGift?: string
  winnerId?: string
  die?: DiceStage
}

const copy = {
  title: 'The Last Light',
  subtitle: 'Choose whose flame stays lit.',
  opening: 'Protect another contestant each ballot. Anyone left unprotected loses one flame.',
  ending: 'At zero flames, you’re out. Tied leaders can face a roll of the dice.',
  enter: 'Light the chamber',
  pick: 'Select a portrait to see their details.',
  sealed: 'The ballots are sealed.',
  lock: 'Seal protection',
  spectating: 'The remaining contestants are choosing.',
  everyone: 'Every flame stays lit.',
  wipe: 'No flames go out this ballot.',
  next: 'Continue',
  dice: 'The Dice Finale',
  pickFace: 'Claim a number. The first claimed number rolled wins.',
  lockFace: 'Claim number',
  rolling: 'The die is rolling.',
  unclaimed: 'Unclaimed. Roll again.',
  skip: 'Skip to results',
  unavailable: 'The chamber needs at least two contestants.',
  exit: 'Continue',
}

function startMatch(players: readonly ChallengePlayer[], autoStart?: boolean): Match {
  return {
    phase: autoStart === false ? 'intro' : 'ballot',
    round: 1,
    deadline: Date.now() + CHOICE_DURATION_MS,
    flames: initialFlames(players.map((player) => player.id)),
    eliminated: [],
  }
}

function Flames({ remaining }: { remaining: number }) {
  return (
    <span className="last-light__flames" role="img" aria-label={`${remaining} flames remaining`}>
      {Array.from({ length: STARTING_FLAMES }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={
            index < remaining ? 'last-light__flame last-light__flame--lit' : 'last-light__flame'
          }
        />
      ))}
    </span>
  )
}

const pipPositions: Readonly<Record<number, number[]>> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function DiePips({ face }: { face: number }) {
  return Array.from({ length: 9 }, (_, index) => (
    <span
      key={index}
      className={pipPositions[face].includes(index) ? 'last-light__pip' : undefined}
    />
  ))
}

function Die({
  sides,
  face,
  rolling,
  duration,
}: {
  sides: 6 | 8
  face?: number
  rolling: boolean
  duration: number
}) {
  if (rolling && sides === 6) {
    return (
      <div
        className="last-light__die last-light__cube"
        style={{ animationDuration: `${duration}ms` }}
        aria-hidden="true"
      >
        {Object.keys(pipPositions)
          .map(Number)
          .map((number) => (
            <div key={number} className="last-light__die last-light__die--d6 last-light__cube-face">
              <DiePips face={number} />
            </div>
          ))}
      </div>
    )
  }
  return (
    <div
      className={`last-light__die last-light__die--d${sides}${rolling ? ' last-light__die--rolling' : ''}`}
      style={rolling ? { animationDuration: `${duration}ms` } : undefined}
      aria-hidden="true"
    >
      {sides === 8 ? <span>{face ?? '?'}</span> : <DiePips face={face ?? 5} />}
    </div>
  )
}

function connectionCue(props: GenericMinigameProps, from: string, to: string): string {
  const tags = props.relationships?.[from]?.[to]?.tags ?? []
  const ally =
    tags.includes('alliance') ||
    props.alliances?.some(
      (alliance) =>
        (alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY') &&
        alliance.memberIds.includes(from) &&
        alliance.memberIds.includes(to)
    )
  const bond = tags.includes('romance')
    ? 'Romance'
    : tags.includes('bromance')
      ? 'Bromance'
      : tags.includes('friendship')
        ? 'Friendship'
        : undefined
  const feeling = socialPreference(props, from, to)
  const connection = [
    tags.includes('pact') ? 'Pact' : undefined,
    ally ? 'Alliance' : undefined,
    bond,
    tags.includes('rivalry') ? 'Rivalry' : feeling < -0.26 ? 'Suspicion' : undefined,
  ].filter(Boolean)
  return connection.join(' · ') || (feeling > 0.25 ? 'Friendly' : 'Neutral')
}

export default function LastLight(props: GenericMinigameProps) {
  const [players] = useState(() => getChallengePlayers(props))
  const [humanId] = useState(() => players.find((player) => player.isHuman)?.id)
  const [match, setMatch] = useState(() => startMatch(players, props.autoStart))
  const [target, setTarget] = useState<string>()
  const [face, setFace] = useState<number>()
  const [clock, setClock] = useState(() => Date.now())
  const [fastForward, setFastForward] = useState(false)
  const submitted = useRef(false)
  const playSound = useChallengeAudio('last-light')
  const [artwork] = useState(() => getSocialChallengeArtwork(props.premiumPresentation, ARTWORK))
  const prefersReducedMotion = useReducedMotion()
  const still = !artwork || prefersReducedMotion === true
  const active = getActivePlayers(match.flames)
  const { phase, die, round, deadline } = match
  const ballot = match.latestBallot
  const donationTargets =
    phase === 'donation' && humanId ? getDonationTargets(match.flames, humanId) : []
  const lastSavedByYou = humanId ? ballot?.votes[humanId] : undefined
  const eligibleTargets = humanId ? getProtectionTargets(active, humanId, lastSavedByYou) : []
  const losses = useMemo(() => {
    if (!ballot || ballot.preventedWipe) return []
    const unprotected = new Set(ballot.unprotected)
    let cue = FIRST_FLAME_MS
    return players
      .filter(({ id }) => unprotected.has(id))
      .map((player) => ({ player, flames: ballot.flames[player.id] }))
      .sort((a, b) => Number(a.flames === 0) - Number(b.flames === 0))
      .map((loss) => {
        if (loss.flames === 0) cue += ELIMINATION_HOLD_MS
        const next = { ...loss, cue }
        cue += FLAME_INTERVAL_MS
        return next
      })
  }, [ballot, players])
  const firstCue = losses[0]?.cue
  const finalCue = losses.find(({ flames }) => flames === 0)?.cue
  const lastCue = losses.at(-1)?.cue
  const ceremonyMs = still
    ? 480
    : lastCue === undefined
      ? 980
      : lastCue + (finalCue === undefined ? 1_030 : 2_500)
  const humanCanVote = Boolean(humanId && active.includes(humanId))
  const humanCanRoll = Boolean(humanId && die?.finalists.includes(humanId))
  const waitingForHuman =
    phase === 'donation' ||
    (phase === 'ballot' && humanCanVote && eligibleTargets.length > 0) ||
    (phase === 'dice-pick' && humanCanRoll)
  const seed = props.seed
  const relationships = props.relationships
  const alliances = props.alliances
  const preference = useCallback(
    (from: string, to: string) => socialPreference({ relationships, alliances }, from, to),
    [relationships, alliances]
  )

  const advance = useCallback(
    (pickedTarget?: string, pickedFace?: number) => {
      const now = Date.now()
      const nextDeadline = now + CHOICE_DURATION_MS
      setClock(now)
      setMatch((current) => {
        if (current !== match) return current
        switch (current.phase) {
          case 'intro':
            return { ...current, phase: 'ballot', deadline: nextDeadline }
          case 'donation': {
            const gift = now < current.deadline ? pickedTarget : undefined
            const { flames, accepted } = resolveLastLightDonations({
              flames: current.flames,
              round: current.round,
              seed,
              preference,
              human: humanId ? { id: humanId, target: gift } : undefined,
            })
            return {
              ...current,
              phase: 'ballot',
              deadline: nextDeadline,
              flames,
              gifts: accepted,
              rejectedGift: humanId && gift && !accepted[humanId] ? gift : undefined,
            }
          }
          case 'ballot':
            return {
              ...current,
              phase: 'sealed',
              target: now < current.deadline ? pickedTarget : undefined,
            }
          case 'sealed': {
            const previousVotes = current.latestBallot?.votes ?? {}
            const selections = collectLastLightSelections({
              flames: current.flames,
              previousVotes,
              round: current.round,
              seed,
              preference,
              human: humanId ? { id: humanId, target: current.target } : undefined,
            })
            const ballot = resolveLastLightBallot({
              flames: current.flames,
              selections,
              previousVotes,
              round: current.round,
              seed,
            })
            return {
              ...current,
              phase: 'reveal',
              latestBallot: ballot,
            }
          }
          case 'reveal': {
            const ballot = current.latestBallot!
            return {
              ...current,
              phase: 'consequence',
              flames: ballot.flames,
              eliminated: ballot.eliminated.length
                ? [...current.eliminated, ballot.eliminated]
                : current.eliminated,
            }
          }
          case 'consequence': {
            const result = evaluateLastLightBallot(current.latestBallot!)
            if (result.kind === 'winner') {
              return { ...current, phase: 'end', winnerId: result.winnerId }
            }
            if (result.kind === 'dice') {
              return {
                ...current,
                phase: 'altar',
                die: { finalists: result.finalists, picks: {}, rolls: 0 },
              }
            }
            const canDonate = humanId && getDonationTargets(current.flames, humanId).length > 0
            const nextRound = current.round + 1
            const automatic = canDonate
              ? undefined
              : resolveLastLightDonations({
                  flames: current.flames,
                  round: nextRound,
                  seed,
                  preference,
                  human: humanId ? { id: humanId } : undefined,
                })
            return {
              ...current,
              phase: canDonate ? 'donation' : 'ballot',
              round: nextRound,
              flames: automatic?.flames ?? current.flames,
              deadline: canDonate ? now + DONATION_DURATION_MS : nextDeadline,
              target: undefined,
              gifts: automatic?.accepted,
              rejectedGift: undefined,
            }
          }
          case 'altar':
            return { ...current, phase: 'dice-pick', deadline: nextDeadline }
          case 'dice-pick': {
            const previousDie = current.die!
            const picks = createDicePicks({
              finalists: previousDie.finalists,
              human: humanId,
              face: pickedFace,
              seed,
              round: current.round,
            })
            return { ...current, phase: 'rolling', die: { ...previousDie, picks } }
          }
          case 'rolling': {
            const previousDie = current.die!
            const { face, winnerId } = rollLastLightDie(
              previousDie.picks,
              previousDie.rolls,
              current.round,
              seed
            )
            return {
              ...current,
              phase: 'die-landed',
              die: { ...previousDie, rolls: previousDie.rolls + 1, lastFace: face, winnerId },
            }
          }
          case 'die-landed':
            return current.die?.winnerId
              ? { ...current, phase: 'end', winnerId: current.die.winnerId }
              : { ...current, phase: 'rolling' }
          case 'end':
            return current
        }
      })
    },
    [humanId, match, preference, seed]
  )

  useEffect(() => {
    if (players.length < 2 || phase === 'intro' || phase === 'end') return
    let delay: number
    if (waitingForHuman) delay = Math.max(0, deadline - Date.now())
    else if (fastForward) delay = 55
    else if (phase === 'sealed') delay = still ? 650 : BALLOT_SEAL_MS
    else if (phase === 'reveal') delay = still ? 1_300 : PROTECTION_REVEAL_MS
    else if (phase === 'consequence') delay = ceremonyMs + 2_250
    else if (phase === 'altar') delay = still ? 800 : DICE_ALTAR_MS
    else if (phase === 'rolling') delay = still ? 650 : diceRollDuration(die?.rolls ?? 0)
    else if (phase === 'die-landed')
      delay = still ? 800 : die?.winnerId ? DICE_LAND_WIN_MS : DICE_LAND_MISS_MS
    else delay = 1_750
    const timeout = window.setTimeout(() => {
      setTarget(undefined)
      setFace(undefined)
      advance()
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [
    advance,
    ceremonyMs,
    deadline,
    die,
    fastForward,
    phase,
    players.length,
    still,
    waitingForHuman,
  ])

  useEffect(() => {
    if (!waitingForHuman || players.length < 2) return
    const interval = window.setInterval(() => setClock(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [players.length, waitingForHuman])

  useEffect(() => {
    if (fastForward) return
    if (phase === 'sealed') playSound('lock')
    if (phase === 'reveal' || phase === 'altar') playSound('reveal')
    if (phase === 'consequence' && match.latestBallot?.savedEveryone) playSound('link')
    if (phase === 'rolling') playSound('roll')
    if (phase === 'die-landed') playSound(die?.winnerId ? 'success' : 'draw')
    if (phase === 'end' && !die?.winnerId) playSound('success')
  }, [die?.winnerId, fastForward, match.latestBallot?.savedEveryone, phase, playSound])

  useEffect(() => {
    if (phase === 'ballot' && match.gifts && Object.keys(match.gifts).length > 0 && !fastForward)
      playSound('link')
  }, [fastForward, match.gifts, phase, playSound])

  useEffect(() => {
    if (fastForward) return
    if (phase === 'reveal' && ballot) {
      const focusId = humanId && humanId in ballot.votes ? humanId : Object.keys(ballot.votes)[0]
      if (!Object.values(ballot.votes).includes(focusId)) return
      const timeout = window.setTimeout(() => playSound('link'), still ? 200 : WARD_LOCK_MS)
      return () => window.clearTimeout(timeout)
    }
    if (phase !== 'consequence' || firstCue === undefined) return
    if (still) {
      const timeout = window.setTimeout(
        () => playSound(finalCue === undefined ? 'draw' : 'loss'),
        480
      )
      return () => window.clearTimeout(timeout)
    }
    const cues: { time: number; sound: 'draw' | 'loss' }[] = []
    if (firstCue !== finalCue) cues.push({ time: firstCue, sound: 'draw' })
    if (finalCue !== undefined) cues.push({ time: finalCue, sound: 'loss' })
    const timers = cues.map(({ time, sound }) => window.setTimeout(() => playSound(sound), time))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [ballot, fastForward, finalCue, firstCue, humanId, phase, playSound, still])

  const playerById = (id: string) => players.find((player) => player.id === id)
  const winner = match.winnerId !== undefined ? playerById(match.winnerId) : undefined
  const rankings = useMemo(
    () => (match.winnerId ? rankLastLight(match.winnerId, match.flames, match.eliminated) : []),
    [match.winnerId, match.flames, match.eliminated]
  )
  const result = useMemo(() => {
    if (!match.winnerId) return null
    const completion = buildChallengeCompletion(rankings, match.flames, humanId, 'survival')
    return {
      rawValue: completion.rawValue ?? match.flames[match.winnerId],
      partial: false,
      completion,
    }
  }, [match.winnerId, match.flames, rankings, humanId])
  useCompetitionResultCheckpoint(result)

  function finish() {
    if (!result || submitted.current) return
    submitted.current = true
    props.onFinish?.(result.rawValue, undefined, result.completion)
  }

  function confirmTarget() {
    if (
      phase !== 'ballot' ||
      clock >= deadline ||
      !humanCanVote ||
      !target ||
      !eligibleTargets.includes(target)
    )
      return
    setTarget(undefined)
    advance(target)
  }

  function confirmFace() {
    if (phase !== 'dice-pick' || Date.now() >= deadline || !humanCanRoll || face === undefined)
      return
    setFace(undefined)
    playSound('lock')
    advance(undefined, face)
  }

  function startBallot(recipient?: string) {
    if (phase !== 'donation') return
    setTarget(undefined)
    advance(recipient)
  }

  const remainingSeconds = Math.max(
    0,
    Math.min(
      (phase === 'donation' ? DONATION_DURATION_MS : CHOICE_DURATION_MS) / 1_000,
      Math.ceil((deadline - clock) / 1_000)
    )
  )
  const protectedIds = new Set(Object.values(ballot?.votes ?? {}))
  const eligibleToSkip =
    humanId && phase !== 'intro' && phase !== 'end' && (!humanCanVote || (die && !humanCanRoll))
  const justEliminated = phase === 'consequence' && humanId && ballot?.eliminated.includes(humanId)
  const skipButton = eligibleToSkip && !fastForward && (
    <button type="button" className="last-light__skip" onClick={() => setFastForward(true)}>
      {copy.skip}
    </button>
  )

  function renderRoster() {
    const showProtection = phase === 'reveal' || phase === 'consequence'
    const showLoss = phase === 'consequence'
    const shown = players.filter(
      ({ id }) => active.includes(id) || (showLoss && ballot?.eliminated.includes(id))
    )
    return (
      <div className={`last-light__roster${showProtection ? ' last-light__roster--reading' : ''}`}>
        {shown.map((player) => {
          const lives = match.flames[player.id]
          const isProtected = showProtection && protectedIds.has(player.id)
          return (
            <div
              key={player.id}
              className="last-light__target last-light__target--static"
              data-flame={isProtected ? 'protected' : undefined}
            >
              <ChallengePortrait
                player={player}
                tone={
                  lives === 0 ? 'out' : isProtected ? 'safe' : lives === 1 ? 'danger' : 'neutral'
                }
              >
                <Flames remaining={lives} />
              </ChallengePortrait>
            </div>
          )
        })}
      </div>
    )
  }

  function renderBallot() {
    const selected = target ? playerById(target) : undefined
    const validTarget = selected && eligibleTargets.includes(selected.id)
    const voteStatus =
      selected && ballot
        ? ballot.votes[selected.id] === humanId
          ? 'Protected you'
          : 'Did not protect you'
        : 'No previous ballot'
    return (
      <>
        <div className="last-light__round">
          <span>
            Ballot {round} / {BALLOT_LIMIT}
          </span>
          {waitingForHuman && <span aria-label="Seconds remaining">{remainingSeconds}s</span>}
        </div>
        {Object.entries(match.gifts ?? {}).map(([donor, recipient]) => (
          <p className="last-light__donated" role="status" key={donor}>
            {donor === humanId ? 'You' : playerById(donor)?.name} gave{' '}
            {recipient === humanId ? 'you' : playerById(recipient)?.name} one flame.
          </p>
        ))}
        {match.rejectedGift && (
          <p className="last-light__donated" role="status">
            {playerById(match.rejectedGift)?.name} received another gift. You kept your flame.
          </p>
        )}
        <p className="social-challenge__caption" role="status">
          {humanCanVote
            ? eligibleTargets.length
              ? copy.pick
              : 'There is no eligible pick this ballot.'
            : copy.spectating}
        </p>
        {humanCanVote && humanId ? (
          <>
            <LastLightPortraitWall
              players={players.filter(({ id }) => active.includes(id))}
              selected={target}
              previousTarget={lastSavedByYou}
              eligibleTargets={eligibleTargets}
              framed={Boolean(artwork)}
              onSelect={setTarget}
            />
            {selected && (
              <section
                className="last-light__dossier"
                aria-label="Selected portrait"
                aria-live="polite"
              >
                <h3>{selected.name}</h3>
                <dl>
                  <div>
                    <dt>Connection</dt>
                    <dd>{connectionCue(props, humanId, selected.id)}</dd>
                  </div>
                  <div>
                    <dt>Last ballot</dt>
                    <dd>{voteStatus}</dd>
                  </div>
                  <div>
                    <dt>Flames left</dt>
                    <dd>
                      {match.flames[selected.id]} of {STARTING_FLAMES}
                    </dd>
                  </div>
                </dl>
                {!validTarget && (
                  <p>You protected {selected.name} last ballot. Choose someone else.</p>
                )}
              </section>
            )}
            <button
              type="button"
              className="social-challenge__action last-light__continue"
              disabled={!validTarget || remainingSeconds === 0}
              onClick={confirmTarget}
            >
              {copy.lock}
            </button>
          </>
        ) : (
          renderRoster()
        )}
        {ballot && renderBallotRecord(ballot)}
      </>
    )
  }

  function renderDonation() {
    const selected = target ? playerById(target) : undefined
    return (
      <>
        <div className="last-light__round">
          <span>
            Before ballot {round} / {BALLOT_LIMIT}
          </span>
          <span aria-label="Seconds remaining">{remainingSeconds}s</span>
        </div>
        <section
          className="social-challenge__panel last-light__donation"
          aria-label="Donate a flame"
        >
          {artwork && (
            <div className="last-light__donation-candle">
              <LastLightCandle state="guarded" artwork={artwork} />
            </div>
          )}
          <h3>Donate a flame</h3>
          <p>Give one of your flames to a contestant who has one left.</p>
          <p>If several contestants offer, one gift is drawn. Only that donor spends a flame.</p>
          <p>You have {humanId ? match.flames[humanId] : 0} flames.</p>
          <LastLightPortraitWall
            players={players.filter(({ id }) => donationTargets.includes(id))}
            selected={target}
            eligibleTargets={donationTargets}
            framed={Boolean(artwork)}
            onSelect={setTarget}
          />
          <div className="last-light__donation-actions">
            <button
              type="button"
              className="social-challenge__action"
              disabled={!selected || remainingSeconds === 0}
              onClick={() => startBallot(selected?.id)}
            >
              {selected ? 'Give one flame to ' + selected.name : 'Give one flame'}
            </button>
            <button type="button" className="last-light__skip" onClick={() => startBallot()}>
              Begin ballot
            </button>
          </div>
        </section>
      </>
    )
  }

  function renderBallotRecord(current: LastLightBallot, showRoster = false) {
    return (
      <details className="last-light__record">
        <summary>{showRoster ? 'Ballot record' : 'Previous ballot'}</summary>
        {showRoster && renderRoster()}
        <ul className="last-light__votes" aria-label="Protection votes">
          {Object.entries(current.votes).map(([voter, protectedId]) => (
            <li key={voter}>
              <span title={playerById(voter)?.name}>{playerById(voter)?.name}</span>
              <span aria-label="protected">→</span>
              <strong title={playerById(protectedId)?.name}>{playerById(protectedId)?.name}</strong>
            </li>
          ))}
        </ul>
      </details>
    )
  }

  function renderReveal() {
    if (!ballot) return null
    const affected = players.filter(({ id }) => id in ballot.votes)
    const focus = affected.find(({ id }) => id === humanId) ?? affected[0]
    if (!focus) return null
    const protectors = players.filter(({ id }) => ballot.votes[id] === focus.id)
    const lit = protectors.length > 0

    return (
      <>
        <div className="last-light__round">
          Ballot {round} / {BALLOT_LIMIT}
        </div>
        <div className="last-light__reading-shot" data-protected={lit}>
          <div className="last-light__reading-beam" aria-hidden="true" />
          <div className="last-light__reading-subject">
            <ChallengePortrait player={focus} tone={lit ? 'safe' : 'danger'}>
              <Flames remaining={match.flames[focus.id]} />
            </ChallengePortrait>
            {lit && artwork && <img className="last-light__ward" src={artwork.ward} alt="" />}
          </div>
          {artwork && (
            <div className="last-light__reading-candle">
              <LastLightCandle state={lit ? 'guarded' : 'exposed'} artwork={artwork} />
            </div>
          )}
          <p className="last-light__scene-line" role="status">
            {lit
              ? focus.isHuman
                ? 'You were protected'
                : focus.name + ' was protected'
              : focus.isHuman
                ? 'No one protected you'
                : 'No one protected ' + focus.name}
          </p>
          {lit && (
            <div className="last-light__protectors" aria-label="Protected by">
              {protectors.slice(0, 3).map((player) => (
                <ChallengePortrait player={player} key={player.id} />
              ))}
              {protectors.length > 3 && <span>+{protectors.length - 3}</span>}
            </div>
          )}
        </div>
      </>
    )
  }

  function renderConsequence() {
    if (!ballot) return null
    const flameOutcome = ballot.preventedWipe
      ? copy.wipe
      : ballot.savedEveryone
        ? copy.everyone
        : (losses.length === 1 ? 'One flame goes' : losses.length + ' flames go') + ' out.'
    const eliminated = losses.filter(({ flames }) => flames === 0).map(({ player }) => player.name)
    const outcome =
      eliminated.length === 1
        ? eliminated[0] + ' loses their last flame.'
        : eliminated.length > 1
          ? eliminated.join(', ') + ' lose their last flame.'
          : flameOutcome
    const controls = (
      <>
        <button
          type="button"
          className="social-challenge__action last-light__continue"
          onClick={() => advance()}
        >
          {copy.next}
        </button>
        {renderBallotRecord(ballot, true)}
        {justEliminated && skipButton}
      </>
    )

    if (!artwork)
      return (
        <>
          <p className="last-light__scene-line" role="status">
            {outcome}
          </p>
          {renderRoster()}
          {controls}
        </>
      )

    return (
      <>
        <div className="last-light__round">
          Ballot {round} / {BALLOT_LIMIT}
        </div>
        <LastLightCeremony
          key={round}
          losses={losses}
          outcome={outcome}
          duration={fastForward ? 0 : ceremonyMs}
          still={still || fastForward}
          artwork={artwork}
        >
          {controls}
        </LastLightCeremony>
      </>
    )
  }

  function renderDice() {
    if (!die) return null
    const sides = getLastLightDieSides(die.finalists.length)
    const choosing = phase === 'dice-pick'
    const rolling = phase === 'rolling'
    const approaching = phase === 'altar'
    const landedWinner = die.winnerId ? playerById(die.winnerId)?.name : undefined
    return (
      <div className="last-light__finale" data-dice-scene={phase}>
        <h2>{copy.dice}</h2>
        <div className="last-light__roster last-light__roster--finalists">
          {die.finalists.map((id) => {
            const player = playerById(id)!
            return (
              <ChallengePortrait
                key={id}
                player={player}
                tone={die.winnerId === id ? 'safe' : 'neutral'}
              >
                <Flames remaining={match.flames[id]} />
                {die.picks[id] && <span className="last-light__number">{die.picks[id]}</span>}
              </ChallengePortrait>
            )
          })}
        </div>
        <div
          className="last-light__altar"
          data-impact={landedWinner ? 'winner' : phase === 'die-landed' ? 'landed' : undefined}
        >
          <span className="last-light__die-shadow" aria-hidden="true" />
          <span className="last-light__altar-ring" aria-hidden="true" />
          <Die
            key={`${phase}-${die.rolls}`}
            sides={sides}
            face={rolling ? undefined : die.lastFace}
            rolling={rolling && !still}
            duration={diceRollDuration(die.rolls)}
          />
        </div>
        <p className="social-challenge__caption" role="status">
          {choosing
            ? copy.pickFace
            : rolling
              ? copy.rolling
              : approaching
                ? 'The tied finalists step to the altar.'
                : `${die.lastFace} rolled. ${landedWinner ? `${landedWinner} wins.` : copy.unclaimed}`}
        </p>
        {choosing && humanCanRoll && (
          <>
            <div className="last-light__faces" aria-label="Dice numbers">
              {Array.from({ length: sides }, (_, index) => index + 1).map((number) => (
                <button
                  key={number}
                  type="button"
                  aria-pressed={face === number}
                  onClick={() => setFace(number)}
                >
                  {number}
                </button>
              ))}
            </div>
            <div className="social-challenge__actions">
              <span aria-label="Seconds remaining">{remainingSeconds}s</span>
              <button
                type="button"
                className="social-challenge__action"
                disabled={face === undefined || remainingSeconds === 0}
                onClick={confirmFace}
              >
                {copy.lockFace}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  const shot =
    phase === 'reveal' || phase === 'end'
      ? 'reading'
      : phase === 'consequence'
        ? 'candles'
        : die
          ? 'altar'
          : undefined

  return (
    <ChallengeStage
      game="last-light"
      title={copy.title}
      background={artwork?.background}
      cinematic={Boolean(artwork)}
      subtitle={phase === 'ballot' ? copy.subtitle : undefined}
      scenery={
        artwork && (
          <div className="last-light__reel" data-shot={shot} data-phase={phase} aria-hidden="true">
            {(['reading', 'candles', 'altar'] as const).map((angle) => (
              <img
                className="last-light__plate"
                key={angle}
                data-angle={angle}
                src={artwork[angle]}
                alt=""
                decoding="async"
              />
            ))}
          </div>
        )
      }
    >
      <div
        className="last-light"
        data-phase={phase}
        style={
          artwork
            ? ({ '--last-light-flame-art': `url("${artwork.flame}")` } as CSSProperties)
            : undefined
        }
      >
        {players.length < 2 ? (
          <p className="social-challenge__caption">{copy.unavailable}</p>
        ) : phase === 'intro' ? (
          <div className="last-light__intro social-challenge__panel">
            <Flames remaining={STARTING_FLAMES} />
            <p>{copy.opening}</p>
            <p>You cannot protect the same contestant two ballots in a row.</p>
            <p>
              Before a ballot, you can give one flame to someone on their last if you have at least
              two.
            </p>
            <p>{copy.ending}</p>
            <button type="button" className="social-challenge__action" onClick={() => advance()}>
              {copy.enter}
            </button>
          </div>
        ) : phase === 'end' && winner ? (
          <div className="last-light__results social-challenge__results">
            <div className="last-light__winner-shot">
              <ChallengePortrait player={winner} tone="safe">
                <Flames remaining={match.flames[winner.id]} />
              </ChallengePortrait>
            </div>
            <h3 className="last-light__winner">
              {winner.isHuman ? 'You hold the last light' : `${winner.name} holds the last light`}
            </h3>
            <ol className="last-light__standings" aria-label="Final standings">
              {rankings.map((group, index) => (
                <li key={group[0]}>
                  <span>
                    {1 + rankings.slice(0, index).reduce((sum, row) => sum + row.length, 0)}
                  </span>
                  <strong>{group.map((id) => playerById(id)?.name).join(', ')}</strong>
                </li>
              ))}
            </ol>
            <button type="button" className="social-challenge__action" onClick={finish}>
              {copy.exit}
            </button>
          </div>
        ) : phase === 'donation' ? (
          renderDonation()
        ) : phase === 'ballot' ? (
          renderBallot()
        ) : phase === 'sealed' ? (
          <div className="last-light__interlude">
            <span className="last-light__shutters" aria-hidden="true" />
            <div className="last-light__seal" aria-hidden="true">
              <span />
            </div>
            <p role="status">{copy.sealed}</p>
          </div>
        ) : phase === 'reveal' ? (
          renderReveal()
        ) : phase === 'consequence' ? (
          renderConsequence()
        ) : (
          renderDice()
        )}
        {!justEliminated && skipButton}
      </div>
    </ChallengeStage>
  )
}

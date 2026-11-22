import { useEffect, useMemo, useState } from 'react'
import { useCompetitionResultCheckpoint } from '../../competitionResultContext'
import type { GenericMinigameProps } from '../../reactComponents'
import { ChallengePortrait, ChallengeStage } from '../ChallengeStage'
import { getSocialChallengeArtwork } from '../cinematicArtwork'
import { useChallengeAudio } from '../useChallengeAudio'
import {
  buildChallengeCompletion,
  challengeRng,
  getChallengePlayers,
  socialPreference,
  type ChallengePlayer,
} from '../shared'
import {
  advanceTournament,
  canBuyLife,
  createTournament,
  EXTRA_LIFE_COST,
  finalStandings,
  HANDS,
  MIN_WAGER,
  playShowdown,
  playWagerWave,
  rankAlive,
  STARTING_BANKROLL,
  STARTING_LIVES,
  wagerLimits,
  type Clash,
  type Hand,
  type Pair,
  type Tournament,
  type WagerPlay,
} from './rules'
import './rockPaperScissors.css'

const TITLE = 'Rock, Paper, Scissors'
const ARTWORK = { background: 'rps.webp' }
const WAGER_MS = 24000
const SHOWDOWN_MS = 14000
const OPEN_SEALS_MS = 580
const IMPACT_MS = 1040
const VERDICT_MS = 1660
const DUEL_REVEAL_MS = 3260
const SPECTATOR_REVEAL_MS = 2440
const KNOCKOUT_REVEAL_MS = 3740
const TITLE_REVEAL_MS = 4210

type RevealBeat = 'sealed' | 'clash' | 'verdict'
type RevealStakes = 'hand' | 'knockout' | 'title'

const HAND_NAME: Record<Hand, string> = {
  rock: 'Rock',
  paper: 'Paper',
  scissors: 'Scissors',
}

function HandSeal({ hand }: { hand: Hand }) {
  return (
    <span className={`rps__seal rps__seal--${hand}`} aria-hidden="true">
      <span className="rps__symbol">
        {hand === 'scissors' && (
          <>
            <i />
            <i />
          </>
        )}
      </span>
    </span>
  )
}

function LifeGems({ lives, lost }: { lives: number; lost: boolean }) {
  return (
    <span className="rps__gems" aria-label={`${lives} of ${STARTING_LIVES} lives`} role="img">
      {Array.from({ length: STARTING_LIVES }, (_, index) => (
        <span
          key={index}
          className={`rps__gem${index < lives ? ' rps__gem--lit' : ''}${lost && index === lives ? ' rps__gem--crack' : ''}`}
        />
      ))}
    </span>
  )
}

function HandPicker({ selected, onPick }: { selected?: Hand; onPick: (hand: Hand) => void }) {
  return (
    <div className="rps__choices" role="group" aria-label="Choose your hand">
      {HANDS.map((hand) => (
        <button
          key={hand}
          type="button"
          className="rps__hand-button"
          aria-pressed={selected === hand}
          onClick={() => onPick(hand)}
        >
          <HandSeal hand={hand} />
          <span>{HAND_NAME[hand]}</span>
        </button>
      ))}
    </div>
  )
}

function ClashReveal({
  clash,
  players,
  game,
  showdown,
  beat,
  stakes,
}: {
  clash: Clash
  players: ChallengePlayer[]
  game: Tournament
  showdown: boolean
  beat: RevealBeat
  stakes: RevealStakes
}) {
  const handsOpen = beat !== 'sealed'
  const verdictOpen = beat === 'verdict'
  const winnerHand =
    !handsOpen || clash.winner === null ? 'draw' : clash.hands[clash.pair.indexOf(clash.winner)]
  const winner = players.find((player) => player.id === clash.winner)
  const loser = players.find((player) => player.id === clash.loser)
  const message = !winner
    ? showdown
      ? 'Draw. The pair plays again.'
      : 'Draw. Both wagers are returned.'
    : showdown || !loser
      ? `${winner.name} wins the duel.`
      : clash.knockout
        ? `${winner.name} wins. ${loser.name} is out.`
        : `${winner.name} wins. ${loser.name} loses a life.`

  return (
    <section
      className="rps__clash"
      data-beat={beat}
      data-clash={winnerHand}
      data-stakes={verdictOpen ? stakes : 'hand'}
      aria-label="Duel reveal"
    >
      <div className="rps__clash-arena">
        {handsOpen && (
          <div className="rps__collision" aria-hidden="true">
            <span className="rps__impact" />
            <span className="rps__impact-ring" />
            <span className="rps__sparks" />
          </div>
        )}
        {clash.pair.map((id, index) => {
          const player = players.find((candidate) => candidate.id === id)
          if (!player) return null
          const lost = id === clash.loser
          const won = id === clash.winner
          const boughtLife = Boolean(clash.lifePurchases[id])
          const balanceChange = clash.bankrollChanges[id] ?? 0
          const balance = game.bankrolls[id] - (verdictOpen ? 0 : balanceChange)
          const lives =
            game.lives[id] + (!verdictOpen && !showdown ? Number(lost) - Number(boughtLife) : 0)
          const wager = clash.wagers[id] ?? 0
          return (
            <div
              className="rps__clash-side"
              data-side={index === 0 ? 'left' : 'right'}
              data-outcome={handsOpen ? (won ? 'win' : lost ? 'loss' : 'draw') : undefined}
              key={id}
            >
              <div className="rps__clash-token">
                {handsOpen ? (
                  <HandSeal hand={clash.hands[index]} />
                ) : (
                  <span className="rps__seal rps__seal--covered" aria-hidden="true" />
                )}
              </div>
              <span className="rps__clash-hand">{handsOpen && HAND_NAME[clash.hands[index]]}</span>
              <ChallengePortrait
                player={player}
                tone={verdictOpen ? (won ? 'safe' : lost ? 'danger' : 'neutral') : 'neutral'}
              >
                {!showdown && (
                  <>
                    <LifeGems lives={lives} lost={lost && verdictOpen} />
                    <strong className="rps__purse">{balance} Eyeros</strong>
                  </>
                )}
              </ChallengePortrait>
              {!showdown && verdictOpen && (
                <div
                  className="rps__transfer"
                  data-change={won ? 'win' : lost ? 'loss' : undefined}
                >
                  <span>{won ? '+' + wager : lost ? '−' + wager : 'Refund ' + wager}</span>
                  {won && clash.loot > 0 && <span>+{clash.loot} knockout</span>}
                  {boughtLife && <span>−{EXTRA_LIFE_COST} life</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="rps__verdict" role="status">
        {verdictOpen ? message : beat === 'sealed' ? 'Hands sealed' : null}
      </p>
    </section>
  )
}

function Rules() {
  return (
    <details className="rps__rules">
      <summary>Arena rules</summary>
      <ul>
        <li>
          Start with {STARTING_BANKROLL} Eyeros and {STARTING_LIVES} lives. You face each opponent
          who is still in once.
        </li>
        <li>
          The minimum wager is {MIN_WAGER}. With less, wager what you have. At zero, you can still
          duel.
        </li>
        <li>
          A win pays back double your stake. A loss takes your stake and one life. A draw refunds
          both stakes.
        </li>
        <li>
          On their last life, the loser is out and you take their remaining Eyeros after the wager.
        </li>
        <li>
          With one life, spend {EXTRA_LIFE_COST} Eyeros before your next duel to buy one more life.
        </li>
        <li>
          Survivors rank by Eyeros, lives, wins, then fewest losses. A tie for first goes to a
          no-wager showdown. Drawn showdown hands replay.
        </li>
        <li>If your timer runs out, you play a random hand with the minimum wager.</li>
      </ul>
    </details>
  )
}

function MatchBoard({
  players,
  game,
  pair,
}: {
  players: ChallengePlayer[]
  game: Tournament
  pair?: Pair
}) {
  const alive = rankAlive(game)
  const eliminated = [...game.eliminated].reverse().flat()
  return (
    <ul className="rps__board" aria-label="Arena standings">
      {[...alive, ...eliminated].map((id) => {
        const player = players.find((candidate) => candidate.id === id)
        if (!player) return null
        const lives = game.lives[id]
        return (
          <li key={id} data-paired={pair?.includes(id) ?? false} data-out={lives === 0}>
            <span>{player.name}</span>
            <strong className="rps__purse">{game.bankrolls[id]} Eyeros</strong>
            <LifeGems lives={lives} lost={false} />
            <span className="rps__record">
              {lives === 0 ? 'Out' : game.wins[id] + 'W / ' + game.losses[id] + 'L'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Duelists({
  pair,
  players,
  game,
  buyer,
}: {
  pair: Pair
  players: ChallengePlayer[]
  game: Tournament
  buyer?: string
}) {
  return (
    <div className="rps__duelists">
      {pair.map((id) => {
        const player = players.find((candidate) => candidate.id === id)
        if (!player) return null
        return (
          <ChallengePortrait player={player} key={id}>
            <LifeGems lives={game.lives[id] + Number(id === buyer)} lost={false} />
            <strong className="rps__purse">
              {game.bankrolls[id] - (id === buyer ? EXTRA_LIFE_COST : 0)} Eyeros
            </strong>
          </ChallengePortrait>
        )
      })}
    </div>
  )
}

function DuelTimer({ duration }: { duration: number }) {
  const [remaining, setRemaining] = useState(duration / 1000)
  useEffect(() => {
    const deadline = Date.now() + duration
    const tick = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    }, 250)
    return () => window.clearInterval(tick)
  }, [duration])

  return (
    <>
      <p className="social-challenge__caption rps__clock" role="timer">
        {remaining}s
      </p>
      <div className="rps__timer" aria-hidden="true">
        <span style={{ animationDuration: duration + 'ms' }} />
      </div>
    </>
  )
}

function WagerChoice({
  game,
  pair,
  players,
  playerId,
  onSeal,
}: {
  game: Tournament
  pair: Pair
  players: ChallengePlayer[]
  playerId: string
  onSeal: (play: WagerPlay) => void
}) {
  const [buyLife, setBuyLife] = useState(false)
  const [hand, setHand] = useState<Hand>()
  const [stake, setStake] = useState(() => String(wagerLimits(game, playerId).min))
  const { min, max } = wagerLimits(game, playerId, buyLife)
  const wager = Number(stake)
  const validWager = stake !== '' && Number.isInteger(wager) && wager >= min && wager <= max
  const quickWagers = [...new Set([min, 10, 25, 50, max])]
    .filter((amount) => amount >= min && amount <= max)
    .sort((a, b) => a - b)

  const toggleLife = () => {
    const next = !buyLife
    const limits = wagerLimits(game, playerId, next)
    setBuyLife(next)
    setStake(String(Math.min(limits.max, Math.max(limits.min, wager))))
  }

  return (
    <section className="social-challenge__panel rps__hand-panel" aria-label="Place your wager">
      <Duelists pair={pair} players={players} game={game} buyer={buyLife ? playerId : undefined} />
      <DuelTimer duration={WAGER_MS} />
      <HandPicker selected={hand} onPick={setHand} />
      <div className="rps__wager-desk">
        {min === max ? (
          <p className="social-challenge__caption">
            {max === 0 ? 'Free duel' : 'All-in wager · ' + max + ' Eyeros'}
          </p>
        ) : (
          <>
            <div className="rps__wager-options" role="group" aria-label="Quick wagers">
              {quickWagers.map((amount) => (
                <button
                  type="button"
                  key={amount}
                  aria-pressed={validWager && wager === amount}
                  onClick={() => setStake(String(amount))}
                >
                  {amount === max ? 'All in' : amount}
                </button>
              ))}
            </div>
            <label className="rps__wager-value">
              Wager (Eyeros)
              <input
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                step={1}
                value={stake}
                aria-invalid={!validWager}
                onChange={(event) => setStake(event.target.value)}
              />
            </label>
          </>
        )}
        <p className="social-challenge__caption">
          {validWager
            ? 'Win payout · ' + wager * 2 + ' Eyeros'
            : 'Enter ' + min + ' to ' + max + ' Eyeros.'}
        </p>
      </div>
      {canBuyLife(game, playerId) && (
        <button type="button" className="rps__life-buy" aria-pressed={buyLife} onClick={toggleLife}>
          {buyLife ? 'Extra life reserved' : 'Buy a life · ' + EXTRA_LIFE_COST + ' Eyeros'}
        </button>
      )}
      <button
        type="button"
        className="social-challenge__action rps__lock"
        disabled={!hand || !validWager}
        onClick={() => {
          if (hand && validWager) onSeal({ playerId, hand, wager, buyLife })
        }}
      >
        Seal hand
      </button>
    </section>
  )
}

export default function RockPaperScissors(props: GenericMinigameProps) {
  const [players] = useState(() => getChallengePlayers(props))
  const [social] = useState(() => props)
  const [started, setStarted] = useState(() => props.autoStart ?? false)
  const [skipping, setSkipping] = useState(false)
  const [reveal, setReveal] = useState<{ hand: Tournament; beat: RevealBeat }>()
  const [game, setGame] = useState(() =>
    createTournament(
      players.map((player) => player.id),
      props.seed
    )
  )
  const playSound = useChallengeAudio('rps')
  const [artwork] = useState(() => getSocialChallengeArtwork(props.premiumPresentation, ARTWORK))
  const humanId = players.find((player) => player.isHuman)?.id
  const humanPair = game.pairs.find((pair) => humanId && pair.includes(humanId))
  const pair = humanPair ?? game.pairs[0]
  const showdown = game.phase === 'showdown' || game.phase === 'showdown-reveal'
  const isReveal = game.phase === 'duel-reveal' || game.phase === 'showdown-reveal'
  const spotlight =
    game.results.find((result) => humanId && result.pair.includes(humanId)) ?? game.results[0]
  const next = useMemo(() => (isReveal ? advanceTournament(game) : game), [game, isReveal])
  const stakes: RevealStakes =
    spotlight?.winner && next.champion === spotlight.winner
      ? 'title'
      : spotlight?.knockout
        ? 'knockout'
        : 'hand'
  const revealBeat =
    skipping || !artwork ? 'verdict' : reveal?.hand === game ? reveal.beat : 'sealed'
  const showConsequences = !isReveal || revealBeat === 'verdict'
  const canSkip = Boolean(
    humanId &&
    (game.lives[humanId] === 0 || (showdown && !game.showdownContenders.includes(humanId)))
  )

  useEffect(() => {
    if (!started || game.phase === 'finished' || game.waves.length === 0) return
    let delay = humanPair ? (showdown ? SHOWDOWN_MS : WAGER_MS) : 1450
    if (isReveal) {
      delay = !artwork
        ? 1_700
        : stakes === 'title'
          ? TITLE_REVEAL_MS
          : stakes === 'knockout'
            ? KNOCKOUT_REVEAL_MS
            : humanPair
              ? DUEL_REVEAL_MS
              : SPECTATOR_REVEAL_MS
    }
    const timer = window.setTimeout(
      () => {
        const rng = challengeRng(game.seed, 'rps', 'timeout', game.wave, game.showdownRound)
        const timeoutPlay =
          humanId && humanPair
            ? {
                playerId: humanId,
                hand: HANDS[Math.floor(rng() * HANDS.length)],
                wager: wagerLimits(game, humanId).min,
              }
            : undefined
        setGame((state) => {
          if (state !== game) return state
          if (isReveal) return next
          if (showdown) return playShowdown(state, timeoutPlay ? [timeoutPlay] : undefined)
          return playWagerWave(state, timeoutPlay ? [timeoutPlay] : undefined, (from, to) =>
            socialPreference(social, from, to)
          )
        })
      },
      skipping ? 35 : delay
    )
    return () => window.clearTimeout(timer)
  }, [
    artwork,
    game,
    humanId,
    humanPair,
    isReveal,
    next,
    showdown,
    skipping,
    social,
    stakes,
    started,
  ])

  useEffect(() => {
    if (!started || !isReveal || !spotlight || skipping) return
    if (!artwork) {
      playSound(spotlight.winner ? 'lock' : 'draw')
      return
    }
    const openSeals = window.setTimeout(
      () => setReveal({ hand: game, beat: 'clash' }),
      OPEN_SEALS_MS
    )
    const playImpact = window.setTimeout(
      () => playSound(spotlight.winner ? 'reveal' : 'draw'),
      IMPACT_MS
    )
    const showVerdict = window.setTimeout(() => {
      setReveal({ hand: game, beat: 'verdict' })
      if (!showdown && spotlight.loser) playSound('loss')
    }, VERDICT_MS)
    return () => {
      window.clearTimeout(openSeals)
      window.clearTimeout(playImpact)
      window.clearTimeout(showVerdict)
    }
  }, [artwork, game, isReveal, playSound, showdown, skipping, spotlight, started])

  const groups = useMemo(() => finalStandings(game), [game])
  const result = useMemo(() => {
    if (groups.length === 0) return null
    let ahead = 0
    const scores: Record<string, number> = {}
    for (const group of groups) {
      for (const id of group) scores[id] = players.length - ahead
      ahead += group.length
    }
    const completion = buildChallengeCompletion(groups, scores, humanId)
    return { rawValue: completion.rawValue ?? 0, partial: false, completion }
  }, [groups, humanId, players.length])
  useCompetitionResultCheckpoint(result)
  useEffect(() => {
    if (result) playSound('success')
  }, [playSound, result])

  const sealWager = (play: WagerPlay) => {
    playSound('lock')
    setGame((state) =>
      state === game
        ? playWagerWave(state, [play], (from, to) => socialPreference(social, from, to))
        : state
    )
  }

  const sealShowdown = (hand: Hand) => {
    if (!humanId) return
    playSound('lock')
    setGame((state) =>
      state === game ? playShowdown(state, [{ playerId: humanId, hand }]) : state
    )
  }

  if (game.waves.length === 0) {
    return (
      <ChallengeStage
        game="rps"
        title={TITLE}
        background={artwork?.background}
        cinematic={Boolean(artwork)}
      >
        <p role="status">Two or more contestants are needed to start a duel.</p>
      </ChallengeStage>
    )
  }

  if (!started) {
    return (
      <ChallengeStage
        game="rps"
        title={TITLE}
        background={artwork?.background}
        cinematic={Boolean(artwork)}
      >
        <section className="social-challenge__panel rps__intro">
          <div className="rps__intro-seals">
            {HANDS.map((hand) => (
              <HandSeal key={hand} hand={hand} />
            ))}
          </div>
          <h2>
            {STARTING_BANKROLL} Eyeros. {STARTING_LIVES} lives.
          </h2>
          <p>
            Wager on your own hand. Finish the rotation alive with more Eyeros than anyone else.
          </p>
          <Rules />
          <button
            type="button"
            className="social-challenge__action"
            onClick={() => {
              playSound('lock')
              setStarted(true)
            }}
          >
            Enter the arena
          </button>
        </section>
      </ChallengeStage>
    )
  }

  if (result) {
    const winner = players.find((player) => player.id === groups[0][0])
    return (
      <ChallengeStage
        game="rps"
        title={TITLE}
        subtitle="Final standings"
        background={artwork?.background}
        cinematic={Boolean(artwork)}
      >
        <section className="social-challenge__panel social-challenge__results rps__results">
          {winner && (
            <div className="rps__champion">
              <ChallengePortrait player={winner} tone="safe">
                <LifeGems lives={game.lives[winner.id]} lost={false} />
                <strong className="rps__purse">{game.bankrolls[winner.id]} Eyeros</strong>
              </ChallengePortrait>
              <h2>{winner.isHuman ? 'You win the arena' : winner.name + ' wins the arena'}</h2>
            </div>
          )}
          <ol className="rps__result-list">
            {groups.flatMap((group, groupIndex) => {
              const ahead = groups
                .slice(0, groupIndex)
                .reduce((count, prior) => count + prior.length, 0)
              return group.map((id) => {
                const player = players.find((candidate) => candidate.id === id)
                return (
                  <li key={id} value={ahead + 1}>
                    <span>
                      {player?.name ?? id}
                      {player?.isHuman ? ' (you)' : ''}
                    </span>
                    <strong>{game.lives[id] === 0 ? 'Out' : game.bankrolls[id] + ' Eyeros'}</strong>
                  </li>
                )
              })
            })}
          </ol>
          <button
            type="button"
            className="social-challenge__action"
            onClick={() => props.onFinish?.(result.rawValue, undefined, result.completion)}
          >
            Continue
          </button>
        </section>
      </ChallengeStage>
    )
  }

  const round = showdown
    ? 'Tie-break showdown'
    : 'Duel wave ' + (game.wave + 1) + ' of ' + game.waves.length

  return (
    <ChallengeStage
      game="rps"
      title={TITLE}
      subtitle={round}
      background={artwork?.background}
      cinematic={Boolean(artwork)}
    >
      <div className="rps__play">
        {isReveal && spotlight && (
          <ClashReveal
            key={round + ' ' + game.showdownRound}
            clash={spotlight}
            players={players}
            game={game}
            showdown={showdown}
            beat={revealBeat}
            stakes={stakes}
          />
        )}

        {isReveal && showConsequences && game.results.length > 1 && (
          <ul className="rps__wave-results" aria-label="Other duels">
            {game.results
              .filter((result) => result !== spotlight)
              .map((clash) => (
                <li key={clash.pair[0]}>
                  <span>
                    {clash.pair
                      .map((id) => players.find((player) => player.id === id)?.name)
                      .join(' vs ')}
                  </span>
                  <strong>
                    {clash.winner
                      ? players.find((player) => player.id === clash.winner)?.name +
                        (clash.knockout ? ' · knockout' : ' wins')
                      : 'Draw'}
                  </strong>
                </li>
              ))}
          </ul>
        )}

        {game.phase === 'wager' && humanId && humanPair && (
          <WagerChoice
            key={game.wave}
            pair={humanPair}
            game={game}
            players={players}
            playerId={humanId}
            onSeal={sealWager}
          />
        )}

        {game.phase === 'showdown' && humanPair && (
          <section
            className="social-challenge__panel rps__hand-panel"
            aria-label="Tie-break duel"
            key={game.showdownRound}
          >
            <Duelists pair={humanPair} players={players} game={game} />
            <p className="social-challenge__caption">No wagers. Win the hand to advance.</p>
            <DuelTimer duration={SHOWDOWN_MS} />
            <HandPicker onPick={sealShowdown} />
          </section>
        )}

        {!isReveal && !humanPair && (
          <>
            {pair && <Duelists pair={pair} players={players} game={game} />}
            <p className="social-challenge__caption rps__status" role="status">
              {humanId && !canSkip
                ? 'You sit out this wave.'
                : 'The contestants are sealing their hands.'}
            </p>
          </>
        )}

        {showConsequences && <MatchBoard players={players} game={game} pair={pair} />}
        {canSkip && (
          <div className="social-challenge__actions rps__spectator">
            <button
              type="button"
              className="social-challenge__action"
              disabled={skipping}
              onClick={() => setSkipping(true)}
            >
              {skipping ? 'Finishing the duels.' : 'Skip to results'}
            </button>
          </div>
        )}
        {game.phase === 'wager' && <Rules />}
      </div>
    </ChallengeStage>
  )
}

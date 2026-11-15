import { useEffect, useState, type CSSProperties } from 'react'
import type { ScoreboardState } from './NumberTrivia'
import { NUMBER_TRIVIA_DUEL_STARTING_LIVES, NUMBER_TRIVIA_TOTAL_ROUNDS } from './numberTriviaUtils'

interface PortraitProps {
  name: string
  avatar?: string
}

export function TriviaPortrait({ name, avatar }: PortraitProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  return (
    <span className="number-trivia__portrait" aria-hidden="true">
      {(!avatar || failed || !loaded) && <span>{name.slice(0, 2).toUpperCase()}</span>}
      {avatar && !failed && (
        <img
          src={avatar}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ display: loaded ? 'block' : 'none' }}
        />
      )}
    </span>
  )
}

interface ResultsProps {
  scoreboard: ScoreboardState
  participants: Array<{ id: string; avatar?: string }>
  showStandings: boolean
  onToggleStandings: () => void
}

export function NumberTriviaResults({
  scoreboard,
  participants,
  showStandings,
  onToggleStandings,
}: ResultsProps) {
  const [reveal, setReveal] = useState<'answer' | 'scores' | 'verdict'>(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'verdict' : 'answer'
  )
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const scores = window.setTimeout(
      () => setReveal((stage) => (stage === 'verdict' ? stage : 'scores')),
      1100
    )
    const verdict = window.setTimeout(() => setReveal('verdict'), 2400)
    return () => {
      window.clearTimeout(scores)
      window.clearTimeout(verdict)
    }
  }, [])

  const finalists =
    scoreboard.phase === 'qualifier' && scoreboard.roundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS
  const spotlightIds = scoreboard.final
    ? [scoreboard.standings[0].participantId]
    : finalists
      ? scoreboard.finalistIds
      : scoreboard.lifeLostId
        ? [scoreboard.lifeLostId]
        : scoreboard.eliminatedIds
  const spotlights = scoreboard.standings.filter((entry) =>
    spotlightIds.includes(entry.participantId)
  )
  const human = scoreboard.standings.find((entry) => entry.isHuman)
  const tone = scoreboard.final || finalists ? 'gold' : spotlights.length ? 'red' : 'cyan'
  const title = scoreboard.final
    ? 'LAST ONE STANDING'
    : finalists
      ? 'MEET YOUR FINALISTS'
      : scoreboard.lifeLostId
        ? scoreboard.eliminatedIds.length
          ? 'OUT OF LIVES'
          : 'ONE LIFE LOST'
        : spotlights.length
          ? 'END OF THE LINE'
          : 'EVERYONE STAYS'
  const portrait = (id: string, name: string) => (
    <TriviaPortrait key={id} name={name} avatar={participants.find((p) => p.id === id)?.avatar} />
  )

  return (
    <section
      className={`number-trivia__results number-trivia__results--${tone}`}
      aria-label={
        scoreboard.final
          ? 'Final scoreboard'
          : scoreboard.phase === 'duel'
            ? `Duel ${scoreboard.duelNumber} scoreboard`
            : `Round ${scoreboard.roundNumber} scoreboard`
      }
    >
      <div className="number-trivia__reveal" key={reveal} aria-live="polite" aria-atomic="true">
        {reveal === 'answer' ? (
          <>
            <p className="number-trivia__eyebrow">The number you needed</p>
            <strong className="number-trivia__answer-reveal">{scoreboard.answer}</strong>
            <p className="number-trivia__reveal-caption">Answers locked. The scores are in.</p>
          </>
        ) : reveal === 'scores' ? (
          <>
            <p className="number-trivia__eyebrow">Your round {scoreboard.roundNumber}</p>
            <strong className="number-trivia__score-reveal">
              +
              {human?.eliminatedRound !== null && human?.eliminatedRound !== scoreboard.roundNumber
                ? 0
                : (human?.lastRoundScore ?? 0)}
            </strong>
            <p className="number-trivia__reveal-caption">
              {human?.eliminatedRound !== null && human?.eliminatedRound !== scoreboard.roundNumber
                ? 'Watching from the sidelines'
                : human?.lastRoundGuessed
                  ? 'Exact answer found'
                  : 'Every point counts'}
            </p>
          </>
        ) : (
          <>
            <p className="number-trivia__eyebrow">
              {scoreboard.final
                ? 'Number Trivia champion'
                : scoreboard.phase === 'duel'
                  ? `Duel ${scoreboard.duelNumber} verdict`
                  : `Round ${scoreboard.roundNumber} verdict`}
            </p>
            <h3 className="number-trivia__verdict-title">{title}</h3>
            <div
              className={`number-trivia__spotlights ${finalists ? 'number-trivia__spotlights--finalists' : ''}`}
            >
              {spotlights.map((entry, index) => (
                <div
                  key={entry.participantId}
                  className={`number-trivia__spotlight ${tone === 'red' ? 'number-trivia__spotlight--out' : ''}`}
                  style={{ '--i': index } as CSSProperties}
                >
                  {portrait(entry.participantId, entry.participantName)}
                  <strong>
                    {entry.participantName}
                    {entry.isHuman && entry.participantName !== 'You' ? ' (You)' : ''}
                  </strong>
                  {scoreboard.phase === 'duel' || finalists ? (
                    <div
                      className="number-trivia__life-pips"
                      aria-label={`${scoreboard.lives[entry.participantId] ?? 0} lives remaining`}
                    >
                      {Array.from({ length: NUMBER_TRIVIA_DUEL_STARTING_LIVES }, (_, i) => (
                        <i
                          key={i}
                          className={
                            i >= (scoreboard.lives[entry.participantId] ?? 0)
                              ? 'number-trivia__life-pip--lost'
                              : ''
                          }
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  ) : (
                    <span>{entry.cumulativeScore} points</span>
                  )}
                  {scoreboard.eliminatedIds.includes(entry.participantId) && (
                    <span className="number-trivia__out-label">ELIMINATED</span>
                  )}
                </div>
              ))}
            </div>
            <p className="number-trivia__reveal-caption">
              {scoreboard.final
                ? 'The spotlight is yours.'
                : finalists
                  ? 'Three lives each. One champion.'
                  : scoreboard.phase === 'duel'
                    ? 'Accuracy first. Speed breaks a tie.'
                    : spotlights.length
                      ? 'The competition moves on.'
                      : 'The race to the final continues.'}
            </p>
          </>
        )}
      </div>
      <div className="number-trivia__answer-strip">
        <span>Correct answer</span>
        <strong>{scoreboard.answer}</strong>
      </div>
      <div className="number-trivia__results-actions">
        {reveal !== 'verdict' && (
          <button type="button" onClick={() => setReveal('verdict')}>
            Skip reveal
          </button>
        )}
        <button
          type="button"
          onClick={onToggleStandings}
          aria-expanded={showStandings}
          aria-controls="number-trivia-standings"
        >
          {showStandings ? 'Hide standings −' : 'View standings +'}
        </button>
      </div>
      {showStandings && (
        <ol
          id="number-trivia-standings"
          className="number-trivia__standings"
          aria-label="Tournament standings"
        >
          {scoreboard.standings.map((entry, index) => (
            <li
              key={entry.participantId}
              className={`${entry.isHuman ? 'number-trivia__standing--human' : ''} ${entry.eliminatedRound !== null ? 'number-trivia__standing--out' : ''}`}
            >
              <span className="number-trivia__rank">{String(index + 1).padStart(2, '0')}</span>
              {portrait(entry.participantId, entry.participantName)}
              <span className="number-trivia__standing-name">
                <strong>{entry.participantName}</strong>
                <small>
                  {scoreboard.final && index === 0
                    ? 'Champion'
                    : entry.eliminatedRound !== null
                      ? `Eliminated R${entry.eliminatedRound}`
                      : scoreboard.phase === 'duel'
                        ? `${scoreboard.lives[entry.participantId] ?? 0} lives`
                        : finalists
                          ? 'Finalist'
                          : 'Through to next round'}
                </small>
              </span>
              <span className="number-trivia__standing-score">
                <strong>{entry.cumulativeScore}</strong>
                <small>
                  +
                  {entry.eliminatedRound !== null && entry.eliminatedRound < scoreboard.roundNumber
                    ? 0
                    : entry.lastRoundScore}
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

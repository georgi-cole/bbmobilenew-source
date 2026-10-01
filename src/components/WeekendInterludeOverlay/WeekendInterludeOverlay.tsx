import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  advance,
  advanceWeekendDay,
  completeWeekendInterlude,
  continueHubSays,
  submitHubSaysVote,
} from '../../store/gameSlice'
import { openSocialPanel } from '../../social/socialSlice'
import { getHubSaysQuestion } from '../../features/weekend/hubSays'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './WeekendInterludeOverlay.css'

export default function WeekendInterludeOverlay() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const weekend = game.weekendInterlude

  if (!weekend?.active) return null

  const activePlayers = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  const human = activePlayers.find((player) => player.isUser)
  const selectablePlayers = activePlayers.filter((player) => !player.isUser)
  const hub = weekend.episode === 'hub_says' ? weekend.hubSays : undefined
  const currentQuestionId = hub?.questionIds[hub.currentQuestionIndex]
  const currentQuestion = currentQuestionId ? getHubSaysQuestion(currentQuestionId) : undefined
  const currentResult =
    currentQuestionId != null
      ? hub?.results.find((result) => result.questionId === currentQuestionId)
      : undefined
  const winner = currentResult
    ? activePlayers.find((player) => player.id === currentResult.winnerId)
    : undefined
  const isLastHubQuestion =
    Boolean(hub) && hub.currentQuestionIndex >= Math.max(0, hub.questionIds.length - 1)

  const finishWeekend = () => {
    dispatch(completeWeekendInterlude())
    // Redux reducers are synchronous: after completion the ordinary week_end
    // transition is unblocked and advances Day 5 -> Day 6 unchanged.
    dispatch(advance())
  }

  return (
    <div
      className="weekend-interlude"
      role="dialog"
      aria-modal="true"
      aria-label={`Weekend Day ${weekend.weekendDay} of 2`}
    >
      <div className="weekend-interlude__ambient" aria-hidden="true" />
      <main className="weekend-interlude__card">
        <header className="weekend-interlude__header">
          <div>
            <div className="weekend-interlude__eyebrow">The Big Eye · Weekend</div>
            <h1>Weekend Day {weekend.weekendDay}</h1>
            <p>
              Day {weekend.afterDay} is complete. The numbered game is paused until this
              two-day interlude ends.
            </p>
          </div>
          <div className="weekend-interlude__wallet" aria-label="Weekend social credits">
            <span>⚡ {weekend.wallet.energy}</span>
            <span>🤝 {weekend.wallet.influence}</span>
            <span>💡 {weekend.wallet.info}</span>
            <small>Weekend credits</small>
          </div>
        </header>

        {weekend.stage === 'hub_says' && currentQuestion && human ? (
          <section className="weekend-interlude__hub" aria-label="The Hub Says">
            <div className="weekend-interlude__hub-title">
              <span>THE HUB SAYS…</span>
              <small>
                {Math.min((hub?.currentQuestionIndex ?? 0) + 1, hub?.questionIds.length ?? 0)} /{' '}
                {hub?.questionIds.length ?? 0}
              </small>
            </div>

            <h2>{currentQuestion.prompt}</h2>

            {!currentResult ? (
              <>
                <p className="weekend-interlude__instruction">
                  Everyone answers anonymously. Pick the housemate you think fits best.
                </p>
                <div className="weekend-interlude__roster" role="group" aria-label="Choose housemate">
                  {selectablePlayers.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className="weekend-interlude__person"
                      onClick={() =>
                        dispatch(
                          submitHubSaysVote({
                            questionId: currentQuestion.id,
                            targetId: player.id,
                          })
                        )
                      }
                    >
                      <PlayerAvatar player={player} size="sm" showRelationshipOutline={false} />
                      <span>{player.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="weekend-interlude__winner" aria-live="polite">
                {winner && (
                  <PlayerAvatar player={winner} size="md" showRelationshipOutline={false} />
                )}
                <span className="weekend-interlude__winner-kicker">THE HOUSE CHOSE</span>
                <strong>{winner?.name ?? 'A housemate'}</strong>
                <p>The house has spoken.</p>
                <button
                  type="button"
                  className="weekend-interlude__primary"
                  onClick={() => dispatch(continueHubSays())}
                >
                  {isLastHubQuestion ? 'Open Weekend Social' : 'Next Question'}
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className="weekend-interlude__social">
            <div className="weekend-interlude__social-copy">
              <span className="weekend-interlude__section-label">
                {weekend.weekendDay === 1 ? 'DAY 1 · FREE TIME' : 'DAY 2 · FREE TIME'}
              </span>
              <h2>
                {weekend.weekendDay === 1
                  ? 'React to the house.'
                  : 'One more day without a ceremony.'}
              </h2>
              <p>
                Use the blue weekend wallet to talk, repair, bond, investigate or stir things up.
                Relationship consequences stay. Unused weekend credits disappear when the weekend
                ends.
              </p>
            </div>

            <button
              type="button"
              className="weekend-interlude__social-button"
              onClick={() => dispatch(openSocialPanel())}
            >
              <span>Open Social</span>
              <small>
                ⚡ {weekend.wallet.energy} · 🤝 {weekend.wallet.influence} · 💡{' '}
                {weekend.wallet.info}
              </small>
            </button>

            <div className="weekend-interlude__footer">
              {weekend.weekendDay === 1 ? (
                <button
                  type="button"
                  className="weekend-interlude__primary"
                  onClick={() => dispatch(advanceWeekendDay())}
                >
                  End Weekend Day 1
                </button>
              ) : (
                <button
                  type="button"
                  className="weekend-interlude__primary"
                  onClick={finishWeekend}
                >
                  End Weekend · Start Day {weekend.afterDay + 1}
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

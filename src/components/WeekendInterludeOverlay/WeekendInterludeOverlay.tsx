import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  advance,
  advanceWeekendDay,
  completeWeekendInterlude,
  continueHubSays,
  continueWeekendFeature,
  recordWeekendPartyBeat,
  submitHubSaysVote,
} from '../../store/gameSlice'
import {
  learnRealityKnowledge,
  openSocialPanel,
  upsertRealitySecretRecord,
} from '../../social/socialSlice'
import { getHubSaysQuestion } from '../../features/weekend/hubSays'
import { resolveWeekendPartyBeat } from '../../features/weekend/hubParty'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './WeekendInterludeOverlay.css'

export default function WeekendInterludeOverlay() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const social = useAppSelector((state) => state.social)
  const weekend = game.weekendInterlude
  const [seasonFactIndex, setSeasonFactIndex] = useState(0)

  const activePlayers = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  const human = activePlayers.find((player) => player.isUser)

  useEffect(() => {
    setSeasonFactIndex(0)
  }, [weekend?.afterDay, weekend?.episode])

  useEffect(() => {
    if (
      !weekend?.active ||
      weekend.episode !== 'party' ||
      weekend.stage !== 'social' ||
      !weekend.party ||
      weekend.party.beats.some((beat) => beat.weekendDay === weekend.weekendDay)
    ) {
      return
    }

    const beat = resolveWeekendPartyBeat(game, social, weekend.weekendDay)
    if (!beat) return

    dispatch(recordWeekendPartyBeat(beat))

    if (beat.kind !== 'secret_spill' || !beat.factId || !beat.secretId || !beat.speakerId || !human) {
      return
    }

    const fact = social.reality.facts[beat.factId]
    const secret = social.reality.secrets[beat.secretId]
    if (!fact || !secret || secret.knowerIds.includes(human.id)) return

    dispatch(
      learnRealityKnowledge({
        ownerId: human.id,
        factId: fact.id,
        confidence: 0.86,
        memory: {
          id: `memory:weekend-party:${game.season}:${weekend.afterDay}:${human.id}:${fact.id}`,
          ownerId: human.id,
          eventId: beat.id,
          day: game.week,
          phase: 'social_2',
          participantIds: Array.from(
            new Set([beat.speakerId, ...beat.subjectIds, human.id].filter(Boolean))
          ),
          sourceType: 'HEARSAY',
          sourceChain: [beat.speakerId],
          confidence: 0.86,
          importance: 0.72,
          surprise: 0.68,
          emotionalValence: 0,
          emotionalIntensity: 0.45,
          secrecy: 0.9,
          strategicRelevance: 0.8,
          visibility: fact.visibility,
          tags: ['weekend_party', 'secret_spill'],
          relatedPromiseIds: [],
          relatedSecretIds: [secret.id],
          recallStrength: 0.9,
        },
      })
    )
    dispatch(
      upsertRealitySecretRecord({
        ...secret,
        knowerIds: Array.from(new Set([...secret.knowerIds, human.id])),
      })
    )
  }, [dispatch, game, human, social, weekend])

  if (!weekend?.active) return null

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
  const isLastHubQuestion = hub
    ? hub.currentQuestionIndex >= Math.max(0, hub.questionIds.length - 1)
    : false
  const currentPartyBeat =
    weekend.episode === 'party'
      ? weekend.party?.beats.find((beat) => beat.weekendDay === weekend.weekendDay)
      : undefined
  const seasonFacts = weekend.episode === 'season_so_far' ? weekend.seasonSoFar?.facts ?? [] : []
  const currentSeasonFact = seasonFacts[seasonFactIndex]
  const currentSeasonPlayer = currentSeasonFact
    ? activePlayers.find((player) => player.id === currentSeasonFact.playerId)
    : undefined

  const finishWeekend = () => {
    dispatch(completeWeekendInterlude())
    // Redux reducers are synchronous: completion unblocks the ordinary
    // week_end -> week_start transition for Day 6, 11 or 16.
    dispatch(advance())
  }

  const rootClassName = [
    'weekend-interlude',
    weekend.episode === 'party' ? 'weekend-interlude--party' : '',
    weekend.episode === 'season_so_far' ? 'weekend-interlude--season' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={rootClassName}
      role="dialog"
      aria-modal="true"
      aria-label={`Weekend Day ${weekend.weekendDay} of 2`}
    >
      <div className="weekend-interlude__ambient" aria-hidden="true" />
      <main className="weekend-interlude__card">
        <header className="weekend-interlude__header">
          <div>
            <div className="weekend-interlude__eyebrow">
              {weekend.episode === 'party'
                ? 'The Big Eye · Hub Party'
                : weekend.episode === 'season_so_far'
                  ? 'The Big Eye · The Season So Far'
                  : 'The Big Eye · Weekend'}
            </div>
            <h1>Weekend Day {weekend.weekendDay}</h1>
            <p>
              Day {weekend.afterDay} is complete. The numbered game is paused until this two-day
              interlude ends.
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
                <div
                  className="weekend-interlude__roster"
                  role="group"
                  aria-label="Choose housemate"
                >
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
        ) : weekend.stage === 'party' ? (
          <section className="weekend-interlude__feature weekend-interlude__party">
            <span className="weekend-interlude__section-label">WEEKEND 2 · THE HUB PARTY</span>
            <h2>No competitions. No nominations. Music up.</h2>
            <div className="weekend-interlude__tv-card">
              <strong>📺 THE BIG EYE</strong>
              <p>
                Drinks and mocktails are out. The house has history now. Talk to whoever you want —
                just remember that people say things at parties they normally keep to themselves.
              </p>
            </div>
            <div className="weekend-interlude__party-note">
              Two grounded party moments will unfold across the weekend. A private spill only uses
              information the speaker really knows; anything else falls back to a real opinion or
              an existing relationship story.
            </div>
            <div className="weekend-interlude__footer">
              <button
                type="button"
                className="weekend-interlude__primary"
                onClick={() => dispatch(continueWeekendFeature())}
              >
                Start the Party
              </button>
            </div>
          </section>
        ) : weekend.stage === 'season_so_far' ? (
          <section className="weekend-interlude__feature weekend-interlude__season-recap">
            <div className="weekend-interlude__hub-title">
              <span>THE SEASON SO FAR</span>
              <small>
                {seasonFacts.length === 0 ? 0 : seasonFactIndex + 1} / {seasonFacts.length}
              </small>
            </div>

            {currentSeasonFact && currentSeasonPlayer ? (
              <div className="weekend-interlude__fact-card" aria-live="polite">
                <PlayerAvatar
                  player={currentSeasonPlayer}
                  size="md"
                  showRelationshipOutline={false}
                />
                <span>{currentSeasonPlayer.name}</span>
                <p>{currentSeasonFact.text}</p>
              </div>
            ) : (
              <div className="weekend-interlude__fact-card">
                <p>The house has made it a long way. There is more season behind you than ahead.</p>
              </div>
            )}

            <div className="weekend-interlude__season-dots" aria-hidden="true">
              {seasonFacts.map((fact, index) => (
                <span
                  key={fact.playerId}
                  className={index === seasonFactIndex ? 'is-active' : undefined}
                />
              ))}
            </div>

            <div className="weekend-interlude__footer">
              {seasonFactIndex < seasonFacts.length - 1 ? (
                <button
                  type="button"
                  className="weekend-interlude__primary"
                  onClick={() => setSeasonFactIndex((index) => index + 1)}
                >
                  Next Housemate
                </button>
              ) : (
                <button
                  type="button"
                  className="weekend-interlude__primary"
                  onClick={() => dispatch(continueWeekendFeature())}
                >
                  Open Weekend Social
                </button>
              )}
            </div>
          </section>
        ) : (
          <section className="weekend-interlude__social">
            {weekend.episode === 'party' && (
              <div className="weekend-interlude__party-beat">
                <span className="weekend-interlude__section-label">
                  {currentPartyBeat?.visibility === 'private' ? 'PRIVATE SPILL' : 'PARTY MOMENT'}
                </span>
                <p>
                  {currentPartyBeat?.text ??
                    'The music is up and the room is loosening. Something is about to happen.'}
                </p>
              </div>
            )}

            <div className="weekend-interlude__social-copy">
              <span className="weekend-interlude__section-label">
                {weekend.weekendDay === 1 ? 'DAY 1 · FREE TIME' : 'DAY 2 · FREE TIME'}
              </span>
              <h2>
                {weekend.episode === 'party'
                  ? weekend.weekendDay === 1
                    ? 'The party is in full swing.'
                    : 'The house is still awake.'
                  : weekend.episode === 'season_so_far'
                    ? weekend.weekendDay === 1
                      ? 'You have come a long way.'
                      : 'One quiet day before the game resumes.'
                    : weekend.weekendDay === 1
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

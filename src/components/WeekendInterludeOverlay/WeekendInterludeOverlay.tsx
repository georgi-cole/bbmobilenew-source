import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { getHubSaysQuestion, getHubSaysVotePercentage } from '../../features/weekend/hubSays'
import { resolveWeekendPartyBeat } from '../../features/weekend/hubParty'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { chooseHubSaysPlayer, recordWeekendPartyBeat } from '../../store/gameSlice'
import { learnRealityKnowledge, upsertRealitySecretRecord } from '../../social/socialSlice'
import { resolveWeatherDay } from '../../weather/weatherEngine'
import { WeatherGlyph } from '../../weather/WeatherBulletinOverlay'
import { getWeatherConditionLabel } from '../../weather/weatherConditionLabels'
import { getWeatherRuntime, type WeatherConditionId } from '../../weather/weatherRuntime'
import { formatSystemWeatherTemperature } from '../../weather/weatherTemperatureUnit'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import type { Player } from '../../types'
import './WeekendInterludeOverlay.css'

function getEpisodeTitle(weekendNumber: 1 | 2 | 3): string {
  if (weekendNumber === 1) return 'The Hub Says'
  if (weekendNumber === 2) return 'Hub Party'
  return 'The Season So Far'
}

function getWeatherLine(condition: WeatherConditionId): string {
  if (['sunny', 'mostly_sunny', 'clearing'].includes(condition)) {
    return 'The last light lingers over the Hub.'
  }
  if (['drizzle', 'light_showers', 'sun_showers', 'rainy', 'heavy_rain'].includes(condition)) {
    return 'A little rain settles over the Hub tonight.'
  }
  if (condition === 'stormy') return 'A storm rolls past while the Hub winds down.'
  if (condition === 'snowy' || condition === 'snow_showers') {
    return 'Snow drifts past as the Hub settles in.'
  }
  if (condition === 'misty' || condition === 'foggy') {
    return 'The Hub fades into a quiet, misty night.'
  }
  return 'Clouds gather as the Hub settles in for the night.'
}

function WeekendHubSaysChoices({
  players,
  selectedPlayerId,
  onSelect,
}: {
  players: Player[]
  selectedPlayerId?: string | null
  onSelect: (playerId: string) => void
}) {
  const [choicePage, setChoicePage] = useState(0)
  const pageSize = 4
  const pageCount = Math.max(1, Math.ceil(players.length / pageSize))
  const visiblePlayers = players.slice(choicePage * pageSize, choicePage * pageSize + pageSize)

  return (
    <div
      className="weekend-interlude__carousel"
      role="group"
      aria-label={`Choose a Hubmate, page ${choicePage + 1} of ${pageCount}`}
    >
      <button
        className="weekend-interlude__carousel-arrow"
        type="button"
        aria-label="Previous Hubmates"
        disabled={choicePage === 0}
        onClick={() => setChoicePage((page) => Math.max(0, page - 1))}
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M19.5 6.5 10 16l9.5 9.5M11 16h14" />
        </svg>
      </button>
      <div className="weekend-interlude__players">
        {visiblePlayers.map((player) => {
          const selected = selectedPlayerId === player.id
          return (
            <button
              key={player.id}
              type="button"
              className={`weekend-interlude__player${selected ? ' weekend-interlude__player--selected' : ''}`}
              aria-pressed={selected}
              onClick={() => onSelect(player.id)}
            >
              <PlayerAvatar
                player={player}
                size="sm"
                selected={selected}
                showRelationshipOutline={false}
                className="weekend-interlude__avatar"
              />
              <span>{player.name}</span>
            </button>
          )
        })}
      </div>
      <button
        className="weekend-interlude__carousel-arrow"
        type="button"
        aria-label="Next Hubmates"
        disabled={choicePage >= pageCount - 1}
        onClick={() => setChoicePage((page) => Math.min(pageCount - 1, page + 1))}
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="m12.5 6.5 9.5 9.5-9.5 9.5M21 16H7" />
        </svg>
      </button>
    </div>
  )
}

export default function WeekendInterludeOverlay() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const social = useAppSelector((state) => state.social)
  const weekend = game.weekendInterlude
  const activePlayers = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  const selectablePlayers = activePlayers.filter((player) => !player.isUser)
  const human = activePlayers.find((player) => player.isUser)

  useEffect(() => {
    if (
      !weekend?.active ||
      weekend.episode !== 'party' ||
      weekend.stage !== 'party' ||
      !weekend.party ||
      weekend.party.beats.some((beat) => beat.weekendDay === weekend.weekendDay)
    ) {
      return
    }

    const beat = resolveWeekendPartyBeat(game, social, weekend.weekendDay)
    if (!beat) return
    dispatch(recordWeekendPartyBeat(beat))

    if (
      weekend.debug ||
      beat.kind !== 'secret_spill' ||
      !beat.factId ||
      !beat.secretId ||
      !beat.speakerId ||
      !human
    ) {
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

  const weather = weekend ? resolveWeatherDay(game.gameId, weekend.afterDay) : null

  if (!weekend?.active || (weekend.debug && weekend.reunionPreview)) return null

  const hub = weekend.episode === 'hub_says' ? weekend.hubSays : undefined
  const hubBeat = hub?.beat ?? 'question'
  const currentQuestionId = hub?.questionIds[hub.currentQuestionIndex]
  const currentQuestion = currentQuestionId ? getHubSaysQuestion(currentQuestionId) : undefined
  const currentResult = currentQuestionId
    ? hub?.results.find((result) => result.questionId === currentQuestionId)
    : undefined
  const winner = currentResult
    ? activePlayers.find((player) => player.id === currentResult.winnerId)
    : undefined
  const winnerPercentage = currentResult
    ? getHubSaysVotePercentage(currentResult.voteCounts, currentResult.winnerId)
    : 0
  const currentPartyBeat = weekend.party?.beats.find(
    (beat) => beat.weekendDay === weekend.weekendDay
  )
  const seasonFacts = weekend.seasonSoFar?.facts ?? []
  const seasonFactIndex = weekend.seasonSoFar?.currentFactIndex ?? 0
  const currentSeasonFact = seasonFacts[seasonFactIndex]
  const currentSeasonPlayer = currentSeasonFact
    ? activePlayers.find((player) => player.id === currentSeasonFact.playerId)
    : undefined
  const weatherCondition = weather?.condition ?? 'partly_cloudy'
  const weatherTemperature = weather
    ? formatSystemWeatherTemperature(
        weather.temperatureC,
        getWeatherRuntime()?.config.temperature.unit ?? 'auto'
      )
    : ''
  const weekendNumber =
    weekend.weekendNumber ?? (weekend.afterDay === 5 ? 1 : weekend.afterDay === 10 ? 2 : 3)
  const welcomeCopy = weekend.finaleWeekend
    ? 'Three finalists. One last night to prepare for the Final Power Battle.'
    : weekend.episode === 'hub_says'
      ? 'Get ready for a little honesty. Let’s see what the players think of each other.'
      : weekend.episode === 'party'
        ? 'The lights are low and the Hub is dressed for a party. See where the night takes you.'
        : 'Take a breath and look back at the moments that brought everyone here.'
  const dayTwoTitle = weekend.finaleWeekend
    ? 'One last night before the Final Three.'
    : weekend.episode === 'party'
      ? 'One more day together.'
      : 'A new day to look back.'
  const dayTwoCopy = weekend.finaleWeekend
    ? 'The finalists are almost at the starting line. Make these last hours count.'
    : weekend.episode === 'party'
      ? 'The music is still playing. See what unfolds.'
      : 'Take in one last chapter before the game moves on.'
  const instructionEyebrow = weekend.finaleWeekend
    ? 'FINAL PREPARATIONS'
    : weekend.episode === 'hub_says'
      ? 'THE HUB SAYS'
      : weekend.episode === 'party'
        ? 'HUB PARTY'
        : 'THE SEASON SO FAR'
  const instructionTitle = weekend.finaleWeekend
    ? 'Three stories. One last night.'
    : weekend.episode === 'hub_says'
      ? 'Five questions are coming.'
      : weekend.episode === 'party'
        ? 'Follow the music.'
        : 'Every Hubmate has a story.'
  const instructionCopy = weekend.finaleWeekend
    ? 'Look back at the finalists’ journeys, then take a little time to prepare for the competitions ahead.'
    : weekend.episode === 'hub_says'
      ? 'For each one, choose the Hubmate who fits best. When everyone has answered, see who the Hub picked.'
      : weekend.episode === 'party'
        ? 'Talk, laugh, make a move. The night has its own plans.'
        : 'Play will take you through the moments that shaped this season, one story at a time.'
  const isWeekendFinalDay = weekend.stage === 'social' && weekend.weekendDay === 2
  const socialEyebrow = weekend.finaleWeekend
    ? 'BEFORE THE FINAL THREE'
    : 'A LITTLE TIME TO CONNECT'
  const socialTitle = weekend.finaleWeekend
    ? 'The last night is yours.'
    : weekend.episode === 'hub_says'
      ? 'That was fun, wasn’t it?'
      : weekend.episode === 'party'
        ? 'Keep the good company close.'
        : 'What a season it’s been.'
  const socialCopy = isWeekendFinalDay
    ? weekend.finaleWeekend
      ? 'Settle your plans, say what needs saying, and get some rest. Tomorrow, the Final Three begins.'
      : weekend.episode === 'party'
        ? 'The music’s still playing. Make the last few hours count.'
        : weekend.episode === 'hub_says'
          ? 'A few answers to sleep on, and a little more time to talk.'
          : 'You’ve come a long way. Enjoy a little more time together before the game moves on.'
    : weekend.finaleWeekend
      ? 'The finalists have one last evening to compare notes, strengthen a bond, or make a move before the competition.'
      : 'The Big Eye has left you a little extra room to talk, clear the air, or make a move. Make the most of it before the weekend wraps.'
  const rootClassName = [
    'weekend-interlude',
    `weekend-interlude--${weekend.episode.replace(/_/g, '-')}`,
    weekend.finaleWeekend ? 'weekend-interlude--finale' : '',
    `weekend-interlude--stage-${weekend.stage.replace(/_/g, '-')}`,
  ]
    .filter(Boolean)
    .join(' ')
  const finaleReunionAnnouncementActive =
    weekend.finaleWeekend &&
    !weekend.debug &&
    weekend.weekendDay === 2 &&
    (weekend.stage === 'tribunal_invitation' || weekend.stage === 'tribunal_glimpse') &&
    weekend.reunionDeparted !== true &&
    weekend.tribunalGlimpse?.opened !== true
  const reunionCast = game.players.filter(
    (player) => player.status === 'evicted' || player.status === 'jury'
  )
  const tribunalBadgeSrc = import.meta.env.BASE_URL + 'assets/avatar_badges/tribunal_badge.svg'

  if (finaleReunionAnnouncementActive) {
    return createPortal(
      <main
        className="weekend-reunion-announcement"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekend-reunion-announcement-title"
        data-testid="finale-reunion-announcement"
      >
        <div className="weekend-reunion-announcement__doors" aria-hidden="true">
          <span />
          <span />
        </div>
        <div className="weekend-reunion-announcement__content">
          <span className="weekend-reunion-announcement__eyebrow">THE FINALE WEEKEND</span>
          <h1 id="weekend-reunion-announcement-title">Look who's back.</h1>
          <p>All of them. One last party before the finale—for old scores and words left unsaid.</p>
          {reunionCast.length > 0 && (
            <div
              className="weekend-reunion-cast"
              role="group"
              aria-label="Returning eliminated players"
            >
              {[reunionCast.slice(0, 7), reunionCast.slice(7)]
                .filter((row) => row.length > 0)
                .map((row, rowIndex) => (
                  <div className="weekend-reunion-cast__row" key={`returning-row-${rowIndex}`}>
                    {row.map((player, index) => {
                      const cutoutPlayer = {
                        id: player.id,
                        name: player.name,
                        sex: player.sex,
                      }
                      return (
                        <div
                          className="weekend-reunion-cast__figure"
                          key={player.id}
                          style={{ '--cast-index': rowIndex * 7 + index } as CSSProperties}
                        >
                          <FullSizeCutoutImage
                            player={cutoutPlayer}
                            alt={`${player.name}, returning for the finale reunion`}
                            loading="eager"
                            decoding="async"
                          />
                        </div>
                      )
                    })}
                  </div>
                ))}
            </div>
          )}
        </div>
      </main>,
      document.body
    )
  }

  return (
    <section
      className={rootClassName}
      aria-label={`${getEpisodeTitle(weekendNumber)}, Weekend ${weekendNumber}, Day ${weekend.weekendDay}`}
      data-weekend-stage={weekend.stage}
    >
      {(weekend.stage === 'intro' || weekend.stage === 'day_two_intro') && (
        <div
          className="weekend-interlude__beat weekend-interlude__beat--message"
          aria-live="polite"
        >
          {!(weekend.stage === 'intro' && weekend.finaleWeekend) && (
            <span className="weekend-interlude__eyebrow">
              {weekend.stage === 'intro'
                ? 'THE WEEKEND BEGINS'
                : weekend.episode === 'party'
                  ? 'HUB PARTY'
                  : 'THE SEASON SO FAR'}
            </span>
          )}
          <h2
            className={
              weekend.stage === 'intro' && weekend.finaleWeekend
                ? 'weekend-interlude__stream-copy weekend-interlude__finale-title'
                : 'weekend-interlude__stream-copy'
            }
          >
            {weekend.stage === 'intro'
              ? weekend.finaleWeekend
                ? 'The Final Weekend'
                : 'Welcome to the weekend'
              : dayTwoTitle}
          </h2>
          <p className="weekend-interlude__stream-copy">
            {weekend.stage === 'intro' ? welcomeCopy : dayTwoCopy}
          </p>
        </div>
      )}

      {weekend.stage === 'instructions' && (
        <div
          className="weekend-interlude__beat weekend-interlude__beat--message"
          aria-live="polite"
        >
          <span className="weekend-interlude__eyebrow">{instructionEyebrow}</span>
          <h2 className="weekend-interlude__stream-copy">{instructionTitle}</h2>
          <p className="weekend-interlude__stream-copy">{instructionCopy}</p>
        </div>
      )}

      {weekend.stage === 'hub_says' && currentQuestion && (
        <div className="weekend-interlude__beat weekend-interlude__hub" aria-live="polite">
          <div className="weekend-interlude__eyebrow">THE HUB SAYS</div>

          {hubBeat !== 'result' && (
            <h2 className="weekend-interlude__question weekend-interlude__stream-copy">
              {currentQuestion.prompt}
            </h2>
          )}

          {hubBeat !== 'result' && (
            <WeekendHubSaysChoices
              key={hub?.currentQuestionIndex ?? 0}
              players={selectablePlayers}
              selectedPlayerId={hub?.selectedPlayerId}
              onSelect={(playerId) => dispatch(chooseHubSaysPlayer(playerId))}
            />
          )}

          {hubBeat === 'result' && currentResult && (
            <div className="weekend-interlude__result">
              <div className="weekend-interlude__result-player">
                {winner && (
                  <PlayerAvatar
                    player={winner}
                    size="md"
                    showRelationshipOutline={false}
                    className="weekend-interlude__avatar"
                  />
                )}
                <strong>{winner?.name ?? 'A Hubmate'}</strong>
              </div>
              <span className="weekend-interlude__result-percentage">{winnerPercentage}%</span>
            </div>
          )}
        </div>
      )}

      {weekend.stage === 'party' && (
        <div className="weekend-interlude__beat weekend-interlude__party-moment" aria-live="polite">
          <span className="weekend-interlude__eyebrow">
            {currentPartyBeat?.visibility === 'private' ? 'A QUIET WORD' : 'HUB PARTY'}
          </span>
          <p className="weekend-interlude__stream-copy">
            {currentPartyBeat?.text ?? 'A few quiet conversations unfold around the Hub.'}
          </p>
        </div>
      )}

      {weekend.stage === 'season_so_far' && (
        <div className="weekend-interlude__beat weekend-interlude__season-fact" aria-live="polite">
          <span className="weekend-interlude__eyebrow">THE SEASON SO FAR</span>
          {currentSeasonFact ? (
            <div className="weekend-interlude__fact">
              {currentSeasonPlayer && (
                <PlayerAvatar
                  player={currentSeasonPlayer}
                  size="sm"
                  showRelationshipOutline={false}
                />
              )}
              <p className="weekend-interlude__stream-copy">{currentSeasonFact.text}</p>
            </div>
          ) : (
            <h2>Every Hubmate has a story.</h2>
          )}
        </div>
      )}

      {weekend.stage === 'social' && (
        <div
          className="weekend-interlude__beat weekend-interlude__beat--message"
          aria-live="polite"
        >
          {!isWeekendFinalDay && (
            <>
              <span className="weekend-interlude__eyebrow">{socialEyebrow}</span>
              <h2 className="weekend-interlude__stream-copy">{socialTitle}</h2>
            </>
          )}
          <p className="weekend-interlude__stream-copy">{socialCopy}</p>
        </div>
      )}

      {weekend.stage === 'finale_reunion_social' && (
        <div
          className="weekend-interlude__beat weekend-interlude__beat--message weekend-interlude__reunion-invitation"
          aria-live="polite"
        >
          <span className="weekend-interlude__eyebrow">ONE LAST NIGHT TOGETHER</span>
          <h2 className="weekend-interlude__stream-copy">Reconnect before the finale.</h2>
          <p className="weekend-interlude__stream-copy">
            Your former Hubmates are back. Visit profiles, make amends, clear the air.
          </p>
        </div>
      )}

      {weekend.stage === 'finale_sequester_announcement' && (
        <div
          className="weekend-interlude__beat weekend-interlude__beat--message weekend-interlude__sequester-announcement"
          aria-live="polite"
        >
          <img
            className="weekend-interlude__sequester-badge"
            src={tribunalBadgeSrc}
            alt=""
            aria-hidden="true"
          />
          <span className="weekend-interlude__eyebrow">TRIBUNAL SEQUESTER</span>
          <h2 className="weekend-interlude__stream-copy">Special footage is ready.</h2>
          <p className="weekend-interlude__stream-copy">
            Go to the Confessional for a special stream.
          </p>
        </div>
      )}

      {(weekend.stage === 'tribunal_invitation' || weekend.stage === 'tribunal_glimpse') && (
        <div
          className={`weekend-interlude__beat weekend-interlude__beat--message ${weekend.reunionDepartureActive || weekend.reunionDeparted ? 'weekend-interlude__reunion-departure' : 'weekend-interlude__reunion-arrival'}`}
          aria-live="polite"
        >
          {weekend.reunionDepartureActive ? (
            <>
              <span className="weekend-interlude__eyebrow">ONE BY ONE, THEY LEAVE</span>
              <h2 className="weekend-interlude__stream-copy">The reunion is over.</h2>
              <p className="weekend-interlude__stream-copy">
                The party’s over, and the guests are heading home. Some relationships may be beyond
                repair; others may have opened the door to friendship.
              </p>
            </>
          ) : weekend.reunionDeparted ? (
            <>
              <span className="weekend-interlude__eyebrow">THE REUNION IS OVER</span>
              <h2 className="weekend-interlude__stream-copy">The eliminated players have left.</h2>
              <p className="weekend-interlude__stream-copy">
                The Tribunal is in place. The Final Power Battle is next.
              </p>
            </>
          ) : (
            <>
              <span className="weekend-interlude__eyebrow">THE FINALE WEEKEND</span>
              <h2 className="weekend-interlude__stream-copy">Look who's back.</h2>
              <p className="weekend-interlude__stream-copy">
                All of them. One last party before the finale—for old scores and words left unsaid.
              </p>
            </>
          )}
        </div>
      )}

      {weekend.stage === 'finale_battle_ready' && (
        <div
          className="weekend-interlude__beat weekend-interlude__beat--message weekend-interlude__reunion-departure"
          aria-live="polite"
        >
          {weekend.reunionDepartureActive ? (
            <>
              <span className="weekend-interlude__eyebrow">ONE BY ONE, THEY LEAVE</span>
              <h2 className="weekend-interlude__stream-copy">The reunion is over.</h2>
              <p className="weekend-interlude__stream-copy">
                The party’s over, and the guests are heading home. Some relationships may be beyond
                repair; others may have opened the door to friendship.
              </p>
            </>
          ) : weekend.reunionDeparted ? (
            <>
              <span className="weekend-interlude__eyebrow">THE REUNION IS OVER</span>
              <h2 className="weekend-interlude__stream-copy">The eliminated players have left.</h2>
              <p className="weekend-interlude__stream-copy">
                The Tribunal is in place. The Final Power Battle is next.
              </p>
            </>
          ) : (
            <>
              <span className="weekend-interlude__eyebrow">THE TRIBUNAL IS SEQUESTERED</span>
              <h2 className="weekend-interlude__stream-copy">It’s time to say goodbye.</h2>
              <p className="weekend-interlude__stream-copy">
                The party’s over, and the guests are heading home. Some relationships may be beyond
                repair; others may have opened the door to friendship.
              </p>
            </>
          )}
        </div>
      )}

      {weekend.stage === 'day_transition' && weather && (
        <div className="weekend-interlude__beat weekend-interlude__weather" aria-live="polite">
          <span className="weekend-interlude__eyebrow">A MOMENT BETWEEN DAYS</span>
          <div className="weekend-interlude__weather-main">
            <span className="weekend-interlude__temperature">{weatherTemperature}</span>
            <div className="weekend-interlude__weather-condition">
              <WeatherGlyph
                condition={weatherCondition}
                rainbow={weather.phenomenon === 'rainbow'}
              />
              <span>{getWeatherConditionLabel(weatherCondition)}</span>
            </div>
          </div>
          <p>{getWeatherLine(weatherCondition)}</p>
        </div>
      )}
    </section>
  )
}

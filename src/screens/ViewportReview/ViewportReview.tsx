import { useEffect, useMemo, useState } from 'react'
import { configureStore, type UnknownAction } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { getRouteSearchParams } from '../../utils/routeQuery'
import { store, type RootState } from '../../store/store'
import gameReducer, { createInitialGameState } from '../../store/gameSlice'
import cwgoReducer from '../../features/cwgo/cwgoCompetitionSlice'
import challengeReducer from '../../store/challengeSlice'
import { getAllGames, getGame } from '../../minigames/registry'
import MinigameHost from '../../components/MinigameHost/MinigameHost'
import PublicFavoriteOverlay from '../../components/PublicFavoriteOverlay/PublicFavoriteOverlay'
import SeasonRecapCinematic from '../../components/SeasonRecapCinematic/SeasonRecapCinematic'
import ChatOverlay from '../../components/ChatOverlay/ChatOverlay'
import GameOver from '../GameOver/GameOver'
import Leaderboard from '../Leaderboard/Leaderboard'
import './ViewportReview.css'

const CASES = [
  [
    'chainOfGreed',
    'Chain of Greed',
    'Try Shared Chain and Solo Rush. Check the ladder, action row, and round rankings.',
  ],
  [
    'dontGoOver',
    "Don't Go Over + Reverse Time",
    'Enter a guess using every keypad row. End early from the eye menu to test Reverse Time; the retry question should change.',
  ],
  [
    'threeDigitsQuiz',
    'Number Trivia',
    'The question, full number pad, and Lock In must fit together. Continue into the round results.',
  ],
  [
    'timingBar',
    'Timing Bar',
    'Let the first timer expire to finish last. Both spectator choices must remain visible below the scrollable ranking.',
  ],
  [
    'capitalization',
    'Back 2 the Game',
    'Start the competition. Skip or answer three questions to reach a checkpoint, then continue to the next globe spin.',
  ],
  [
    'archive',
    'Final Archive',
    'Skip the opening. Explore awards and the season calendar. Long details scroll vertically; the page should never pan sideways.',
  ],
  [
    'favorite',
    'Audience vote + final reveal',
    'Lock a forecast, then fast forward. Check the live board and the final Continue button.',
  ],
  [
    'chat',
    'Final Goodbyes / Final Four',
    'The transcript uses the Confessional style. Scroll earlier messages while the Continue action remains anchored.',
  ],
  [
    'gameover',
    'Season Complete + After the Eye',
    'Swipe the record pages, then open Aftermath and its edition. Check the masthead below the simulated status row.',
  ],
  [
    'cardClash',
    'Deck of Light',
    'All three opening tools must remain accessible, including Replay.',
  ],
  [
    'batteryLow',
    'Battery Low',
    'All 24 batteries must be visible on a short phone. Select the reserve and continue playing.',
  ],
  [
    'hall',
    'Hall of Fame',
    'Open Achievements. Scroll vertically and check that there is no sideways page movement.',
  ],
] as const

function createReviewStore() {
  const game = createInitialGameState({ seed: 424242 })
  game.players = game.players.slice(0, 16).map((player, index) => ({
    ...player,
    isUser: index === 0,
    isWinner: index === 0,
    finalRank: index + 1,
    seasonPlacement: index + 1,
    stats: { ...player.stats, lohWins: 3, posWins: 3, timesNominated: 4 },
  }))
  // This nested store has no persistence middleware or subscribers: testing a
  // fixture cannot overwrite the player's real season, purchases or profile.
  const initial = { ...structuredClone(store.getState()), game }
  return configureStore({
    reducer: (state: RootState = initial, action: UnknownAction): RootState => ({
      ...state,
      game: gameReducer(state.game, action),
      cwgo: cwgoReducer(state.cwgo, action),
      challenge: challengeReducer(state.challenge, action),
    }),
  })
}

function ReviewCase({ id, safe, premium }: { id: string; safe: boolean; premium: boolean }) {
  useEffect(() => {
    const root = document.documentElement
    const values = {
      '--safe-top': safe ? '59px' : '0px',
      '--app-safe-area-top': safe ? '59px' : '0px',
      '--safe-bottom': safe ? '34px' : '0px',
    }
    const previous = Object.keys(values).map((key) => [key, root.style.getPropertyValue(key)])
    for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value)
    return () => {
      for (const [key, value] of previous) {
        if (value) root.style.setProperty(key, value)
        else root.style.removeProperty(key)
      }
    }
  }, [safe])
  const reviewStore = useMemo(() => createReviewStore(), [])
  const players = reviewStore.getState().game.players
  const [finished, setFinished] = useState(false)
  const game = getGame(id)
  const participants = players.slice(0, 8).map((player, index) => ({
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    isHuman: index === 0,
    precomputedScore: index === 0 ? 0 : 80 - index,
    previousPR: null,
  }))
  let content
  if (finished) content = <button onClick={() => location.reload()}>Restart this case</button>
  else if (id === 'archive')
    content = (
      <SeasonRecapCinematic
        season={3}
        week={14}
        players={players}
        onComplete={() => setFinished(true)}
      />
    )
  else if (id === 'favorite')
    content = (
      <PublicFavoriteOverlay
        candidates={players.slice(0, 8)}
        seed={424242}
        eliminationIntervalMs={1200}
        onComplete={() => setFinished(true)}
      />
    )
  else if (id === 'chat')
    content = (
      <ChatOverlay
        lines={players.map((player, index) => ({
          id: String(index),
          role: 'player',
          player,
          text: 'I learned more than I expected. You kept me honest in here. See you on finale night.',
        }))}
        header={{ title: 'Final Goodbyes', subtitle: 'The last night in the Hub' }}
        typingSpeed={3}
        onComplete={() => setFinished(true)}
      />
    )
  else if (id === 'gameover') content = <GameOver developmentPreview />
  else if (id === 'hall') content = <Leaderboard />
  else if (game)
    content = (
      <MinigameHost
        game={game}
        stateStore={reviewStore}
        participants={participants}
        premiumPresentationOverride={premium}
        skipRules
        skipCountdown
        gameOptions={{
          seed: 424242,
          prizeType: 'LOH',
          capitalizationContext: id === 'capitalization' ? 'battleBack' : undefined,
        }}
        onDone={() => setFinished(true)}
        competitionRetry={{ enabled: true, onWatch: (reward) => reward() }}
      />
    )
  else content = <p>Unknown review case.</p>
  return (
    <div className={`app-shell viewport-review-case${safe ? ' viewport-review-case--safe' : ''}`}>
      <Provider store={reviewStore}>{content}</Provider>
      {safe && (
        <div className="viewport-review-status" aria-hidden="true">
          19:27 <span>Simulated iPhone status area</span>
        </div>
      )}
    </div>
  )
}

/** Development-only visual review. Fixtures never write into the live store. */
export default function ViewportReview({ standalone = false }: { standalone?: boolean } = {}) {
  const params = getRouteSearchParams()
  const caseId = params.get('case')
  const [selected, setSelected] = useState('dontGoOver')
  const [device, setDevice] = useState('390x844')
  const [safe, setSafe] = useState(true)
  const [premium, setPremium] = useState(false)
  if (caseId)
    return (
      <ReviewCase
        id={caseId}
        safe={params.get('safe') !== '0'}
        premium={params.get('premium') === '1'}
      />
    )
  const [width, height] = device.split('x').map(Number)
  const source = `${standalone ? window.location.href.split('#')[0] : import.meta.env.BASE_URL}#/viewport-review?case=${selected}&safe=${safe ? 1 : 0}&premium=${premium ? 1 : 0}`
  return (
    <main className="viewport-review">
      <h1>Mobile layout review</h1>
      <p>
        Test the real game screens using an isolated sample season. Ad rewards are simulated here.
      </p>
      <label>
        Phone size{' '}
        <select value={device} onChange={(event) => setDevice(event.target.value)}>
          <option>390x844</option>
          <option>320x568</option>
          <option>430x932</option>
          <option>844x390</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={safe} onChange={(event) => setSafe(event.target.checked)} />{' '}
        Simulate iPhone status and home areas
      </label>
      <label>
        <input
          type="checkbox"
          checked={premium}
          onChange={(event) => setPremium(event.target.checked)}
        />{' '}
        Premium presentation
      </label>
      <div className="viewport-review__cases">
        {CASES.map(([id, title, instructions]) => (
          <button key={id} onClick={() => setSelected(id)} aria-pressed={selected === id}>
            <strong>{title}</strong>
            <span>{instructions}</span>
          </button>
        ))}
      </div>
      <p>
        <a href={source} target="_blank" rel="noreferrer">
          Open selected case full screen
        </a>{' '}
        · Re-select a case or reload its frame to restart.
      </p>
      <div className="viewport-review__frame" style={{ width, height }}>
        <iframe
          key={source + device}
          src={source}
          title="Selected viewport review case"
          width={width}
          height={height}
        />
      </div>
      <details>
        <summary>Check another minigame</summary>
        <div className="viewport-review__cases">
          {getAllGames()
            .filter((entry) => !entry.retired)
            .map((entry) => (
              <button key={entry.key} onClick={() => setSelected(entry.key)}>
                {entry.title}
              </button>
            ))}
        </div>
      </details>
    </main>
  )
}

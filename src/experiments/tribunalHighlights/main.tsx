import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { Provider } from 'react-redux'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { store } from '../../store/store'
import { hydrateGame } from '../../store/gameSlice'
import { setPendingChallenge } from '../../store/challengeSlice'
import { setAudio, setDisplay, setSim } from '../../store/settingsSlice'
import { I18nProvider } from '../../i18n'
import AppShell from '../../components/layout/AppShell'
import GameScreen from '../../screens/GameScreen/GameScreen'
import FauxTvProgrammingController from '../../broadcasting/FauxTvProgrammingController'
import AudioStateSync from '../../services/sound/AudioStateSync'
import AudioGate from '../../components/AudioGate/AudioGate'
import { SoundManager } from '../../services/sound/SoundManager'
import { createTribunalScenario, type TribunalScenario } from './fixtures'
import '../../index.css'
import '../../styles/gameDesignSystem.css'
import '../../styles/gameAccessibility.css'
import './preview.css'

const scenarios: { id: TribunalScenario; label: string }[] = [
  { id: 'your_elimination', label: 'Your elimination' },
  { id: 'invitation', label: 'Your Tribunal choice' },
  { id: 'arrival', label: 'Arrival' },
  { id: 'double', label: 'Double eviction' },
  { id: 'final_four', label: 'Final Four' },
  { id: 'finalists', label: 'Final Two' },
  { id: 'battle_back', label: 'Battle Back' },
]

function loadScenario(scenario: TribunalScenario) {
  store.dispatch(setPendingChallenge(null))
  store.dispatch(setSim({ enableTwists: scenario === 'battle_back', publicMode: false }))
  store.dispatch(hydrateGame(createTribunalScenario(scenario)))
}

function PreviewAudio() {
  const location = useLocation()
  return <AudioStateSync hash={`#${location.pathname}${location.search}`} />
}

export default function Preview() {
  const [scenario, setScenario] = useState<TribunalScenario>(
    () =>
      scenarios.find(
        (item) => item.id === new URLSearchParams(window.location.search).get('scenario')
      )?.id ?? 'arrival'
  )
  const [reduced, setReduced] = useState(false)
  const [restart, setRestart] = useState(0)
  const [recapStyle, setRecapStyle] = useState(() =>
    new URLSearchParams(window.location.search).get('recapStyle') === 'cinematic'
      ? 'cinematic'
      : 'standard'
  )
  const embeddedUrl = new URL(window.location.href)
  embeddedUrl.searchParams.set('embedded', '1')
  embeddedUrl.searchParams.set('scenario', scenario)
  embeddedUrl.searchParams.set('reducedMotion', String(reduced))
  embeddedUrl.searchParams.set('recapStyle', recapStyle)
  embeddedUrl.hash = '/game?phonePreview=true'
  return (
    <div className="tribunal-preview">
      <aside className="tribunal-preview__notes">
        <p>THE BIG EYE · EXPERIMENT</p>
        <h1>Life after elimination.</h1>
        <p>
          Actual game components and season engine. These scenarios use a separate demonstration
          season.
        </p>
        <div className="tribunal-preview__scenarios">
          {scenarios.map((item) => (
            <button
              key={item.id}
              aria-pressed={scenario === item.id}
              onClick={() => {
                setScenario(item.id)
                setRestart((value) => value + 1)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="tribunal-preview__recap-style">
          Recap style
          <select
            aria-label="Recap style"
            value={recapStyle}
            onChange={(event) => setRecapStyle(event.target.value)}
          >
            <option value="standard">Standard</option>
            <option value="cinematic">VIP cinematic</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={reduced}
            onChange={(event) => {
              setReduced(event.target.checked)
            }}
          />{' '}
          Reduced motion
        </label>
        <p>
          Use <strong>Play</strong> to follow the scenes, or jump to the final vote. The Battle Back
          scenario pauses for the real return competition. Full-season viewing remains available.
        </p>
        <button onClick={() => setRestart((value) => value + 1)}>Restart this scenario</button>
      </aside>
      <div className="tribunal-preview__phone">
        <iframe
          key={`${scenario}:${restart}:${reduced}:${recapStyle}`}
          title="Playable Tribunal flow"
          src={embeddedUrl.href}
        />
      </div>
    </div>
  )
}

if (!import.meta.env.DEV) throw new Error('This preview is development-only')
store.dispatch(setAudio({ musicOn: true, sfxOn: false }))
document.body.classList.add('experiment-game-chrome-refined')
const previewParams = new URLSearchParams(window.location.search)
if (previewParams.get('embedded') === '1') {
  void SoundManager.init()
  const selected =
    scenarios.find((item) => item.id === previewParams.get('scenario'))?.id ?? 'arrival'
  loadScenario(selected)
  store.dispatch(setDisplay({ reduceMotion: previewParams.get('reducedMotion') === 'true' }))
  createRoot(document.getElementById('root')!).render(
    <Provider store={store}>
      <I18nProvider>
        <FauxTvProgrammingController />
        <MemoryRouter initialEntries={['/game?phonePreview=true']}>
          <PreviewAudio />
          <AudioGate />
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/game" element={<GameScreen />} />
              <Route
                path="*"
                element={
                  <div className="tribunal-preview__paused">
                    <h1>Demo season paused</h1>
                    <p>
                      You can return to this season or restart a scenario from the preview controls.
                    </p>
                    <Link to="/game?phonePreview=true">Return to the season</Link>
                  </div>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </Provider>
  )
} else createRoot(document.getElementById('root')!).render(<Preview />)

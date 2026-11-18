import { useEffect, useRef, useState } from 'react'
import type { TribunalHighlight } from '../../types'
import { useNavigate } from 'react-router'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { setTribunalViewingMode, markTribunalSequesterGuideSeen } from '../../store/gameSlice'
import { setTribunalHighlightsOpen } from '../../store/uiSlice'
import { getTribunalMembers } from '../../rules/tribunalPolicy'
import {
  isTribunalVoteReady,
  tribunalHighlightLines,
} from '../../features/tribunal/tribunalHighlights'
import { stepTribunalHighlights } from '../../features/tribunal/tribunalHighlightsProgression'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import GameControlDock from '../GameControlDock/GameControlDock'
import { joinPublicAssetPath } from '../../utils/avatar'
import TribunalRecapScreen, { type RecapSceneNavigation } from './TribunalRecapScreen'
import TribunalSequesterGuide from './TribunalSequesterGuide'
import ConfirmExitModal from '../ConfirmExitModal/ConfirmExitModal'
import { markTutorialGuideHandled } from '../../onboarding/tutorialGuidePreference'
import './TribunalHighlights.css'

export default function TribunalHighlights() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const game = useAppSelector((state) => state.game)
  const { activeProfileId, isGuest } = useAppSelector((state) => state.profiles)
  const [guideOpen, setGuideOpen] = useState(() => !game.tribunalSequesterGuideSeen)
  const [confirmVote, setConfirmVote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [needsAttention, setNeedsAttention] = useState(false)
  const [paused, setPaused] = useState(false)
  const [sceneNavigation, setSceneNavigation] = useState<RecapSceneNavigation | null>(null)
  const [heldHighlight, setHeldHighlight] = useState<TribunalHighlight | undefined>(undefined)
  const running = useRef(false)
  const generation = useRef(0)
  const mounted = useRef(true)
  const alive = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  const tribunalMembers = getTribunalMembers(game.players)
  const highlights = game.tribunalHighlights ?? []
  const rosterIds = new Set([
    ...alive.map((player) => player.id),
    ...highlights.flatMap((entry) => entry.evicteeIds),
  ])
  const roster = game.players.filter((player) => !player.isUser && rosterIds.has(player.id))
  const highlight = busy ? heldHighlight : highlights.at(-1)
  const voteReady = isTribunalVoteReady(game)
  const departures = highlight
    ? game.players.filter((player) => highlight.evicteeIds.includes(player.id))
    : []
  const lines = highlight && !voteReady ? tribunalHighlightLines(highlight, game) : []
  const overlayOpen = guideOpen || confirmVote
  const closeGuide = () => {
    dispatch(markTribunalSequesterGuideSeen())
    markTutorialGuideHandled(activeProfileId, isGuest, 'tribunal')
    setGuideOpen(false)
  }

  useEffect(() => {
    dispatch(setTribunalHighlightsOpen(true))
    return () => {
      dispatch(setTribunalHighlightsOpen(false))
    }
  }, [dispatch])

  const stop = () => {
    generation.current += 1
    running.current = false
    setBusy(false)
    setPaused(true)
  }

  useEffect(() => {
    mounted.current = true
    const pauseWhenHidden = () => {
      if (document.visibilityState === 'visible') return
      generation.current += 1
      running.current = false
      setBusy(false)
      setPaused(true)
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => {
      mounted.current = false
      generation.current += 1
      running.current = false
      document.removeEventListener('visibilitychange', pauseWhenHidden)
    }
  }, [game.gameId])

  const watchFullSeason = () => {
    if (guideOpen) return
    stop()
    dispatch(setTribunalViewingMode('full'))
  }

  const run = async (target: 'eviction' | 'vote') => {
    if (guideOpen || running.current) return
    running.current = true
    setHeldHighlight(highlights.at(-1))
    const ticket = ++generation.current
    setBusy(true)
    setNeedsAttention(false)
    setPaused(false)
    try {
      for (let step = 0; step < 1200; step += 1) {
        if (!mounted.current || generation.current !== ticket) return
        const result = dispatch(stepTribunalHighlights(game.gameId))
        if (result === 'attention') {
          setNeedsAttention(true)
          break
        }
        if (result !== 'advanced' && !(result === 'eviction' && target === 'vote')) break
        // Leave time for rendering, cancellation, navigation, and save persistence.
        if (step % 4 === 3) await new Promise<void>((resolve) => window.setTimeout(resolve, 16))
        if (step === 1199) setNeedsAttention(true)
      }
    } finally {
      if (mounted.current && generation.current === ticket) {
        running.current = false
        setBusy(false)
      }
    }
  }

  const title = voteReady
    ? 'The choice is yours.'
    : departures.length > 1
      ? 'Two departures. One night.'
      : departures.length
        ? 'A new face in the Tribunal.'
        : 'Your story isn’t over.'

  const tribunalSummary = (
    <div className="tribunal-highlights__jury">
      <span className="tribunal-highlights__jury-dot" />
      {tribunalMembers.length} in the Tribunal<span>Including you</span>
    </div>
  )

  return (
    <section
      className={`tribunal-highlights${voteReady ? ' tribunal-highlights--finalists' : ''}`}
      aria-label="Tribunal highlights"
    >
      <div className="tribunal-highlights__ambience" aria-hidden="true">
        <i />
        <i />
      </div>
      <div className="tribunal-highlights__shell" inert={confirmVote}>
        <header className="tribunal-highlights__header">
          <div className="tribunal-highlights__header-actions">
            <button
              className="tribunal-highlights__home"
              onClick={() => {
                if (guideOpen) return
                stop()
                navigate('/')
              }}
            >
              <span aria-hidden="true">‹</span> Home
            </button>
          </div>
          <span className="tribunal-highlights__brand">THE BIG EYE</span>
          <div className="tribunal-highlights__header-meta">
            <span className="tribunal-highlights__seat">YOUR SEAT IS SAFE</span>
            {highlights.length > 0 && (
              <details className="tribunal-highlights__history">
                <summary aria-label="Review the eliminations">Eliminations</summary>
                <ol>
                  {highlights.map((entry) => (
                    <li key={entry.id}>
                      <span>Day {entry.week}</span>
                      <strong>
                        {entry.evicteeIds
                          .map((id) => game.players.find((p) => p.id === id)?.name ?? id)
                          .join(' & ')}
                      </strong>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        </header>

        <div className="tribunal-highlights__heading">
          <p className="game-ui-eyebrow">THE TRIBUNAL</p>
          <h1>{voteReady ? 'The Final Two' : 'Meanwhile, in the Hub…'}</h1>
          {!voteReady && <p>The season moves on. Your vote still matters.</p>}
        </div>

        <main className="tribunal-highlights__content">
          <div className="tribunal-highlights__scene">
            <TribunalRecapScreen
              game={game}
              highlight={highlight}
              voteReady={voteReady}
              onSceneNavigationChange={setSceneNavigation}
              paused={overlayOpen}
            />
            {!voteReady && (
              <div className="tribunal-highlights__story" aria-live="polite" aria-atomic="true">
                <h2>{title}</h2>
                {voteReady ? null : lines.length ? (
                  <ul>
                    {lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Follow the key moments, meet the next Tribunal members, and help choose the
                    winner.
                  </p>
                )}
              </div>
            )}
          </div>

          {!voteReady && (
            <section className="tribunal-highlights__remaining" aria-label="Still in the Hub">
              <div className="tribunal-highlights__remaining-heading">
                <div className="tribunal-highlights__section-label">
                  <span>STILL IN THE HUB</span>
                  <strong>{alive.length}</strong>
                </div>
                {tribunalSummary}
              </div>
              <div
                className="tribunal-highlights__roster"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, roster.length)}, minmax(0, 1fr))`,
                }}
              >
                {roster.map((player) => (
                  <div
                    key={player.id}
                    className={`tribunal-highlights__roster-player${['evicted', 'jury'].includes(player.status) ? ' is-eliminated' : ''}`}
                  >
                    <div className="tribunal-highlights__roster-portrait">
                      <PlayerAvatar player={player} size="sm" showRelationshipOutline={false} />
                      {['evicted', 'jury'].includes(player.status) && (
                        <span
                          className="tribunal-highlights__roster-strike"
                          role="img"
                          aria-label={`${player.name} eliminated`}
                          style={{
                            backgroundImage: `url("${joinPublicAssetPath('evictionmark/evictionmark.png')}"), linear-gradient(45deg, transparent 43%, #c8565f 48%, #c8565f 52%, transparent 57%)`,
                          }}
                        />
                      )}
                    </div>
                    <span>{player.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>

        <footer className="tribunal-highlights__controls">
          {!voteReady && (
            <p className="tribunal-highlights__status" role="status">
              {busy
                ? `Following Day ${game.week}…`
                : needsAttention
                  ? 'The live show needs your attention.'
                  : voteReady
                    ? 'Your vote will help choose the winner.'
                    : paused
                      ? 'Paused. Continue whenever you’re ready.'
                      : 'A return opportunity will bring you back to the live show.'}
            </p>
          )}
          <div className="tribunal-highlights__dock">
            <GameControlDock
              navigationDisabled
              presentationPlayback
              presentationActions={{
                left: {
                  label: 'Go to final vote',
                  onClick: voteReady
                    ? watchFullSeason
                    : () => {
                        if (!guideOpen) setConfirmVote(true)
                      },
                  disabled: busy || needsAttention,
                },
                right: { label: 'Watch full season', onClick: watchFullSeason, disabled: busy },
              }}
              primaryDisabled={busy}
              primaryLabel="Play"
              onPrimaryActionClick={
                guideOpen
                  ? () => {}
                  : voteReady || needsAttention
                    ? watchFullSeason
                    : (sceneNavigation?.advance ?? (() => void run('eviction')))
              }
            />
          </div>
        </footer>
      </div>
      {guideOpen && <TribunalSequesterGuide onClose={closeGuide} />}
      <ConfirmExitModal
        open={confirmVote}
        title="Skip to the final vote?"
        description="This advances past the remaining highlights. Eligible Battle Back opportunities will still bring you to the live show, and you will cast your final vote yourself."
        confirmLabel="Go to final vote"
        cancelLabel="Keep watching"
        onCancel={() => setConfirmVote(false)}
        onConfirm={() => {
          setConfirmVote(false)
          void run('vote')
        }}
      />
    </section>
  )
}

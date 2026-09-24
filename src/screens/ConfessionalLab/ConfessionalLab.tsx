import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import { useAppSelector } from '../../store/hooks'
import { isDebugAccessGranted } from '../../utils/debugMode'
import {
  createInitialBigEyeState,
  type BigEyeConversationState,
  type BigEyeQuestion,
} from '../../bb/confessionalBigEye'
import {
  CONFESSIONAL_CALIBRATION_SCENARIOS,
  CONFESSIONAL_LAB_WORLD,
  runConfessionalCalibrationSuite,
  type ConfessionalCalibrationCategory,
  type ConfessionalCalibrationScenarioResult,
} from '../../bb/confessionalCalibration'
import { getConfessionalRuntimeConfig } from '../../bb/confessionalRuntimeConfig'
import {
  analyzeBigEyeTurn,
  generateBigBrotherReply,
  type BigBrotherResponse,
  type BigEyeTurnAnalysis,
  type BigEyeWorldContext,
} from '../../services/bigBrother'
import './ConfessionalLab.css'

type LabTab = 'workbench' | 'suite'
type ContextMode = 'synthetic' | 'current'

const CATEGORY_LABELS: Record<ConfessionalCalibrationCategory, string> = {
  understanding: 'Understanding',
  knowledge: 'Knowledge',
  continuity: 'Continuity',
  authored: 'Authored',
  character: 'Character',
  salience: 'Salience',
}

function mergeState(input: {
  lastQuestion: BigEyeQuestion | null
  threadTopic: string
  focusPlayer: string
  familiarity: number
  warmth: number
  friction: number
}): BigEyeConversationState {
  const state = createInitialBigEyeState()
  return {
    ...state,
    lastQuestion: input.lastQuestion,
    thread:
      input.threadTopic.trim() || input.focusPlayer.trim()
        ? {
            topic: input.threadTopic.trim() || null,
            focusPlayer: input.focusPlayer.trim() || null,
            questionKind: input.lastQuestion,
            depth: 1,
          }
        : null,
    rapport: {
      familiarity: Math.max(0, Math.min(100, input.familiarity)),
      warmth: Math.max(-10, Math.min(10, input.warmth)),
      friction: Math.max(0, Math.min(10, input.friction)),
    },
  }
}

function memoryDelta(before: string, after: string): string[] {
  const previous = new Set(
    before
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  )
  return after
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !previous.has(line))
}

function routeLabel(analysis: BigEyeTurnAnalysis): string {
  if (analysis.route === 'authored') return 'AUTHORED'
  if (analysis.route === 'deterministic') return 'LOCAL / DETERMINISTIC'
  return analysis.wouldRequestDirector ? 'GENERATIVE REQUEST' : 'GENERATION ELIGIBLE'
}

export default function ConfessionalLab() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const hasAccess = isDebugAccessGranted(searchParams, window.location.hostname)

  const game = useAppSelector((state) => state.game)
  const relationships = useAppSelector((state) => state.social.relationships)
  const realityDomain = useAppSelector((state) => state.social.reality)
  const remoteConfessionalRevision = useAppSelector(
    (state) => state.remoteConfig.config?.confessional?.revision
  )
  const userPlayer = game.players.find((player) => player.isUser)
  const playerId = userPlayer?.id ?? 'user'
  const playerName = userPlayer?.name ?? 'Housemate'

  const currentWorld = useMemo<BigEyeWorldContext>(() => {
    const nameById = new Map(game.players.map((player) => [player.id, player.name]))
    const nameFor = (id: string | null | undefined) => (id ? (nameById.get(id) ?? id) : null)
    const relationshipRows = Object.entries(relationships[playerId] ?? {})
      .map(([targetId, relationship]) => ({
        name: nameById.get(targetId) ?? targetId,
        affinity: relationship.affinity,
        tags: [...(relationship.tags ?? [])],
      }))
      .sort((left, right) => Math.abs(right.affinity) - Math.abs(left.affinity))
      .slice(0, 20)

    const formalAlliances = Object.values(realityDomain.alliances ?? {})
      .filter(
        (alliance) =>
          alliance.memberIds.includes(playerId) &&
          alliance.status !== 'DISSOLVED'
      )
      .map((alliance) => ({
        id: alliance.id,
        name: alliance.name?.trim() || null,
        memberNames: alliance.memberIds.map((id) => nameFor(id) ?? id),
        status: alliance.status,
      }))
    const legacyAllianceNames =
      formalAlliances.length === 0
        ? relationshipRows
            .filter((row) => row.tags.some((tag) => tag === 'alliance' || tag === 'ally'))
            .map((row) => row.name)
        : []
    const alliances =
      formalAlliances.length > 0
        ? formalAlliances
        : legacyAllianceNames.length
          ? [
              {
                id: 'relationship-allies',
                name: null,
                memberNames: [playerName, ...legacyAllianceNames],
                status: 'ACTIVE',
              },
            ]
          : []

    const publicFeed = game.tvFeed.slice(-12).map((event) => event.text.slice(0, 280))
    const recentEvictedNames: string[] = []
    const pendingEvictee = nameFor(game.pendingEviction?.evicteeId)
    if (pendingEvictee) recentEvictedNames.push(pendingEvictee)
    for (const eventText of [...publicFeed].reverse()) {
      const normalized = eventText.toLowerCase()
      if (
        !normalized.includes('evicted') &&
        !normalized.includes('eliminated') &&
        !normalized.includes('went home') &&
        !normalized.includes('left the house')
      ) {
        continue
      }
      const matched = game.players.find((player) => normalized.includes(player.name.toLowerCase()))
      if (matched && !recentEvictedNames.includes(matched.name)) recentEvictedNames.push(matched.name)
      if (recentEvictedNames.length >= 2) break
    }

    return {
      season: game.season,
      week: game.week,
      phase: game.phase,
      playerStatus: userPlayer?.status ?? 'active',
      leaderName: nameFor(game.lohId),
      nomineeNames: game.nomineeIds.map((id) => nameFor(id) ?? id),
      safetyWinnerName: nameFor(game.posWinnerId),
      remainingHousemates: game.players
        .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
        .map((player) => player.name),
      playerStats: {
        leaderWins: userPlayer?.stats?.lohWins ?? 0,
        safetyWins: userPlayer?.stats?.posWins ?? 0,
        timesNominated: userPlayer?.stats?.timesNominated ?? 0,
      },
      closestRelationships: relationshipRows,
      alliances,
      recentEvictedNames,
      recentPublicEvents: publicFeed.slice(-8),
    }
  }, [game, playerId, playerName, realityDomain.alliances, relationships, userPlayer])

  const [tab, setTab] = useState<LabTab>('workbench')
  const [contextMode, setContextMode] = useState<ContextMode>('synthetic')
  const [scenarioWorld, setScenarioWorld] = useState<BigEyeWorldContext>(CONFESSIONAL_LAB_WORLD)
  const [prompt, setPrompt] = useState(
    "Maya is sketchy and lying to me, but I need her vote and I am scared she'll put me up."
  )
  const [memory, setMemory] = useState('')
  const [lastQuestion, setLastQuestion] = useState<BigEyeQuestion | null>(null)
  const [threadTopic, setThreadTopic] = useState('')
  const [focusPlayer, setFocusPlayer] = useState('')
  const [familiarity, setFamiliarity] = useState(0)
  const [warmth, setWarmth] = useState(0)
  const [friction, setFriction] = useState(0)
  const [allowGenerative, setAllowGenerative] = useState(false)
  const [analysis, setAnalysis] = useState<BigEyeTurnAnalysis | null>(null)
  const [fullReply, setFullReply] = useState<BigBrotherResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [suiteCategory, setSuiteCategory] = useState<'all' | ConfessionalCalibrationCategory>('all')
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    CONFESSIONAL_CALIBRATION_SCENARIOS[0]?.id ?? ''
  )

  const runtimeConfig = getConfessionalRuntimeConfig()
  const world = contextMode === 'current' ? currentWorld : scenarioWorld
  const effectivePlayerName = contextMode === 'current' ? playerName : 'Alex'

  const suiteSnapshot = useMemo(
    () => ({
      revision: remoteConfessionalRevision ?? runtimeConfig.revision,
      results: runConfessionalCalibrationSuite(),
    }),
    [remoteConfessionalRevision, runtimeConfig.revision]
  )
  const suiteResults = suiteSnapshot.results
  const visibleSuiteResults = useMemo(
    () =>
      suiteCategory === 'all'
        ? suiteResults
        : suiteResults.filter((result) => result.scenario.category === suiteCategory),
    [suiteCategory, suiteResults]
  )
  const selectedScenario =
    suiteResults.find((result) => result.scenario.id === selectedScenarioId) ?? suiteResults[0]

  const contractResults = suiteResults.filter((result) => result.scenario.tier === 'contract')
  const contractFailures = contractResults.filter((result) => !result.passed)
  const calibrationFlags = suiteResults.filter(
    (result) => result.scenario.tier === 'calibration' && !result.passed
  )

  const buildPayload = (skipDirector: boolean) => ({
    diaryText: prompt,
    playerName: effectivePlayerName,
    phase: world.phase,
    seed: 7331,
    state: mergeState({
      lastQuestion,
      threadTopic,
      focusPlayer,
      familiarity,
      warmth,
      friction,
    }),
    history: [] as Array<{ role: 'user' | 'bb'; text: string }>,
    memorySummary: memory,
    world,
    skipDirector,
  })

  const inspect = () => {
    setFullReply(null)
    setAnalysis(analyzeBigEyeTurn(buildPayload(true)))
  }

  const runConfiguredPipeline = async () => {
    setBusy(true)
    setFullReply(null)
    try {
      const payload = buildPayload(!allowGenerative)
      setAnalysis(analyzeBigEyeTurn(payload))
      setFullReply(await generateBigBrotherReply(payload))
    } finally {
      setBusy(false)
    }
  }

  const loadScenario = (result: ConfessionalCalibrationScenarioResult) => {
    const scenario = result.scenario
    const initial = { ...createInitialBigEyeState(), ...scenario.initialState }
    setPrompt(scenario.turns[0]?.text ?? '')
    setMemory(scenario.initialMemory ?? '')
    setLastQuestion(initial.lastQuestion ?? null)
    setThreadTopic(initial.thread?.topic ?? '')
    setFocusPlayer(initial.thread?.focusPlayer ?? '')
    setFamiliarity(initial.rapport?.familiarity ?? 0)
    setWarmth(initial.rapport?.warmth ?? 0)
    setFriction(initial.rapport?.friction ?? 0)
    setScenarioWorld(scenario.world ?? CONFESSIONAL_LAB_WORLD)
    setContextMode('synthetic')
    setAnalysis(null)
    setFullReply(null)
    setSelectedScenarioId(scenario.id)
    setTab('workbench')
  }

  const copyReport = async () => {
    const report = {
      generatedAt: new Date().toISOString(),
      configRevision: suiteSnapshot.revision,
      summary: {
        scenarios: suiteResults.length,
        contractScenarios: contractResults.length,
        contractFailures: contractFailures.length,
        calibrationFlags: calibrationFlags.length,
      },
      results: suiteResults.map((result) => ({
        id: result.scenario.id,
        title: result.scenario.title,
        category: result.scenario.category,
        tier: result.scenario.tier,
        passed: result.passed,
        failedChecks: result.checks.filter((check) => !check.passed),
      })),
    }
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
  }

  if (!hasAccess) return <Navigate to="/game" replace />

  return (
    <main className="clab">
      <header className="clab__header">
        <GameBackButton className="clab__back" onClick={() => navigate(-1)} />
        <div className="clab__heading">
          <p className="clab__eyebrow">Big Eye QA</p>
          <h1>Confessional Calibration Lab</h1>
          <p>
            Inspect what The Big Eye understands, remembers and routes before changing live tuning.
          </p>
        </div>
        <div className="clab__revision">
          <span>Databank</span>
          <strong>{runtimeConfig.revision}</strong>
        </div>
      </header>

      <nav className="clab__tabs" aria-label="Calibration lab sections">
        <button
          type="button"
          className={tab === 'workbench' ? 'is-active' : ''}
          onClick={() => setTab('workbench')}
        >
          Workbench
        </button>
        <button
          type="button"
          className={tab === 'suite' ? 'is-active' : ''}
          onClick={() => setTab('suite')}
        >
          Scenario Suite
          <span className="clab__tab-count">{suiteResults.length}</span>
        </button>
      </nav>

      {tab === 'workbench' ? (
        <div className="clab__workbench">
          <section className="clab-card clab-card--composer">
            <div className="clab-card__header">
              <div>
                <p className="clab-card__kicker">Input</p>
                <h2>Player message</h2>
              </div>
              <div className="clab-segmented" aria-label="World context">
                <button
                  type="button"
                  className={contextMode === 'synthetic' ? 'is-active' : ''}
                  onClick={() => setContextMode('synthetic')}
                >
                  Lab world
                </button>
                <button
                  type="button"
                  className={contextMode === 'current' ? 'is-active' : ''}
                  onClick={() => setContextMode('current')}
                >
                  Current season
                </button>
              </div>
            </div>

            <textarea
              className="clab__prompt"
              value={prompt}
              maxLength={500}
              onChange={(event) => setPrompt(event.target.value)}
              aria-label="Confessional test message"
            />
            <div className="clab__prompt-meta">
              <span>{prompt.length}/500</span>
              <span>
                Day {world.week} · {world.phase.replaceAll('_', ' ')}
              </span>
              <span>{world.remainingHousemates.length} remaining</span>
            </div>

            <details className="clab__state-editor">
              <summary>Seed conversation state and memory</summary>
              <div className="clab__field-grid">
                <label>
                  Pending authored question
                  <select
                    value={lastQuestion ?? ''}
                    onChange={(event) =>
                      setLastQuestion((event.target.value || null) as BigEyeQuestion | null)
                    }
                  >
                    <option value="">None</option>
                    <option value="offer_game">offer_game</option>
                    <option value="confirm_self_eviction">confirm_self_eviction</option>
                  </select>
                </label>
                <label>
                  Thread topic
                  <input
                    value={threadTopic}
                    onChange={(event) => setThreadTopic(event.target.value)}
                    placeholder="trust"
                  />
                </label>
                <label>
                  Focus player
                  <input
                    value={focusPlayer}
                    onChange={(event) => setFocusPlayer(event.target.value)}
                    placeholder="Maya"
                  />
                </label>
                <label>
                  Familiarity
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={familiarity}
                    onChange={(event) => setFamiliarity(Number(event.target.value))}
                  />
                </label>
                <label>
                  Warmth
                  <input
                    type="number"
                    min="-10"
                    max="10"
                    value={warmth}
                    onChange={(event) => setWarmth(Number(event.target.value))}
                  />
                </label>
                <label>
                  Friction
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={friction}
                    onChange={(event) => setFriction(Number(event.target.value))}
                  />
                </label>
              </div>
              <label className="clab__memory-field">
                Compact memory ledger
                <textarea
                  value={memory}
                  onChange={(event) => setMemory(event.target.value)}
                  placeholder={'Belief — distrusts Maya\nPrediction — winner: Kian'}
                />
              </label>
            </details>

            <div className="clab__actions">
              <button
                type="button"
                className="clab-btn clab-btn--primary"
                disabled={!prompt.trim()}
                onClick={inspect}
              >
                Analyze locally
              </button>
              <label className="clab__ai-toggle">
                <input
                  type="checkbox"
                  checked={allowGenerative}
                  onChange={(event) => setAllowGenerative(event.target.checked)}
                />
                Allow configured AI request
              </label>
              <button
                type="button"
                className="clab-btn"
                disabled={!prompt.trim() || busy}
                onClick={() => void runConfiguredPipeline()}
              >
                {busy ? 'Running…' : 'Run reply pipeline'}
              </button>
            </div>
            <p className="clab__hint">
              Local analysis never spends inference. The pipeline button only permits a generative
              request when the checkbox is enabled and the turn is actually eligible.
            </p>
          </section>

          <aside className="clab-card clab-card--world">
            <p className="clab-card__kicker">World dossier</p>
            <h2>{contextMode === 'current' ? playerName : 'Alex'}</h2>
            <dl className="clab__facts">
              <dt>Status</dt>
              <dd>{world.playerStatus}</dd>
              <dt>Leader</dt>
              <dd>{world.leaderName ?? '—'}</dd>
              <dt>Nominees</dt>
              <dd>{world.nomineeNames.join(', ') || '—'}</dd>
              <dt>Safety</dt>
              <dd>{world.safetyWinnerName ?? '—'}</dd>
              <dt>Closest</dt>
              <dd>{world.closestRelationships[0]?.name ?? '—'}</dd>
              <dt>Record</dt>
              <dd>
                {world.playerStats.leaderWins} LOH · {world.playerStats.safetyWins} Safety ·{' '}
                {world.playerStats.timesNominated} noms
              </dd>
            </dl>
            <details>
              <summary>Recent public events</summary>
              <ul className="clab__event-list">
                {world.recentPublicEvents.map((event, index) => (
                  <li key={`${event}-${index}`}>{event}</li>
                ))}
              </ul>
            </details>
          </aside>

          {analysis && (
            <>
              <section className="clab-card clab-card--route">
                <div className="clab-card__header">
                  <div>
                    <p className="clab-card__kicker">Routing</p>
                    <h2>{routeLabel(analysis)}</h2>
                  </div>
                  <span className={`clab-route clab-route--${analysis.route}`}>
                    {analysis.route}
                  </span>
                </div>
                <div className="clab__route-grid">
                  <div>
                    <span>Detected intent</span>
                    <strong>{analysis.detectedIntent}</strong>
                  </div>
                  <div>
                    <span>Semantic intent</span>
                    <strong>{analysis.semanticIntent}</strong>
                  </div>
                  <div>
                    <span>Director eligible</span>
                    <strong>{analysis.directorEligible ? 'yes' : 'no'}</strong>
                  </div>
                  <div>
                    <span>VIP eligible</span>
                    <strong>{analysis.vipEligible ? 'yes' : 'no'}</strong>
                  </div>
                  <div>
                    <span>Authored protection</span>
                    <strong>{analysis.authoredFlow ? 'yes' : 'no'}</strong>
                  </div>
                  <div>
                    <span>Game action</span>
                    <strong>{analysis.action ?? 'none'}</strong>
                  </div>
                </div>
              </section>

              <section className="clab-card clab-card--frame">
                <p className="clab-card__kicker">Comprehension frame</p>
                <h2>What The Eye thinks you meant</h2>
                <div className="clab__chip-group">
                  <span className="clab-chip clab-chip--strong">{analysis.frame.speechAct}</span>
                  {analysis.frame.topics.map((topic) => (
                    <span className="clab-chip" key={topic}>
                      {topic}
                    </span>
                  ))}
                  {analysis.frame.relationshipStances.map((stance) => (
                    <span className="clab-chip clab-chip--stance" key={stance}>
                      {stance}
                    </span>
                  ))}
                  {analysis.frame.emotions.map((emotion) => (
                    <span className="clab-chip clab-chip--emotion" key={emotion.type}>
                      {emotion.type} {Math.round(emotion.score * 100)}%
                    </span>
                  ))}
                </div>
                <dl className="clab__facts clab__facts--compact">
                  <dt>Entities</dt>
                  <dd>{analysis.frame.entities.join(', ') || '—'}</dd>
                  <dt>Focus</dt>
                  <dd>{analysis.frame.focusPlayer ?? '—'}</dd>
                  <dt>Continuation</dt>
                  <dd>{analysis.frame.continuation ? 'yes' : 'no'}</dd>
                  <dt>Knowledge query</dt>
                  <dd>{analysis.frame.knowledgeQuery ?? '—'}</dd>
                  <dt>Prediction</dt>
                  <dd>{analysis.frame.predictedWinner ?? '—'}</dd>
                  <dt>Contradiction</dt>
                  <dd>{analysis.frame.contradiction ?? '—'}</dd>
                  <dt>Response moves</dt>
                  <dd>{analysis.frame.responseMoves.join(', ')}</dd>
                </dl>
              </section>

              <section className="clab-card clab-card--reply">
                <p className="clab-card__kicker">Local baseline</p>
                <h2>The Big Eye</h2>
                <blockquote>{analysis.localText}</blockquote>
                {fullReply && (
                  <div className="clab__full-reply">
                    <span>Configured pipeline · {fullReply.source}</span>
                    <p>{fullReply.text}</p>
                  </div>
                )}
              </section>

              <section className="clab-card clab-card--memory">
                <p className="clab-card__kicker">Memory write</p>
                <h2>Compact ledger</h2>
                <div className="clab__memory-delta">
                  {memoryDelta(memory, analysis.localMemorySummary).length ? (
                    memoryDelta(memory, analysis.localMemorySummary).map((line) => (
                      <span key={line}>+ {line}</span>
                    ))
                  ) : (
                    <span>No new durable note.</span>
                  )}
                </div>
                <pre>{analysis.localMemorySummary || 'No memory.'}</pre>
              </section>

              <section className="clab-card clab-card--raw">
                <details>
                  <summary>Raw diagnostic object</summary>
                  <pre>{JSON.stringify(analysis, null, 2)}</pre>
                </details>
              </section>
            </>
          )}
        </div>
      ) : (
        <div className="clab__suite">
          <section className="clab__scoreboard">
            <div>
              <span>Scenarios</span>
              <strong>{suiteResults.length}</strong>
            </div>
            <div>
              <span>Contract checks</span>
              <strong>
                {contractResults.length - contractFailures.length}/{contractResults.length}
              </strong>
            </div>
            <div className={contractFailures.length ? 'is-danger' : 'is-good'}>
              <span>Contract failures</span>
              <strong>{contractFailures.length}</strong>
            </div>
            <div className={calibrationFlags.length ? 'is-warn' : 'is-good'}>
              <span>Calibration flags</span>
              <strong>{calibrationFlags.length}</strong>
            </div>
          </section>

          <section className="clab-card clab-card--suite-list">
            <div className="clab-card__header">
              <div>
                <p className="clab-card__kicker">Regression + calibration matrix</p>
                <h2>Scenario suite</h2>
              </div>
              <button type="button" className="clab-btn" onClick={() => void copyReport()}>
                Copy JSON report
              </button>
            </div>
            <div className="clab__filters">
              {(
                ['all', ...Object.keys(CATEGORY_LABELS)] as Array<
                  'all' | ConfessionalCalibrationCategory
                >
              ).map((category) => (
                <button
                  type="button"
                  key={category}
                  className={suiteCategory === category ? 'is-active' : ''}
                  onClick={() => setSuiteCategory(category)}
                >
                  {category === 'all' ? 'All' : CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>
            <div className="clab__scenario-list">
              {visibleSuiteResults.map((result) => {
                const failed = result.checks.filter((check) => !check.passed).length
                const lastTurn = result.turns[result.turns.length - 1]
                return (
                  <button
                    type="button"
                    key={result.scenario.id}
                    className={`clab__scenario-row${selectedScenarioId === result.scenario.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedScenarioId(result.scenario.id)}
                  >
                    <span
                      className={`clab__status-dot ${result.passed ? 'is-pass' : result.scenario.tier === 'contract' ? 'is-fail' : 'is-warn'}`}
                      aria-hidden="true"
                    />
                    <span className="clab__scenario-main">
                      <strong>{result.scenario.title}</strong>
                      <small>{result.scenario.description}</small>
                    </span>
                    <span className="clab__scenario-meta">
                      <em>{result.scenario.tier}</em>
                      <span>{lastTurn?.analysis.route ?? result.salience?.event ?? '—'}</span>
                      <span>{failed ? `${failed} flag${failed === 1 ? '' : 's'}` : 'pass'}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {selectedScenario && (
            <section className="clab-card clab-card--scenario-detail">
              <div className="clab-card__header">
                <div>
                  <p className="clab-card__kicker">
                    {CATEGORY_LABELS[selectedScenario.scenario.category]} ·{' '}
                    {selectedScenario.scenario.tier}
                  </p>
                  <h2>{selectedScenario.scenario.title}</h2>
                  <p>{selectedScenario.scenario.description}</p>
                </div>
                <button
                  type="button"
                  className="clab-btn clab-btn--primary"
                  onClick={() => loadScenario(selectedScenario)}
                >
                  Load in workbench
                </button>
              </div>

              {selectedScenario.salience && (
                <div className="clab__salience">
                  <span>{selectedScenario.salience.event}</span>
                  <blockquote>{selectedScenario.salience.text}</blockquote>
                </div>
              )}

              <div className="clab__turns">
                {selectedScenario.turns.map((turn, index) => (
                  <article className="clab__turn" key={`${turn.text}-${index}`}>
                    <header>
                      <span>Turn {index + 1}</span>
                      <strong>{turn.analysis.semanticIntent}</strong>
                      <em>{turn.analysis.route}</em>
                    </header>
                    <p className="clab__turn-input">“{turn.text}”</p>
                    <p className="clab__turn-reply">{turn.analysis.localText}</p>
                    <div className="clab__checks">
                      {turn.checks.map((check, checkIndex) => (
                        <div
                          className={check.passed ? 'is-pass' : 'is-fail'}
                          key={`${check.label}-${checkIndex}`}
                        >
                          <span>{check.passed ? 'PASS' : 'FLAG'}</span>
                          <strong>{check.label}</strong>
                          <small>
                            expected {check.expected} · actual {check.actual}
                          </small>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              {selectedScenario.checks
                .filter((check) => check.label === 'Salience')
                .map((check, index) => (
                  <div
                    className={`clab__salience-check ${check.passed ? 'is-pass' : 'is-fail'}`}
                    key={index}
                  >
                    {check.passed ? 'PASS' : 'FLAG'} · expected {check.expected} · actual{' '}
                    {check.actual}
                  </div>
                ))}
            </section>
          )}
        </div>
      )}
    </main>
  )
}

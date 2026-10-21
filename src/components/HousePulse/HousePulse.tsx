import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Player, PulseChronicle, WeekendInterludeState } from '../../types'
import { composePulseChronicle, getPulseChronicleIdentity } from '../../social/pulseChronicle'
import { buildSocialStoryStream, type SocialStoryBeat } from '../../social/socialStoryStream'
import type {
  DramaSocialNetwork,
  RelationshipsMap,
  SocialActionLogEntry,
  SocialCommitment,
} from '../../social/types'
import type { RealityDomainState } from '../../social/reality'
import {
  getSocialCommitmentDueCopy,
  getSocialCommitmentLabel,
} from '../../social/socialCommitments'
import RealityLedger from '../RealityLedger/RealityLedger'
import GameBackButton from '../ui/GameBackButton/GameBackButton'
import './HousePulse.css'

type PulseTab = 'today' | 'stream' | 'stories' | 'intel' | 'commitments' | 'ledger'

interface HousePulseProps {
  network: DramaSocialNetwork
  players: readonly Player[]
  humanId: string
  actionHistory: readonly SocialActionLogEntry[]
  relationships: RelationshipsMap
  weekStartRelSnapshot: Record<string, Record<string, number>>
  currentWeek: number
  season?: number
  gameId?: string
  gamePhase?: string
  pulseChronicles?: readonly PulseChronicle[]
  weekendInterlude?: WeekendInterludeState | null
  weatherCondition?: string | null
  reality?: RealityDomainState
  socialCommitments?: readonly SocialCommitment[]
  pendingActionCount?: number
  onOpenIncoming?: () => void
  onOpenAlliances?: (allianceId?: string, eventId?: string) => void
}

const EMPTY_PULSE_CHRONICLES: readonly PulseChronicle[] = []

const RUMOUR_LABEL: Record<string, string> = {
  secret_alliance: 'Secret pact',
  secret_romance: 'Secret romance',
  targeting: 'Target talk',
  fake_deal: 'Possible double deal',
  personal_comment: 'Private remark',
}

const PHASE_LABEL: Record<string, string> = {
  // i18n-ignore: Legacy phase-label registry stores canonical English copy
  season_start: 'Season opening',
  week_start: 'Start of the day',
  loh_results: 'After the LOH competition',
  social_1: 'Before nominations',
  nominations: 'At nominations',
  nomination_results: 'After nominations',
  pos_results: 'After the Safety competition',
  pos_ceremony_results: 'After the Safety ceremony',
  social_2: 'Before the vote',
  live_vote: 'During the vote',
  eviction_results: 'After the elimination',
  social: 'During Hub life',
}

const ARC_LABEL = {
  romance: 'Romance',
  bromance: 'Close bond',
  rivalry: 'Rivalry',
  betrayal: 'Betrayal',
} as const

function arcStageCopy(stage: string): string {
  switch (stage) {
    case 'spark':
      return 'A first pattern is emerging.'
    case 'building':
      return 'Repeated moments are turning into a real storyline.'
    case 'established':
      return 'The connection is now part of how the Hub reads them.'
    case 'strained':
      return 'Recent events have put the relationship under visible pressure.'
    case 'climax':
      return 'The storyline has reached a decisive point.'
    case 'resolved':
      return 'The storyline has reached an outcome.'
    default:
      return 'The relationship is still developing.'
  }
}

function titleCase(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

type PulseStoryBeat = SocialStoryBeat & { allianceId?: string; sourceEventId?: string }

export default function HousePulse({
  network,
  players,
  humanId,
  actionHistory,
  relationships,
  weekStartRelSnapshot,
  currentWeek,
  season = 1,
  gameId = 'legacy',
  gamePhase,
  pulseChronicles,
  weekendInterlude,
  weatherCondition,
  reality,
  socialCommitments = [],
  pendingActionCount = 0,
  onOpenIncoming,
  onOpenAlliances,
}: HousePulseProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PulseTab>('today')
  const [earlierOpen, setEarlierOpen] = useState(false)
  const [intelFocusEventId, setIntelFocusEventId] = useState<string | undefined>()

  useEffect(() => {
    const openPulse = () => {
      setTab(reality ? 'today' : 'stream')
      setEarlierOpen(false)
      setOpen(true)
    }
    const closePulse = () => setOpen(false)
    const openIntelEvent = (event: Event) => {
      const eventId = (event as CustomEvent<string>).detail
      if (!eventId) return
      setIntelFocusEventId(eventId)
      setTab('intel')
      setOpen(true)
    }
    const setPulseTab = (event: Event) => {
      const nextTab = (event as CustomEvent<string>).detail
      if (
        nextTab === 'today' ||
        nextTab === 'stream' ||
        nextTab === 'intel' ||
        nextTab === 'commitments' ||
        nextTab === 'ledger'
      ) {
        setTab(
          nextTab === 'ledger' ? 'commitments' : nextTab === 'stream' && reality ? 'today' : nextTab
        )
        setEarlierOpen(false)
        setOpen(true)
      }
    }

    window.addEventListener('reality-social-tutorial:open-pulse', openPulse)
    window.addEventListener('reality-social-tutorial:close-pulse', closePulse)
    window.addEventListener('reality-social-tutorial:set-pulse-tab', setPulseTab)
    window.addEventListener('reality-social:open-intel-event', openIntelEvent)
    return () => {
      window.removeEventListener('reality-social-tutorial:open-pulse', openPulse)
      window.removeEventListener('reality-social-tutorial:close-pulse', closePulse)
      window.removeEventListener('reality-social-tutorial:set-pulse-tab', setPulseTab)
      window.removeEventListener('reality-social:open-intel-event', openIntelEvent)
    }
  }, [reality])

  const playerName = useCallback(
    (id: string) => players.find((player) => player.id === id)?.name ?? 'Unknown',
    [players]
  )

  const knownArcs = useMemo(
    () =>
      network.arcs.filter(
        (arc) =>
          arc.public ||
          arc.participantIds.includes(humanId) ||
          (arc.discoveredByIds ?? []).includes(humanId)
      ),
    [humanId, network.arcs]
  )
  const knownRumours = useMemo(
    () =>
      network.rumours.filter(
        (rumour) =>
          rumour.status === 'exposed' ||
          rumour.originatorId === humanId ||
          rumour.listeners.some((listener) => listener.playerId === humanId)
      ),
    [humanId, network.rumours]
  )
  const storyBeats = useMemo<PulseStoryBeat[]>(
    () =>
      reality
        ? []
        : buildSocialStoryStream({
            network,
            actionHistory,
            relationships,
            weekStartRelSnapshot,
            players,
            humanId,
            currentWeek,
          }),
    [
      actionHistory,
      currentWeek,
      humanId,
      network,
      players,
      reality,
      relationships,
      weekStartRelSnapshot,
    ]
  )
  const savedChronicles = pulseChronicles ?? EMPTY_PULSE_CHRONICLES
  const activeWeekend =
    weekendInterlude?.active && !weekendInterlude.debug ? weekendInterlude : null
  const dailyIdentity = useMemo(() => getPulseChronicleIdentity(currentWeek), [currentWeek])
  const liveIdentity = useMemo(
    () => getPulseChronicleIdentity(currentWeek, activeWeekend),
    [currentWeek, activeWeekend]
  )
  const latestCompletedEpisodeToday = useMemo(
    () =>
      !activeWeekend
        ? [...savedChronicles]
            .filter((entry) => entry.season === season && entry.day === currentWeek)
            .sort(
              (left, right) =>
                (left.capturedThroughRealitySequence ?? -1) -
                  (right.capturedThroughRealitySequence ?? -1) ||
                (left.capturedThroughTimestamp ?? 0) - (right.capturedThroughTimestamp ?? 0)
            )
            .at(-1)
        : undefined,
    [activeWeekend, savedChronicles, season, currentWeek]
  )
  const episodeIdentity = useMemo(
    () =>
      activeWeekend
        ? liveIdentity
        : latestCompletedEpisodeToday?.episodeKey
          ? {
              key: latestCompletedEpisodeToday.episodeKey,
              label:
                latestCompletedEpisodeToday.episodeLabel ??
                `Day ${latestCompletedEpisodeToday.day}`,
            }
          : dailyIdentity,
    [activeWeekend, liveIdentity, latestCompletedEpisodeToday, dailyIdentity]
  )
  const earlierEpisodesToday = savedChronicles
    .filter((entry) => entry.season === season && entry.day === currentWeek)
    .sort(
      (left, right) => (left.capturedThroughTimestamp ?? 0) - (right.capturedThroughTimestamp ?? 0)
    )
  const priorEpisodes = earlierEpisodesToday.filter(
    (entry) => (entry.episodeKey ?? `day:${entry.day}`) !== episodeIdentity.key
  )
  const actionHistoryAfterTimestamp = priorEpisodes.reduce(
    (latest, entry) => Math.max(latest, entry.capturedThroughTimestamp ?? 0),
    0
  )
  const realityEventsAfterSequence = priorEpisodes.reduce(
    (latest, entry) => Math.max(latest, entry.capturedThroughRealitySequence ?? -1),
    -1
  )
  const dayChronicle = useMemo(() => {
    if (!reality) return null
    const savedEpisode = savedChronicles.find(
      (entry) =>
        entry.season === season && (entry.episodeKey ?? `day:${entry.day}`) === episodeIdentity.key
    )
    if (savedEpisode || !open || tab !== 'today') return savedEpisode ?? null
    return composePulseChronicle({
      gameId,
      season,
      day: currentWeek,
      humanId,
      players,
      reality,
      actionHistory,
      weather: weatherCondition,
      complete: gamePhase === 'week_end' && !activeWeekend,
      episode: episodeIdentity,
      actionHistoryAfterTimestamp,
      realityEventsAfterSequence,
    })
  }, [
    reality,
    open,
    tab,
    savedChronicles,
    activeWeekend,
    episodeIdentity,
    actionHistoryAfterTimestamp,
    realityEventsAfterSequence,
    season,
    currentWeek,
    gameId,
    humanId,
    players,
    actionHistory,
    weatherCondition,
    gamePhase,
  ])
  const earlierChronicles = useMemo(
    () =>
      savedChronicles
        .filter(
          (entry) =>
            entry.season === season &&
            (entry.day < currentWeek ||
              (entry.day === currentWeek &&
                (entry.episodeKey ?? `day:${entry.day}`) !== episodeIdentity.key))
        )
        .slice()
        .sort(
          (left, right) =>
            right.day - left.day ||
            (right.capturedThroughTimestamp ?? 0) - (left.capturedThroughTimestamp ?? 0)
        ),
    [savedChronicles, season, currentWeek, episodeIdentity.key]
  )
  const todayBeats = reality ? [] : storyBeats
  const latest = todayBeats[0]
  const pendingPromises = socialCommitments.filter(
    (commitment) =>
      commitment.status === 'pending' &&
      (commitment.promisorId === humanId || commitment.beneficiaryId === humanId) &&
      !Object.keys(reality?.promises ?? {}).some(
        (id) =>
          id === `promise:${commitment.interactionId}` ||
          id.startsWith(`promise:${commitment.interactionId}:`)
      )
  )
  const activeRealityPromises = Object.values(reality?.promises ?? {})
    .filter(
      (promise) =>
        (promise.status === 'ACTIVE' || promise.status === 'PROPOSED') &&
        (promise.promisorId === humanId || promise.beneficiaryIds.includes(humanId))
    )
    .sort(
      (left, right) =>
        (left.deadline?.day ?? Number.POSITIVE_INFINITY) -
          (right.deadline?.day ?? Number.POSITIVE_INFINITY) ||
        right.createdAt.day - left.createdAt.day
    )
  const pendingPromiseCount = pendingPromises.length + activeRealityPromises.length

  const modal = open ? (
    <div className="house-pulse__overlay" role="presentation" onMouseDown={() => setOpen(false)}>
      <section
        className="house-pulse__sheet"
        role="dialog"
        aria-modal="true"
        aria-label="My Pulse"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="house-pulse__header">
          <div>
            <span className="house-pulse__eyebrow">Reality Mode</span>
            <h2>My Pulse</h2>
            <p>Your latest developments, learned intel and commitments.</p>
          </div>
          <GameBackButton
            className="house-pulse__back"
            label="Back to Social"
            onClick={() => setOpen(false)}
            title="Back to Social"
          />
        </header>

        <nav
          className="house-pulse__tabs"
          aria-label="My Pulse sections"
          data-reality-tutorial="pulse-tabs"
        >
          {(reality
            ? (['today', 'intel', 'commitments'] as PulseTab[])
            : (['stream', 'stories', 'intel'] as PulseTab[])
          ).map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? 'is-active' : ''}
              onClick={() => setTab(item)}
            >
              {item === 'today'
                ? 'Today'
                : item === 'commitments'
                  ? 'Commitments'
                  : item === 'intel'
                    ? 'Intel'
                    : item}
            </button>
          ))}
        </nav>

        <div
          className="house-pulse__content"
          data-reality-tutorial={tab === 'today' || tab === 'stream' ? 'pulse-stream' : undefined}
        >
          {(tab === 'today' || tab === 'stream') && (
            <>
              {reality && pendingActionCount > 0 && onOpenIncoming && (
                <article
                  className="house-pulse__attention"
                  aria-label="Alliance decisions need attention"
                >
                  <div>
                    <strong>
                      {pendingActionCount} alliance decision{pendingActionCount === 1 ? '' : 's'}{' '}
                      await{pendingActionCount === 1 ? 's' : ''} your response
                    </strong>
                    <small>Open Incoming to review proposals and votes.</small>
                  </div>
                  <button type="button" onClick={onOpenIncoming}>
                    Review request
                  </button>
                </article>
              )}
              {reality && pendingPromiseCount > 0 && (
                <article className="house-pulse__attention house-pulse__attention--promise">
                  <div>
                    <strong>
                      {activeRealityPromises[0]
                        ? activeRealityPromises[0].promisorId === humanId
                          ? 'Your promise'
                          : `${playerName(activeRealityPromises[0].promisorId)} promised you`
                        : pendingPromises[0].promisorId === humanId
                          ? 'Your promise'
                          : `${playerName(pendingPromises[0].promisorId)} promised you`}
                      {' · '}
                      {activeRealityPromises[0]
                        ? titleCase(activeRealityPromises[0].kind)
                        : getSocialCommitmentLabel(pendingPromises[0].kind)}
                    </strong>
                    <small>
                      {activeRealityPromises[0]
                        ? activeRealityPromises[0].deadline
                          ? `Due Day ${activeRealityPromises[0].deadline.day} · ${PHASE_LABEL[activeRealityPromises[0].deadline.phase] ?? titleCase(activeRealityPromises[0].deadline.phase)}`
                          : 'No deadline set'
                        : `Due Day ${pendingPromises[0].dueWeek} · ${getSocialCommitmentDueCopy(pendingPromises[0].kind)}`}
                    </small>
                  </div>
                  <button type="button" onClick={() => setTab('commitments')}>
                    View commitment
                  </button>
                </article>
              )}
              {reality && dayChronicle ? (
                <>
                  {dayChronicle.sourceEventIds.length ? (
                    <article className="house-pulse__chronicle" aria-label="The Hub Chronicles">
                      <div className="house-pulse__chronicle-eyebrow">
                        <span>The Hub Chronicles</span>
                        <span>
                          {dayChronicle.episodeLabel ?? `Day ${dayChronicle.day}`} ·{' '}
                          {dayChronicle.complete ? 'Episode complete' : 'The story so far'}
                        </span>
                      </div>
                      <h3>{dayChronicle.title}</h3>
                      <div className="house-pulse__chronicle-story">
                        {dayChronicle.paragraphs.map((paragraph, index) => (
                          <p key={index}>{paragraph}</p>
                        ))}
                      </div>
                      {dayChronicle.note && (
                        <aside className="house-pulse__producer">
                          <strong>Producer’s Note</strong>
                          <p>{dayChronicle.note}</p>
                        </aside>
                      )}
                    </article>
                  ) : (
                    <p className="house-pulse__empty">
                      No major developments have reached your radar today. Your story is still
                      unfolding.
                    </p>
                  )}
                  {earlierChronicles.length > 0 && (
                    <details className="house-pulse__history house-pulse__chronicle-archive">
                      <summary>Previous episodes · {earlierChronicles.length}</summary>
                      {earlierChronicles.map((entry) => (
                        <article
                          className="house-pulse__chronicle"
                          key={entry.episodeKey ?? entry.season + ':' + entry.day}
                        >
                          <div className="house-pulse__chronicle-eyebrow">
                            <span>The Hub Chronicles</span>
                            <span>{entry.episodeLabel ?? `Day ${entry.day}`}</span>
                          </div>
                          <h3>{entry.title}</h3>
                          <div className="house-pulse__chronicle-story">
                            {entry.paragraphs.map((paragraph, index) => (
                              <p key={index}>{paragraph}</p>
                            ))}
                          </div>
                          {entry.note && (
                            <aside className="house-pulse__producer">
                              <strong>Producer’s Note</strong>
                              <p>{entry.note}</p>
                            </aside>
                          )}
                        </article>
                      ))}
                    </details>
                  )}
                </>
              ) : todayBeats.length ? (
                <>
                  {todayBeats.slice(0, 3).map((beat) => (
                    <article
                      className={`house-pulse__card house-pulse__card--${beat.kind} house-pulse__card--${beat.severity}`}
                      key={beat.id}
                    >
                      <div className="house-pulse__card-top">
                        <span>
                          Day {beat.week} ·{' '}
                          {PHASE_LABEL[beat.phase] ?? beat.phase.replaceAll('_', ' ')}
                        </span>
                        {!reality && <em>{titleCase(beat.severity)}</em>}
                      </div>
                      <h3>{beat.title}</h3>
                      {!reality && <p>{beat.text}</p>}
                      {reality && onOpenAlliances && beat.allianceId && (
                        <button
                          type="button"
                          className="house-pulse__link"
                          onClick={() => {
                            setOpen(false)
                            onOpenAlliances(beat.allianceId, beat.sourceEventId ?? beat.id)
                          }}
                        >
                          View alliance history
                        </button>
                      )}
                      {reality &&
                        (beat.eventType === 'ALLIANCE_STRATEGY_MEETING' ||
                          beat.eventType === 'DAY_SUMMARY') && <p>{beat.text}</p>}
                    </article>
                  ))}
                  {todayBeats.length > 3 && (
                    <details
                      className="house-pulse__history"
                      onToggle={(event) => setEarlierOpen(event.currentTarget.open)}
                    >
                      <summary>Earlier today · {todayBeats.length - 3}</summary>
                      {earlierOpen &&
                        todayBeats.slice(3).map((beat) => (
                          <article
                            className={`house-pulse__card house-pulse__card--${beat.kind}`}
                            key={beat.id}
                          >
                            <div className="house-pulse__card-top">
                              <span>
                                Day {beat.week} ·{' '}
                                {PHASE_LABEL[beat.phase] ?? beat.phase.replaceAll('_', ' ')}
                              </span>
                            </div>
                            <h3>{beat.title}</h3>
                            {!reality && <p>{beat.text}</p>}
                            {reality && onOpenAlliances && beat.allianceId && (
                              <button
                                type="button"
                                className="house-pulse__link"
                                onClick={() => {
                                  setOpen(false)
                                  onOpenAlliances(beat.allianceId, beat.sourceEventId ?? beat.id)
                                }}
                              >
                                View alliance history
                              </button>
                            )}
                            {reality && beat.eventType === 'ALLIANCE_STRATEGY_MEETING' && (
                              <p>{beat.text}</p>
                            )}
                          </article>
                        ))}
                    </details>
                  )}
                </>
              ) : (
                <p className="house-pulse__empty">
                  {reality
                    ? pendingActionCount > 0 || pendingPromiseCount > 0
                      ? 'Your next step is ready above. Check Intel and Commitments for more context.'
                      : 'Nothing important has changed today. Check back after your next conversation or decision.'
                    : 'The Hub is still reading the room. Visible patterns will appear here as actions repeat or consequences land.'}
                </p>
              )}
            </>
          )}

          {tab === 'stories' &&
            (knownArcs.length ? (
              knownArcs
                .slice()
                .sort((left, right) => right.lastAdvancedWeek - left.lastAdvancedWeek)
                .map((arc) => {
                  const first =
                    arc.participantIds[0] === humanId ? 'You' : playerName(arc.participantIds[0])
                  const second =
                    arc.participantIds[1] === humanId ? 'you' : playerName(arc.participantIds[1])
                  return (
                    <article
                      className={`house-pulse__card house-pulse__card--${arc.type}`}
                      key={arc.id}
                    >
                      <div className="house-pulse__card-top">
                        <span>{ARC_LABEL[arc.type]}</span>
                        <em>
                          {arc.public
                            ? 'Public'
                            : arc.participantIds.includes(humanId)
                              ? 'Your story'
                              : 'Discovered'}
                        </em>
                      </div>
                      <h3>
                        {first} and {second}
                      </h3>
                      <p>{arcStageCopy(arc.stage)}</p>
                      <small>
                        Began Day {arc.startedWeek} · last changed Day {arc.lastAdvancedWeek}
                      </small>
                    </article>
                  )
                })
            ) : (
              <p className="house-pulse__empty">No continuing storyline has reached your radar.</p>
            ))}

          {!reality &&
            tab === 'intel' &&
            (knownRumours.length ? (
              knownRumours.map((rumour) => {
                const chain = (rumour.sourceChain ?? [rumour.originatorId]).map(playerName)
                const subject = playerName(rumour.subjectId)
                const source = playerName(rumour.originatorId)
                const reliability =
                  rumour.evidence === 'confirmed'
                    ? 'Confirmed'
                    : rumour.evidence === 'credible'
                      ? 'Credible'
                      : rumour.evidence === 'weak'
                        ? 'Weak evidence'
                        : 'Unconfirmed'
                const claim =
                  rumour.claim && !rumour.claim.startsWith('A private')
                    ? rumour.claim.replaceAll(' ? ', ', ')
                    : `${source} is circulating a ${RUMOUR_LABEL[rumour.kind]?.toLowerCase() ?? 'claim'} involving ${subject}.`
                const trail =
                  rumour.originatorId === humanId
                    ? chain.length > 1
                      ? `You started this. It has passed through ${chain.slice(1).join(', ')}.`
                      : 'You started this, but it has not travelled yet.'
                    : chain.length > 1
                      ? `You heard it through ${chain[chain.length - 1]}; it began with ${chain[0]}.`
                      : `You heard it directly from ${chain[0]}.`

                return (
                  <article className="house-pulse__card house-pulse__card--intel" key={rumour.id}>
                    <div className="house-pulse__card-top">
                      <span>{RUMOUR_LABEL[rumour.kind] ?? 'Hub intel'}</span>
                      <em>{reliability}</em>
                    </div>
                    <h3>{subject}</h3>
                    <p>{claim}</p>
                    <small>{trail}</small>
                  </article>
                )
              })
            ) : (
              <p className="house-pulse__empty">You have not learned any current Hub intel.</p>
            ))}

          {tab === 'intel' && reality && (
            <RealityLedger
              reality={reality}
              players={players}
              humanId={humanId}
              relationships={relationships}
              section="knowledge"
              currentDay={currentWeek}
              focusEventId={intelFocusEventId}
              compact
            />
          )}
          {tab === 'commitments' && reality && (
            <RealityLedger
              reality={reality}
              players={players}
              humanId={humanId}
              relationships={relationships}
              socialCommitments={socialCommitments}
              section="deals"
              compact
            />
          )}
        </div>
      </section>
    </div>
  ) : null

  return (
    <>
      <button
        type="button"
        className="house-pulse__summary"
        data-reality-tutorial="pulse-summary"
        onClick={() => {
          setTab(reality ? 'today' : 'stream')
          setEarlierOpen(false)
          setOpen(true)
        }}
      >
        <span className="house-pulse__mark">◉</span>
        <span>
          <strong>My Pulse</strong>
          <small>
            {reality
              ? `Day ${currentWeek} · The Hub Chronicles`
              : `Today · ${storyBeats.length} visible shift${storyBeats.length === 1 ? '' : 's'}`}
          </small>
        </span>
        <em>
          {reality
            ? pendingActionCount > 0
              ? `${pendingActionCount} alliance decision${pendingActionCount === 1 ? '' : 's'} need your attention.`
              : pendingPromiseCount > 0
                ? `${pendingPromiseCount} commitment${pendingPromiseCount === 1 ? '' : 's'} need your attention.`
                : (dayChronicle?.title ?? 'Your story in the Hub is unfolding.')
            : (latest?.text ?? 'The Hub is still reading the room.')}
        </em>
        <b>{reality ? 'Open My Pulse' : 'Open My Game'}</b>
      </button>
      {modal && createPortal(modal, document.body)}
    </>
  )
}

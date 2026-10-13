import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Player } from '../../types'
import { buildSocialStoryStream, type SocialStoryBeat } from '../../social/socialStoryStream'
import type {
  DramaSocialNetwork,
  RelationshipsMap,
  SocialActionLogEntry,
  SocialCommitment,
} from '../../social/types'
import type { RealityDomainState } from '../../social/reality'
import {
  allianceEventText,
  allianceForEvent,
  allianceKind,
  canReadAllianceEvent,
  isFormerAllianceMember,
} from '../../social/reality'
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
  reality?: RealityDomainState
  socialCommitments?: readonly SocialCommitment[]
  pendingActionCount?: number
  onOpenIncoming?: () => void
  onOpenAlliances?: (allianceId?: string, eventId?: string) => void
}

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

type PulseStoryBeat = SocialStoryBeat & { allianceId?: string }

/** Today is a concise, chronological feed of only events the player could know. */
function buildRealityPulseStream(
  reality: RealityDomainState,
  humanId: string,
  currentWeek: number,
  playerName: (id: string) => string
): PulseStoryBeat[] {
  const records = [
    ...new Map(
      [
        ...reality.events.filter((event) => event.day === currentWeek),
        ...Object.values(reality.alliances).flatMap((alliance) =>
          (alliance.history ?? []).filter((event) => event.day === currentWeek)
        ),
        ...Object.values(reality.allianceManagement.requests).flatMap((request) =>
          (request.history ?? []).filter((event) => event.day === currentWeek)
        ),
      ].map((event) => [event.id, event])
    ).values(),
  ]
  const consultationEventIds = new Set(
    records
      .filter((event) => event.type === 'ALLIANCE_STRATEGY_MEETING')
      .map((event) => event.reason.split(':').at(-1))
      .filter((id): id is string => Boolean(id && id.startsWith('reality-event-')))
  )
  return records
    .filter((event) => {
      if (!canReadAllianceEvent(event, humanId)) return false
      // The strategy meeting is the useful story record; hide its low-value
      // interaction-log twin once the huddle has a durable outcome event.
      if (
        event.type === 'SOCIAL_INTERACTION_RESOLVED' &&
        event.actionId === 'consult_alliance' &&
        consultationEventIds.has(event.id)
      )
        return false
      if (
        ['ALLIANCE_REQUEST_VOTE', 'ALLIANCE_REQUEST_CONSENT', 'ALLIANCE_REQUEST_ACCEPTED'].includes(
          event.type
        )
      )
        return false
      // Synchronous voting and AI acceptance produce one outcome in Today; the full read retains every step.
      if (
        ['ALLIANCE_REQUEST_SUBMITTED', 'ALLIANCE_INVITATION_SENT'].includes(event.type) &&
        event.allianceRequestId
      ) {
        const request = reality.allianceManagement.requests[event.allianceRequestId]
        if (request?.settledAt?.day === event.day && request.settledAt.phase === event.phase)
          return false
      }
      return true
    })
    .sort((left, right) => right.sequence - left.sequence)
    .map((event) => {
      const allianceId = allianceForEvent(reality, event)
      const alliance = allianceId ? reality.alliances[allianceId] : undefined
      const isAllianceEvent = event.type.startsWith('ALLIANCE_')
      const signal = `${event.type} ${event.tags.join(' ')}`.toLowerCase()
      const kind: SocialStoryBeat['kind'] = /betray|conflict|confront|target|nomination/.test(
        signal
      )
        ? 'conflict'
        : /repair|apolog|reassure/.test(signal)
          ? 'repair'
          : isAllianceEvent || /deal|promise|vote|strategy/.test(signal)
            ? 'strategy'
            : event.publicEligible
              ? 'public'
              : 'bond'
      const actor =
        event.actorId === humanId ? 'You' : event.actorId ? playerName(event.actorId) : 'The hub'
      const allianceName = event.allianceSnapshot?.name ?? alliance?.name ?? 'the alliance'
      const targets = event.targetIds
        .filter((id) => id !== event.actorId)
        .map((id) => (id === humanId ? 'you' : playerName(id)))
        .join(' and ')
      const text = isAllianceEvent
        ? allianceEventText(reality, event, humanId, playerName)
        : `${actor} · ${titleCase(event.actionId ?? event.type)}${targets ? ` · ${targets}` : ''}.`
      const isConsultation = event.type === 'ALLIANCE_STRATEGY_MEETING'
      const title = isConsultation ? `${actor} consulted ${allianceName}.` : text
      const consultationDetail = isConsultation
        ? (event.allianceConsultationSummary ??
          (event.targetIds.length
            ? `The recorded huddle focused on ${event.targetIds.map((id) => (id === humanId ? 'you' : playerName(id))).join(' and ')}, but its recommendation details were not saved.`
            : 'The outcome was not recorded for this earlier huddle.'))
        : text
      return {
        id: event.id,
        kind,
        title,
        text: consultationDetail,
        eventType: event.type,
        allianceId:
          alliance &&
          allianceKind(alliance) === 'GROUP' &&
          isFormerAllianceMember(alliance, humanId)
            ? allianceId
            : undefined,
        participantIds: event.participantIds,
        week: event.day,
        phase: event.phase,
        severity: event.visibility === 'CEREMONY_PUBLIC' ? 'major' : 'notable',
        createdAt: event.sequence,
        dedupeKey: event.id,
      }
    })
}

export default function HousePulse({
  network,
  players,
  humanId,
  actionHistory,
  relationships,
  weekStartRelSnapshot,
  currentWeek,
  reality,
  socialCommitments = [],
  pendingActionCount = 0,
  onOpenIncoming,
  onOpenAlliances,
}: HousePulseProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PulseTab>('today')
  const [earlierOpen, setEarlierOpen] = useState(false)

  useEffect(() => {
    const openPulse = () => {
      setTab(reality ? 'today' : 'stream')
      setEarlierOpen(false)
      setOpen(true)
    }
    const closePulse = () => setOpen(false)
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
    return () => {
      window.removeEventListener('reality-social-tutorial:open-pulse', openPulse)
      window.removeEventListener('reality-social-tutorial:close-pulse', closePulse)
      window.removeEventListener('reality-social-tutorial:set-pulse-tab', setPulseTab)
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
        ? buildRealityPulseStream(reality, humanId, currentWeek, playerName)
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
      playerName,
      players,
      reality,
      relationships,
      weekStartRelSnapshot,
    ]
  )
  const todayBeats = storyBeats
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
              {todayBeats.length ? (
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
                            onOpenAlliances(beat.allianceId, beat.id)
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
                                  onOpenAlliances(beat.allianceId, beat.id)
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
              ? `Today · ${storyBeats.length} development${storyBeats.length === 1 ? '' : 's'}`
              : `Today · ${storyBeats.length} visible shift${storyBeats.length === 1 ? '' : 's'}`}
          </small>
        </span>
        <em>
          {reality
            ? pendingActionCount > 0
              ? `${pendingActionCount} alliance decision${pendingActionCount === 1 ? '' : 's'} need your attention.`
              : pendingPromiseCount > 0
                ? `${pendingPromiseCount} commitment${pendingPromiseCount === 1 ? '' : 's'} need your attention.`
                : (latest?.title ?? 'Your latest Hub developments and commitments.')
            : (latest?.text ?? 'The Hub is still reading the room.')}
        </em>
        <b>{reality ? 'Open My Pulse' : 'Open My Game'}</b>
      </button>
      {modal && createPortal(modal, document.body)}
    </>
  )
}

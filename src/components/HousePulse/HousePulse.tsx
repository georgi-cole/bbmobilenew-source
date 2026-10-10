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
import { allianceKind, getRealityAllianceKnowledgeView } from '../../social/reality'
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
  onOpenAlliances?: () => void
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
  eviction_results: 'After the eviction',
  social: 'During house life',
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
      return 'The connection is now part of how the house reads them.'
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

/**
 * Reality Mode only reports events the player took part in, witnessed, or that
 * happened openly in the house. It intentionally does not turn hidden AI
 * actions into a "story" before the player could have learned them.
 */
function buildRealityPulseStream(
  reality: RealityDomainState,
  humanId: string,
  currentWeek: number,
  playerName: (id: string) => string
): SocialStoryBeat[] {
  return reality.events
    .filter(
      (event) =>
        event.day === currentWeek &&
        (event.participantIds.includes(humanId) ||
          event.witnessIds.includes(humanId) ||
          event.visibility === 'HOUSE_PUBLIC' ||
          event.visibility === 'CEREMONY_PUBLIC')
    )
    .slice()
    .map((event) => {
      const signal = `${event.type} ${event.tags.join(' ')}`.toLowerCase()
      const targetNames = event.targetIds.filter((id) => id !== humanId).map(playerName)
      const actor = event.actorId && event.actorId !== humanId ? playerName(event.actorId) : null
      const kind: SocialStoryBeat['kind'] = /betray|conflict|confront|target|nomination/.test(
        signal
      )
        ? 'conflict'
        : /repair|apolog|reassure/.test(signal)
          ? 'repair'
          : /alliance|deal|promise|vote|strategy/.test(signal)
            ? 'strategy'
            : event.visibility === 'HOUSE_PUBLIC' || event.visibility === 'CEREMONY_PUBLIC'
              ? 'public'
              : 'bond'
      const allianceId =
        event.allianceSnapshot?.id ??
        (event.reason.startsWith('management:') ? event.reason.slice('management:'.length) : null)
      const alliance = allianceId ? reality.alliances[allianceId] : null
      const allianceKnowledge = alliance
        ? getRealityAllianceKnowledgeView(reality, alliance.id, humanId)
        : null
      const knownAllianceName =
        event.allianceSnapshot?.name ??
        (alliance && allianceKnowledge?.level !== 'UNKNOWN'
          ? (allianceKnowledge?.displayName ?? alliance.name)
          : undefined)
      const allianceName = knownAllianceName ?? 'the alliance'
      const formationName = knownAllianceName ?? 'an alliance'
      const otherParticipants = event.participantIds.filter(
        (id) => id !== humanId && id !== event.actorId
      )
      const otherParticipantNames = otherParticipants.map(playerName).join(' and ')
      const title = /ALLIANCE_OFFICERS_CHANGED/.test(event.type)
        ? 'Alliance leadership changed'
        : /ALLIANCE_MEMBER_RECRUITED/.test(event.type)
          ? 'A new member joined an alliance'
          : /ALLIANCE_FORMED/.test(event.type)
            ? 'An alliance formed'
            : /ALLIANCE_RENAMED/.test(event.type)
              ? 'Your alliance was renamed'
              : /ALLIANCE_(ENDED|DISSOLVED)/.test(event.type)
                ? (event.allianceSnapshot?.kind ??
                    (alliance ? allianceKind(alliance) : undefined)) === 'PACT'
                  ? 'A pact ended'
                  : 'An alliance ended'
                : event.visibility === 'CEREMONY_PUBLIC'
                  ? 'A public decision landed'
                  : /nomination/.test(signal)
                    ? 'Nominations changed the room'
                    : /safety|pov/.test(signal)
                      ? 'Safety changed the board'
                      : titleCase(event.type)
      const subject = event.actorId === humanId ? 'You' : (actor ?? 'The house')
      const detail = targetNames.length ? ` involving ${targetNames.join(' and ')}` : ''
      const isAllianceEvent =
        Boolean(allianceId) ||
        /ALLIANCE_(FORMED|RENAMED|MEMBER_RECRUITED|OFFICERS_CHANGED|ENDED)/.test(event.type)
      const text = /ALLIANCE_OFFICERS_CHANGED/.test(event.type)
        ? `Leadership roles changed in ${allianceName}.`
        : /ALLIANCE_MEMBER_RECRUITED/.test(event.type)
          ? `${targetNames[0] ?? 'A housemate'} joined ${allianceName}.`
          : /ALLIANCE_FORMED/.test(event.type)
            ? event.actorId === humanId
              ? `You formed ${formationName}${
                  event.participantIds.filter((id) => id !== humanId).length
                    ? ` with ${event.participantIds
                        .filter((id) => id !== humanId)
                        .map(playerName)
                        .join(' and ')}`
                    : ''
                }.`
              : actor
                ? `${actor} formed ${formationName}${event.participantIds.includes(humanId) ? ' with you' : ''}${otherParticipantNames ? `${event.participantIds.includes(humanId) ? ' and ' : ' with '}${otherParticipantNames}` : ''}.`
                : `You learned that ${formationName} formed${detail}.`
            : /ALLIANCE_RENAMED/.test(event.type)
              ? `${subject} gave ${allianceName} a new name.`
              : /ALLIANCE_(ENDED|DISSOLVED)/.test(event.type)
                ? allianceEndText({
                    event,
                    allianceName,
                    endReason: event.allianceSnapshot?.endReason ?? alliance?.endReason,
                    allianceKind:
                      event.allianceSnapshot?.kind ??
                      (alliance ? allianceKind(alliance) : undefined),
                    playerName,
                    humanId,
                  })
                : event.visibility === 'HOUSE_PUBLIC' || event.visibility === 'CEREMONY_PUBLIC'
                  ? `${subject} made a visible move${detail}. The house has seen it.`
                  : `${subject} was part of a moment${detail} that you experienced firsthand.`
      return {
        id: event.id,
        kind,
        title,
        text,
        eventType: event.type,
        participantIds: event.participantIds,
        week: event.day,
        phase: event.phase,
        severity:
          event.visibility === 'CEREMONY_PUBLIC' || /nomination|eviction|safety/.test(signal)
            ? 'major'
            : event.outcome === 'SYSTEM' && !isAllianceEvent
              ? 'quiet'
              : 'notable',
        createdAt: event.sequence,
        dedupeKey: event.id,
      }
    })
}

function allianceEndText(input: {
  event: RealityDomainState['events'][number]
  allianceName: string
  endReason?: string
  allianceKind?: 'PACT' | 'GROUP'
  playerName: (id: string) => string
  humanId: string
}): string {
  const { event, allianceName, endReason, allianceKind, playerName, humanId } = input
  const snapshot = event.allianceSnapshot
  const actor = event.actorId ? playerName(event.actorId) : 'The house'
  const subject = event.actorId === humanId ? 'You' : actor
  const memberIds = snapshot?.memberIds ?? event.participantIds
  const memberNames = memberIds.map(playerName)
  const otherMembers = memberIds.filter((id) => id !== humanId).map(playerName)

  if (endReason === 'DISSOLVED_BY_LEADER') {
    const roster = memberNames.length
      ? `, ending it for ${formatNames(memberNames.map((name) => (name === 'You' ? 'you' : name)))}`
      : ''
    return `${subject} dissolved ${allianceName}${roster}.`
  }
  if (endReason === 'ENDED_BY_PARTNER') {
    if (event.actorId === humanId)
      return `You ended your pact with ${otherMembers.join(' and ') || 'your partner'}.`
    return `${actor} ended their pact with you.`
  }
  if (endReason === 'TOO_FEW_MEMBERS') {
    const departingId = event.targetIds[0]
    const departingName = departingId ? playerName(departingId) : 'A member'
    const exitVerb =
      snapshot?.exitKind === 'EXPELLED'
        ? 'was removed'
        : snapshot?.exitKind === 'DEFECTION'
          ? 'defected'
          : snapshot?.exitKind === 'EVICTED'
            ? 'left the game'
            : 'left'
    const action =
      snapshot?.exitKind === 'EXPELLED' && event.actorId && event.actorId !== departingId
        ? ` by ${actor}`
        : ''
    return `${allianceName} ended after ${departingName} ${exitVerb}${action}, leaving too few members to continue.`
  }
  if (endReason === 'SUPERSEDED')
    return allianceKind === 'PACT'
      ? `${allianceName} ended when the pact was replaced by a group.`
      : `${allianceName} was replaced by a newer alliance.`
  if (endReason === 'RECONCILED') return `${allianceName} ended as the pact was renewed.`
  const roster = memberNames.length ? ` Members were ${memberNames.join(', ')}.` : ''
  return `${allianceName} ended${roster}`
}

function formatNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
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

  useEffect(() => {
    const openPulse = () => {
      setTab(reality ? 'today' : 'stream')
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
  const storyBeats = useMemo(
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
  const prioritizedBeats = storyBeats.slice().sort((left, right) => {
    const weight = { major: 2, notable: 1, quiet: 0 }
    return weight[right.severity] - weight[left.severity] || right.createdAt - left.createdAt
  })
  const todayBeats = reality ? prioritizedBeats : storyBeats
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
                        <em>{titleCase(beat.severity)}</em>
                      </div>
                      <h3>{beat.title}</h3>
                      <p>{beat.text}</p>
                      {reality &&
                        onOpenAlliances &&
                        beat.eventType !== 'ALLIANCE_ENDED' &&
                        beat.eventType !== 'ALLIANCE_DISSOLVED' &&
                        /alliance|pact|group/.test(beat.title.toLowerCase()) && (
                          <button
                            type="button"
                            className="house-pulse__link"
                            onClick={() => {
                              setOpen(false)
                              onOpenAlliances()
                            }}
                          >
                            Open alliance actions
                          </button>
                        )}
                    </article>
                  ))}
                  {todayBeats.length > 3 && (
                    <details className="house-pulse__history">
                      <summary>Earlier today · {todayBeats.length - 3}</summary>
                      {todayBeats.slice(3).map((beat) => (
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
                          <p>{beat.text}</p>
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
                    : 'The house is still reading the room. Visible patterns will appear here as actions repeat or consequences land.'}
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
                      <span>{RUMOUR_LABEL[rumour.kind] ?? 'House intel'}</span>
                      <em>{reliability}</em>
                    </div>
                    <h3>{subject}</h3>
                    <p>{claim}</p>
                    <small>{trail}</small>
                  </article>
                )
              })
            ) : (
              <p className="house-pulse__empty">You have not learned any current house intel.</p>
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
                : (latest?.title ?? 'Your latest house developments and commitments.')
            : (latest?.text ?? 'The house is still reading the room.')}
        </em>
        <b>{reality ? 'Open My Pulse' : 'Open My Game'}</b>
      </button>
      {modal && createPortal(modal, document.body)}
    </>
  )
}

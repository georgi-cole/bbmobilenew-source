import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  closeIncomingInbox,
  markIncomingInteractionRead,
  selectDramaNetwork,
  selectIncomingInboxOpen,
  selectIncomingInteractions,
  selectSocialCommitments,
} from '../../social/socialSlice'
import { getIncomingInteractionPriority } from '../../social/incomingInteractionScheduler'
import {
  getIncomingInteractionTypeLabel,
  respondToIncomingInteraction,
} from '../../social/incomingInteractions'
import { executeAllianceManagementCommand } from '../../social/allianceManagementActions'
import {
  allianceRequestDecisionActors,
  canSeeAllianceRequest,
  isPendingAllianceRequest,
} from '../../social/reality/allianceManagement'
import type { RealityAllianceRequest } from '../../social/reality/types'
import {
  getIncomingInteractionResponseLabel,
  getIncomingInteractionResponseOptions,
  getIncomingInteractionTone,
  orderIncomingInteractionResponseOptions,
} from '../../social/incomingInteractionPresentation'
import GameBackButton from '../ui/GameBackButton/GameBackButton'
import {
  getIncomingSocialModuleAvailability,
  logBlockedSocialModuleOpen,
} from '../../social/socialModuleAvailability'
import {
  getSocialCommitmentDueCopy,
  getSocialCommitmentLabel,
  getSocialCredibility,
} from '../../social/socialCommitments'
import { getEffectiveSocialMode } from '../../social/socialMode'
import {
  getIncomingInteractionResponsePolicy,
  type IncomingInteractionResponsePolicy,
} from '../../social/socialRuntimeConfig'
import type {
  DramaBelief,
  IncomingInteraction,
  IncomingInteractionPriority,
  IncomingInteractionResponseType,
  RelationshipsMap,
  SocialCommitment,
  SocialMemoryMap,
} from '../../social/types'
import type { Player } from '../../types'
import {
  formatIncomingDeadline,
  isIncomingInteractionUrgent,
} from '../../social/incomingInteractionDeadline'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import ContextualGuidePrompt from '../../onboarding/ContextualGuidePrompt'
import {
  hasSeenContextualGuide,
  markContextualGuideSeen,
} from '../../onboarding/contextualGuidePreference'
import IncomingInteractionIcon from './IncomingInteractionIcon'
import './IncomingInteractionsInbox.css'

function formatResponseLabel(interaction: IncomingInteraction): string {
  if (interaction.resolvedLabel) return `Resolved · ${interaction.resolvedLabel}`
  if (!interaction.resolvedWith) return 'Resolved'
  return `Resolved · ${getIncomingInteractionResponseLabel(
    interaction.type,
    interaction.resolvedWith
  )}`
}

function relationshipContextLabel(interaction: IncomingInteraction): string | null {
  const intent = interaction.payload?.relationshipIntent
  if (typeof intent !== 'string') return null
  return (
    {
      CONNECT: 'Getting to know you',
      DEEPEN_BOND: 'Following up',
      RECRUIT: 'Looking for a real partnership',
      MAINTAIN_COMMITMENT: 'Checking your commitment',
      CONFIDE: 'A personal conversation',
      EXPLORE_ROMANCE: 'A personal conversation',
      MAINTAIN_ROMANCE: 'A relationship moment',
      SEEK_REASSURANCE: 'Following up',
      REPAIR: 'Trying to repair things',
      CONFRONT: 'An unresolved moment',
    }[intent] ?? 'Following up'
  )
}

function getExpiryLabel(
  interaction: IncomingInteraction,
  currentWeek: number,
  currentPhase: string,
  policy: IncomingInteractionResponsePolicy
): string | null {
  if (
    interaction.resolved ||
    policy !== 'required' ||
    !isIncomingInteractionUrgent(interaction, { day: currentWeek, phase: currentPhase })
  ) {
    return null
  }
  return formatIncomingDeadline(interaction)
}

function getHouseRead(
  beliefs: readonly DramaBelief[],
  humanId: string
): { label: string; explanation: string } {
  const relevant = beliefs.filter(
    (belief) => belief.subjectId === humanId && belief.holderId !== humanId
  )
  if (relevant.length === 0) {
    return {
      label: 'Still forming',
      explanation: 'The house has not settled on a clear read of you yet.',
    }
  }
  const weight = relevant.reduce((sum, belief) => sum + belief.confidence, 0) || 1
  const sentiment =
    relevant.reduce((sum, belief) => sum + belief.sentiment * belief.confidence, 0) / weight

  if (sentiment >= 0.28) {
    return {
      label: 'Mostly positive',
      explanation: 'The strongest current beliefs about you lean loyal or dependable.',
    }
  }
  if (sentiment <= -0.28) {
    return {
      label: 'Under suspicion',
      explanation:
        'Recent choices, rumours or broken expectations are making the house more cautious around you.',
    }
  }
  return {
    label: 'Mixed',
    explanation: 'Different housemates currently read your game in different ways.',
  }
}

function formatResolutionReason(reason?: string): string {
  switch (reason) {
    case 'protected_at_nominations':
      return 'You kept them off the block.'
    case 'nominated_after_promise':
      return 'They were nominated after you promised protection.'
    case 'saved_with_safety':
    case 'protected_by_multi_save':
      return 'You used Safety to protect them.'
    case 'declined_to_use_safety':
      return 'You chose not to use Safety.'
    case 'saved_someone_else':
      return 'You used Safety on somebody else.'
    case 'voted_to_keep':
    case 'double_vote_kept_them_safe':
      return 'Your vote matched the promise.'
    case 'voted_against_promise':
    case 'double_vote_targeted_them':
      return 'Your vote went against the promise.'
    case 'decision_window_passed':
      return 'The decision window closed without a valid test.'
    default:
      return reason
        ? reason.replaceAll('_', ' ')
        : 'The promise was judged by a later game decision.'
  }
}

function allianceDecisionTitle(
  request: RealityAllianceRequest,
  allianceName: string,
  proposerName: string,
  candidateName: string
): string {
  switch (request.kind) {
    case 'ADMIT':
      return request.status === 'VOTING'
        ? `Vote on inviting ${candidateName} to ${allianceName}`
        : `${proposerName} invited you to join ${allianceName}`
    case 'FOUND':
      return `${proposerName} proposed a new group`
    case 'PACT':
      return `${proposerName} proposed a personal pact`
    case 'APPOINT':
      return `${proposerName} offered you co-leader in ${allianceName}`
    case 'TRANSFER':
      return `${proposerName} offered you leadership of ${allianceName}`
    case 'REMOVE_SUGGESTION':
      return `Vote on removing ${candidateName} from ${allianceName}`
    case 'RENAME_SUGGESTION':
      return `${proposerName} suggested renaming ${allianceName}`
  }
}

function allianceDecisionCopy(
  request: RealityAllianceRequest,
  allianceName: string,
  roster: string,
  candidateName: string
): string {
  switch (request.kind) {
    case 'ADMIT':
      return request.status === 'VOTING'
        ? `The group is voting on admitting ${candidateName}. A strict member majority and an officer's yes vote are required.`
        : `The group approved your admission. Accept to join as a regular member. Current members: ${roster}.`
    case 'FOUND':
      return `Review the proposed founding roster: ${roster}. Every founder must agree before the group is formed.`
    case 'PACT':
      return 'Accept to create a one-to-one personal pact. This does not form a group.'
    case 'APPOINT':
      return `Accept to become co-leader of ${allianceName}.`
    case 'TRANSFER':
      return `Accept to take leadership of ${allianceName}; the current leader becomes a regular member.`
    case 'REMOVE_SUGGESTION':
      return `The officers are considering a request to remove ${candidateName} from ${allianceName}.`
    case 'RENAME_SUGGESTION':
      return `Suggested name: ${request.proposedName ?? 'Unnamed'}. Accept to rename the group; decline to keep its current name.`
  }
}

function allianceDecisionActionLabels(request: RealityAllianceRequest): [string, string] {
  if (request.status === 'VOTING') return ['Approve vote', 'Vote no']
  switch (request.kind) {
    case 'ADMIT':
      return ['Accept invitation', 'Decline invitation']
    case 'FOUND':
      return ['Agree to group', 'Decline proposal']
    case 'PACT':
      return ['Accept pact', 'Decline pact']
    case 'APPOINT':
      return ['Accept role', 'Decline role']
    case 'TRANSFER':
      return ['Accept leadership', 'Decline transfer']
    case 'REMOVE_SUGGESTION':
      return ['Approve removal', 'Decline suggestion']
    case 'RENAME_SUGGESTION':
      return ['Accept new name', 'Keep current name']
  }
}

interface InteractionItemProps {
  interaction: IncomingInteraction
  priority: IncomingInteractionPriority
  policy: IncomingInteractionResponsePolicy
  showActions: boolean
  playerById: Map<string, Player>
  currentWeek: number
  currentPhase: string
  onRead: (interactionId: string) => void
  onRespond: (
    interactionId: string,
    responseType: IncomingInteractionResponseType,
    responseLabel: string
  ) => void
  relationships: RelationshipsMap
  socialMemory: SocialMemoryMap
  humanId: string
  commitment?: SocialCommitment
  interactionDramaMode: boolean
}

function InteractionItem({
  interaction,
  priority,
  policy,
  showActions,
  playerById,
  currentWeek,
  currentPhase,
  onRead,
  onRespond,
  relationships,
  socialMemory,
  humanId,
  commitment,
  interactionDramaMode,
}: InteractionItemProps) {
  const itemRef = useRef<HTMLDivElement>(null)
  const fromPlayer = playerById.get(interaction.fromId)
  const fromName = fromPlayer?.name ?? interaction.fromId
  const typeLabel = getIncomingInteractionTypeLabel(interaction.type)
  const relationshipContext = relationshipContextLabel(interaction)
  const isUnread = !interaction.read && !interaction.resolved
  const isUrgent =
    policy === 'required' &&
    isIncomingInteractionUrgent(interaction, { day: currentWeek, phase: currentPhase })
  const expiryLabel = getExpiryLabel(interaction, currentWeek, currentPhase, policy)
  const shouldShowActions = showActions && policy !== 'readOnly' && !interaction.resolved

  useEffect(() => {
    if (!isUnread || !itemRef.current) return
    const element = itemRef.current
    if (typeof IntersectionObserver === 'undefined') {
      onRead(interaction.id)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.55)) {
          onRead(interaction.id)
          observer.disconnect()
        }
      },
      { threshold: [0.55] }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [interaction.id, isUnread, onRead])

  const tone = useMemo(
    () =>
      interactionDramaMode
        ? getIncomingInteractionTone({
            interaction,
            relationships,
            socialMemory,
            humanId,
            isUrgent,
          })
        : undefined,
    [interactionDramaMode, interaction, relationships, socialMemory, humanId, isUrgent]
  )

  const responseOptions = useMemo(
    () =>
      shouldShowActions
        ? orderIncomingInteractionResponseOptions(
            interaction,
            getIncomingInteractionResponseOptions(
              interaction.type,
              interaction,
              tone,
              interactionDramaMode
            )
          )
        : [],
    [shouldShowActions, interaction, tone, interactionDramaMode]
  )

  const resolvedLabel = interaction.resolved
    ? formatResponseLabel(interaction)
    : isUnread
      ? 'New'
      : policy === 'readOnly'
        ? 'Update'
        : null

  return (
    <div
      ref={itemRef}
      className={`inbox-item inbox-item--priority-${priority} inbox-item--policy-${policy}${
        isUnread ? ' inbox-item--unread' : ''
      }${interaction.resolved ? ' inbox-item--resolved' : ''}`}
      role="listitem"
    >
      <div className="inbox-item__header">
        {fromPlayer ? (
          <PlayerAvatar
            player={fromPlayer}
            size="sm"
            showRelationshipOutline={false}
            showEvictedStyle={false}
          />
        ) : (
          <span className="inbox-item__avatar-fallback" aria-label="Unknown housemate">
            <IncomingInteractionIcon name="person" />
          </span>
        )}

        <div className="inbox-item__title">
          <div className="inbox-item__from-row">
            <span className="inbox-item__from">{fromName}</span>
            {priority === 'high' && policy === 'required' && (
              <span className="inbox-item__priority inbox-item__priority--high">Important</span>
            )}
          </div>
          <div className="inbox-item__type-row">
            <span className="inbox-item__type-icon">
              <IncomingInteractionIcon name={interaction.type} />
            </span>
            <span className="inbox-item__type">{typeLabel}</span>
            {relationshipContext && <span className="inbox-item__tone">{relationshipContext}</span>}
            {interactionDramaMode && policy === 'required' && tone && (
              <span className="inbox-item__tone">{tone}</span>
            )}
            {expiryLabel && (
              <span className="inbox-item__expiry inbox-item__expiry--urgent">{expiryLabel}</span>
            )}
          </div>
        </div>

        {resolvedLabel && (
          <span className={`inbox-item__status${isUnread ? ' inbox-item__status--new' : ''}`}>
            {resolvedLabel}
          </span>
        )}
      </div>

      <p className="inbox-item__text">{interaction.text}</p>

      {interaction.outcomeText && <p className="inbox-item__outcome">{interaction.outcomeText}</p>}

      {interactionDramaMode && commitment && (
        <div className={`inbox-item__promise inbox-item__promise--${commitment.status}`}>
          <strong>
            {commitment.status === 'pending' ? 'Promise active' : `Promise ${commitment.status}`}
          </strong>
          <span>{getSocialCommitmentLabel(commitment.kind)}</span>
        </div>
      )}

      {shouldShowActions && (
        <div className="inbox-item__actions">
          {responseOptions.map((option) => (
            <button
              key={`${interaction.id}-${option.responseType}`}
              type="button"
              aria-label={option.label}
              data-response-type={option.responseType}
              className={`inbox-action inbox-action--${option.style}`}
              onClick={() => onRespond(interaction.id, option.responseType, option.label)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function IncomingInteractionsInbox() {
  const dispatch = useAppDispatch()
  const open = useAppSelector(selectIncomingInboxOpen)
  const compareWhileOpen = useCallback(
    (previous: unknown, next: unknown) => !open || previous === next,
    [open]
  )
  // Preserve the inbox and its resolved-conversation state while closed without
  // rerendering it for every background relationship or season update.
  const game = useAppSelector((state) => state.game, compareWhileOpen)
  const interactions = useAppSelector(selectIncomingInteractions)
  const allianceRequests = useAppSelector(
    (state) => state.social.reality.allianceManagement?.requests ?? {},
    compareWhileOpen
  )
  const reality = useAppSelector((state) => state.social.reality, compareWhileOpen)
  const relationships = useAppSelector(
    (state) => state.social?.relationships ?? {},
    compareWhileOpen
  )
  const socialMemory = useAppSelector((state) => state.social?.socialMemory ?? {}, compareWhileOpen)
  const commitments = useAppSelector(selectSocialCommitments)
  const dramaNetwork = useAppSelector(selectDramaNetwork, compareWhileOpen)
  const settings = useAppSelector((state) => state.settings, compareWhileOpen)
  const vip = useAppSelector((state) => state.vip, compareWhileOpen)
  const activeProfileId = useAppSelector((state) => state.profiles?.activeProfileId ?? null)
  const isGuest = useAppSelector((state) => state.profiles?.isGuest ?? false)
  const globalDramaMode = getEffectiveSocialMode({ game, settings, vip }) === 'drama'
  const [recentlyResolvedIds, setRecentlyResolvedIds] = useState<Set<string>>(() => new Set())
  const [allianceDecisionFeedback, setAllianceDecisionFeedback] = useState<string | null>(null)
  const [, refreshContextualGuides] = useState(0)

  const players = game.players
  const currentWeek = game.week ?? 1
  const humanPlayer = players.find((player) => player.isUser)
  const socialModuleAvailability = useMemo(() => getIncomingSocialModuleAvailability(game), [game])
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const actionableAllianceRequests = useMemo(() => {
    if (!humanPlayer) return []
    return Object.values(allianceRequests).filter(
      (request) =>
        isPendingAllianceRequest(request) &&
        canSeeAllianceRequest(request, humanPlayer.id) &&
        allianceRequestDecisionActors(request).includes(humanPlayer.id)
    )
  }, [allianceRequests, humanPlayer])

  const interactionEntries = useMemo(
    () =>
      interactions.map((interaction) => ({
        interaction,
        priority: getIncomingInteractionPriority(
          interaction.type,
          typeof interaction.payload?.scenarioKey === 'string'
            ? interaction.payload.scenarioKey
            : undefined
        ),
        policy: getIncomingInteractionResponsePolicy(interaction),
      })),
    [interactions]
  )

  const sortedInteractions = useMemo(
    () =>
      [...interactionEntries].sort(
        (left, right) =>
          left.interaction.createdAt - right.interaction.createdAt ||
          left.interaction.id.localeCompare(right.interaction.id)
      ),
    [interactionEntries]
  )
  const openInteractions = useMemo(
    () => sortedInteractions.filter((entry) => !entry.interaction.resolved),
    [sortedInteractions]
  )
  const visibleConversationInteractions = useMemo(
    () =>
      sortedInteractions.filter(
        (entry) => !entry.interaction.resolved || recentlyResolvedIds.has(entry.interaction.id)
      ),
    [sortedInteractions, recentlyResolvedIds]
  )
  const resolvedInteractions = useMemo(
    () =>
      sortedInteractions.filter(
        (entry) =>
          entry.interaction.resolved &&
          !recentlyResolvedIds.has(entry.interaction.id) &&
          entry.interaction.resolvedWeek === currentWeek
      ),
    [sortedInteractions, currentWeek, recentlyResolvedIds]
  )
  const pendingCommitments = useMemo(
    () => commitments.filter((commitment) => commitment.status === 'pending'),
    [commitments]
  )
  const judgedCommitments = useMemo(
    () =>
      commitments
        .filter((commitment) => commitment.status === 'kept' || commitment.status === 'broken')
        .sort(
          (left, right) =>
            (right.resolvedWeek ?? right.createdWeek) - (left.resolvedWeek ?? left.createdWeek)
        ),
    [commitments]
  )
  const credibility = useMemo(() => getSocialCredibility(commitments), [commitments])
  const houseRead = useMemo(
    () => (humanPlayer ? getHouseRead(dramaNetwork.beliefs, humanPlayer.id) : null),
    [dramaNetwork.beliefs, humanPlayer]
  )

  const headerSummary =
    [
      actionableAllianceRequests.length > 0
        ? `${actionableAllianceRequests.length} alliance decision${actionableAllianceRequests.length === 1 ? '' : 's'}`
        : null,
      openInteractions.length > 0
        ? `${openInteractions.length} open conversation${openInteractions.length === 1 ? '' : 's'}`
        : null,
    ]
      .filter((entry): entry is string => entry !== null)
      .join(' · ') || 'All caught up'

  const hasSeenIncomingGuide = hasSeenContextualGuide('incoming', activeProfileId, isGuest)
  const hasSeenPromiseGuide = hasSeenContextualGuide('promise', activeProfileId, isGuest)
  const hasMeaningfulIncoming =
    globalDramaMode && openInteractions.some(({ policy }) => policy === 'required')
  const hasHumanPromise =
    globalDramaMode &&
    Boolean(
      humanPlayer &&
      pendingCommitments.some((commitment) => commitment.promisorId === humanPlayer.id)
    )
  const showIncomingContextGuide = open && hasMeaningfulIncoming && !hasSeenIncomingGuide
  const showPromiseContextGuide =
    open && hasHumanPromise && !showIncomingContextGuide && !hasSeenPromiseGuide

  const dismissContextualGuide = (guide: 'incoming' | 'promise') => {
    markContextualGuideSeen(guide, activeProfileId, isGuest)
    refreshContextualGuides((revision) => revision + 1)
  }

  useEffect(() => {
    if (!open || socialModuleAvailability.canOpen) return
    logBlockedSocialModuleOpen(
      'Incoming social module',
      socialModuleAvailability,
      'IncomingInteractionsInbox visibility guard'
    )
    dispatch(closeIncomingInbox())
  }, [dispatch, open, socialModuleAvailability])

  if (!open || !socialModuleAvailability.canOpen || !humanPlayer) return null

  const renderInteraction = (
    interaction: IncomingInteraction,
    priority: IncomingInteractionPriority,
    policy: IncomingInteractionResponsePolicy,
    showActions: boolean
  ) => {
    const interactionDramaMode = globalDramaMode
    return (
      <InteractionItem
        key={interaction.id}
        interaction={interaction}
        priority={priority}
        policy={policy}
        showActions={showActions}
        playerById={playerById}
        currentWeek={currentWeek}
        currentPhase={game.phase ?? 'week_start'}
        onRead={(interactionId) => dispatch(markIncomingInteractionRead(interactionId))}
        onRespond={(interactionId, responseType, responseLabel) => {
          setRecentlyResolvedIds((current) => {
            const nextIds = new Set(current)
            nextIds.add(interactionId)
            return nextIds
          })
          dispatch(respondToIncomingInteraction({ interactionId, responseType, responseLabel }))
        }}
        relationships={relationships}
        socialMemory={socialMemory}
        humanId={humanPlayer.id}
        commitment={commitments.find((entry) => entry.interactionId === interaction.id)}
        interactionDramaMode={interactionDramaMode}
      />
    )
  }

  return (
    <div
      className="inbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Incoming interactions"
    >
      <div className={`inbox-panel${globalDramaMode ? ' inbox-panel--drama' : ''}`}>
        <header className="inbox-header">
          <div className="inbox-header__top">
            <div className="inbox-header__title">
              <IncomingInteractionIcon name="inbox" className="inbox-header__title-icon" />
              <span className="inbox-header__title-text">Incoming Interactions</span>
              {globalDramaMode && <span className="inbox-header__mode">Reality</span>}
            </div>
            <GameBackButton
              className="inbox-header__close"
              label="Close inbox"
              onClick={() => {
                setRecentlyResolvedIds(new Set())
                dispatch(closeIncomingInbox())
              }}
            />
          </div>

          <div className="inbox-header__meta">
            {globalDramaMode && (
              <details className="inbox-header__reputation">
                <summary>
                  {credibility.kept + credibility.broken === 0
                    ? 'Promise reliability · unproven'
                    : `Promise reliability ${credibility.score}% · ${credibility.label}`}
                </summary>
                <div className="inbox-header__reputation-body">
                  <p>
                    <strong>{credibility.kept}</strong> kept · <strong>{credibility.broken}</strong>{' '}
                    broken
                  </p>
                  <p>
                    Reliability changes only when a promise reaches the decision it referred to. It
                    improves by making fewer promises and keeping the next ones you do make.
                  </p>
                  {houseRead && (
                    <p>
                      <strong>House read: {houseRead.label}.</strong> {houseRead.explanation}
                    </p>
                  )}
                  {judgedCommitments.slice(0, 3).map((commitment) => (
                    <p key={commitment.id} className="inbox-header__reputation-event">
                      {commitment.status === 'kept' ? '✓' : '✕'}{' '}
                      {getSocialCommitmentLabel(commitment.kind)} ·{' '}
                      {formatResolutionReason(commitment.resolutionReason)}
                    </p>
                  ))}
                </div>
              </details>
            )}
            <span className="inbox-header__summary">{headerSummary}</span>
          </div>
        </header>

        <div className="inbox-list">
          {allianceDecisionFeedback && (
            <p className="inbox-alliance-feedback" role="status" aria-live="polite">
              {allianceDecisionFeedback}
            </p>
          )}
          {sortedInteractions.length === 0 && actionableAllianceRequests.length === 0 ? (
            <div className="inbox-empty">No incoming interactions or alliance decisions.</div>
          ) : (
            <div className="inbox-sections">
              {actionableAllianceRequests.length > 0 && (
                <section className="inbox-section" aria-label="Alliance proposals and decisions">
                  <h3 className="inbox-section__title">
                    Alliance proposals and votes · {actionableAllianceRequests.length}
                  </h3>
                  <div className="inbox-section__list" role="list">
                    {actionableAllianceRequests.map((request) => {
                      const proposerName =
                        playerById.get(request.proposerId)?.name ?? request.proposerId
                      const candidateName = request.candidateId
                        ? (playerById.get(request.candidateId)?.name ?? request.candidateId)
                        : 'the candidate'
                      const alliance = request.allianceId
                        ? reality.alliances[request.allianceId]
                        : undefined
                      const allianceName = alliance?.name ?? request.name ?? 'the group'
                      const rosterIds =
                        request.kind === 'FOUND'
                          ? request.memberIds
                          : (alliance?.memberIds ?? request.memberIds)
                      const roster = rosterIds
                        .map((id) => playerById.get(id)?.name ?? id)
                        .join(' · ')
                      const [acceptLabel, declineLabel] = allianceDecisionActionLabels(request)
                      return (
                        <article
                          className="inbox-item inbox-item--alliance inbox-item--unread"
                          key={request.id}
                          role="listitem"
                        >
                          <div className="inbox-item__header">
                            <div className="inbox-item__title">
                              <div className="inbox-item__from-row">
                                <span className="inbox-item__from">
                                  {allianceDecisionTitle(
                                    request,
                                    allianceName,
                                    proposerName,
                                    candidateName
                                  )}
                                </span>
                                <span className="inbox-item__priority inbox-item__priority--alliance">
                                  Alliance
                                </span>
                              </div>
                              <div className="inbox-item__type-row">
                                <span className="inbox-item__type">
                                  {request.status === 'VOTING' ? 'Member vote' : 'Your decision'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <p className="inbox-item__text">
                            {allianceDecisionCopy(request, allianceName, roster, candidateName)}
                          </p>
                          <div className="inbox-item__actions">
                            <button
                              type="button"
                              aria-label={acceptLabel}
                              className="inbox-action inbox-action--positive"
                              onClick={() => {
                                const result = dispatch(
                                  executeAllianceManagementCommand({
                                    type: 'RESPOND',
                                    requestId: request.id,
                                    actorId: humanPlayer.id,
                                    accept: true,
                                  })
                                )
                                setAllianceDecisionFeedback(result.reason)
                              }}
                            >
                              {acceptLabel}
                            </button>
                            <button
                              type="button"
                              aria-label={declineLabel}
                              className="inbox-action inbox-action--negative"
                              onClick={() => {
                                const result = dispatch(
                                  executeAllianceManagementCommand({
                                    type: 'RESPOND',
                                    requestId: request.id,
                                    actorId: humanPlayer.id,
                                    accept: false,
                                  })
                                )
                                setAllianceDecisionFeedback(result.reason)
                              }}
                            >
                              {declineLabel}
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              )}
              {globalDramaMode && pendingCommitments.length > 0 && (
                <details className="inbox-section inbox-section--promises">
                  <summary className="inbox-section__title inbox-section__title--promises">
                    Active promises · {pendingCommitments.length}
                  </summary>
                  <div className="inbox-promises">
                    {pendingCommitments.map((commitment) => (
                      <div className="inbox-promise" key={commitment.id}>
                        <strong>{getSocialCommitmentLabel(commitment.kind)}</strong>
                        <span>
                          {playerById.get(commitment.beneficiaryId)?.name ??
                            commitment.beneficiaryId}
                          {' · '}
                          {getSocialCommitmentDueCopy(commitment.kind)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {visibleConversationInteractions.length > 0 && (
                <section className="inbox-section" aria-label="Messages">
                  <h3 className="inbox-section__title">Messages</h3>
                  <div className="inbox-section__list" role="list">
                    {visibleConversationInteractions.map(({ interaction, priority, policy }) =>
                      renderInteraction(interaction, priority, policy, !interaction.resolved)
                    )}
                  </div>
                </section>
              )}

              {resolvedInteractions.length > 0 && (
                <details className="inbox-section inbox-section--history">
                  <summary className="inbox-section__title inbox-section__title--resolved">
                    History · {resolvedInteractions.length}
                  </summary>
                  <div className="inbox-section__list" role="list">
                    {resolvedInteractions.map(({ interaction, priority, policy }) =>
                      renderInteraction(interaction, priority, policy, false)
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
      {showIncomingContextGuide && (
        <ContextualGuidePrompt
          eyebrow="INCOMING"
          title="They came to you"
          body="Incoming is driven by the other players. Your response can change the relationship — and some conversations can create commitments that matter later."
          onComplete={() => dismissContextualGuide('incoming')}
        />
      )}
      {showPromiseContextGuide && (
        <ContextualGuidePrompt
          eyebrow="PROMISE"
          title="You made a promise"
          body="This commitment will be judged when the relevant game decision happens. Keeping or breaking it can affect trust and your reputation. You can review active promises here in Incoming."
          onComplete={() => dismissContextualGuide('promise')}
        />
      )}
    </div>
  )
}

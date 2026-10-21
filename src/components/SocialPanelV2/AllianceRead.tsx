import { useEffect, useMemo, useState } from 'react'
import type { Player } from '../../types'
import { formatPlayerFacingPhase } from '../../social/reality/presentation'
import {
  allianceEventText,
  allianceHistory,
  canSeeAllianceRequest,
  isPendingAllianceRequest,
  type AllianceHistoryEvent,
  type RealityAlliance,
  type RealityDomainState,
} from '../../social/reality'

interface Props {
  alliance: RealityAlliance
  reality: RealityDomainState
  humanId: string
  players: readonly Player[]
  selectedMemberId: string | null
  focusEventId?: string
  onSelectMember: (id: string) => void
}

const HISTORY_PAGE_SIZE = 25

interface AllianceHistoryRow {
  event: AllianceHistoryEvent
  eventIds: string[]
  requestId?: string
  requestSteps: AllianceHistoryEvent[]
}

function eventIds(event: AllianceHistoryEvent): string[] {
  return [event.id, ...(event.mergedEventIds ?? [])]
}

function buildAllianceHistoryRows(history: readonly AllianceHistoryEvent[]): AllianceHistoryRow[] {
  const requestEvents = new Map<string, AllianceHistoryEvent[]>()
  for (const event of history) {
    if (!event.allianceRequestId) continue
    const grouped = requestEvents.get(event.allianceRequestId) ?? []
    grouped.push(event)
    requestEvents.set(event.allianceRequestId, grouped)
  }

  const emittedRequests = new Set<string>()
  const rows: AllianceHistoryRow[] = []
  for (const event of history) {
    const requestId = event.allianceRequestId
    const steps = requestId ? requestEvents.get(requestId) : undefined
    if (requestId && steps && steps.length > 1) {
      if (emittedRequests.has(requestId)) continue
      emittedRequests.add(requestId)
      const latest = steps[0]
      rows.push({
        event: latest,
        eventIds: [...new Set(steps.flatMap(eventIds))],
        requestId,
        requestSteps: steps.slice(1).reverse(),
      })
      continue
    }
    rows.push({ event, eventIds: eventIds(event), requestSteps: [] })
  }
  return rows.sort((left, right) => right.event.sequence - left.event.sequence)
}

export default function AllianceRead({
  alliance,
  reality,
  humanId,
  players,
  selectedMemberId,
  focusEventId,
  onSelectMember,
}: Props) {
  const [manualDetails, setManualDetails] = useState<{ key: string; open: boolean } | null>(null)
  const [historyPage, setHistoryPage] = useState<{
    allianceId: string
    focusEventId?: string
    anchorEventId: string
  } | null>(null)
  const [fullReadOpen, setFullReadOpen] = useState(false)
  const [requestExpandedOverrides, setRequestExpandedOverrides] = useState<Record<string, boolean>>(
    {}
  )
  const detailsKey = `${alliance.id}:${focusEventId ?? ''}`
  const historyOpen = manualDetails?.key === detailsKey ? manualDetails.open : Boolean(focusEventId)
  const playerName = (id: string) =>
    id === humanId ? 'You' : (players.find((player) => player.id === id)?.name ?? 'Hubmate')
  const currentMember = alliance.memberIds.includes(humanId) && alliance.status !== 'DISSOLVED'
  const knownRoster = alliance.rosterKnowledgeByActor?.[humanId]
  const history = useMemo(
    () => allianceHistory(reality, alliance.id, humanId),
    [reality, alliance.id, humanId]
  )
  const historyRows = useMemo(() => buildAllianceHistoryRows(history), [history])
  const focusedRow = focusEventId
    ? historyRows.find((row) => row.eventIds.includes(focusEventId))
    : undefined
  const focusedRowIndex = focusedRow ? historyRows.indexOf(focusedRow) : -1
  const maxHistoryStart = Math.max(0, historyRows.length - HISTORY_PAGE_SIZE)
  const focusWindowStart =
    focusedRowIndex >= 0
      ? Math.max(0, Math.min(maxHistoryStart, focusedRowIndex - Math.floor(HISTORY_PAGE_SIZE / 2)))
      : 0
  const savedAnchorIndex =
    historyPage?.allianceId === alliance.id && historyPage.focusEventId === focusEventId
      ? historyRows.findIndex((row) => row.eventIds.includes(historyPage.anchorEventId))
      : -1
  const visibleHistoryStart = Math.max(
    0,
    Math.min(maxHistoryStart, savedAnchorIndex >= 0 ? savedAnchorIndex : focusWindowStart)
  )
  const visibleHistoryEnd = Math.min(historyRows.length, visibleHistoryStart + HISTORY_PAGE_SIZE)
  const visibleHistoryRows = historyRows.slice(visibleHistoryStart, visibleHistoryEnd)
  const lastKnownSnapshot = history.find((event) =>
    event.allianceSnapshot?.memberIds.includes(humanId)
  )?.allianceSnapshot
  const memberIds = currentMember
    ? alliance.memberIds
    : (knownRoster?.memberIds ?? lastKnownSnapshot?.memberIds ?? [])
  const endedKnown = history.some(
    (event) => event.type === 'ALLIANCE_ENDED' || event.type === 'ALLIANCE_DISSOLVED'
  )
  const foundation = alliance.createdAt ?? history.find((event) => event.type === 'ALLIANCE_FORMED')
  const pending = Object.values(reality.allianceManagement.requests).filter(
    (request) =>
      request.allianceId === alliance.id &&
      isPendingAllianceRequest(request) &&
      canSeeAllianceRequest(request, humanId)
  )
  const legacyDecisions = (
    historyOpen ? Object.values(reality.allianceManagement.requests) : []
  ).filter(
    (request) =>
      (request.allianceId === alliance.id || request.resultAllianceId === alliance.id) &&
      canSeeAllianceRequest(request, humanId) &&
      !request.history?.length
  )
  const promises = (historyOpen ? Object.values(reality.promises) : []).filter(
    (promise) =>
      (promise.originatingAllianceId === alliance.id ||
        alliance.sharedPromiseIds.includes(promise.id)) &&
      (promise.promisorId === humanId ||
        promise.beneficiaryIds.includes(humanId) ||
        promise.witnessIds.includes(humanId) ||
        promise.visibility === 'HOUSE_PUBLIC' ||
        promise.visibility === 'CEREMONY_PUBLIC')
  )
  const role = (id: string) => {
    if (
      id ===
      (currentMember ? alliance.leaderId : (knownRoster?.leaderId ?? lastKnownSnapshot?.leaderId))
    )
      return 'Leader'
    if (
      id ===
      (currentMember
        ? alliance.coLeaderId
        : (knownRoster?.coLeaderId ?? lastKnownSnapshot?.coLeaderId))
    )
      return 'Co-leader'
    return alliance.founderIds.includes(id) ? 'Founding member' : 'Member'
  }
  const moveHistoryPage = (start: number) => {
    const anchor = historyRows[Math.max(0, Math.min(maxHistoryStart, start))]
    if (!anchor) return
    setHistoryPage({
      allianceId: alliance.id,
      focusEventId,
      anchorEventId: anchor.event.id,
    })
  }
  useEffect(() => {
    if (!focusedRow) return
    if (!historyOpen) return
    const frame = requestAnimationFrame(() => {
      document.getElementById(`alliance-history-event-${focusedRow.event.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusedRow, historyOpen])
  useEffect(() => {
    if (!fullReadOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullReadOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [fullReadOpen])
  return (
    <section
      className={`sp2-focus sp2-focus--active sp2-alliance-read${fullReadOpen ? ' sp2-alliance-read--full-screen' : ''}`}
      aria-label={fullReadOpen ? 'Full alliance read' : 'Selected alliance'}
    >
      {fullReadOpen && (
        <div className="sp2-alliance-read__full-screen-bar">
          <button type="button" onClick={() => setFullReadOpen(false)}>
            Back to Social
          </button>
          <span>Full alliance read</span>
        </div>
      )}
      <span className="sp2-alliance-read__mark" aria-hidden="true">
        ✦
      </span>
      <div className="sp2-focus__copy">
        <span className="sp2-focus__eyebrow">Your alliance</span>
        <h2>
          {currentMember
            ? (alliance.name ?? 'Alliance')
            : (knownRoster?.name ?? lastKnownSnapshot?.name ?? alliance.name ?? 'Alliance')}
        </h2>
        <div className="sp2-focus__status-line">
          <span className="sp2-focus__status">
            {endedKnown
              ? 'Dissolved'
              : currentMember
                ? alliance.status === 'PROBATIONARY'
                  ? 'New alliance'
                  : alliance.status.toLowerCase()
                : 'Former member'}
          </span>
          <span className="sp2-focus__status">
            {foundation
              ? `Founded Day ${foundation.day}`
              : alliance.provenance === 'LEGACY'
                ? 'Legacy foundation date unavailable'
                : 'Foundation date unavailable'}
          </span>
          <span className="sp2-focus__status">
            {memberIds.length} {currentMember ? 'members' : 'last known members'}
          </span>
        </div>
        {currentMember && (
          <div className="sp2-focus__tags" aria-label="Alliance health">
            <span>{Math.round(alliance.cohesion * 100)}% cohesion</span>
            <span>{Math.round(alliance.fractureRisk * 100)}% fracture risk</span>
            <span>{role(humanId)}</span>
          </div>
        )}
        <p className="sp2-alliance-read__roster">{memberIds.map(playerName).join(' · ')}</p>
        {pending.map((request) => (
          <p className="sp2-alliance-read__pending" key={request.id} role="status">
            {request.kind === 'ADMIT'
              ? request.status === 'VOTING'
                ? `${playerName(request.candidateId!)}: member vote pending (${Object.keys(request.votes).length}/${request.electorateIds.length} answered).`
                : `${playerName(request.candidateId!)}: invitation sent; awaiting acceptance.`
              : `${request.kind.toLowerCase().replaceAll('_', ' ')}: awaiting a decision.`}{' '}
            Response window: Day {request.deadline.day},{' '}
            {request.deadline.phase.replaceAll('_', ' ')}.
          </p>
        ))}
        <details className="sp2-focus__full-read" key={alliance.id} open={historyOpen}>
          <summary
            onClick={(event) => {
              event.preventDefault()
              setManualDetails({ key: detailsKey, open: !historyOpen })
            }}
          >
            Read your alliance's story
          </summary>
          {historyOpen && (
            <div className="sp2-alliance-read__details">
              <button
                type="button"
                className="sp2-alliance-read__full-screen-button"
                onClick={() => setFullReadOpen(true)}
              >
                Read in full screen
              </button>
              <h3>{currentMember ? 'Members' : 'Last known roster'}</h3>
              <div
                className="sp2-consult-alliance-picker__chips"
                role="group"
                aria-label="Alliance members"
              >
                {memberIds.map((id) => (
                  <button
                    type="button"
                    key={id}
                    className={`sp2-consult-alliance-chip${selectedMemberId === id ? ' is-active' : ''}`}
                    disabled={
                      !currentMember ||
                      id === humanId ||
                      !players.some(
                        (player) =>
                          player.id === id &&
                          player.status !== 'evicted' &&
                          player.status !== 'jury'
                      )
                    }
                    aria-pressed={selectedMemberId === id}
                    onClick={() => onSelectMember(id)}
                  >
                    {playerName(id)} · {role(id)}
                  </button>
                ))}
              </div>
              {promises.length > 0 && (
                <>
                  <h3>Commitments</h3>
                  <ul>
                    {promises.map((promise) => (
                      <li key={promise.id}>
                        {playerName(promise.promisorId)} ·{' '}
                        {promise.kind.toLowerCase().replaceAll('_', ' ')} ·{' '}
                        {promise.status.toLowerCase()}
                        {promise.deadline ? ` · due Day ${promise.deadline.day}` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <h3>Your alliance story</h3>
              {visibleHistoryStart > 0 && (
                <button
                  type="button"
                  className="sp2-alliance-read__more"
                  onClick={() => moveHistoryPage(visibleHistoryStart - HISTORY_PAGE_SIZE)}
                >
                  Show newer moments · {visibleHistoryStart} available
                </button>
              )}
              {historyRows.length ? (
                <ol className="sp2-alliance-read__history">
                  {visibleHistoryRows.map((row) => {
                    const requestExpanded = row.requestId
                      ? (requestExpandedOverrides[row.requestId] ??
                        row.eventIds.includes(focusEventId ?? ''))
                      : false
                    return (
                      <li
                        key={row.event.id}
                        id={`alliance-history-event-${row.event.id}`}
                        className={
                          row.eventIds.includes(focusEventId ?? '') ? 'is-highlighted' : undefined
                        }
                      >
                        <small>
                          Day {row.event.day} · {formatPlayerFacingPhase(row.event.phase)}
                        </small>
                        <span>{allianceEventText(reality, row.event, humanId, playerName)}</span>
                        {row.requestId && row.requestSteps.length > 0 && (
                          <details
                            className="sp2-alliance-read__request-steps"
                            open={requestExpanded}
                          >
                            <summary
                              onClick={(event) => {
                                event.preventDefault()
                                setRequestExpandedOverrides((current) => ({
                                  ...current,
                                  [row.requestId!]: !requestExpanded,
                                }))
                              }}
                            >
                              See how this decision unfolded
                            </summary>
                            {requestExpanded && (
                              <ol>
                                {row.requestSteps.map((step) => (
                                  <li key={step.id}>
                                    <small>
                                      Day {step.day} · {formatPlayerFacingPhase(step.phase)}
                                    </small>
                                    <span>
                                      {allianceEventText(reality, step, humanId, playerName)}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </details>
                        )}
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p>No recorded events yet.</p>
              )}
              {visibleHistoryEnd < historyRows.length && (
                <button
                  type="button"
                  className="sp2-alliance-read__more"
                  onClick={() => moveHistoryPage(visibleHistoryStart + HISTORY_PAGE_SIZE)}
                >
                  Show older moments · {historyRows.length - visibleHistoryEnd} available
                </button>
              )}
              {legacyDecisions.length > 0 && (
                <>
                  <h3>Earlier decisions</h3>
                  <ul>
                    {legacyDecisions.map((request) => (
                      <li key={request.id}>
                        Day {request.createdAt.day} ·{' '}
                        {request.kind.toLowerCase().replaceAll('_', ' ')}
                        {request.candidateId ? ` · ${playerName(request.candidateId)}` : ''} ·{' '}
                        {request.status.toLowerCase()}
                        {request.reason ? `: ${request.reason}` : ''}
                        {Object.entries(
                          request.memberIds.includes(humanId) ? request.votes : {}
                        ).map(([id, yes]) => (
                          <span key={id}>
                            {' '}
                            · {playerName(id)} voted {yes ? 'yes' : 'no'}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </details>
      </div>
    </section>
  )
}

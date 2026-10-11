import type { Player } from '../../types'
import {
  allianceEventText,
  allianceHistory,
  canSeeAllianceRequest,
  isPendingAllianceRequest,
  type RealityAlliance,
  type RealityDomainState,
} from '../../social/reality'

interface Props {
  alliance: RealityAlliance
  reality: RealityDomainState
  humanId: string
  players: readonly Player[]
  selectedMemberId: string | null
  onSelectMember: (id: string) => void
}

export default function AllianceRead({
  alliance,
  reality,
  humanId,
  players,
  selectedMemberId,
  onSelectMember,
}: Props) {
  const playerName = (id: string) =>
    id === humanId ? 'You' : (players.find((player) => player.id === id)?.name ?? 'Hubmate')
  const currentMember = alliance.memberIds.includes(humanId) && alliance.status !== 'DISSOLVED'
  const knownRoster = alliance.rosterKnowledgeByActor?.[humanId]
  const history = allianceHistory(reality, alliance.id, humanId)
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
  const legacyDecisions = Object.values(reality.allianceManagement.requests).filter(
    (request) =>
      (request.allianceId === alliance.id || request.resultAllianceId === alliance.id) &&
      canSeeAllianceRequest(request, humanId) &&
      !request.history?.length
  )
  const promises = Object.values(reality.promises).filter(
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
  return (
    <section
      className="sp2-focus sp2-focus--active sp2-alliance-read"
      aria-label="Selected alliance"
    >
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
            {foundation ? `Founded Day ${foundation.day}` : 'Foundation day unrecorded'}
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
        <details className="sp2-focus__full-read" key={alliance.id}>
          <summary>Open full alliance read</summary>
          <div className="sp2-alliance-read__details">
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
                        player.id === id && player.status !== 'evicted' && player.status !== 'jury'
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
            <h3>Track record</h3>
            {history.length ? (
              <ol className="sp2-alliance-read__history">
                {history.map((event) => (
                  <li key={event.id}>
                    <small>
                      Day {event.day} · {event.phase.replaceAll('_', ' ')}
                    </small>
                    <span>{allianceEventText(reality, event, humanId, playerName)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No recorded events yet.</p>
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
                      {Object.entries(request.memberIds.includes(humanId) ? request.votes : {}).map(
                        ([id, yes]) => (
                          <span key={id}>
                            {' '}
                            · {playerName(id)} voted {yes ? 'yes' : 'no'}
                          </span>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </details>
      </div>
    </section>
  )
}

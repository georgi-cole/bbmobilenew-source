import { useState } from 'react'
import type { Player } from '../../types'
import {
  ALLIANCE_LIMITS,
  allianceKind,
  currentAllianceCounts,
  getCurrentPact,
  isCurrentAlliance,
} from '../../social/reality/allianceIdentity'
import {
  allianceRequestDecisionActors,
  canSeeAllianceRequest,
  isPendingAllianceRequest,
  type AllianceManagementCommand,
  type AllianceManagementResult,
} from '../../social/reality/allianceManagement'
import type { RealityAlliance, RealityDomainState } from '../../social/reality/types'
import './AllianceManager.css'

interface Props {
  reality: RealityDomainState
  players: readonly Player[]
  humanId: string
  onCommand: (command: AllianceManagementCommand) => AllianceManagementResult
  onRename?: (id: string, name: string) => void
}

export default function AllianceManager({ reality, players, humanId, onCommand, onRename }: Props) {
  const [message, setMessage] = useState('')
  const [founding, setFounding] = useState(false)
  const [founders, setFounders] = useState<string[]>([humanId])
  const [basePactId, setBasePactId] = useState<string>()
  const [name, setName] = useState('')
  const [coLeaderId, setCoLeaderId] = useState('')
  const [pactCandidate, setPactCandidate] = useState('')
  const [groupAction, setGroupAction] = useState<{
    allianceId: string
    kind: 'ADMIT' | 'APPOINT' | 'TRANSFER' | 'REMOVE_SUGGESTION' | 'REMOVE' | 'RENAME'
  }>()
  const [groupCandidate, setGroupCandidate] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmation, setConfirmation] = useState<{
    allianceId: string
    type: 'LEAVE' | 'DISSOLVE'
  }>()
  const counts = currentAllianceCounts(reality, humanId)
  const alive = players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
  const playerName = (id: string) =>
    id === humanId
      ? 'You'
      : (players.find((player) => player.id === id)?.name ?? 'Former contestant')
  const current = Object.values(reality.alliances).filter(
    (entry) => isCurrentAlliance(entry) && entry.memberIds.includes(humanId)
  )
  const groups = current.filter((entry) => allianceKind(entry) === 'GROUP')
  const pacts = current.filter((entry) => allianceKind(entry) === 'PACT')
  const requests = Object.values(reality.allianceManagement?.requests ?? {}).filter(
    (request) => isPendingAllianceRequest(request) && canSeeAllianceRequest(request, humanId)
  )
  const act = (command: AllianceManagementCommand) => {
    const result = onCommand(command)
    setMessage(result.reason)
    return result
  }
  const chooseGroupAction = (allianceId: string, kind: NonNullable<typeof groupAction>['kind']) => {
    setGroupAction({ allianceId, kind })
    setGroupCandidate('')
    setRenameDraft(reality.alliances[allianceId].name ?? '')
    setConfirmation(undefined)
  }
  const startFounding = (pact?: RealityAlliance) => {
    setFounding(true)
    setFounders(pact ? [...pact.memberIds] : [humanId])
    setBasePactId(pact?.id)
    setName('')
    setCoLeaderId('')
  }
  const roleName = (alliance: RealityAlliance, id: string) =>
    id === alliance.leaderId ? 'Leader' : id === alliance.coLeaderId ? 'Co-leader' : 'Member'

  return (
    <section className="alliance-manager" aria-label="Your alliances">
      <div className="alliance-manager__heading">
        <h3>Your alliances</h3>
        <p>
          {counts.groups} / {ALLIANCE_LIMITS.groupsPerMember} groups · {counts.pacts} personal pacts
        </p>
      </div>
      <p className="alliance-manager__hint">
        A pact is between two people. Joining a group needs its members’ approval and the newcomer’s
        acceptance.
      </p>
      {message && (
        <p className="alliance-manager__message" role="status" aria-live="polite">
          {message}
        </p>
      )}
      <div className="alliance-manager__new">
        <label>
          Personal pact with
          <select value={pactCandidate} onChange={(event) => setPactCandidate(event.target.value)}>
            <option value="">Choose a housemate</option>
            {alive
              .filter(
                (player) => player.id !== humanId && !getCurrentPact(reality, humanId, player.id)
              )
              .map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!pactCandidate}
          onClick={() => {
            act({ type: 'PROPOSE', kind: 'PACT', actorId: humanId, candidateId: pactCandidate })
            setPactCandidate('')
          }}
        >
          Propose personal pact
        </button>
        <button
          type="button"
          disabled={counts.groups >= ALLIANCE_LIMITS.groupsPerMember}
          onClick={() => startFounding()}
        >
          Found a group
        </button>
      </div>
      {founding && (
        <form
          className="alliance-manager__form"
          onSubmit={(event) => {
            event.preventDefault()
            const result = act({
              type: 'PROPOSE',
              kind: 'FOUND',
              actorId: humanId,
              memberIds: founders,
              basePactId,
              name,
              leaderId: humanId,
              coLeaderId: coLeaderId || undefined,
            })
            if (result.status !== 'REJECTED') setFounding(false)
          }}
        >
          <h4>Agree a founding roster</h4>
          <label>
            Group name
            <input
              value={name}
              maxLength={28}
              onChange={(event) => setName(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <fieldset>
            <legend>Founders — everyone must accept</legend>
            {alive.map((player) => (
              <label key={player.id}>
                <input
                  type="checkbox"
                  checked={founders.includes(player.id)}
                  disabled={
                    player.id === humanId ||
                    Boolean(
                      basePactId && reality.alliances[basePactId].memberIds.includes(player.id)
                    ) ||
                    (!founders.includes(player.id) &&
                      founders.length >= ALLIANCE_LIMITS.groupMembers)
                  }
                  onChange={(event) =>
                    setFounders(
                      event.target.checked
                        ? [...founders, player.id]
                        : founders.filter((id) => id !== player.id)
                    )
                  }
                />
                {playerName(player.id)}
              </label>
            ))}
          </fieldset>
          <p>You will lead the group.</p>
          <label>
            Optional co-leader
            <select value={coLeaderId} onChange={(event) => setCoLeaderId(event.target.value)}>
              <option value="">No co-leader</option>
              {founders
                .filter((id) => id !== humanId)
                .map((id) => (
                  <option key={id} value={id}>
                    {playerName(id)}
                  </option>
                ))}
            </select>
          </label>
          <p>
            If the leader leaves, the co-leader succeeds; otherwise the longest-serving current
            member leads. A promoted co-leader vacates their old role.
          </p>
          {basePactId && (
            <p>
              {/final\s*(two|2)|endgame/i.test(reality.alliances[basePactId].purpose)
                ? 'Your private endgame pact stays separate.'
                : 'The selected ordinary pact ends only after all founders accept the new group.'}{' '}
              Existing promises keep their original recipients.
            </p>
          )}
          <div className="alliance-manager__actions">
            <button type="submit" disabled={founders.length < 3}>
              Ask all founders
            </button>
            <button type="button" onClick={() => setFounding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {requests.length > 0 && (
        <div className="alliance-manager__requests">
          <h4>Decisions waiting</h4>
          {requests.map((request) => {
            const canAnswer = allianceRequestDecisionActors(request).includes(humanId)
            const title =
              request.kind === 'PACT'
                ? 'Personal pact'
                : request.kind === 'FOUND'
                  ? 'New group'
                  : request.kind === 'ADMIT'
                    ? `Invite ${playerName(request.candidateId!)}`
                    : request.kind === 'APPOINT'
                      ? 'Co-leader offer'
                      : request.kind === 'TRANSFER'
                        ? 'Leadership offer'
                        : 'Removal suggestion'
            return (
              <article key={request.id} className="alliance-manager__card">
                <h4>
                  {title}
                  {request.name ? ` · ${request.name}` : ''}
                </h4>
                <p>{request.memberIds.map(playerName).join(' · ')}</p>
                {request.kind !== 'PACT' && (
                  <p>
                    Leader: {playerName(request.leaderId ?? request.proposerId)}
                    {request.coLeaderId ? ` · Co-leader: ${playerName(request.coLeaderId)}` : ''}
                  </p>
                )}
                {request.status === 'VOTING' ? (
                  <p>
                    {Object.values(request.votes).filter(Boolean).length} approvals of{' '}
                    {request.electorateIds.length}. Needs more than half and at least one officer’s
                    approval. The candidate answers afterward.
                  </p>
                ) : (
                  <p>
                    {request.kind === 'FOUND'
                      ? 'Every founder must accept this exact roster and its officers.'
                      : request.kind === 'ADMIT'
                        ? 'The group approved this invitation. Accepting joins this named group.'
                        : 'Awaiting the required acceptance.'}
                  </p>
                )}
                {['FOUND', 'ADMIT'].includes(request.kind) && (
                  <p>
                    Succession: co-leader first, then the longest-serving current member. Personal
                    side pacts and private promises stay private.
                  </p>
                )}
                <p>
                  Answer by day {request.deadline.day},{' '}
                  {request.deadline.phase === 'social_1'
                    ? 'the first social window'
                    : 'the final social window'}
                  .
                </p>
                <div className="alliance-manager__actions">
                  {canAnswer ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          act({
                            type: 'RESPOND',
                            requestId: request.id,
                            actorId: humanId,
                            accept: true,
                          })
                        }
                      >
                        {request.status === 'VOTING' ? 'Approve' : 'Accept'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          act({
                            type: 'RESPOND',
                            requestId: request.id,
                            actorId: humanId,
                            accept: false,
                          })
                        }
                      >
                        {request.status === 'VOTING' ? 'Vote no' : 'Decline'}
                      </button>
                    </>
                  ) : (
                    <span>Your answer is recorded; waiting for the remaining decisions.</span>
                  )}
                  {request.proposerId === humanId && (
                    <button
                      type="button"
                      onClick={() =>
                        act({ type: 'WITHDRAW', requestId: request.id, actorId: humanId })
                      }
                    >
                      Withdraw request
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
      {groups.length === 0 && pacts.length === 0 && (
        <p>
          No current commitments. Start a personal pact or agree a group with at least three
          founders.
        </p>
      )}
      {groups.map((group) => {
        const officer = group.leaderIds.includes(humanId)
        const leader = group.leaderId === humanId
        const action = groupAction?.allianceId === group.id ? groupAction : undefined
        const options =
          action?.kind === 'ADMIT'
            ? alive.filter((player) => !group.memberIds.includes(player.id))
            : alive.filter(
                (player) =>
                  group.memberIds.includes(player.id) &&
                  player.id !== humanId &&
                  (!['REMOVE', 'REMOVE_SUGGESTION'].includes(action?.kind ?? '') ||
                    (player.id !== group.leaderId && (leader || player.id !== group.coLeaderId)))
              )
        return (
          <article className="alliance-manager__card" key={group.id}>
            <h4>{group.name ?? 'Group alliance'}</h4>
            <p>
              {group.status === 'FRACTURED'
                ? 'Tense'
                : group.status === 'DORMANT'
                  ? 'Quiet'
                  : group.status === 'PROBATIONARY'
                    ? 'New'
                    : 'Active'}{' '}
              · {group.memberIds.length} / 6 members
            </p>
            <ul>
              {group.memberIds.map((id) => (
                <li key={id}>
                  {playerName(id)} <span>{roleName(group, id)}</span>
                </li>
              ))}
            </ul>
            <div className="alliance-manager__actions">
              <button type="button" onClick={() => chooseGroupAction(group.id, 'ADMIT')}>
                Suggest a recruit
              </button>
              <button
                type="button"
                onClick={() =>
                  chooseGroupAction(group.id, officer ? 'REMOVE' : 'REMOVE_SUGGESTION')
                }
              >
                {officer ? 'Remove a member' : 'Suggest removal'}
              </button>
              {leader && (
                <>
                  <button type="button" onClick={() => chooseGroupAction(group.id, 'APPOINT')}>
                    Offer co-leader role
                  </button>
                  <button type="button" onClick={() => chooseGroupAction(group.id, 'TRANSFER')}>
                    Offer leadership
                  </button>
                  {group.coLeaderId && (
                    <button
                      type="button"
                      onClick={() =>
                        act({ type: 'CLEAR_COLEADER', allianceId: group.id, actorId: humanId })
                      }
                    >
                      Clear co-leader role
                    </button>
                  )}
                  {onRename && (
                    <button type="button" onClick={() => chooseGroupAction(group.id, 'RENAME')}>
                      Rename
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmation({ allianceId: group.id, type: 'DISSOLVE' })}
                  >
                    Dissolve group
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setConfirmation({ allianceId: group.id, type: 'LEAVE' })}
              >
                Leave group
              </button>
            </div>
            {action && (
              <form
                className="alliance-manager__form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (action.kind === 'RENAME') {
                    onRename?.(group.id, renameDraft)
                    setMessage('The group name was updated.')
                  } else
                    act(
                      action.kind === 'REMOVE'
                        ? {
                            type: 'REMOVE',
                            allianceId: group.id,
                            actorId: humanId,
                            targetId: groupCandidate,
                          }
                        : {
                            type: 'PROPOSE',
                            kind: action.kind,
                            allianceId: group.id,
                            actorId: humanId,
                            candidateId: groupCandidate,
                          }
                    )
                  setGroupAction(undefined)
                }}
              >
                {action.kind === 'RENAME' ? (
                  <label>
                    Group name
                    <input
                      value={renameDraft}
                      maxLength={28}
                      onChange={(event) => setRenameDraft(event.target.value)}
                    />
                  </label>
                ) : (
                  <label>
                    Choose a housemate
                    <select
                      value={groupCandidate}
                      onChange={(event) => setGroupCandidate(event.target.value)}
                    >
                      <option value="">Choose</option>
                      {options.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {action.kind === 'REMOVE' && (
                  <p>
                    This removes their membership in this group. It does not evict them from the
                    game or end independent personal pacts.
                  </p>
                )}
                <div className="alliance-manager__actions">
                  <button
                    type="submit"
                    disabled={
                      action.kind === 'RENAME' ? renameDraft.trim().length < 2 : !groupCandidate
                    }
                  >
                    Confirm
                  </button>
                  <button type="button" onClick={() => setGroupAction(undefined)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {confirmation?.allianceId === group.id && (
              <div className="alliance-manager__form">
                <p>
                  {confirmation.type === 'DISSOLVE'
                    ? 'This ends group membership for everyone. Independent pacts and personal promises remain.'
                    : 'This ends your connection through this group. Connections through other groups or pacts remain. If needed, the agreed succession rule appoints the next leader.'}
                </p>
                <div className="alliance-manager__actions">
                  <button
                    type="button"
                    onClick={() => {
                      act({ ...confirmation, actorId: humanId })
                      setConfirmation(undefined)
                    }}
                  >
                    Confirm {confirmation.type === 'DISSOLVE' ? 'dissolution' : 'leave'}
                  </button>
                  <button type="button" onClick={() => setConfirmation(undefined)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </article>
        )
      })}
      {pacts.length > 0 && (
        <div>
          <h4>Personal pacts</h4>
          {pacts.map((pact) => (
            <article key={pact.id} className="alliance-manager__card alliance-manager__pact">
              <h4>{playerName(pact.memberIds.find((id) => id !== humanId)!)}</h4>
              <p>
                {pact.provenance === 'UNRESOLVED'
                  ? 'An older save recorded overlapping pair agreements. You can end this recorded pact or mutually renew it; its original promises remain.'
                  : pact.purpose}
              </p>
              <div className="alliance-manager__actions">
                {pact.provenance === 'UNRESOLVED' ? (
                  <button
                    type="button"
                    onClick={() =>
                      act({
                        type: 'PROPOSE',
                        kind: 'PACT',
                        actorId: humanId,
                        candidateId: pact.memberIds.find((id) => id !== humanId),
                        basePactId: pact.id,
                      })
                    }
                  >
                    Mutually renew
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={counts.groups >= ALLIANCE_LIMITS.groupsPerMember}
                    onClick={() => startFounding(pact)}
                  >
                    Expand into a group
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmation({ allianceId: pact.id, type: 'LEAVE' })}
                >
                  End personal pact
                </button>
              </div>
              {confirmation?.allianceId === pact.id && (
                <div className="alliance-manager__form">
                  <p>
                    This ends only this personal pact. Any shared groups and existing personal
                    promises remain.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      act({ type: 'LEAVE', allianceId: pact.id, actorId: humanId })
                      setConfirmation(undefined)
                    }}
                  >
                    Confirm end pact
                  </button>
                  <button type="button" onClick={() => setConfirmation(undefined)}>
                    Cancel
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <details>
        <summary>Former commitments</summary>
        {Object.values(reality.alliances)
          .filter(
            (entry) =>
              entry.provenance !== 'SOURCE' &&
              !entry.memberIds.includes(humanId) &&
              entry.rosterKnowledgeByActor?.[humanId]
          )
          .map((entry) => {
            const known = entry.rosterKnowledgeByActor![humanId]
            return (
              <article key={entry.id}>
                <h4>
                  {known.name ??
                    (allianceKind(entry) === 'PACT' ? 'Former personal pact' : 'Former group')}
                </h4>
                <p>Last known roster: {known.memberIds.map(playerName).join(' · ')}</p>
                <p>Your membership has ended. Later private changes are not shown.</p>
              </article>
            )
          })}
      </details>
      <details>
        <summary>Recent decisions</summary>
        {Object.values(reality.allianceManagement?.requests ?? {})
          .filter(
            (request) =>
              !isPendingAllianceRequest(request) && canSeeAllianceRequest(request, humanId)
          )
          .slice(-6)
          .reverse()
          .map((request) => (
            <p key={request.id}>{request.reason ?? request.status.toLowerCase()}</p>
          ))}
      </details>
    </section>
  )
}

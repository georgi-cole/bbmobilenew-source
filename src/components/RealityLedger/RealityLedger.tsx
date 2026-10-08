import { useMemo, useState } from 'react'
import type { Player } from '../../types'
import type { RelationshipsMap, SocialCommitment } from '../../social/types'
import {
  getSocialCommitmentDueCopy,
  getSocialCommitmentLabel,
} from '../../social/socialCommitments'
import { getIntelLeadViews } from '../../social/intelligenceSystem'
import {
  allianceKind,
  canHumanKnowFact,
  getRealityAllianceKnowledgeView,
  getRelationshipStoryLabel,
  type DirectedRelationship,
  type RealityBelief,
  type RealityDomainState,
} from '../../social/reality'
import './RealityLedger.css'

type LedgerTab = 'knowledge' | 'deals' | 'house' | 'relationships'

export interface RealityLedgerProps {
  reality: RealityDomainState
  players: readonly Player[]
  humanId: string
  /** Live social graph used to keep labels/meters synchronized after actions. */
  relationships?: RelationshipsMap
  socialCommitments?: readonly SocialCommitment[]
  /** Renders one notebook section without the nested section switcher. */
  section?: LedgerTab
  compact?: boolean
  focusPlayerId?: string
  currentDay?: number
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.82) return 'High confidence'
  if (confidence >= 0.55) return 'Plausible'
  return 'Uncertain'
}

function titleCase(value: string): string {
  return value
    .replace(/^CEREMONY_/, '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function allianceStatusLabel(status: string, kind: 'PACT' | 'GROUP'): string {
  if (status === 'PROBATIONARY') return kind === 'GROUP' ? 'New group' : 'New pact'
  if (status === 'ACTIVE') return 'Active'
  if (status === 'DORMANT') return 'Dormant'
  if (status === 'FRACTURED') return 'Fractured'
  if (status === 'DISSOLVED') return 'Ended'
  return titleCase(status)
}

function allianceSecrecyLabel(value: number): string {
  if (value >= 0.72) return 'Highly secret'
  if (value >= 0.42) return 'Low profile'
  if (value > 0.2) return 'Leaking'
  return 'Exposed'
}

function clampRelationship(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)))
}

function tension(edge: DirectedRelationship): number {
  return Math.round(
    Math.max(0, Math.min(100, edge.resentment * 0.45 + edge.suspicion * 0.35 + edge.fear * 0.2))
  )
}

function combinedLiveRelationship(
  relationships: RelationshipsMap | undefined,
  humanId: string,
  otherId: string
): { affinity: number; tags: Set<string> } | null {
  const outward = relationships?.[humanId]?.[otherId]
  if (!outward) return null
  return {
    affinity: outward.affinity,
    tags: new Set(outward.tags ?? []),
  }
}

function liveRelationshipLabel(
  edge: DirectedRelationship,
  live: ReturnType<typeof combinedLiveRelationship>
): string {
  if (!live) return titleCase(edge.perceivedLabel)
  const tags = live.tags
  if (tags.has('ex') || tags.has('broken_romance')) return '💔 Ex'
  if (tags.has('betrayal') || tags.has('broken_promise')) return 'Betrayed'
  if (tags.has('broken_alliance')) return 'Broken alliance'
  if (tags.has('rivalry') || tags.has('target')) return 'Rival'
  if (tags.has('romance')) return 'Romance'
  if (tags.has('bromance')) return 'Ride-or-die'
  if (tags.has('alliance') || tags.has('cupid_partner')) return 'Ally'
  if (live.affinity >= 55) return 'Close'
  if (live.affinity >= 20) return 'Friendly'
  if (live.affinity <= -45) return 'Hostile'
  if (live.affinity <= -15) return 'Tense'
  return titleCase(edge.perceivedLabel)
}

function liveRelationshipMetrics(
  edge: DirectedRelationship,
  live: ReturnType<typeof combinedLiveRelationship>
): Array<[string, number]> {
  if (!live) {
    return [
      ['Trust', edge.trust],
      ['Warmth', edge.warmth],
      ['Loyalty', edge.loyalty],
      ['Respect', edge.respect],
      ['Tension', tension(edge)],
    ]
  }
  const broken =
    live.tags.has('ex') ||
    live.tags.has('broken_romance') ||
    live.tags.has('broken_alliance') ||
    live.tags.has('betrayal') ||
    live.tags.has('broken_promise')
  const affinity = broken ? Math.min(-50, live.affinity) : live.affinity
  const trust = clampRelationship(edge.trust * 0.6 + affinity * 0.4)
  const warmth = clampRelationship(edge.warmth * 0.5 + affinity * 0.5)
  const loyalty = clampRelationship(
    broken ? Math.min(edge.loyalty, affinity) : edge.loyalty * 0.55 + affinity * 0.45
  )
  const respect = clampRelationship(edge.respect * 0.7 + affinity * 0.3)
  const liveTension = affinity < 0 ? Math.min(100, Math.abs(affinity) + (broken ? 30 : 8)) : 0
  return [
    ['Trust', trust],
    ['Warmth', warmth],
    ['Loyalty', loyalty],
    ['Respect', respect],
    ['Tension', Math.max(tension(edge), liveTension)],
  ]
}

function beliefSource(
  belief: RealityBelief,
  reality: RealityDomainState,
  playerName: (id: string) => string
): string {
  const memory = (reality.memoriesByOwner[belief.ownerId] ?? []).find((entry) =>
    belief.supportingMemoryIds.includes(entry.id)
  )
  if (!memory) return 'Source unavailable'
  if (memory.sourceType === 'OFFICIAL') return 'Official result'
  if (memory.sourceType === 'DIRECT') return 'You experienced this'
  if (memory.sourceType === 'WITNESSED') return 'You witnessed this'
  if (memory.sourceType === 'INFERRED') return 'Your read of the situation'
  const sourceId = memory.sourceChain.at(-1)
  return sourceId ? `Heard through ${playerName(sourceId)}` : 'Hearsay'
}

export default function RealityLedger({
  reality,
  players,
  humanId,
  relationships: liveRelationships,
  socialCommitments = [],
  section,
  compact = false,
  focusPlayerId,
  currentDay,
}: RealityLedgerProps) {
  const [tab, setTab] = useState<LedgerTab>('relationships')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  const activeTab = section ?? tab
  const activePlayerIds = useMemo(
    () =>
      new Set(
        players
          .filter(
            (player) =>
              player.id !== humanId && player.status !== 'evicted' && player.status !== 'jury'
          )
          .map((player) => player.id)
      ),
    [humanId, players]
  )
  const playerName = (id: string) =>
    id === humanId ? 'You' : (players.find((player) => player.id === id)?.name ?? 'Unknown')

  const knownFacts = useMemo(
    () =>
      Object.values(reality.facts)
        .filter((fact) => canHumanKnowFact(fact, humanId, 'PLAYER_LIMITED'))
        .sort((left, right) => right.day - left.day || right.phase.localeCompare(left.phase)),
    [humanId, reality.facts]
  )
  const intelLeads = useMemo(
    () =>
      getIntelLeadViews(
        reality,
        humanId,
        players,
        currentDay ?? Math.max(0, ...Object.values(reality.facts).map((fact) => fact.day))
      ),
    [currentDay, humanId, players, reality]
  )
  const beliefs = useMemo(
    () =>
      Object.values(reality.beliefsByOwner[humanId] ?? {})
        .filter((belief) => belief.status !== 'STALE' && belief.status !== 'DISPROVEN')
        .sort((left, right) => right.lastUpdatedDay - left.lastUpdatedDay),
    [humanId, reality.beliefsByOwner]
  )
  const promises = useMemo(
    () =>
      Object.values(reality.promises)
        .filter(
          (promise) =>
            promise.promisorId === humanId ||
            promise.beneficiaryIds.includes(humanId) ||
            promise.witnessIds.includes(humanId)
        )
        .sort((left, right) => right.createdAt.day - left.createdAt.day),
    [humanId, reality.promises]
  )
  const legacyCommitments = useMemo(() => {
    const realityPromiseIds = Object.keys(reality.promises)
    return socialCommitments.filter(
      (commitment) =>
        (commitment.promisorId === humanId || commitment.beneficiaryId === humanId) &&
        !realityPromiseIds.some(
          (id) =>
            id === `promise:${commitment.interactionId}` ||
            id.startsWith(`promise:${commitment.interactionId}:`)
        )
    )
  }, [humanId, reality.promises, socialCommitments])
  const debts = useMemo(
    () =>
      Object.values(reality.debts).filter(
        (debt) => debt.debtorId === humanId || debt.creditorId === humanId
      ),
    [humanId, reality.debts]
  )
  const openPromises = promises.filter(
    (promise) => promise.status === 'ACTIVE' || promise.status === 'PROPOSED'
  )
  const resolvedPromises = promises.filter(
    (promise) => promise.status !== 'ACTIVE' && promise.status !== 'PROPOSED'
  )
  const openLegacyCommitments = legacyCommitments.filter(
    (commitment) => commitment.status === 'pending'
  )
  const resolvedLegacyCommitments = legacyCommitments.filter(
    (commitment) => commitment.status !== 'pending'
  )
  const openDebts = debts.filter(
    (debt) => debt.status === 'OPEN' || debt.status === 'PARTIALLY_REPAID'
  )
  const resolvedDebts = debts.filter(
    (debt) => debt.status !== 'OPEN' && debt.status !== 'PARTIALLY_REPAID'
  )
  const commitmentHistoryCount =
    resolvedPromises.length + resolvedLegacyCommitments.length + resolvedDebts.length
  const threads = useMemo(
    () =>
      Object.values(reality.threads).filter(
        (thread) =>
          !thread.type.startsWith('RELATIONSHIP_') &&
          (thread.participantIds.includes(humanId) || thread.observerIds.includes(humanId)) &&
          (thread.type !== 'PLAYER_NEMESIS' ||
            Object.values(reality.relationshipAutonomy.evidence).some(
              (evidence) =>
                evidence.ownerId === thread.participantIds[0] &&
                evidence.targetId === thread.participantIds[1]
            ))
      ),
    [humanId, reality.relationshipAutonomy.evidence, reality.threads]
  )
  const knownRelationshipStories = useMemo(() => {
    const directEvidence = new Set(
      Object.values(reality.relationshipAutonomy.evidence)
        .filter((entry) => entry.ownerId === humanId || entry.targetId === humanId)
        .map((entry) => `${entry.ownerId}:${entry.targetId}`)
    )
    return Object.values(reality.relationshipAutonomy.intents)
      .filter(
        (intent) =>
          intent.status !== 'CLOSED' &&
          (intent.ownerId === humanId || intent.targetId === humanId) &&
          directEvidence.has(`${intent.ownerId}:${intent.targetId}`)
      )
      .sort(
        (left, right) =>
          right.lastAdvancedAt.day - left.lastAdvancedAt.day || right.importance - left.importance
      )
  }, [humanId, reality.relationshipAutonomy])
  const alliances = useMemo(
    () =>
      Object.values(reality.alliances)
        .map((alliance) => ({
          alliance,
          knowledge: getRealityAllianceKnowledgeView(reality, alliance.id, humanId),
        }))
        .filter(
          ({ alliance, knowledge }) =>
            alliance.provenance !== 'SOURCE' && knowledge.level !== 'UNKNOWN'
        )
        .sort(
          (left, right) =>
            Number(right.knowledge.level === 'MEMBER') -
              Number(left.knowledge.level === 'MEMBER') ||
            right.knowledge.confidence - left.knowledge.confidence ||
            left.alliance.id.localeCompare(right.alliance.id)
        ),
    [humanId, reality]
  )
  const discoveredAlliances = alliances.filter(({ knowledge }) => knowledge.level !== 'MEMBER')
  const relationships = useMemo(
    () =>
      Object.values(reality.relationships[humanId] ?? {})
        .filter((edge) => activePlayerIds.has(edge.toId))
        .sort(
          (left, right) =>
            right.familiarity - left.familiarity || left.toId.localeCompare(right.toId)
        ),
    [activePlayerIds, humanId, reality.relationships]
  )
  const selectedRelationship = focusPlayerId
    ? relationships.find((edge) => edge.toId === focusPlayerId)
    : (relationships.find((edge) => edge.toId === selectedPlayerId) ?? relationships[0])
  const selectedLiveRelationship = selectedRelationship
    ? combinedLiveRelationship(liveRelationships, humanId, selectedRelationship.toId)
    : null

  return (
    <section
      className={`reality-ledger${compact ? ' reality-ledger--compact' : ''}`}
      aria-label="Reality ledger"
    >
      {!compact && (
        <div className="reality-ledger__intro">
          <span>Your private game read</span>
          <small>Only information your player has learned appears here.</small>
        </div>
      )}
      {!section && (
        <nav className="reality-ledger__tabs" aria-label="Private notebook sections">
          {(['relationships', 'knowledge', 'deals', 'house'] as LedgerTab[]).map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? 'is-active' : ''}
              onClick={() => setTab(item)}
            >
              {item === 'knowledge'
                ? 'Known'
                : item === 'relationships'
                  ? 'People'
                  : item === 'house'
                    ? 'House stories'
                    : item === 'deals'
                      ? 'Commitments'
                      : item}
            </button>
          ))}
        </nav>
      )}

      <div className="reality-ledger__content">
        {activeTab === 'knowledge' && (
          <>
            <h3>Leads and discoveries</h3>
            <p className="reality-ledger__hint">
              Signals your player has learned, with their source and confidence.
            </p>
            {intelLeads.length === 0 && discoveredAlliances.length === 0 ? (
              <p className="reality-ledger__empty">
                You have not learned any current leads or other alliances yet.
              </p>
            ) : (
              <>
                {intelLeads.slice(0, 8).map((lead) => (
                  <article className="reality-ledger__item" key={lead.factId}>
                    <div>
                      <span className="reality-ledger__badge reality-ledger__badge--claim">
                        {lead.confidence}
                      </span>
                      <small>Day {lead.day}</small>
                    </div>
                    <strong>{lead.text}</strong>
                    <em>{lead.source}</em>
                  </article>
                ))}
                {discoveredAlliances.map(({ alliance, knowledge }) => (
                  <article className="reality-ledger__item" key={alliance.id}>
                    <div>
                      <span className="reality-ledger__badge reality-ledger__badge--alliance">
                        {knowledge.level === 'MEMBER'
                          ? allianceStatusLabel(alliance.status, allianceKind(alliance))
                          : knowledge.level === 'PUBLIC'
                            ? 'Public alliance'
                            : knowledge.level === 'CONFIRMED'
                              ? 'Confirmed pact'
                              : 'Suspected pact'}
                      </span>
                      <small>
                        {knowledge.level === 'MEMBER'
                          ? `${Math.round((knowledge.cohesion ?? 0) * 100)}% cohesion · ${allianceSecrecyLabel(knowledge.secrecy ?? 0)}`
                          : knowledge.level === 'PUBLIC'
                            ? 'House-known'
                            : confidenceLabel(knowledge.confidence)}
                      </small>
                    </div>
                    <strong>
                      {knowledge.displayName ??
                        (knowledge.level === 'MEMBER'
                          ? 'Private pact'
                          : knowledge.level === 'PUBLIC'
                            ? 'Exposed alliance'
                            : 'Possible alliance')}
                    </strong>
                    <p>
                      {knowledge.knownMemberIds.length
                        ? `Known links: ${knowledge.knownMemberIds.map(playerName).join(' · ')}${knowledge.fullMembershipKnown ? '' : ' · other members unknown'}`
                        : 'You suspect a pact exists, but do not know its members.'}
                    </p>
                  </article>
                ))}
              </>
            )}
            {(knownFacts.length > 0 || beliefs.length > 0) && (
              <details className="reality-ledger__history">
                <summary>Evidence history · {knownFacts.length + beliefs.length}</summary>
                {knownFacts.slice(0, 12).map((fact) => (
                  <article className="reality-ledger__item" key={fact.id}>
                    <div>
                      <span className="reality-ledger__badge reality-ledger__badge--fact">
                        Known fact
                      </span>
                      <small>Day {fact.day}</small>
                    </div>
                    <strong>{titleCase(fact.propositionType)}</strong>
                    <p>{fact.subjectIds.map(playerName).join(' · ')}</p>
                  </article>
                ))}
                {beliefs.slice(0, 12).map((belief) => (
                  <article className="reality-ledger__item" key={belief.id}>
                    <div>
                      <span className="reality-ledger__badge reality-ledger__badge--claim">
                        Claim
                      </span>
                      <small>{confidenceLabel(belief.confidence)}</small>
                    </div>
                    <strong>{titleCase(belief.propositionType)}</strong>
                    <p>{belief.subjectIds.map(playerName).join(' · ')}</p>
                    <em>{beliefSource(belief, reality, playerName)}</em>
                  </article>
                ))}
              </details>
            )}
          </>
        )}

        {activeTab === 'deals' && (
          <>
            <h3>Commitments</h3>
            <p className="reality-ledger__hint">
              Promises, favors and their deadlines, kept together for your next decision.
            </p>
            <>
              {openPromises.length === 0 &&
              openLegacyCommitments.length === 0 &&
              openDebts.length === 0 ? (
                <p className="reality-ledger__empty">
                  No open promises or favors need your attention.
                </p>
              ) : (
                <>
                  {openPromises.map((promise) => (
                    <article className="reality-ledger__item" key={promise.id}>
                      <div>
                        <span
                          className={`reality-ledger__badge reality-ledger__badge--${promise.status.toLowerCase()}`}
                        >
                          {titleCase(promise.status)}
                        </span>
                        <small>
                          {promise.deadline
                            ? `Due Day ${promise.deadline.day}`
                            : `Made Day ${promise.createdAt.day}`}
                        </small>
                      </div>
                      <strong>{titleCase(promise.kind)}</strong>
                      <p>
                        {playerName(promise.promisorId)} →{' '}
                        {promise.beneficiaryIds.map(playerName).join(', ')}
                      </p>
                    </article>
                  ))}
                  {openLegacyCommitments.map((commitment) => (
                    <article className="reality-ledger__item" key={`legacy-${commitment.id}`}>
                      <div>
                        <span
                          className={`reality-ledger__badge reality-ledger__badge--${commitment.status}`}
                        >
                          Promise · {titleCase(commitment.status)}
                        </span>
                        <small>
                          Due Day {commitment.dueWeek} ·{' '}
                          {getSocialCommitmentDueCopy(commitment.kind)}
                        </small>
                      </div>
                      <strong>{getSocialCommitmentLabel(commitment.kind)}</strong>
                      <p>
                        {playerName(commitment.promisorId)} → {playerName(commitment.beneficiaryId)}
                      </p>
                    </article>
                  ))}
                  {openDebts.map((debt) => (
                    <article className="reality-ledger__item" key={debt.id}>
                      <div>
                        <span className="reality-ledger__badge reality-ledger__badge--debt">
                          Favor · {titleCase(debt.status)}
                        </span>
                        <small>Raised Day {debt.createdAt.day}</small>
                      </div>
                      <strong>
                        {playerName(debt.debtorId)} owes {playerName(debt.creditorId)}
                      </strong>
                    </article>
                  ))}
                </>
              )}
              {commitmentHistoryCount > 0 && (
                <details className="reality-ledger__history">
                  <summary>Resolved history · {commitmentHistoryCount}</summary>
                  {resolvedPromises.map((promise) => (
                    <article className="reality-ledger__item" key={promise.id}>
                      <div>
                        <span
                          className={`reality-ledger__badge reality-ledger__badge--${promise.status.toLowerCase()}`}
                        >
                          {titleCase(promise.status)}
                        </span>
                        <small>Made Day {promise.createdAt.day}</small>
                      </div>
                      <strong>{titleCase(promise.kind)}</strong>
                      <p>
                        {playerName(promise.promisorId)} →{' '}
                        {promise.beneficiaryIds.map(playerName).join(', ')}
                      </p>
                    </article>
                  ))}
                  {resolvedLegacyCommitments.map((commitment) => (
                    <article className="reality-ledger__item" key={`legacy-${commitment.id}`}>
                      <div>
                        <span
                          className={`reality-ledger__badge reality-ledger__badge--${commitment.status}`}
                        >
                          Promise · {titleCase(commitment.status)}
                        </span>
                        <small>Due Day {commitment.dueWeek}</small>
                      </div>
                      <strong>{getSocialCommitmentLabel(commitment.kind)}</strong>
                      <p>
                        {playerName(commitment.promisorId)} → {playerName(commitment.beneficiaryId)}
                      </p>
                    </article>
                  ))}
                  {resolvedDebts.map((debt) => (
                    <article className="reality-ledger__item" key={debt.id}>
                      <div>
                        <span className="reality-ledger__badge reality-ledger__badge--debt">
                          Favor · {titleCase(debt.status)}
                        </span>
                        <small>Raised Day {debt.createdAt.day}</small>
                      </div>
                      <strong>
                        {playerName(debt.debtorId)} owed {playerName(debt.creditorId)}
                      </strong>
                    </article>
                  ))}
                </details>
              )}
            </>
          </>
        )}

        {activeTab === 'house' && (
          <>
            <h3>Open house stories</h3>
            {threads.length === 0 && knownRelationshipStories.length === 0 ? (
              <p className="reality-ledger__empty">No known house story is active.</p>
            ) : (
              <>
                {threads.map((thread) => (
                  <article className="reality-ledger__item" key={thread.id}>
                    <div>
                      <span className="reality-ledger__badge reality-ledger__badge--thread">
                        {titleCase(thread.status)}
                      </span>
                      <small>Urgency {Math.round(thread.urgency * 100)}%</small>
                    </div>
                    <strong>{titleCase(thread.type)}</strong>
                    <p>{thread.participantIds.map(playerName).join(' · ')}</p>
                  </article>
                ))}
                {knownRelationshipStories.map((story) => {
                  const otherId = story.ownerId === humanId ? story.targetId : story.ownerId
                  return (
                    <article className="reality-ledger__item" key={story.id}>
                      <div>
                        <span className="reality-ledger__badge reality-ledger__badge--thread">
                          {titleCase(story.stage)}
                        </span>
                        <small>Day {story.lastAdvancedAt.day}</small>
                      </div>
                      <strong>{getRelationshipStoryLabel(story.kind)}</strong>
                      <p>With {playerName(otherId)}</p>
                    </article>
                  )
                })}
              </>
            )}
          </>
        )}

        {activeTab === 'relationships' && (
          <>
            <h3>Your relationship reads</h3>
            {relationships.length === 0 ? (
              <p className="reality-ledger__empty">Your relationships are still forming.</p>
            ) : (
              <>
                {!focusPlayerId && (
                  <div className="reality-ledger__people" role="list">
                    {relationships.map((edge) => {
                      const live = combinedLiveRelationship(liveRelationships, humanId, edge.toId)
                      return (
                        <button
                          role="listitem"
                          key={edge.toId}
                          type="button"
                          className={selectedRelationship?.toId === edge.toId ? 'is-active' : ''}
                          onClick={() => setSelectedPlayerId(edge.toId)}
                        >
                          <strong>{playerName(edge.toId)}</strong>
                          <small>{liveRelationshipLabel(edge, live)}</small>
                        </button>
                      )
                    })}
                  </div>
                )}
                {selectedRelationship && (
                  <article className="reality-ledger__relationship">
                    <div>
                      <strong>{playerName(selectedRelationship.toId)}</strong>
                      <span>
                        {liveRelationshipLabel(selectedRelationship, selectedLiveRelationship)}
                      </span>
                    </div>
                    {liveRelationshipMetrics(selectedRelationship, selectedLiveRelationship).map(
                      ([label, rawValue]) => {
                        const value = Number(rawValue)
                        const normalized = label === 'Tension' ? value : (value + 100) / 2
                        return (
                          <label key={String(label)}>
                            <span>{label}</span>
                            <meter min="0" max="100" value={normalized} />
                          </label>
                        )
                      }
                    )}
                    <small>
                      This is your character’s read. Their private opinion of you remains hidden.
                    </small>
                  </article>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}

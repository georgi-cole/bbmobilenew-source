import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAppSelector } from '../../store/hooks'
import { selectSessionLogs } from '../../social/socialSlice'
import { getActionById } from '../../social/SocialManeuvers'
import { getSocialActionPresentation } from '../../social/socialRuntimeConfig'
import { getSocialNarrative, type SocialNarrativeOptions } from './socialNarratives'
import { formatVagueLohPlan } from '../../social/lohConsultationCopy'
import type { Player } from '../../types'
import type { SocialActionLogEntry } from '../../social/types'
import './RecentActivity.css'

export interface RecentActivityProps {
  players?: readonly Player[]
  maxEntries?: number
  /** Shows a single clear receipt with an optional expandable history. */
  compact?: boolean
  onExpandedChange?: (expanded: boolean) => void
  /** Feedback for attempts that do not produce a gameplay log entry. */
  feedback?: string | null
  actionControl?: ReactNode
}

const GENERIC_OUTCOME_PREFIXES = [
  'landed exactly as intended',
  'struck the right chord',
  'brought you noticeably closer',
  'paid off socially',
  'changed the temperature between you',
  'became a small win with real social value',
  'fell flat and the silence said everything',
  'did not land the way you hoped',
  'created distance instead of momentum',
  'met a cold reception',
  'left the conversation worse than it found it',
  'felt rehearsed and backfired',
  'was one move too many',
  'crossed from charming into suspicious',
  'triggered the exact opposite reaction',
  'reopened an irritation you should have left alone',
  'was accepted',
  'made things worse',
  'succeeded',
  'backfired',
  'failed',
  'was successful',
  'was unsuccessful',
]

function isGenericOutcomeSummary(summary: string, actionTitle: string): boolean {
  if (
    /^You brought \d+ hubmates into one conversation; each reacted according to your history/i.test(
      summary
    )
  ) {
    return true
  }
  const prefix = `${actionTitle} `
  if (!summary.startsWith(prefix)) return false
  const outcome = summary.slice(prefix.length).trimStart().toLowerCase()
  return GENERIC_OUTCOME_PREFIXES.some((phrase) => outcome.startsWith(phrase))
}

function getRelativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

/** Keep one UI receipt for a batch while retaining every gameplay log. */
function groupActivityReceipts(entries: SocialActionLogEntry[]): SocialActionLogEntry[] {
  const groups = new Map<string | SocialActionLogEntry, SocialActionLogEntry[]>()
  for (const entry of entries) {
    const key = entry.receipt?.groupId ?? entry
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0]
    const latest = group[group.length - 1]
    return {
      ...latest,
      targetIds: [...new Set(group.flatMap((entry) => entry.targetIds ?? [entry.targetId]))],
      targetDeltas: Object.assign(
        {},
        ...group.map((entry) => entry.targetDeltas ?? { [entry.targetId]: entry.delta })
      ),
      costs: group.reduce(
        (sum, entry) => ({
          energy: sum.energy + (entry.costs?.energy ?? entry.cost),
          influence: sum.influence + (entry.costs?.influence ?? 0),
          info: sum.info + (entry.costs?.info ?? 0),
        }),
        { energy: 0, influence: 0, info: 0 }
      ),
      yieldsApplied: group.reduce(
        (sum, entry) => ({
          influence: sum.influence + (entry.yieldsApplied?.influence ?? 0),
          info: sum.info + (entry.yieldsApplied?.info ?? 0),
        }),
        { influence: 0, info: 0 }
      ),
    }
  })
}

/**
 * Shows panel-session actions. Technical outcome and relationship direction are
 * intentionally separate: a successful confrontation may correctly damage a
 * relationship without being presented as a failed action.
 */
export default function RecentActivity({
  players,
  maxEntries,
  compact = false,
  onExpandedChange,
  feedback,
  actionControl,
}: RecentActivityProps) {
  const sessionLogs = useAppSelector(selectSessionLogs)
  const [clearedBefore, setClearedBefore] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const [highlightedKeys, setHighlightedKeys] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState(false)
  const prevNewestTimestampRef = useRef(0)

  const playerById = useMemo(
    () => new Map(players?.map((player) => [player.id, player]) ?? []),
    [players]
  )
  const visibleLogs = useMemo(() => {
    const entries = groupActivityReceipts(
      sessionLogs.filter(
        (entry) =>
          entry.timestamp > clearedBefore &&
          (entry.source !== 'system' || entry.actionId === 'alliance_admit_result')
      )
    )
    return maxEntries === undefined ? entries : entries.slice(-maxEntries)
  }, [sessionLogs, clearedBefore, maxEntries])
  const displayedLogs = compact && !expanded ? (feedback ? [] : visibleLogs.slice(-1)) : visibleLogs

  function toggleHistory() {
    const next = !expanded
    setExpanded(next)
    onExpandedChange?.(next)
  }

  useEffect(() => {
    if (contentRef.current)
      contentRef.current.scrollTop = expanded ? contentRef.current.scrollHeight : 0
  }, [visibleLogs, expanded, feedback])

  useEffect(() => {
    const newestTimestamp = visibleLogs.at(-1)?.timestamp ?? 0
    if (newestTimestamp > prevNewestTimestampRef.current) {
      const newKeys = new Set<string>()
      for (const entry of visibleLogs) {
        if (entry.timestamp > prevNewestTimestampRef.current) {
          newKeys.add(
            entry.id ??
              `${entry.timestamp}-${entry.actionId}-${entry.targetId}-${entry.subjectId ?? ''}`
          )
        }
      }
      prevNewestTimestampRef.current = newestTimestamp
      const addTimer = setTimeout(() => {
        setHighlightedKeys((previous) => new Set([...previous, ...newKeys]))
      }, 0)
      const removeTimer = setTimeout(() => {
        setHighlightedKeys((previous) => {
          const next = new Set(previous)
          newKeys.forEach((key) => next.delete(key))
          return next
        })
      }, 1200)
      return () => {
        clearTimeout(addTimer)
        clearTimeout(removeTimer)
      }
    }
    prevNewestTimestampRef.current = newestTimestamp
  }, [visibleLogs])

  return (
    <div
      className={`ra-container${!compact || expanded ? ' ra-container--expanded' : ''}`}
      aria-label="Recent Activity"
    >
      {(visibleLogs.length > 0 || feedback || actionControl) && (
        <div className="ra-header">
          <span className="ra-title">Hub wire</span>
          <span className="ra-header__actions">
            {compact && (visibleLogs.length > 1 || (feedback && visibleLogs.length > 0)) && (
              <button
                className="ra-history-btn"
                type="button"
                aria-label={expanded ? 'Show latest activity' : `History · ${visibleLogs.length}`}
                aria-expanded={expanded}
                onClick={toggleHistory}
              >
                {expanded ? (
                  'Latest'
                ) : (
                  <>
                    <span>History</span>
                    <span className="ra-history-btn__count" aria-hidden="true">
                      {visibleLogs.length}
                    </span>
                  </>
                )}
              </button>
            )}
            {(!compact || expanded) && (
              <button
                className="ra-clear-btn"
                type="button"
                aria-label="Clear recent activity"
                onClick={() => {
                  setClearedBefore(Date.now())
                  setExpanded(false)
                  onExpandedChange?.(false)
                }}
              >
                Clear
              </button>
            )}
          </span>
        </div>
      )}

      <div className="ra-content" ref={contentRef}>
        {feedback && (
          <p className="ra-feedback" role="status">
            {feedback}
          </p>
        )}
        {visibleLogs.length === 0 && !feedback ? (
          <span className="ra-empty">No recent actions.</span>
        ) : displayedLogs.length > 0 ? (
          <ul
            className="ra-list"
            aria-label="Recent actions"
            role={compact && !expanded ? 'status' : undefined}
            aria-live={compact && !expanded ? 'polite' : 'off'}
          >
            {displayedLogs.map((entry) => {
              const action = getActionById(entry.actionId)
              const actionTitle = action
                ? getSocialActionPresentation(action).title
                : entry.actionId.replace(/_/g, ' ')
              const outcomeActionTitle = action?.title ?? actionTitle
              const targetName = playerById.get(entry.targetId)?.name ?? entry.targetId
              const targetNames = (entry.targetIds ?? [entry.targetId]).map(
                (targetId) => playerById.get(targetId)?.name ?? targetId
              )
              const audienceName = targetNames.join(', ')
              const subjectName = entry.subjectId
                ? (playerById.get(entry.subjectId)?.name ??
                  (entry.subjectId === 'user'
                    ? players?.find((player) => player.isUser)?.name
                    : undefined) ??
                  entry.subjectId)
                : null
              const subjectIsHuman = entry.subjectId
                ? playerById.get(entry.subjectId)?.isUser === true || entry.subjectId === 'user'
                : false
              const narrativeTargetName =
                action?.needsTargets === false ||
                action?.targetMode === 'none' ||
                entry.targetId === entry.actorId
                  ? ''
                  : targetName
              const narrativeOptions: SocialNarrativeOptions = {
                outcome: entry.outcome,
                ...(action?.category ? { category: action.category } : {}),
                ...(subjectName ? { subjectName } : {}),
                ...(entry.id ? { variantKey: entry.id } : {}),
              }
              const outcomeClass =
                entry.receipt?.tone ?? (entry.outcome === 'success' ? 'positive' : 'negative')
              const outcomeLabel =
                entry.receipt?.outcomeLabel ??
                (entry.outcome === 'success' ? 'Succeeded' : 'Failed')
              const receiptSummary = entry.receipt?.summary
              // Detailed receipts carry important context (for example, a LOH
              // read). Generic outcome copy should give way to the authored
              // action and reaction already in the narrative bank.
              const useDetailedReceipt = Boolean(
                receiptSummary?.trim() &&
                !isGenericOutcomeSummary(receiptSummary, outcomeActionTitle)
              )
              const loggedNarrative =
                entry.narrative && !isGenericOutcomeSummary(entry.narrative, outcomeActionTitle)
                  ? entry.narrative
                  : undefined
              const narrative =
                (useDetailedReceipt ? receiptSummary : undefined) ??
                (entry.actionId === 'group_chat'
                  ? getSocialNarrative(
                      entry.actionId,
                      audienceName,
                      entry.timestamp,
                      narrativeOptions
                    )
                  : loggedNarrative) ??
                (entry.actionId === 'ask_loh_target' &&
                entry.context?.lohDisclosureOutcome === 'vague'
                  ? formatVagueLohPlan(targetName, entry.phase)
                  : undefined) ??
                (entry.actionId === 'ask_loh_target' && subjectName
                  ? entry.context?.lohPlanType === 'backup_plan'
                    ? subjectIsHuman
                      ? `${targetName} told you that you are their backup plan if nominations change.`
                      : `${targetName} told you ${subjectName} is their backup plan if nominations change.`
                    : subjectIsHuman
                      ? `${targetName} told you that you are their current target.`
                      : `${targetName} told you ${subjectName} is their current target.`
                  : getSocialNarrative(
                      entry.actionId,
                      narrativeTargetName,
                      entry.timestamp,
                      narrativeOptions
                    ))
              const displayNarrative = narrative.startsWith('You performed')
                ? `${actionTitle} with ${audienceName}.`
                : narrative
              const key =
                entry.id ??
                `${entry.timestamp}-${entry.actionId}-${entry.targetId}-${entry.subjectId ?? ''}`
              return (
                <li
                  key={key}
                  className={`ra-entry${highlightedKeys.has(key) ? ' ra-entry--new' : ''}`}
                >
                  <span
                    className={`ra-entry__icon ra-entry__icon--${outcomeClass}`}
                    aria-label={outcomeLabel}
                  >
                    {outcomeClass === 'positive' ? '✓' : outcomeClass === 'negative' ? '✗' : '◷'}
                  </span>
                  <span className="ra-entry__body">
                    <span className="ra-entry__action-tag">
                      {actionTitle}
                      {entry.targetIds && entry.targetIds.length > 1
                        ? ` · ${audienceName}`
                        : ''} · {outcomeLabel}
                    </span>
                    <span className="ra-entry__narrative">{displayNarrative}</span>
                  </span>
                  <span
                    className="ra-entry__time"
                    aria-label={`Time: ${getRelativeTime(entry.timestamp)}`}
                  >
                    {getRelativeTime(entry.timestamp)}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
      {actionControl && <div className="ra-action-control">{actionControl}</div>}
    </div>
  )
}

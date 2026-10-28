import { socialConfig } from './socialConfig'
import {
  recordIncomingInteractionDecision,
  recordIncomingInteractionDecisions,
} from './socialSlice'
import type { IncomingInteractionDecisionLogEntry, IncomingInteractionDecisionStage } from './types'

const STAGE_LABELS: Record<IncomingInteractionDecisionStage, string> = {
  generation: 'Generation',
  scheduling: 'Scheduled',
  delivery: 'Delivered',
  postponed: 'Postponed',
  deduped: 'Deduped',
  dropped: 'Dropped',
  expiration: 'Expired',
  auto_resolution: 'Auto-resolved',
}

const batches = new WeakMap<(action: unknown) => unknown, IncomingInteractionDecisionLogEntry[]>()

/** Only diagnostic entries are deferred. Gameplay actions still commit in their original order. */
export function batchIncomingInteractionDecisions<T>(
  dispatch: (action: unknown) => unknown,
  run: () => T
): T {
  if (batches.has(dispatch)) return run()
  const entries: IncomingInteractionDecisionLogEntry[] = []
  batches.set(dispatch, entries)
  try {
    return run()
  } finally {
    batches.delete(dispatch)
    if (entries.length) dispatch(recordIncomingInteractionDecisions(entries))
  }
}

function buildIncomingInteractionLogEntry(
  entry: Omit<IncomingInteractionDecisionLogEntry, 'id' | 'timestamp'>
): IncomingInteractionDecisionLogEntry {
  const canUseUuid =
    typeof globalThis !== 'undefined' &&
    'crypto' in globalThis &&
    typeof globalThis.crypto?.randomUUID === 'function'
  return {
    id: canUseUuid
      ? globalThis.crypto.randomUUID()
      : `incoming-log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: Date.now(),
    ...entry,
  }
}

function formatIncomingInteractionLog(entry: IncomingInteractionDecisionLogEntry): string {
  const label = STAGE_LABELS[entry.stage] ?? entry.stage
  const actor = entry.actorId ?? 'unknown'
  const typeLabel = entry.type ? `(${entry.type})` : ''
  const priority = entry.priority ? `priority=${entry.priority}` : ''
  const reason = entry.reason ? `reason=${entry.reason}` : ''
  const phase = entry.phase ? `phase=${entry.phase}` : ''
  const week = entry.week !== undefined ? `week=${entry.week}` : ''
  const detail = entry.detail ? `detail=${entry.detail}` : ''
  return [
    `[Interaction] ${label}:`,
    `${actor} → player`,
    typeLabel,
    priority,
    reason,
    phase,
    week,
    detail,
  ]
    .filter(Boolean)
    .join(' ')
}

export function logIncomingInteractionDecision(
  dispatch: (action: unknown) => unknown,
  entry: Omit<IncomingInteractionDecisionLogEntry, 'id' | 'timestamp'>
): IncomingInteractionDecisionLogEntry {
  const fullEntry = buildIncomingInteractionLogEntry(entry)
  const batch = batches.get(dispatch)
  if (batch) batch.push(fullEntry)
  else dispatch(recordIncomingInteractionDecision(fullEntry))
  if (socialConfig.verbose || socialConfig.incomingInteractionDebugConfig.enableConsole) {
    console.info(formatIncomingInteractionLog(fullEntry))
  }
  return fullEntry
}

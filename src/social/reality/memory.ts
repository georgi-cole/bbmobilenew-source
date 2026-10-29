import type { RealityDomainState, RealityMemory } from './types'
import { current as readCurrent, isDraft } from 'immer'

export const MAX_REALITY_MEMORIES_PER_ACTOR = 160
type RecallEntry = { memory: RealityMemory; score: number; index: number }
const recallOrder = new WeakMap<RealityMemory[], { day: number; entries: RecallEntry[] }>()

export function memoryRecallScore(memory: RealityMemory, day: number): number {
  const age = Math.max(0, day - memory.day)
  const decay = Math.max(0.15, 1 - age * 0.035)
  return (
    memory.recallStrength *
    decay *
    (0.35 +
      memory.importance * 0.25 +
      memory.emotionalIntensity * 0.2 +
      memory.strategicRelevance * 0.2)
  )
}

export function remember(state: RealityDomainState, memory: RealityMemory): void {
  const stored = state.memoriesByOwner[memory.ownerId] ?? []
  // Read the current transaction's values without creating a proxy for every
  // historical memory. The complete retained list is assigned once below.
  const current = [...(isDraft(stored) ? readCurrent(stored) : stored)]
  const existingIndex = current.findIndex((entry) => entry.id === memory.id)
  if (existingIndex >= 0) current[existingIndex] = memory
  else current.push(memory)
  // Read proxy-backed dimensions once per record, rather than once per sort
  // comparison. Preserve the exact pair-dependent clock and arithmetic order.
  const ranked = current.map((entry) => ({
    memory: entry,
    day: entry.day,
    id: entry.id,
    strength: entry.recallStrength,
    weight:
      0.35 +
      entry.importance * 0.25 +
      entry.emotionalIntensity * 0.2 +
      entry.strategicRelevance * 0.2,
  }))
  const score = (entry: (typeof ranked)[number], day: number) =>
    entry.strength * Math.max(0.15, 1 - Math.max(0, day - entry.day) * 0.035) * entry.weight
  state.memoriesByOwner[memory.ownerId] = ranked
    .sort(
      (left, right) =>
        score(left, Math.max(left.day, right.day)) - score(right, Math.max(left.day, right.day)) ||
        left.id.localeCompare(right.id)
    )
    .slice(-MAX_REALITY_MEMORIES_PER_ACTOR)
    .map((entry) => entry.memory)
}

export function retrieveMemories(
  state: RealityDomainState,
  ownerId: string,
  input: {
    day: number
    participantIds?: readonly string[]
    tags?: readonly string[]
    limit?: number
  }
): RealityMemory[] {
  const participants = new Set(input.participantIds ?? [])
  const tags = new Set(input.tags ?? [])
  const matches = (memory: RealityMemory) =>
    participants.size === 0 ||
    memory.participantIds.some((id) => participants.has(id)) ||
    memory.tags.some((tag) => tags.has(tag))
  const stored = state.memoriesByOwner[ownerId] ?? []
  const draft = isDraft(stored)
  const memories = draft ? readCurrent(stored) : stored
  const selectedMemories = (entries: RecallEntry[]) =>
    entries
      .filter(({ memory }) => matches(memory))
      .slice(0, input.limit ?? 8)
      .map(({ memory, index }) => (draft ? stored[index] : memory))
  const immutable = Object.isFrozen(memories)
  let ranked = immutable ? recallOrder.get(memories) : undefined
  if (!ranked || ranked.day !== input.day) {
    const scored = memories.map((memory, index) => ({
      memory,
      index,
      score: memoryRecallScore(memory, input.day),
    }))
    // Legacy malformed scores can make the old comparator non-transitive.
    // Preserve its exact filtered-input behavior for those saves.
    if (scored.some(({ score }) => !Number.isFinite(score)))
      return selectedMemories(
        scored
          .filter(({ memory }) => matches(memory))
          .sort((a, b) => b.score - a.score || a.memory.id.localeCompare(b.memory.id))
      )
    ranked = {
      day: input.day,
      entries: scored.sort((a, b) => b.score - a.score || a.memory.id.localeCompare(b.memory.id)),
    }
    if (immutable && memories.every(Object.isFrozen)) recallOrder.set(memories, ranked)
  }
  return selectedMemories(ranked.entries)
}

export function decayMemories(state: RealityDomainState, day: number): void {
  for (const [ownerId, memories] of Object.entries(state.memoriesByOwner)) {
    state.memoriesByOwner[ownerId] = memories
      .map((memory) => ({
        ...memory,
        recallStrength: Math.max(
          memory.importance >= 0.8 ? 0.35 : 0.05,
          memory.recallStrength * (memory.day < day ? 0.965 : 1)
        ),
      }))
      .filter(
        (memory) =>
          memory.importance >= 0.75 ||
          memory.tags.includes('anchor') ||
          memory.recallStrength >= 0.08
      )
      .slice(-MAX_REALITY_MEMORIES_PER_ACTOR)
  }
}

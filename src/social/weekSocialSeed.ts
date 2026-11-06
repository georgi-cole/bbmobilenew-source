/**
 * weekSocialSeed — initializes new relationships and consolidates recent social memory.
 *
 * New pairs receive a deterministic starting chemistry value. Existing pairs
 * receive a small continuity adjustment plus a light deterministic background
 * shift. The latter represents indirect conversations, observation, ordinary
 * mood, and off-screen house life without inventing a major event.
 */

import { applyWeekSeedBatch } from './socialSlice'
import type { WeekSeedBatch, WeekSeedOperation } from './socialSlice'
import { getAll } from '../data/houseguests'
import type { SocialMemoryEntry, SocialMemoryMap } from './types'
import { getEffectiveSocialMode } from './socialMode'
import { dampenBellaRelationship, getTwinRelationshipEchoes } from './relationshipUpdateEffects'

interface StoreAPI {
  dispatch: (action: unknown) => unknown
  getState: () => unknown
}

interface SeedState {
  game: {
    players: Array<{ id: string; status: string; isUser?: boolean }>
    seed: number
    week: number
    dramaSocialMode?: boolean
  }
  social: {
    relationships: Record<string, Record<string, { affinity: number; tags: string[] }>>
    socialMemory?: SocialMemoryMap
  }
  settings?: {
    gameUX?: { dramaMode?: boolean }
  }
  vip?: {
    isActive?: boolean
    entitlements?: { dramaMode?: boolean }
  }
}

function makeLcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

const HOUSEGUEST_PROFILE_BY_ID = Object.fromEntries(
  getAll().map((houseguest) => [houseguest.id, houseguest])
)

function seedStaticRelationshipChemistry(
  operations: WeekSeedOperation[],
  activePlayerIds: string[]
): void {
  const activeIds = new Set(activePlayerIds)
  for (const actorId of activePlayerIds) {
    const profile = HOUSEGUEST_PROFILE_BY_ID[actorId]
    if (!profile) continue
    profile.allies.forEach((targetId) => {
      if (!activeIds.has(targetId)) return
      operations.push({
        kind: 'relationship',
        payload: {
          source: actorId,
          target: targetId,
          delta: 8,
          actionSource: 'system',
          realityMeaningful: false,
        },
      })
    })
    profile.enemies.forEach((targetId) => {
      if (!activeIds.has(targetId)) return
      operations.push({
        kind: 'relationship',
        payload: {
          source: actorId,
          target: targetId,
          delta: -8,
          actionSource: 'system',
          realityMeaningful: false,
        },
      })
    })
  }
}

function seedStaticRelationshipTags(
  operations: WeekSeedOperation[],
  activePlayerIds: string[]
): void {
  const activeIds = new Set(activePlayerIds)
  for (const actorId of activePlayerIds) {
    const profile = HOUSEGUEST_PROFILE_BY_ID[actorId]
    if (!profile) continue
    profile.allies.forEach((targetId) => {
      if (!activeIds.has(targetId)) return
      operations.push({
        kind: 'relationship',
        payload: {
          source: actorId,
          target: targetId,
          delta: 0,
          tags: ['alliance'],
          actionSource: 'system',
          realityMeaningful: false,
        },
      })
    })
    profile.enemies.forEach((targetId) => {
      if (!activeIds.has(targetId)) return
      operations.push({
        kind: 'relationship',
        payload: {
          source: actorId,
          target: targetId,
          delta: 0,
          tags: ['target'],
          actionSource: 'system',
          realityMeaningful: false,
        },
      })
    })
  }
}

export function getRelationshipContinuityDelta(entry?: SocialMemoryEntry): number {
  if (!entry) return 0
  const positive = entry.gratitude * 0.7 + Math.max(0, entry.trustMomentum) * 1.1
  const negative =
    entry.resentment * 0.8 + entry.neglect * 0.55 + Math.max(0, -entry.trustMomentum) * 1.1
  const signal = positive - negative
  if (Math.abs(signal) < 2.5) return 0
  return Math.max(-2, Math.min(2, Math.round(signal / 4)))
}

export function getAmbientRelationshipDelta(
  roll: number,
  options: { humanInvolved?: boolean; week?: number } = {}
): number {
  const safeRoll = Math.max(0, Math.min(0.999_999, Number.isFinite(roll) ? roll : 0.5))
  const earlyHumanWarmth = options.humanInvolved === true && (options.week ?? 1) <= 3
  if (earlyHumanWarmth) {
    if (safeRoll < 0.07) return -2
    if (safeRoll < 0.22) return -1
    if (safeRoll < 0.55) return 0
    if (safeRoll < 0.87) return 1
    return 2
  }
  if (safeRoll < 0.12) return -2
  if (safeRoll < 0.32) return -1
  if (safeRoll < 0.68) return 0
  if (safeRoll < 0.88) return 1
  return 2
}

/**
 * Seed or refresh relationships at week start.
 *
 * - Week 1 keeps the established roster chemistry behavior.
 * - Brand-new pairs receive deterministic chemistry between -12 and +25.
 * - Existing pairs receive at most ±3 from memory plus low-amplitude ambient
 *   house life. Human-involved edges get a small early warmth bias, not immunity.
 * - Contestant mood, stress, and social energy settle a little each day.
 */
export function buildWeekSeedBatch(state: SeedState): WeekSeedBatch | null {
  const players = state.game?.players ?? []
  const week = state.game?.week ?? 1
  const gameSeed = state.game?.seed ?? 0
  const relationships = state.social?.relationships ?? {}
  const socialMemory = state.social?.socialMemory ?? {}

  const active = players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
  if (active.length < 2) return null

  const batch: WeekSeedBatch = { operations: [], moods: [] }

  if (week === 1) {
    const activeIds = active.map((player) => player.id)
    if (state.settings?.gameUX?.dramaMode === true || state.game.dramaSocialMode === true) {
      seedStaticRelationshipChemistry(batch.operations, activeIds)
    } else {
      seedStaticRelationshipTags(batch.operations, activeIds)
    }
  }

  const rng = makeLcg(gameSeed ^ (week * 2654435761))

  for (let actorIndex = 0; actorIndex < active.length; actorIndex += 1) {
    for (let targetIndex = 0; targetIndex < active.length; targetIndex += 1) {
      if (actorIndex === targetIndex) continue
      const actor = active[actorIndex]
      const target = active[targetIndex]
      const existing = relationships[actor.id]?.[target.id]
      const delta = existing
        ? Math.max(
            -3,
            Math.min(
              3,
              getRelationshipContinuityDelta(socialMemory[actor.id]?.[target.id]) +
                getAmbientRelationshipDelta(rng(), {
                  humanInvolved: actor.isUser === true || target.isUser === true,
                  week,
                })
            )
          )
        : Math.round(-12 + rng() * 37)

      if (delta !== 0) {
        batch.operations.push({
          kind: 'relationship',
          payload: {
            source: actor.id,
            target: target.id,
            delta,
            actionSource: 'system',
            // Day-start background chemistry is not a direct conversation.
            realityMeaningful: false,
          },
        })
      }
      // Everyone active in the Hub shares the day's public routines. The
      // reducer grants one familiarity point per directed pair and day, even
      // when the ambient relationship roll itself is neutral.
      batch.operations.push({
        kind: 'ambientRelationship',
        payload: {
          sourceId: actor.id,
          targetId: target.id,
          socialDelta: existing ? delta : 0,
          day: week,
        },
      })
    }
  }

  for (const player of active) {
    batch.moods.push({
      actorId: player.id,
      valenceDelta: Math.round((rng() - 0.48) * 10),
      arousalDelta: Math.round((rng() - 0.5) * 8),
      stressDelta: Math.round((rng() - 0.52) * 6),
      socialEnergyDelta: Math.round((rng() - 0.5) * 8),
    })
  }

  return batch
}

export function seedWeekRelationships(store: StoreAPI): void {
  const state = store.getState() as SeedState
  const batch = buildWeekSeedBatch(state)
  if (!batch) return

  const current = store.getState() as SeedState
  if (
    getEffectiveSocialMode({
      game: current.game,
      settings: current.settings,
      vip: current.vip,
    }) === 'drama'
  ) {
    const expandedOperations: WeekSeedOperation[] = []
    for (const operation of batch.operations) {
      if (operation.kind !== 'relationship') {
        expandedOperations.push(operation)
        continue
      }
      const payload = dampenBellaRelationship(operation.payload)
      expandedOperations.push({ kind: 'relationship', payload })
      for (const echo of getTwinRelationshipEchoes(
        payload,
        current.game.players,
        current.game.week
      )) {
        expandedOperations.push({
          kind: 'relationship',
          payload: dampenBellaRelationship(echo),
        })
      }
    }
    batch.operations = expandedOperations
  } else {
    for (const operation of batch.operations) {
      if (operation.kind !== 'relationship') continue
      operation.payload = dampenBellaRelationship(operation.payload)
    }
  }
  store.dispatch(applyWeekSeedBatch(batch))
}

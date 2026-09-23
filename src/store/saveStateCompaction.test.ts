import { describe, expect, it } from 'vitest'
import type { SocialState } from '../social/types'
import {
  compactSocialStateForPersistence,
  PERSISTED_SOCIAL_LIMITS,
} from './saveStateCompaction'

function entries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    actionId: `action-${index}`,
    actorId: 'a',
    targetId: 'b',
    cost: 1,
    delta: 0,
    outcome: 'success' as const,
    newEnergy: 1,
    timestamp: index,
  }))
}

describe('saveStateCompaction', () => {
  it('bounds persistence-only debug and history collections without mutating runtime state', () => {
    const incoming = Array.from({ length: 100 }, (_, index) => ({
      id: `incoming-${index}`,
      fromId: 'a',
      type: 'check_in' as const,
      text: 'hello',
      createdAt: index,
      createdWeek: 1,
      expiresAtWeek: 2,
      read: true,
      requiresResponse: false,
      resolved: index < 90,
      resolvedAt: index < 90 ? index : undefined,
    }))

    const runtime = {
      sessionLogs: entries(120),
      actionHistory: entries(400),
      incomingInteractionLogs: Array.from({ length: 140 }, (_, index) => ({
        id: `log-${index}`,
        stage: 'generation' as const,
        reason: 'test',
        timestamp: index,
      })),
      incomingInteractions: incoming,
      realitySimulation: {
        version: 1,
        rng: { seed: 1, state: 2, cursor: 3 },
        nextTraceSequence: 150,
        trace: Array.from({ length: 150 }, (_, index) => ({
          id: `trace-${index}`,
          sequence: index,
          day: 7,
          phase: 'social_1',
          stage: 'candidate' as const,
          candidates: [{ id: 'candidate', eligible: true, weight: 1 }],
        })),
      },
    } as unknown as SocialState

    const compact = compactSocialStateForPersistence(runtime)

    expect(compact).not.toBe(runtime)
    expect(compact.sessionLogs).toHaveLength(PERSISTED_SOCIAL_LIMITS.sessionLogs)
    expect(compact.actionHistory).toHaveLength(PERSISTED_SOCIAL_LIMITS.actionHistory)
    expect(compact.incomingInteractionLogs).toHaveLength(
      PERSISTED_SOCIAL_LIMITS.incomingInteractionLogs
    )
    expect(compact.incomingInteractions.filter((entry) => entry.resolved)).toHaveLength(
      PERSISTED_SOCIAL_LIMITS.resolvedIncomingInteractions
    )
    expect(compact.incomingInteractions.filter((entry) => !entry.resolved)).toHaveLength(10)
    expect(compact.realitySimulation.trace).toHaveLength(PERSISTED_SOCIAL_LIMITS.realityTrace)
    expect(compact.realitySimulation.trace.every((entry) => entry.candidates === undefined)).toBe(
      true
    )

    expect(runtime.sessionLogs).toHaveLength(120)
    expect(runtime.realitySimulation.trace).toHaveLength(150)
    expect(runtime.realitySimulation.trace[0]?.candidates).toBeDefined()
  })
})

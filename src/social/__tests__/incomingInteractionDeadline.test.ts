import { describe, expect, it } from 'vitest'
import {
  createIncomingInteraction,
  normalizeIncomingInteractionContract,
} from '../incomingInteractionFactory'
import {
  formatIncomingDeadline,
  formatIncomingDecisionDeadline,
  getIncomingDeadline,
  isIncomingInteractionOverdue,
  isIncomingInteractionUrgent,
} from '../incomingInteractionDeadline'
import { getIncomingResponseRelationshipDelta } from '../incomingResponseEffects'
import type { IncomingInteraction } from '../types'

describe('daily incoming interaction deadlines', () => {
  it('authors a same-day phase deadline for a required nomination plea', () => {
    const interaction = createIncomingInteraction({
      id: 'plea-1',
      fromId: 'lia',
      type: 'nomination_plea',
      text: 'Please keep me.',
      week: 4,
      phase: 'social_2',
      mode: 'normal',
      responsePolicy: 'required',
    })

    expect(interaction.createdDay).toBe(4)
    expect(interaction.deadline).toMatchObject({ day: 4, phase: 'live_vote' })
    expect(formatIncomingDeadline(interaction)).toBe('Answer before the live vote')
    expect(isIncomingInteractionUrgent(interaction, { day: 4, phase: 'social_2' })).toBe(true)
    expect(isIncomingInteractionOverdue(interaction, { day: 4, phase: 'live_vote' })).toBe(false)
    expect(isIncomingInteractionOverdue(interaction, { day: 4, phase: 'eviction_results' })).toBe(
      true
    )
  })

  it('migrates a legacy week expiry to a safe terminal phase on that day', () => {
    const legacy: IncomingInteraction = {
      id: 'legacy',
      fromId: 'kai',
      type: 'warning',
      text: 'Watch out.',
      createdAt: 1,
      createdWeek: 2,
      expiresAtWeek: 3,
      read: false,
      requiresResponse: true,
      resolved: false,
    }
    const migrated = normalizeIncomingInteractionContract(legacy)

    expect(migrated.createdDay).toBe(2)
    expect(getIncomingDeadline(migrated)).toMatchObject({
      day: 3,
      phase: 'eviction_results',
    })
  })

  it('uses action-specific ignore consequences instead of one generic penalty', () => {
    expect(getIncomingResponseRelationshipDelta('alliance_proposal', 'ignore')).toBe(-12)
    expect(getIncomingResponseRelationshipDelta('warning', 'ignore')).toBe(-8)
    expect(getIncomingResponseRelationshipDelta('snide_remark', 'ignore')).toBe(1)
  })

  it('shows a personal pact decision day and exact deadline window', () => {
    const interaction = createIncomingInteraction({
      id: 'pact-1',
      fromId: 'lia',
      type: 'alliance_proposal',
      text: 'Would you make this official?',
      week: 9,
      phase: 'social_1',
      mode: 'normal',
    })

    expect(interaction.deadline).toMatchObject({ day: 9, phase: 'social_2' })
    expect(formatIncomingDecisionDeadline(interaction)).toBe(
      'Offer closes Day 9 · end of the final campaign window'
    )
  })
})

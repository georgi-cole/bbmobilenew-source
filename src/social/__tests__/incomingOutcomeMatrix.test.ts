import { describe, expect, it } from 'vitest'
import { getIncomingActionOutcome } from '../incomingOutcomeMatrix'
import { SCENE_CHOICES, SCENE_FAMILY_CHOICES } from '../incomingSceneChoiceBank'

describe('incoming outcome matrix', () => {
  it('covers every offered action with a short distinct result', () => {
    const outcomes: string[] = []
    const uniqueActionKeys = new Set<string>()

    for (const [scenarioKey, variants] of Object.entries(SCENE_CHOICES)) {
      for (const labels of variants) {
        for (const responseLabel of labels) {
          const outcome = getIncomingActionOutcome({
            scenarioKey,
            responseLabel,
            fromName: 'Alexander',
            subjectName: 'Dexter',
            phase: 'social_1',
            senderIsNominated: false,
          })

          expect(outcome, `${scenarioKey} / ${responseLabel}`).toBeTruthy()
          expect(outcome!.length, `${scenarioKey} / ${responseLabel}`).toBeLessThanOrEqual(120)
          const actionKey = `${scenarioKey}:${responseLabel.trim().toLowerCase()}`
          if (!uniqueActionKeys.has(actionKey)) {
            uniqueActionKeys.add(actionKey)
            outcomes.push(outcome!)
          }
        }
      }
    }

    expect(outcomes).toHaveLength(uniqueActionKeys.size)
    expect(new Set(outcomes).size).toBe(outcomes.length)
  })

  it('covers every family-specific nomination aftershock action', () => {
    for (const responseLabel of Object.values(SCENE_FAMILY_CHOICES).flat()) {
      const outcome = getIncomingActionOutcome({
        scenarioKey: 'nomination_aftershock',
        responseLabel,
        fromName: 'Sol',
        phase: 'social_2',
        senderIsNominated: true,
      })

      expect(outcome, `nomination_aftershock / ${responseLabel}`).toBeTruthy()
      expect(outcome!.length).toBeLessThanOrEqual(120)
    }
  })

  it('keeps campaign actions and scenes from collapsing into the same answer', () => {
    const campaign = getIncomingActionOutcome({
      scenarioKey: 'nominee_campaign',
      responseLabel: 'Hear the campaign',
      fromName: 'Jax',
      phase: 'social_2',
      senderIsNominated: true,
    })
    const liveVote = getIncomingActionOutcome({
      scenarioKey: 'live_vote_pitch',
      responseLabel: 'Ask for their case',
      fromName: 'Rune',
      phase: 'live_vote',
      senderIsNominated: true,
    })

    expect(campaign).toBe(
      'Jax says they are still testing which votes are firm and which could move.'
    )
    expect(liveVote).toBe('Rune says keeping them gives you a vote that is still open.')
    expect(campaign).not.toBe(liveVote)
  })

  it('keeps co-nominee reassurance separate from a vote promise', () => {
    const compareVoteReads = getIncomingActionOutcome({
      scenarioKey: 'co_nominee_check_in',
      responseLabel: 'Compare vote reads',
      fromName: 'Nico',
      phase: 'social_2',
      senderIsNominated: true,
    })
    const reassureBond = getIncomingActionOutcome({
      scenarioKey: 'co_nominee_check_in',
      responseLabel: 'Reassure the bond',
      fromName: 'Nico',
      phase: 'social_2',
      senderIsNominated: true,
    })

    expect(compareVoteReads).toContain('neither of you can promise how others will vote')
    expect(reassureBond).toContain('neither of you can change the block for the other')
    expect(reassureBond).not.toMatch(/promise.*vote|vote.*promise/i)
    expect(compareVoteReads).not.toBe(reassureBond)
  })

  it('changes check-in information with the current game timing', () => {
    const beforeNominations = getIncomingActionOutcome({
      scenarioKey: 'relationship_friendship_check_in',
      responseLabel: 'Ask how they are',
      fromName: 'Kian',
      phase: 'social_1',
      senderIsNominated: false,
    })
    const beforeSafety = getIncomingActionOutcome({
      scenarioKey: 'relationship_friendship_check_in',
      responseLabel: 'Ask how they are',
      fromName: 'Kian',
      phase: 'pos_ceremony',
      senderIsNominated: true,
    })
    const beforeEviction = getIncomingActionOutcome({
      scenarioKey: 'relationship_friendship_check_in',
      responseLabel: 'Ask how they are',
      fromName: 'Kian',
      phase: 'live_vote',
      senderIsNominated: true,
    })

    expect(beforeNominations).toBe('Kian says they are worried about the upcoming nominations.')
    expect(beforeSafety).toBe('Kian says they are worried they are being kept as the pawn.')
    expect(beforeEviction).toBe('Kian says they feel the Hub is against them.')
  })

  it('uses the named subject for gossip instead of a vague generic claim', () => {
    expect(
      getIncomingActionOutcome({
        scenarioKey: 'generic_gossip',
        responseLabel: 'Ask for the source',
        fromName: 'Bea',
        subjectName: 'Dex',
        phase: 'social_2',
        senderIsNominated: false,
      })
    ).toBe('Bea says the claim about Dex came through Hub talk they cannot verify.')
  })
})

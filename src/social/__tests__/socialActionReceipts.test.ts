import { describe, expect, it, vi } from 'vitest'
import socialReducer, {
  clearSessionLogs,
  finalizeSocialActionReceipt,
  recordSocialAction,
} from '../socialSlice'
import type { SocialActionLogEntry } from '../types'

function log(summary: string): SocialActionLogEntry {
  return {
    actionId: 'ask_loh_target',
    actorId: 'human',
    targetId: 'rune',
    cost: 1,
    delta: 0,
    outcome: 'success',
    newEnergy: 4,
    timestamp: 100,
    narrative: summary,
  }
}

describe('final social action receipts', () => {
  it('enriches only the matching interaction in session and durable history without replaying it', () => {
    const first = recordSocialAction({ entry: log('First answer.') })
    const second = recordSocialAction({ entry: log('Second answer.') })
    let state = socialReducer(undefined, first)
    state = socialReducer(state, second)
    expect(state.sessionLogs[0].id).not.toBe(state.sessionLogs[1].id)
    const energyBank = state.energyBank
    const relationships = state.relationships
    const receipt = {
      summary:
        'The block is locked. Dex is my main target; Sol is on the block as the replacement.',
      outcomeLabel: 'Completed',
      tone: 'positive' as const,
    }
    const finalized = socialReducer(
      state,
      finalizeSocialActionReceipt({
        entryId: state.sessionLogs[1].id!,
        receipt,
      })
    )
    expect(finalized.sessionLogs).toHaveLength(2)
    expect(finalized.actionHistory).toHaveLength(2)
    expect(finalized.sessionLogs[0].receipt).toBeUndefined()
    expect(finalized.sessionLogs[1].receipt).toEqual(receipt)
    expect(finalized.actionHistory?.[1].receipt).toEqual(receipt)
    expect(finalized.energyBank).toBe(energyBank)
    expect(finalized.relationships).toBe(relationships)
    expect(socialReducer(finalized, clearSessionLogs()).actionHistory?.[1].receipt).toEqual(receipt)
  })

  it('does not advance random rolls when recording a display identity', () => {
    const initial = socialReducer(undefined, { type: '@@test/init' })
    const random = vi.spyOn(Math, 'random')
    try {
      socialReducer(initial, recordSocialAction({ entry: log('The answer.') }))
      expect(random).not.toHaveBeenCalled()
    } finally {
      random.mockRestore()
    }
  })
})

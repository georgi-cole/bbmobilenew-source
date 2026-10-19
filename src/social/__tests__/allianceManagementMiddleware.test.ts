import { describe, expect, it, vi } from 'vitest'
import type { RootState } from '../../store/store'
import { createInitialRealityDomainState } from '../reality/state'
import { allianceManagementMiddleware } from '../allianceManagementMiddleware'
import socialReducer, { commitRealityDomainUpdate } from '../socialSlice'

describe('alliance management middleware', () => {
  it('commits phase autonomy with copy-on-write and skips the completed phase', () => {
    const reality = createInitialRealityDomainState()
    reality.memoriesByOwner.ava = []
    let social = socialReducer(undefined, { type: 'test/init' })
    social = socialReducer(social, {
      type: 'social/replaceRealityDomain',
      payload: reality,
    })
    const memoriesByOwner = social.reality.memoriesByOwner
    const game = {
      week: 1,
      phase: 'social_1',
      seed: 13,
      mode: 'classic',
      players: [
        { id: 'ava', name: 'Ava', isUser: false, status: 'active' },
        { id: 'lia', name: 'Lia', isUser: true, status: 'active' },
      ],
      nomineeIds: [],
      competitionSeasonStateByPlayerId: {},
    }
    const getState = () => ({ game, social }) as unknown as RootState
    const dispatch = vi.fn((action: unknown) => {
      social = socialReducer(social, action as never)
      return action
    })
    const next = (action: unknown) => action
    const invoke = allianceManagementMiddleware({ getState, dispatch } as never)(next as never)

    invoke({ type: 'game/advance' })

    expect(dispatch).toHaveBeenCalledTimes(1)
    const committed = dispatch.mock.calls[0]?.[0] as ReturnType<typeof commitRealityDomainUpdate>
    expect(committed.type).toBe(commitRealityDomainUpdate.type)
    expect(committed.payload.projectAllRelationships).toBe(true)
    expect(committed.payload.domain.memoriesByOwner).toBe(memoriesByOwner)
    expect(
      committed.payload.domain.allianceManagement.processedCommands['ai-alliance:1:social_1']
    ).toBeDefined()

    invoke({ type: 'game/advance' })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})

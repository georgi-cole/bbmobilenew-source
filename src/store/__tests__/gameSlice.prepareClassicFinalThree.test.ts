import { describe, expect, it } from 'vitest'
import gameReducer, {
  createInitialGameState,
  prepareClassicFinalFourTest,
  prepareClassicFinalThreeTest,
} from '../gameSlice'

describe('prepareClassicFinalThreeTest', () => {
  it('keeps the human and exactly two AI finalists in a clean Classic Final Three', () => {
    const initial = createInitialGameState({ seed: 811 })
    initial.lohId = initial.players[2].id
    initial.posWinnerId = initial.players[3].id
    initial.nomineeIds = [initial.players[4].id, initial.players[5].id]
    initial.awaitingHumanVote = true
    initial.voteResults = { stale: 1 }

    const state = gameReducer(initial, prepareClassicFinalThreeTest())
    const finalists = state.players.filter((player) => player.status === 'active')
    const tribunal = state.players.filter((player) => player.status === 'jury')

    expect(state.phase).toBe('final3')
    expect(finalists).toHaveLength(3)
    expect(finalists.some((player) => player.isUser)).toBe(true)
    expect(tribunal).toHaveLength(state.players.length - 3)
    expect(state.lohId).toBeNull()
    expect(state.posWinnerId).toBeNull()
    expect(state.nomineeIds).toEqual([])
    expect(state.awaitingHumanVote).toBe(false)
    expect(state.voteResults).toBeNull()
    // The phase card is created once by the broadcast manager. The reducer
    // itself must not append a second, near-identical Final Three message.
    expect(state.tvFeed).toHaveLength(0)
  })

  it('does nothing while Vox Populi is active', () => {
    const initial = createInitialGameState({ seed: 812 })
    if (!initial.voxPopuli) throw new Error('Expected Vox Populi state')
    initial.voxPopuli.status = 'active'

    const state = gameReducer(initial, prepareClassicFinalThreeTest())

    expect(state.phase).toBe(initial.phase)
    expect(state.players.filter((player) => player.status === 'active')).toHaveLength(
      initial.players.filter((player) => player.status === 'active').length
    )
  })
})

describe('prepareClassicFinalFourTest', () => {
  it('sets up four finalists and a playable human sole-vote eviction', () => {
    const initial = createInitialGameState({ seed: 813 })
    initial.lohId = initial.players[2].id
    initial.posWinnerId = initial.players[3].id
    initial.nomineeIds = [initial.players[4].id, initial.players[5].id]
    initial.awaitingHumanVote = true
    initial.voteResults = { stale: 1 }

    const state = gameReducer(initial, prepareClassicFinalFourTest())
    const finalists = state.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury'
    )
    const nominees = state.players.filter((player) => state.nomineeIds.includes(player.id))

    expect(state.phase).toBe('final4_eviction')
    expect(finalists).toHaveLength(4)
    expect(finalists.some((player) => player.isUser)).toBe(true)
    expect(state.posWinnerId).toBe(finalists.find((player) => player.isUser)?.id)
    expect(nominees).toHaveLength(2)
    expect(nominees.every((player) => player.status === 'nominated')).toBe(true)
    expect(state.players.find((player) => player.id === state.posWinnerId)?.status).toBe('pos')
    expect(state.lohId).toBeNull()
    expect(state.awaitingHumanVote).toBe(false)
    expect(state.voteResults).toBeNull()
    expect(state.tvFeed).toHaveLength(0)
  })

  it('does nothing while Vox Populi is active', () => {
    const initial = createInitialGameState({ seed: 814 })
    if (!initial.voxPopuli) throw new Error('Expected Vox Populi state')
    initial.voxPopuli.status = 'active'

    const state = gameReducer(initial, prepareClassicFinalFourTest())

    expect(state.phase).toBe(initial.phase)
    expect(
      state.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
    ).toHaveLength(
      initial.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
        .length
    )
  })
})

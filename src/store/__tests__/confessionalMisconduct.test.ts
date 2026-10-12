import { describe, expect, it } from 'vitest'
import { isBattleBackEligiblePlayer } from '../../features/twists/battleBackRules'
import gameReducer, { recordConfessionalMisconduct, updatePlayer } from '../gameSlice'

describe('Confessional misconduct enforcement', () => {
  it('persists season strikes and removes the user on the third violation', () => {
    let state = gameReducer(undefined, { type: 'test/initialize' })
    const user = state.players.find((player) => player.isUser)
    expect(user).toBeDefined()
    if (!user) return

    const violation = { playerId: user.id, violation: 'profanity' as const }
    state = gameReducer(state, recordConfessionalMisconduct(violation))
    expect(
      state.players.find((player) => player.id === user.id)?.confessionalMisconduct
    ).toMatchObject({
      season: state.season,
      strikes: 1,
    })

    const firstStrikePlayer = state.players.find((player) => player.id === user.id)!
    state = gameReducer(
      state,
      updatePlayer({ ...firstStrikePlayer, name: firstStrikePlayer.name + ' Updated' })
    )
    expect(
      state.players.find((player) => player.id === user.id)?.confessionalMisconduct?.strikes
    ).toBe(1)

    state = gameReducer(state, recordConfessionalMisconduct(violation))
    state = gameReducer(state, recordConfessionalMisconduct(violation))
    const removed = state.players.find((player) => player.id === user.id)!

    expect(removed).toMatchObject({
      status: 'evicted',
      tribunalEligible: false,
      confessionalMisconduct: {
        season: state.season,
        strikes: 3,
        administrativelyRemoved: true,
      },
    })
    expect(isBattleBackEligiblePlayer(removed, { allowLegacyEvicted: true })).toBe(false)
    expect(state.tvFeed.some((event) => /removed by The Big Eye/i.test(event.text))).toBe(true)
  })

  it('does not let a later generic player update restore eligibility in the same season', () => {
    let state = gameReducer(undefined, { type: 'test/initialize' })
    const user = state.players.find((player) => player.isUser)
    expect(user).toBeDefined()
    if (!user) return

    const violation = { playerId: user.id, violation: 'flood' as const }
    state = gameReducer(state, recordConfessionalMisconduct(violation))
    state = gameReducer(state, recordConfessionalMisconduct(violation))
    state = gameReducer(state, recordConfessionalMisconduct(violation))
    const removed = state.players.find((player) => player.id === user.id)!

    state = gameReducer(
      state,
      updatePlayer({ ...removed, status: 'active', tribunalEligible: true })
    )

    expect(state.players.find((player) => player.id === user.id)).toMatchObject({
      status: 'evicted',
      tribunalEligible: false,
    })
  })

  it('starts a fresh strike count when the season changes', () => {
    let state = gameReducer(undefined, { type: 'test/initialize' })
    const user = state.players.find((player) => player.isUser)
    expect(user).toBeDefined()
    if (!user) return

    const violation = { playerId: user.id, violation: 'gibberish' as const }
    state = gameReducer(state, recordConfessionalMisconduct(violation))
    state = { ...state, season: state.season + 1 }
    state = gameReducer(state, recordConfessionalMisconduct(violation))

    expect(
      state.players.find((player) => player.id === user.id)?.confessionalMisconduct
    ).toMatchObject({
      season: state.season,
      strikes: 1,
      administrativelyRemoved: false,
    })
  })
})

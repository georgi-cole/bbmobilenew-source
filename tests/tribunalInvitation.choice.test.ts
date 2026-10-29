import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  chooseTribunalInvitation,
  completeTribunalArrival,
  hydrateGame,
  prepareTribunalInvitationTest,
} from '../src/store/gameSlice'
import { getTribunalMembers } from '../src/rules/tribunalPolicy'

function fixture(mode: 'invitation' | 'first_arrival' | 'battle_back' = 'invitation') {
  return gameReducer(undefined, prepareTribunalInvitationTest({ gameId: 'tribunal-choice', mode }))
}

describe('Tribunal invitation choice lifecycle', () => {
  it('keeps the chosen arrival pending across hydration and blocks progression until it completes', () => {
    const before = fixture()
    const chosen = gameReducer(before, chooseTribunalInvitation('agree'))
    expect(chosen.tribunalInvitationTransition).toBe('sequester')
    expect(chosen.tribunalInvitationAcknowledged).toBe(true)
    expect(chosen.players.find((player) => player.isUser)?.status).toBe('jury')
    const resumed = gameReducer(undefined, hydrateGame(chosen))
    expect(resumed.tribunalInvitationTransition).toBe('sequester')
    expect(gameReducer(resumed, advance()).phase).toBe(resumed.phase)
    const completed = gameReducer(resumed, completeTribunalArrival())
    expect(completed.tribunalInvitationTransition).toBeNull()
    expect(completed.tribunalInvitationAcknowledged).toBe(true)
    expect(completed.status).toBe('active')
  })

  it('locks Exit against a second choice or an arrival completion', () => {
    const exited = gameReducer(fixture(), chooseTribunalInvitation('exit'))
    expect(exited.tribunalInvitationTransition).toBe('exit')
    expect(gameReducer(exited, chooseTribunalInvitation('agree'))).toBe(exited)
    expect(gameReducer(exited, completeTribunalArrival())).toBe(exited)
    expect(gameReducer(exited, advance()).phase).toBe(exited.phase)
  })

  it('rejects choices during the return challenge and for active contestants', () => {
    const battleBack = fixture('battle_back')
    expect(gameReducer(battleBack, chooseTribunalInvitation('exit'))).toBe(battleBack)
    const active = gameReducer(undefined, { type: 'init' })
    expect(gameReducer(active, chooseTribunalInvitation('agree'))).toBe(active)
  })

  it('offers a first arrival without inventing waiting Tribunal members', () => {
    const first = fixture('first_arrival')
    expect(getTribunalMembers(first.players).map((player) => player.isUser)).toEqual([true])
  })
})

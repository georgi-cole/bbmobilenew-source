import { describe, expect, it } from 'vitest'
import type { GameHistoryEvent, Player } from '../../types'
import { recentTribunalMembers } from './recentTribunalMembers'

const juror = (id: string, extra: Partial<Player> = {}) =>
  ({ id, name: id, status: 'jury', ...extra }) as Player
const exits = (...ids: string[]): GameHistoryEvent[] =>
  ids.map((playerId) => ({ type: 'seasonExit', week: 8, timestamp: 100, data: { playerId } }))
const human = juror('user')

describe('sequester welcoming members', () => {
  it('welcomes a pending bronze exit with the latest jurors even if the finalist returned earlier', () => {
    const player = juror('returnee', { status: 'active' })
    const roster = [juror('a'), juror('b'), juror('c')]
    expect(
      recentTribunalMembers(player, roster, exits('returnee', 'a', 'b', 'c'), true).map(
        (member) => member.id
      )
    ).toEqual(['c', 'b'])
  })
  it('does not choose a roster-order subset when a legacy week-only group is ambiguous', () => {
    const player = juror('user', { evictedAtWeek: 9 })
    const tied = ['a', 'b', 'c'].map((id) => juror(id, { evictedAtWeek: 8 }))
    expect(recentTribunalMembers(player, tied, [])).toEqual([])
    expect(recentTribunalMembers(player, tied.slice(0, 2), []).map((p) => p.id)).toEqual(['a', 'b'])
    expect(
      recentTribunalMembers(
        player,
        [
          juror('latest', { evictedAtWeek: 8 }),
          juror('a', { evictedAtWeek: 7 }),
          juror('b', { evictedAtWeek: 7 }),
        ],
        []
      ).map((p) => p.id)
    ).toEqual(['latest'])
  })
  it('uses the latest two exits, independently of roster order or equal timestamps', () => {
    const roster = [juror('oldest'), juror('latest'), human, juror('previous')]
    expect(
      recentTribunalMembers(human, roster, exits('oldest', 'previous', 'latest', 'user')).map(
        (p) => p.id
      )
    ).toEqual(['latest', 'previous'])
  })
  it('shows one or no waiting members for second and first arrivals', () => {
    const roster = [human, juror('one'), juror('later')]
    expect(
      recentTribunalMembers(human, roster, exits('one', 'user', 'later')).map((p) => p.id)
    ).toEqual(['one'])
    expect(recentTribunalMembers(human, roster, exits('user', 'one', 'later'))).toEqual([])
  })
  it('uses the final exit of returnees and excludes active and non-Tribunal players', () => {
    const roster = [
      human,
      juror('returnee'),
      juror('prior'),
      juror('active', { status: 'active' }),
      juror('evicted', { status: 'evicted' }),
    ]
    expect(
      recentTribunalMembers(
        human,
        roster,
        exits('returnee', 'prior', 'active', 'evicted', 'user', 'returnee')
      ).map((p) => p.id)
    ).toEqual(['prior'])
  })
  it('falls back to stamped placement for old saves, resolving same-week exits', () => {
    const player = juror('user', { seasonPlacement: 6, evictedAtWeek: 9 })
    const roster = [
      player,
      juror('older', { seasonPlacement: 9, evictedAtWeek: 8 }),
      juror('latest', { seasonPlacement: 7, evictedAtWeek: 9 }),
      juror('previous', { seasonPlacement: 8, evictedAtWeek: 9 }),
      juror('future', { seasonPlacement: 5, evictedAtWeek: 10 }),
    ]
    expect(recentTribunalMembers(player, roster, []).map((p) => p.id)).toEqual([
      'latest',
      'previous',
    ])
  })
  it('uses earlier stamped weeks when placement/history are absent, without inventing order from the roster', () => {
    const player = juror('user', { evictedAtWeek: 9 })
    expect(
      recentTribunalMembers(
        player,
        [
          juror('older', { evictedAtWeek: 6 }),
          juror('recent', { evictedAtWeek: 8 }),
          juror('unknown'),
          juror('same-week', { evictedAtWeek: 9 }),
        ],
        []
      ).map((p) => p.id)
    ).toEqual(['recent', 'older'])
    expect(recentTribunalMembers(human, [juror('unknown')], [])).toEqual([])
  })
})

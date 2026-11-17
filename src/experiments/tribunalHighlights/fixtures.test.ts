import { describe, expect, it } from 'vitest'
import reducer, {
  chooseTribunalInvitation,
  completeTribunalArrival,
  dismissVoteResults,
  finalizePendingEviction,
} from '../../store/gameSlice'
import { isTribunalHighlightsEligible } from '../../features/tribunal/tribunalHighlights'
import { createTribunalScenario } from './fixtures'
import { resolveAvatar } from '../../utils/avatar'

describe('playable human Tribunal test scenarios', () => {
  it('preserves main roster portraits while allowing secondary views to choose their own artwork', () => {
    const game = createTribunalScenario('invitation')
    const housemates = game.players.filter((player) => !player.isUser)
    expect(housemates.length).toBeGreaterThan(0)
    for (const player of housemates) {
      expect(resolveAvatar(player)).toMatch(/assets\/skins\/[^/]+_avatar\.webp$/)
      expect(player.avatar).not.toContain('backup-grey-lux')
    }
  })

  it('uses a current catalogue identity for both the human portrait and full-body artwork', () => {
    const game = createTribunalScenario('invitation')
    const human = game.players.find((player) => player.isUser)!
    expect(human.appearance).toEqual({ kind: 'catalog', lookId: 'pc-001', revision: 1 })
    expect(decodeURIComponent(human.avatar)).toContain(
      'assets/player_characters/character 1/main.webp'
    )
    expect(game.seasonContestant?.appearanceSelection).toEqual(human.appearance)
  })

  it('uses real eviction reducers before offering the unacknowledged Tribunal choice', () => {
    const before = createTribunalScenario('your_elimination')
    const humanId = before.players.find((player) => player.isUser)!.id
    expect(before.players.find((player) => player.id === humanId)?.status).toBe('nominated')
    expect(before.pendingEviction?.evicteeId).toBe(humanId)
    expect(isTribunalHighlightsEligible(before)).toBe(false)
    const withoutTally = reducer(before, dismissVoteResults())
    const after = reducer(withoutTally, finalizePendingEviction(humanId))
    expect(after.players.find((player) => player.id === humanId)?.status).toBe('jury')
    expect(after.tribunalInvitationAcknowledged).toBe(false)
    expect(after.pendingEviction).toBeNull()
    expect(isTribunalHighlightsEligible(after)).toBe(false)
    const agreed = reducer(after, chooseTribunalInvitation('agree'))
    expect(agreed.tribunalInvitationTransition).toBe('sequester')
    const arrived = reducer(agreed, completeTribunalArrival())
    expect(isTribunalHighlightsEligible(arrived)).toBe(true)
    expect(arrived.tribunalViewingMode).toBe('highlights')
  })

  it('opens the production invitation directly and keeps Exit available', () => {
    const invitation = createTribunalScenario('invitation')
    expect(invitation.players.find((player) => player.isUser)?.status).toBe('jury')
    expect(invitation.tribunalInvitationAcknowledged).toBe(false)
    expect(invitation.pendingEviction).toBeNull()
    expect(invitation.voteResults).toBeNull()
    const exited = reducer(invitation, chooseTribunalInvitation('exit'))
    expect(exited.tribunalInvitationTransition).toBe('exit')
    expect(isTribunalHighlightsEligible(exited)).toBe(false)
  })
})

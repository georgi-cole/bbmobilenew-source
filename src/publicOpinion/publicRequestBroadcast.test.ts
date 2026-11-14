import { describe, expect, it } from 'vitest'
import { getPublicRequestCompletedBroadcast } from './publicRequestBroadcast'
import type { PublicDirection } from './types'

describe('completed public request broadcast', () => {
  const players = [{ id: 'ash', name: 'Ash' }]
  it('reports the showdown in the past tense instead of repeating the task instruction', () => {
    const direction = {
      type: 'start_drama',
      targetPlayerId: 'ash',
      description: 'Start drama with Ash',
    } as PublicDirection
    const text = getPublicRequestCompletedBroadcast(direction, players)
    expect(text).toContain('Your showdown with Ash')
    expect(text).not.toContain(direction.description)
    expect(text).not.toMatch(/approval rises|request completed/i)
  })
  it('uses the relationship story for a connection request', () => {
    expect(
      getPublicRequestCompletedBroadcast(
        { type: 'get_closer', relatedPlayerId: 'ash' } as PublicDirection,
        players
      )
    ).toContain('Your connection with Ash')
  })
  it('handles a restored request without its former player or description', () => {
    expect(getPublicRequestCompletedBroadcast(undefined, players)).not.toMatch(
      /undefined|request completed|approval rises/i
    )
  })
})

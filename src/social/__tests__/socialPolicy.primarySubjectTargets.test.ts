import { describe, expect, it } from 'vitest'
import { chooseTargetsFor } from '../SocialPolicy'

describe('SocialPolicy primary-plus-subject targeting', () => {
  const players = [
    { id: 'actor', status: 'active' },
    { id: 'human', status: 'active', isUser: true },
    { id: 'loh', status: 'loh' },
    { id: 'voter', status: 'active' },
    { id: 'nominee-a', status: 'nominated' },
    { id: 'nominee-b', status: 'nominated' },
  ]

  it('selects the role holder and a distinct contextual subject for a target pitch', () => {
    const targets = chooseTargetsFor('actor', 'pitch_target', {
      players,
      relationships: {},
      seed: 17,
    })

    expect(targets).toHaveLength(2)
    expect(targets[0]).toBe('loh')
    expect(targets[1]).not.toBe('loh')
  })

  it('keeps a vote rally aimed at a nominated subject and a separate voter', () => {
    const targets = chooseTargetsFor('actor', 'rally_votes_against', {
      players,
      relationships: {},
      seed: 23,
    })

    expect(targets).toHaveLength(2)
    expect(['nominee-a', 'nominee-b']).toContain(targets[1])
    expect(targets[0]).not.toBe(targets[1])
  })

  it('does not invent a required role holder when none is eligible', () => {
    const targets = chooseTargetsFor('actor', 'pitch_target', {
      players: players.filter((player) => player.id !== 'loh'),
      relationships: {},
      seed: 17,
    })

    expect(targets).toEqual([])
  })
})

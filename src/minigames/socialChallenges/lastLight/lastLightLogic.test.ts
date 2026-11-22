import { describe, expect, it } from 'vitest'
import {
  BALLOT_LIMIT,
  chooseAiProtection,
  collectLastLightSelections,
  createDicePicks,
  evaluateLastLightBallot,
  getLastLightDieSides,
  getDonationTargets,
  initialFlames,
  rankLastLight,
  resolveLastLightBallot,
  resolveLastLightDonations,
  rollLastLightDie,
  runLastLightSimulation,
  settleLastLightDonations,
} from './lastLightLogic'

describe('The Last Light flame donations', () => {
  it('transfers exactly one flame without changing the original standings', () => {
    const flames = { donor: 2, recipient: 1, safe: 2, eliminated: 0 }
    expect(getDonationTargets(flames, 'donor')).toEqual(['recipient'])
    expect(settleLastLightDonations(flames, { donor: 'recipient' }, 2).flames).toEqual({
      donor: 1,
      recipient: 2,
      safe: 2,
      eliminated: 0,
    })
    expect(flames.donor).toBe(2)
    expect(flames.recipient).toBe(1)
  })

  it('rejects ineligible donors and recipients', () => {
    const flames = { donor: 3, recipient: 1, safe: 2, eliminated: 0 }
    for (const recipient of ['donor', 'safe', 'eliminated', 'missing']) {
      expect(settleLastLightDonations(flames, { donor: recipient }, 2).flames).toBe(flames)
    }
    for (const donor of ['recipient', 'eliminated', 'missing']) {
      expect(getDonationTargets(flames, donor)).toEqual([])
    }
  })

  it('lets a recipient survive one subsequent loss while leaving the donor at risk', () => {
    const { flames } = settleLastLightDonations({ a: 2, b: 1, c: 3, d: 3 }, { a: 'b' }, 2)
    const ballot = resolveLastLightBallot({
      flames,
      selections: { a: 'c', b: 'd', c: 'd', d: 'c' },
      round: 2,
    })
    expect(ballot.flames).toEqual({ a: 0, b: 1, c: 3, d: 3 })
    expect(ballot.eliminated).toEqual(['a'])
  })

  it('draws one of five offers without charging the four unsuccessful donors', () => {
    const flames = { human: 3, a: 3, b: 3, c: 3, d: 3, recipient: 1 }
    const offers = {
      human: 'recipient',
      a: 'recipient',
      b: 'recipient',
      c: 'recipient',
      d: 'recipient',
    }
    const result = settleLastLightDonations(flames, offers, 2, 17)
    expect(result.flames.recipient).toBe(2)
    const donors = Object.keys(result.accepted)
    expect(donors).toHaveLength(1)
    for (const donor of Object.keys(offers))
      expect(result.flames[donor]).toBe(donor === donors[0] ? 2 : 3)
    const reversed = Object.fromEntries(Object.entries(offers).reverse())
    expect(settleLastLightDonations(flames, reversed, 2, 17)).toEqual(result)
  })

  it('lets bots send and receive gifts even when a human passes', () => {
    const flames = { human: 3, ally: 3, recipient: 1 }
    const results = Array.from({ length: 64 }, (_, seed) =>
      resolveLastLightDonations({
        flames,
        round: 2,
        seed,
        preference: () => 0.9,
        human: { id: 'human' },
      })
    )
    expect(results.some(({ accepted }) => accepted.ally === 'recipient')).toBe(true)
    expect(results.some(({ accepted }) => accepted.human)).toBe(false)
  })

  it('allows an eligible bot to send a gift to the human', () => {
    const results = Array.from({ length: 64 }, (_, seed) =>
      resolveLastLightDonations({
        flames: { human: 1, ally: 3 },
        round: 2,
        seed,
        preference: () => 0.9,
        human: { id: 'human' },
      })
    )
    expect(
      results.some(({ flames, accepted }) => flames.human === 2 && accepted.ally === 'human')
    ).toBe(true)
  })
})

describe('The Last Light ballots', () => {
  it('protects each selected contestant and applies unprotected losses simultaneously', () => {
    const ballot = resolveLastLightBallot({
      flames: { a: 3, b: 3, c: 1, d: 1, e: 2 },
      selections: { a: 'b', b: 'a', c: 'a', d: 'b', e: 'a' },
      round: 3,
    })

    expect(ballot.flames).toEqual({ a: 3, b: 3, c: 0, d: 0, e: 1 })
    expect(ballot.eliminated).toEqual(['c', 'd'])
    expect(evaluateLastLightBallot(ballot)).toEqual({ kind: 'dice', finalists: ['a', 'b'] })
    expect(rankLastLight('a', ballot.flames, [ballot.eliminated])).toEqual([
      ['a'],
      ['b'],
      ['e'],
      ['c', 'd'],
    ])
  })

  it('replaces missing, self-directed and eliminated-target votes with other active targets', () => {
    const ballot = resolveLastLightBallot({
      flames: { a: 2, b: 2, c: 1, d: 1, eliminated: 0 },
      selections: { a: 'a', b: 'eliminated', d: 'c', eliminated: 'b' },
      round: 4,
      seed: 10,
    })

    expect(Object.keys(ballot.votes)).toEqual(['a', 'b', 'c', 'd'])
    expect(new Set(Object.values(ballot.votes)).size).toBeGreaterThanOrEqual(2)
    for (const [voter, target] of Object.entries(ballot.votes)) {
      expect(target).not.toBe(voter)
      expect(target).not.toBe('eliminated')
    }
  })

  it('preserves a last survivor if an exceptional ballot would extinguish all flames', () => {
    const ballot = resolveLastLightBallot({ flames: { a: 1 }, selections: {}, round: 2 })

    expect(ballot.preventedWipe).toBe(true)
    expect(ballot.eliminated).toEqual([])
    expect(evaluateLastLightBallot(ballot)).toEqual({ kind: 'winner', winnerId: 'a' })
  })

  it('rejects a consecutive pick and filters timeout choices by each voter’s last ballot', () => {
    const previousVotes = { a: 'b', b: 'a', c: 'd', d: 'a' }
    const ballot = resolveLastLightBallot({
      flames: initialFlames(['a', 'b', 'c', 'd']),
      selections: { a: 'b', c: 'c', d: 'b' },
      previousVotes,
      round: 2,
      seed: 37,
    })

    expect(Object.keys(ballot.votes)).toHaveLength(4)
    expect(ballot.votes.d).toBe('b')
    for (const [voter, target] of Object.entries(ballot.votes)) {
      expect(target).not.toBe(voter)
      expect(target).not.toBe(previousVotes[voter as keyof typeof previousVotes])
    }
  })

  it('leaves a ballot blank when there is no eligible target, and allows an older pick again', () => {
    const flames = { a: 3, b: 2 }
    const blocked = resolveLastLightBallot({
      flames,
      previousVotes: { a: 'b', b: 'a' },
      selections: { a: 'b', b: 'a' },
      round: 2,
    })
    const available = resolveLastLightBallot({
      flames,
      previousVotes: blocked.votes,
      selections: { a: 'b', b: 'a' },
      round: 3,
    })

    expect(blocked.votes).toEqual({})
    expect(available.votes).toEqual({ a: 'b', b: 'a' })
  })

  it('excludes a repeat from both the weighted and the random bot choice', () => {
    const active = ['a', 'b', 'c']
    for (let seed = 0; seed < 128; seed += 1) {
      expect(
        chooseAiProtection({
          actor: 'a',
          active,
          flames: initialFlames(active),
          previousVotes: { a: 'b' },
          round: 2,
          seed,
          preference: (_, target) => (target === 'b' ? 1 : -1),
        })
      ).toBe('c')
    }
  })

  it('counts an all-safe ballot and breaks ties at the ballot limit', () => {
    const ballot = resolveLastLightBallot({
      flames: initialFlames(['a', 'b', 'c', 'd', 'e']),
      selections: { a: 'b', b: 'c', c: 'd', d: 'e', e: 'a' },
      round: BALLOT_LIMIT,
    })

    expect(ballot.savedEveryone).toBe(true)
    expect(evaluateLastLightBallot(ballot)).toEqual({
      kind: 'dice',
      finalists: ['a', 'b', 'c', 'd', 'e'],
    })
  })

  it('plays on with a clear lead at three but decides a clear lead at two', () => {
    const three = resolveLastLightBallot({
      flames: { a: 3, b: 2, c: 1 },
      selections: { a: 'b', b: 'c', c: 'a' },
      round: 4,
    })
    const two = resolveLastLightBallot({
      flames: { a: 3, b: 2 },
      selections: {},
      round: 5,
    })

    expect(evaluateLastLightBallot(three)).toEqual({ kind: 'next-ballot' })
    expect(evaluateLastLightBallot(two)).toEqual({ kind: 'winner', winnerId: 'a' })
  })

  it('weighs affinity and suspicion without guaranteeing the preferred target', () => {
    const active = ['a', 'b', 'c', 'd', 'e']
    const contributions = Array.from({ length: 256 }, (_, seed) =>
      chooseAiProtection({
        actor: 'a',
        active,
        flames: initialFlames(active),
        previousVotes: {},
        round: 1,
        seed,
        preference: (_, target) => (target === 'b' ? 1 : target === 'c' ? -1 : 0),
      })
    )

    const protectedCount = (id: string) => contributions.filter((target) => target === id).length
    expect(protectedCount('b')).toBeGreaterThan(protectedCount('c') * 2)
    expect(protectedCount('c')).toBeGreaterThan(0)
    expect(protectedCount('a')).toBe(0)
  })

  it('commits AI protection independently of the current human vote', () => {
    const snapshot = {
      flames: initialFlames(['a', 'b', 'c', 'd', 'e']),
      previousVotes: { a: 'b', b: 'a' },
      preference: () => 0,
      round: 2,
      seed: 42,
    }
    const first = collectLastLightSelections({ ...snapshot, human: { id: 'a', target: 'c' } })
    const second = collectLastLightSelections({ ...snapshot, human: { id: 'a', target: 'd' } })

    expect(first).toEqual({ ...second, a: 'c' })
  })
})

describe('The Last Light dice finale', () => {
  it('preserves the human pick and assigns all eight contestants their own face', () => {
    const finalists = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const picks = createDicePicks({ finalists, human: 'a', face: 8, seed: 4, round: 8 })

    expect(getLastLightDieSides(finalists.length)).toBe(8)
    expect(picks.a).toBe(8)
    expect(Object.values(picks).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    const roll = rollLastLightDie(picks, 0, 8, 4)
    expect(picks[roll.winnerId!]).toBe(roll.face)
  })

  it('keeps unclaimed rolls neutral in the regular shared six-sided finale', () => {
    const picks = { a: 3, b: 5 }
    const rolls = Array.from({ length: 30 }, (_, index) => rollLastLightDie(picks, index, 4, 12))

    expect(rolls.some((roll) => roll.winnerId === undefined)).toBe(true)
    expect(rolls.some((roll) => roll.winnerId === 'a')).toBe(true)
    expect(rolls.some((roll) => roll.winnerId === 'b')).toBe(true)
    for (const { face, winnerId } of rolls) {
      expect(winnerId).toBe(face === 3 ? 'a' : face === 5 ? 'b' : undefined)
    }
  })

  it.each([5, 6, 7, 8])(
    'resolves a complete deterministic standings list for %i players',
    (count) => {
      const participants = Array.from({ length: count }, (_, index) => `p${index}`)
      const settings = { participants, seed: 300 }
      const result = runLastLightSimulation(settings)

      expect(result).toEqual(runLastLightSimulation(settings))
      expect(result.rankedGroups[0]).toHaveLength(1)
      expect(result.rankedGroups.flat().sort()).toEqual(participants)
      expect(Object.keys(result.rawResults).sort()).toEqual(participants)
    }
  )
})

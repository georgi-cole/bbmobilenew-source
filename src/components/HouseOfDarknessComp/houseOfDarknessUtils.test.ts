import { describe, expect, it } from 'vitest'
import {
  HOUSE_OF_DARKNESS_MAX_CURSE_CHARGES,
  applyHouseOfDarknessMistakes,
  getHouseOfDarknessCharmOffers,
  getHouseOfDarknessMistakeDamage,
  getHouseOfDarknessPairCount,
  recoverHouseOfDarknessHealth,
} from './houseOfDarknessUtils'
import { simulateHouseOfDarknessAiMemory } from './houseOfDarknessAiBalance'

const damageParams = {
  health: 100,
  sessionSeed: 424242,
  playerId: 'player-a',
  round: 3,
  mistakeStartIndex: 0,
  mistakeCount: 4,
}

describe('Deck of Darkness edge cases', () => {
  it('keeps one seeded charm offer set for every contestant and respects round eligibility', () => {
    const context = {
      aliveCount: 4,
      lowHealthPresent: true,
      queuedCursePresent: true,
      mode: 'endless' as const,
      round: 5,
    }
    const first = getHouseOfDarknessCharmOffers(19, 5, context).map(({ id }) => id)
    const replay = getHouseOfDarknessCharmOffers(19, 5, context).map(({ id }) => id)
    expect(first).toEqual(replay)
    expect(new Set(first).size).toBe(3)
    expect(first).toContain('last-chance')
    expect(
      Array.from({ length: 32 }, (_, seed) =>
        getHouseOfDarknessCharmOffers(seed, 5, context).some(({ id }) => id === 'curse')
      ).some(Boolean)
    ).toBe(true)
    expect(
      getHouseOfDarknessCharmOffers(19, 6, { ...context, mode: 'depth', round: 6 }).some(
        ({ id }) => id === 'curse'
      )
    ).toBe(false)
    expect(
      getHouseOfDarknessCharmOffers(19, 5, { ...context, aliveCount: 5 }).some(
        ({ id }) => id === 'curse'
      )
    ).toBe(false)
    expect(
      getHouseOfDarknessCharmOffers(19, 5, { ...context, lowHealthPresent: false }).some(
        ({ id }) => id === 'last-chance'
      )
    ).toBe(false)
    expect(HOUSE_OF_DARKNESS_MAX_CURSE_CHARGES).toBe(4)
  })

  it('blocks only the first two mistakes and never reduces a hit below one', () => {
    const plain = applyHouseOfDarknessMistakes(damageParams)
    const shielded = applyHouseOfDarknessMistakes({ ...damageParams, shieldBlocks: 2 })
    expect(shielded.shieldBlocksConsumed).toBe(2)
    expect(shielded.blockedDamage).toBeGreaterThan(0)
    expect(shielded.damage).toBe(plain.damage - shielded.blockedDamage)

    const oneHealthShield = applyHouseOfDarknessMistakes({
      ...damageParams,
      health: 1,
      mistakeCount: 1,
      shieldBlocks: 2,
    })
    expect(oneHealthShield.health).toBe(0)
    expect(oneHealthShield.damage).toBe(1)
  })

  it('consumes one +4 Curse charge per error, capped by the charges actually queued', () => {
    const plain = applyHouseOfDarknessMistakes({ ...damageParams, mistakeCount: 3 })
    const cursed = applyHouseOfDarknessMistakes({
      ...damageParams,
      mistakeCount: 3,
      curseCharges: 2,
    })
    expect(cursed.curseChargesConsumed).toBe(2)
    expect(cursed.damage - plain.damage).toBe(8)

    const overcharged = applyHouseOfDarknessMistakes({
      ...damageParams,
      mistakeCount: 3,
      curseCharges: 9,
    })
    expect(overcharged.curseChargesConsumed).toBe(3)
  })

  it('allows one lethal Last Chance and prevents all recovery after it triggers', () => {
    const lethalHit = getHouseOfDarknessMistakeDamage(424242, 'player-a', 3, 0)
    const singleSave = applyHouseOfDarknessMistakes({
      ...damageParams,
      health: lethalHit,
      mistakeCount: 1,
      lastChanceAvailable: true,
    })
    expect(singleSave.lastChanceUsed).toBe(true)
    expect(singleSave.lethalMistakeIndex).toBeNull()
    expect(singleSave.health).toBe(1)
    expect(
      recoverHouseOfDarknessHealth(singleSave.health, singleSave.damage, true, 14, false)
    ).toBe(1)

    const secondLethalStillEndsTheRun = applyHouseOfDarknessMistakes({
      ...damageParams,
      health: lethalHit,
      mistakeCount: 2,
      lastChanceAvailable: true,
    })
    expect(secondLethalStillEndsTheRun.lastChanceUsed).toBe(true)
    expect(secondLethalStillEndsTheRun.lethalMistakeIndex).toBe(1)
    expect(secondLethalStillEndsTheRun.health).toBe(0)

    const alreadySpent = applyHouseOfDarknessMistakes({
      ...damageParams,
      health: lethalHit,
      mistakeCount: 1,
      lastChanceAvailable: true,
      lastChanceAlreadyUsed: true,
    })
    expect(alreadySpent.lastChanceUsed).toBe(false)
    expect(alreadySpent.health).toBe(0)
  })

  it('caps healing and keeps Endless boards at eight pairs', () => {
    expect(recoverHouseOfDarknessHealth(96, 10, true, 14)).toBe(100)
    expect(recoverHouseOfDarknessHealth(0, 80, false, 14)).toBe(0)
    expect(getHouseOfDarknessPairCount(6)).toBe(8)
    expect(getHouseOfDarknessPairCount(50)).toBe(8)
  })

  it('grants Darkness AI a private reveal only when it chooses Peek', () => {
    const simulation = {
      playerId: 'ai-darkness',
      round: 4,
      pairCount: 7,
      tournamentSeed: 8080,
      sessionAbility: 43,
    }
    const peek = simulateHouseOfDarknessAiMemory({ ...simulation, charm: 'peek' })
    expect(peek.toolOutcome).toBe('Peeked privately')

    for (const charm of ['heal', 'shield', 'bargain', 'curse', 'cleanse', 'last-chance'] as const) {
      const result = simulateHouseOfDarknessAiMemory({ ...simulation, charm })
      expect(result.toolOutcome).not.toBe('Peeked privately')
      expect(result.completedPairs).toBeGreaterThanOrEqual(0)
      expect(result.completedPairs).toBeLessThanOrEqual(simulation.pairCount)
    }
  })
})

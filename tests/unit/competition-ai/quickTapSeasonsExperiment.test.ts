import { describe, expect, it } from 'vitest'
import {
  SEASONS,
  SEASONS_STANDALONE_AI_FIELD,
  buildSeasonSchedule,
  rerollSeason,
  simulateSeasonsAiScore,
  simulateSeasonsAiField,
  simulateSeasonsStrategicPlayer,
} from '../../../src/experiments/quickTapSeasons/quickTapSeasons'
import { simulateMinigameAiScore } from '../../../src/ai/competition'
import { assignAiGameIdentities } from '../../../src/ai/aiGameIdentity'
import { getGame } from '../../../src/minigames/registryBase'

describe('Quick Tap Race 2: Seasons', () => {
  it('changes to a different season every eight seconds', () => {
    const schedule = buildSeasonSchedule(42)
    expect(schedule.map((change) => change.at)).toEqual([0, 8, 16, 24, 32])
    for (let index = 1; index < schedule.length; index += 1)
      expect(schedule[index].season).not.toBe(schedule[index - 1].season)
  })
  it('uses the requested multipliers', () => {
    expect([
      SEASONS.winter.multiplier,
      SEASONS.summer.multiplier,
      SEASONS.autumn.multiplier,
      SEASONS.spring.multiplier,
    ]).toEqual([-1, 0.5, 1, 1.25])
  })
  it('mystery boxes always select another season', () => {
    for (let seed = 1; seed <= 100; seed += 1)
      expect(rerollSeason(seed, 0, 'winter')).not.toBe('winter')
  })
  it('creates a deterministic three-AI field', () => {
    expect(simulateSeasonsAiField(7)).toEqual(simulateSeasonsAiField(7))
    expect(simulateSeasonsAiField(7)).toHaveLength(3)
  })
  it('models both deliberate season changes and occasional accidental taps', () => {
    const runs = Array.from({ length: 20 }, (_, index) => simulateSeasonsAiField(index + 1)).flat()
    expect(runs.some((run) => run.manualSeasonChanges > 0)).toBe(true)
    expect(runs.some((run) => run.accidentalTaps > 0)).toBe(true)
  })
  it('uses the same AI scores in the standalone and hosted paths', () => {
    const seed = 2718
    const standalone = simulateSeasonsAiField(seed)

    for (const entry of SEASONS_STANDALONE_AI_FIELD) {
      const standaloneScore = standalone.find((opponent) => opponent.id === entry.id)?.score
      const hostedScore = simulateMinigameAiScore({
        gameKey: 'quickTapSeasons',
        seed,
        playerId: entry.id,
        profile: entry.profile,
      })
      expect(standaloneScore).toBe(
        simulateSeasonsAiScore({
          seed,
          playerId: entry.id,
          profile: entry.profile,
        })
      )
      expect(hostedScore).toBe(standaloneScore)
    }
  })
  it('preserves Quick Tap Seasons identity-adjusted scores above 320', () => {
    const seed = 20260802
    const roster = Array.from({ length: 15 }, (_, index) => ({
      id: `ai-${index}`,
      isUser: false,
    }))
    const identifiedRoster = assignAiGameIdentities(roster, seed, 'classic')
    const scores = identifiedRoster.map((player, participantIndex) =>
      simulateMinigameAiScore({
        gameKey: 'quickTapSeasons',
        seed,
        playerId: player.id,
        participantIndex,
        aiGameIdentity: player.aiGameIdentity,
        identityMode: 'classic',
      })
    )

    expect(scores.some((score) => score > 320)).toBe(true)
    expect(new Set(scores).size).toBeGreaterThan(8)
  })
  it('benchmarks modelled 10-taps/second strategic play over 1,000 seeds', () => {
    const wins = { threeAverageAis: 0, elevenAverageAis: 0 }
    const profile = {
      overall: 50,
      physical: 50,
      mental: 50,
      precision: 50,
      nerve: 50,
      consistency: 50,
      clutch: 50,
      chokeRisk: 50,
      luck: 50,
    }

    for (let seed = 1; seed <= 1000; seed += 1) {
      const humanScore = simulateSeasonsStrategicPlayer(seed).score
      const standaloneScores = simulateSeasonsAiField(seed).map((opponent) => opponent.score)
      const additionalAverageScores = Array.from({ length: 8 }, (_, index) =>
        simulateSeasonsAiScore({
          seed,
          playerId: `additional-average-ai-${index + 1}`,
          profile,
        })
      )
      const aiScores = [...standaloneScores, ...additionalAverageScores]
      if (humanScore > Math.max(...standaloneScores)) wins.threeAverageAis += 1
      if (humanScore > Math.max(...aiScores)) wins.elevenAverageAis += 1
    }

    // These are synthetic model outputs, not measured human win rates.
    // The wider 8.9–13 taps/s field now challenges the synthetic 10-taps/s player.
    expect(wins.threeAverageAis / 10).toBeGreaterThanOrEqual(10)
    expect(wins.threeAverageAis / 10).toBeLessThanOrEqual(25)
    expect(wins.elevenAverageAis / 10).toBeGreaterThanOrEqual(0.2)
    expect(wins.elevenAverageAis / 10).toBeLessThanOrEqual(5)
  })
  it('keeps hidden timing and reroll mechanics out of player-facing rules', () => {
    const rules = getGame('quickTapSeasons')?.instructions.join(' ').toLowerCase() ?? ''
    expect(rules).not.toContain('8 seconds')
    expect(rules).not.toContain('reroll')
    expect(rules).not.toContain('only')
  })
})

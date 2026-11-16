import { describe, expect, it } from 'vitest'
import {
  SEASONS,
  SEASONS_STANDALONE_AI_FIELD,
  buildSeasonSchedule,
  rerollSeason,
  simulateSeasonsAiScore,
  simulateSeasonsAiField,
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
  it('preserves identity-adjusted score variety across a full roster', () => {
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

    expect(scores.some((score) => score > 100)).toBe(true)
    expect(new Set(scores).size).toBeGreaterThan(8)
  })
  it('keeps motor pace varied and within the tuned sustained cadence range', () => {
    const runs = Array.from({ length: 200 }, (_, index) => simulateSeasonsAiField(index + 1)).flat()
    const tapsPerSecond = runs.map((run) => run.tapAttempts / 40)
    const mean = tapsPerSecond.reduce((sum, value) => sum + value, 0) / tapsPerSecond.length

    expect(Math.min(...tapsPerSecond)).toBeGreaterThan(5)
    expect(Math.max(...tapsPerSecond)).toBeLessThan(9)
    expect(mean).toBeGreaterThan(6.5)
    expect(mean).toBeLessThan(8.2)
  })
  it('keeps hidden timing and reroll mechanics out of player-facing rules', () => {
    const rules = getGame('quickTapSeasons')?.instructions.join(' ').toLowerCase() ?? ''
    expect(rules).not.toContain('8 seconds')
    expect(rules).not.toContain('reroll')
    expect(rules).not.toContain('only')
  })
})

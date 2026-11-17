import { describe, expect, it } from 'vitest'
import {
  getDefaultCompetitionProfile,
  getCompetitionSeasonModifiers,
  simulateAiPerformance,
  simulateMinigameAiScore,
} from '../../ai/competition'
import { competitionIdentityMultiplier, type AiGameIdentity } from '../../ai/aiGameIdentity'
import { PLANK_REFERENCE_CONTROLLERS, simulatePressurePlankRun } from './pressurePlankAi'
import {
  PressurePlankEngine,
  replayPressurePlankActions,
  type PlankAction,
} from './pressurePlankEngine'

describe('Pressure Plank action parity', () => {
  it('keeps the world independent of rendering cadence, including a suspended frame', () => {
    const actions: PlankAction[] = Array.from({ length: 30 }, (_, i) => ({
      atMs: 500 + i * 811,
      direction: i % 2 ? 1 : -1,
    }))
    for (const frameMs of [8, 16, 33, 250, 4_000]) {
      const engine = new PressurePlankEngine(42)
      let nextAction = 0
      for (let time = 0; time <= 30_000; time += frameMs) {
        while (nextAction < actions.length && actions[nextAction].atMs <= time) {
          const action = actions[nextAction++]
          engine.tap(action.direction, action.atMs)
        }
        engine.advance(time)
      }
      expect(engine.advance(30_000)).toEqual(replayPressurePlankActions(42, actions, 30_000))
    }
  })

  it('replays reference and runtime opponent inputs into exactly the same final state', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const controller of [undefined, ...Object.values(PLANK_REFERENCE_CONTROLLERS)]) {
        const run = simulatePressurePlankRun({ seed, playerId: 'reference', controller })
        expect(replayPressurePlankActions(seed, run.actions)).toEqual(run.final)
        expect(run.score).toBe(run.final.elapsedMs / 1000)
        expect(run.final.status).not.toBe('active')
      }
    }
  })

  it('rejects invalid, stale and terminal inputs without changing the world', () => {
    const engine = new PressurePlankEngine(12)
    const snapshot = engine.advance(100)
    expect(engine.tap(-1, -10)).toEqual(snapshot)
    expect(engine.tap(1, Number.NaN)).toEqual(snapshot)
    expect(engine.advance(0)).toEqual(snapshot)
    const final = engine.advance(120_000)
    expect(final.status).not.toBe('active')
    expect(engine.tap(1, 120_001)).toEqual(final)
  })

  it('rewards faster, more accurate control across independent worlds', () => {
    const medians = Object.values(PLANK_REFERENCE_CONTROLLERS).map((controller) => {
      const scores = Array.from(
        { length: 32 },
        (_, seed) => simulatePressurePlankRun({ seed, playerId: 'reference', controller }).score
      ).sort((a, b) => a - b)
      return scores[16]
    })
    expect(medians[0]).toBeLessThan(medians[1])
    expect(medians[1]).toBeLessThan(medians[2])
    expect(medians[2]).toBeLessThanOrEqual(medians[3])
  })

  it('uses native survival seconds through both competition dispatchers', () => {
    const profile = getDefaultCompetitionProfile()
    for (const playerId of ['p0', 'p1', 'p2']) {
      for (let seed = 0; seed < 8; seed++) {
        const expected = simulatePressurePlankRun({ seed, playerId, profile }).score
        expect(
          simulateAiPerformance({ minigameKey: 'pressurePlank', seed, playerId, profile })
        ).toBe(expected)
        expect(simulateMinigameAiScore({ gameKey: 'pressurePlank', seed, playerId, profile })).toBe(
          expected
        )
      }
    }
  })

  it('applies season and identity effects to actions before scoring in all four modes', () => {
    const identity: AiGameIdentity = {
      archetype: 'clutch_competitor',
      temperament: 'calm',
      competitionDrive: 1,
      emotionalVolatility: 0.2,
      audienceFocus: 0.5,
      survivalFocus: 0.9,
    }
    const seasonState = { form: 4, confidence: 2, fatigue: 1 }
    const adjustment = getCompetitionSeasonModifiers(seasonState).totalAdjustment * 100
    for (const mode of ['classic', 'cupid', 'vox_populi', 'survival'] as const) {
      for (let seed = 0; seed < 8; seed++) {
        const playerId = 'native-inputs'
        const profile = getDefaultCompetitionProfile()
        const multiplier = competitionIdentityMultiplier(identity, mode, seed, playerId)
        const adjusted = {
          ...profile,
          precision: profile.precision * multiplier,
          consistency: profile.consistency * multiplier,
        }
        for (const key of Object.keys(adjusted) as Array<keyof typeof adjusted>)
          adjusted[key] = Math.min(100, Math.max(0, (adjusted[key] ?? 50) + adjustment))
        const run = simulatePressurePlankRun({ seed, playerId, profile: adjusted })
        expect(
          simulateMinigameAiScore({
            gameKey: 'pressurePlank',
            seed,
            playerId,
            profile,
            seasonState,
            aiGameIdentity: identity,
            identityMode: mode,
          })
        ).toBe(run.score)
        expect(run.score).toBeLessThanOrEqual(120)
      }
    }
  })
})

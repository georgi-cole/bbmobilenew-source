import { test } from './support/test'
import { defaultSimulationConfig, runSeasonSimulation } from './season-sim/runner'
import type { SimulationSkill } from './season-sim/types'

const PERSONA_IDS = [
  'strategic-operator',
  'social-butterfly',
  'loyalist',
  'betrayer-snake',
  'lone-wolf',
  'competition-beast',
  'competition-thrower',
  'floater',
  'chaos-agent',
  'risk-averse',
  'resource-hoarder',
  'resource-spender',
  'romantic',
  'villain',
  'exploit-breaker',
] as const

function calibrationCount(): number {
  const raw = process.env.EYEOLEAN_CALIBRATION_COUNT
  if (!raw) return PERSONA_IDS.length
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) {
    throw new Error('EYEOLEAN_CALIBRATION_COUNT must be an integer from 1 to 5000; received ' + raw)
  }
  return parsed
}

function mixSeed(index: number, salt: number): number {
  let value = (index + 1) ^ salt
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b)
  return (value ^ (value >>> 16)) >>> 0
}

function skillForPersona(personaId: string, index: number): SimulationSkill {
  if (personaId === 'competition-beast') return 'competent'
  if (personaId === 'competition-thrower') return 'thrower'
  const rotation: readonly SimulationSkill[] = ['competent', 'mediocre', 'thrower']
  return rotation[index % rotation.length]
}

const count = calibrationCount()

test.describe('Eyeolean economy calibration @eyeolean-calibration', () => {
  for (let index = 0; index < count; index += 1) {
    const personaId = PERSONA_IDS[index % PERSONA_IDS.length]
    const seeds = {
      roster: mixSeed(index, 0x4f1bbcdc),
      season: mixSeed(index, 0x6d2b79f5),
      actor: mixSeed(index, 0x7a11ce42),
    }

    test(
      'completed season sample ' + (index + 1) + ' · ' + personaId,
      async ({ page }, testInfo) => {
        test.setTimeout(60 * 60_000)
        const config = defaultSimulationConfig({
          id: 'eyeolean-calibration-' + String(index + 1).padStart(4, '0') + '-' + personaId,
          personaId,
          seeds,
          maxActions: 1200,
          maxDays: 60,
          competitionSkill: skillForPersona(personaId, index),
          captureFinalScreenshot: false,
          compactEconomyReport: true,
        })

        await runSeasonSimulation(page, testInfo, config)
        // Economy calibration intentionally keeps completed samples even when the
        // generic simulator reports a non-fatal finding. The JSON report carries
        // those findings and the aggregator excludes samples with error severity.
        await page.goto('about:blank')
      }
    )
  }
})

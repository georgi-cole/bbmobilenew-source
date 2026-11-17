import type { CompetitionSkillProfile } from '../../ai/competition/types'
import { getDefaultCompetitionProfile } from '../../ai/competition'
import {
  PLANK_REFERENCE_CONTROLLERS,
  simulatePressurePlankRun,
} from '../../components/PressurePlank/pressurePlankAi'
import {
  replayPressurePlankActions,
  type PlankAction,
} from '../../components/PressurePlank/pressurePlankEngine'
import { TAP_REFERENCE_MOTORS } from '../../minigames/quickTapRace/tapMotor'
import {
  replayQuickTapVipActions,
  simulateQuickTapVipAiRace,
  type QuickTapVipAction,
  type QuickTapVipMode,
} from '../../minigames/quickTapRace/vip/quickTapVipLogic'

export type CalibrationGame = 'quickTapVipRace' | 'quickTapVipSeasons' | 'pressurePlank'
export interface CalibrationResult {
  score: number
  rawTaps?: number
}
export interface CalibrationVersion {
  name: string
  simulate(
    game: CalibrationGame,
    seed: number,
    playerId: string,
    profile: CompetitionSkillProfile
  ): CalibrationResult
}
export interface Distribution {
  p10: number
  median: number
  p90: number
}
export interface CalibrationTrace {
  game: CalibrationGame
  seed: number
  reference: string
  score: number
  actions: QuickTapVipAction[] | PlankAction[]
}
export interface CalibrationRow {
  game: CalibrationGame
  version: string
  profile: string
  roster: number
  reference: string
  samples: number
  referenceScore: Distribution
  bestOpponentScore: Distribution
  margin: Distribution
  relativeMargin: Distribution
  strictWinRate: number
  topTieRate: number
}
export interface CalibrationReport {
  seeds: number[]
  rosters: number[]
  simulatedOpponents: number
  verifiedReplays: number
  parityFailures: string[]
  fields: Array<{
    game: CalibrationGame
    version: string
    profile: string
    scores: Distribution
    taps?: Distribution
    capRate?: number
  }>
  rows: CalibrationRow[]
  examples: CalibrationTrace[]
}

export function replayCalibrationTrace(trace: CalibrationTrace): CalibrationResult {
  if (!Number.isInteger(trace.seed) || !Array.isArray(trace.actions))
    throw new Error('Invalid action trace')
  if (trace.game === 'pressurePlank')
    return {
      score:
        replayPressurePlankActions(trace.seed, trace.actions as PlankAction[]).elapsedMs / 1000,
    }
  if (trace.game !== 'quickTapVipRace' && trace.game !== 'quickTapVipSeasons')
    throw new Error('Unknown action trace game')
  const replay = replayQuickTapVipActions(
    trace.seed,
    trace.game === 'quickTapVipRace' ? 'race' : 'seasons',
    trace.actions as QuickTapVipAction[]
  )
  return { score: replay.score, rawTaps: replay.rawTaps }
}

export function distribution(values: readonly number[]): Distribution {
  if (!values.length || values.some((value) => !Number.isFinite(value)))
    throw new Error('Calibration requires finite nonempty samples')
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)]
  return { p10: percentile(0.1), median: percentile(0.5), p90: percentile(0.9) }
}

export const ACTION_CALIBRATION_VERSION: CalibrationVersion = {
  name: 'candidate',
  simulate(game, seed, playerId, profile) {
    return game === 'pressurePlank'
      ? simulatePressurePlankRun({ seed, playerId, profile })
      : simulateQuickTapVipAiRace({
          seed,
          playerId,
          profile,
          mode: game === 'quickTapVipRace' ? 'race' : 'seasons',
        })
  },
}

/** Diagnostic reference behaviours are deliberately explicit. These are not
 * measurements of average humans and no win-rate quota changes runtime scores.
 */
export function runActionCalibration(args: {
  seeds: number[]
  rosters?: number[]
  baselines?: CalibrationVersion[]
  onProgress?: (label: string) => void
}): CalibrationReport {
  const { seeds } = args
  const rosters = args.rosters ?? [2, 6, 12, 16]
  if (
    !seeds.length ||
    seeds.some((seed) => !Number.isInteger(seed)) ||
    !rosters.length ||
    rosters.some((n) => !Number.isInteger(n) || n < 2 || n > 32)
  )
    throw new Error('Use integer seeds and roster sizes 2..32')
  const versions = [...(args.baselines ?? []), ACTION_CALIBRATION_VERSION]
  const profiles: Record<string, CompetitionSkillProfile> = {}
  for (const [name, value] of Object.entries({ developing: 30, neutral: 50, skilled: 75 })) {
    const profile = getDefaultCompetitionProfile()
    for (const key of Object.keys(profile) as Array<keyof CompetitionSkillProfile>)
      profile[key] = value
    profiles[name] = profile
  }
  const report: CalibrationReport = {
    seeds,
    rosters,
    simulatedOpponents: 0,
    verifiedReplays: 0,
    parityFailures: [],
    fields: [],
    rows: [],
    examples: [],
  }
  const maxOpponents = Math.max(...rosters) - 1
  for (const game of ['quickTapVipRace', 'quickTapVipSeasons', 'pressurePlank'] as const) {
    const referenceNames =
      game === 'pressurePlank'
        ? Object.keys(PLANK_REFERENCE_CONTROLLERS)
        : Object.keys(TAP_REFERENCE_MOTORS)
    const referenceScores = new Map<number, Record<string, number>>()
    for (const seed of seeds) {
      const scores: Record<string, number> = {}
      for (const name of referenceNames) {
        let score: number
        let actions: QuickTapVipAction[] | PlankAction[]
        let parity: boolean
        if (game === 'pressurePlank') {
          const run = simulatePressurePlankRun({
            seed,
            playerId: 'reference',
            controller: PLANK_REFERENCE_CONTROLLERS[name],
          })
          const replay = replayPressurePlankActions(seed, run.actions)
          score = run.score
          actions = run.actions
          parity = JSON.stringify(replay) === JSON.stringify(run.final)
        } else {
          const mode: QuickTapVipMode = game === 'quickTapVipRace' ? 'race' : 'seasons'
          const run = simulateQuickTapVipAiRace({
            seed,
            playerId: 'reference',
            profile: getDefaultCompetitionProfile(),
            mode,
            motor: TAP_REFERENCE_MOTORS[name],
          })
          const replay = replayQuickTapVipActions(seed, mode, run.actions)
          score = run.score
          actions = run.actions
          parity =
            replay.score === score &&
            replay.rawTaps === run.rawTaps &&
            JSON.stringify(replay.roundScores) === JSON.stringify(run.roundScores)
        }
        scores[name] = score
        report.verifiedReplays++
        if (!parity) report.parityFailures.push(`${game}/${seed}/${name}`)
        if (seed === seeds[0]) report.examples.push({ game, seed, reference: name, score, actions })
      }
      // Screenshot anchors are fixed observations, not tuning targets or invented action traces.
      if (game === 'pressurePlank') scores['observed 97.780s'] = 97.78
      if (game === 'quickTapVipSeasons') scores['observed 1063.63'] = 1063.63
      referenceScores.set(seed, scores)
    }
    for (const [profileName, profile] of Object.entries(profiles)) {
      for (const version of versions) {
        args.onProgress?.(`${game}: ${profileName} / ${version.name}`)
        const fields = seeds.map((seed) =>
          Array.from({ length: maxOpponents }, (_, i) => {
            const playerId = `contestant-${seed}-${i}`
            report.simulatedOpponents++
            const run = version.simulate(game, seed, playerId, profile)
            if (!Number.isFinite(run.score))
              throw new Error(`Nonfinite score: ${game}/${version.name}/${seed}/${playerId}`)
            // Verify every runtime opponent, as well as the reference agents.
            if (version === ACTION_CALIBRATION_VERSION) {
              report.verifiedReplays++
              if (game === 'pressurePlank') {
                const actual = run as ReturnType<typeof simulatePressurePlankRun>
                if (replayPressurePlankActions(seed, actual.actions).elapsedMs / 1000 !== run.score)
                  report.parityFailures.push(`${game}/${seed}/${playerId}`)
              } else {
                const actual = run as ReturnType<typeof simulateQuickTapVipAiRace>
                const replay = replayQuickTapVipActions(
                  seed,
                  game === 'quickTapVipRace' ? 'race' : 'seasons',
                  actual.actions
                )
                if (replay.score !== run.score || replay.rawTaps !== run.rawTaps)
                  report.parityFailures.push(`${game}/${seed}/${playerId}`)
              }
            }
            return { score: run.score, rawTaps: run.rawTaps }
          })
        )
        const flat = fields.flat()
        report.fields.push({
          game,
          version: version.name,
          profile: profileName,
          scores: distribution(flat.map((run) => run.score)),
          ...(game === 'pressurePlank'
            ? { capRate: flat.filter((run) => run.score === 120).length / flat.length }
            : { taps: distribution(flat.map((run) => run.rawTaps!)) }),
        })
        for (const roster of rosters) {
          const best = fields.map((field) =>
            Math.max(...field.slice(0, roster - 1).map((run) => run.score))
          )
          for (const name of Object.keys(referenceScores.get(seeds[0])!)) {
            const scores = seeds.map((seed) => referenceScores.get(seed)![name])
            const margins = scores.map((score, i) => score - best[i])
            report.rows.push({
              game,
              version: version.name,
              profile: profileName,
              roster,
              reference: name,
              samples: seeds.length,
              referenceScore: distribution(scores),
              bestOpponentScore: distribution(best),
              margin: distribution(margins),
              relativeMargin: distribution(
                margins.map((value, i) => value / Math.max(1, Math.abs(best[i])))
              ),
              strictWinRate: margins.filter((margin) => margin > 0).length / seeds.length,
              topTieRate: margins.filter((margin) => margin === 0).length / seeds.length,
            })
          }
        }
      }
    }
  }
  return report
}

export function actionCalibrationMarkdown(report: CalibrationReport): string {
  const number = (value: number) => value.toFixed(2)
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`
  const lines = [
    '# Action calibration results',
    '',
    'Engineering reference agents under the actual game rules. These results do not establish human population difficulty. No runtime opponent reads the human score or targets a win quota.',
    '',
    `${report.seeds.length} fixed seeds; rosters ${report.rosters.join(', ')}; ${report.simulatedOpponents.toLocaleString('en-US')} opponent runs; ${report.verifiedReplays.toLocaleString('en-US')} action replays; ${report.parityFailures.length} parity failures.`,
    '',
    '## Individual opponent score distribution',
    '',
    '| Game | Version | Profile | P10 | Median | P90 | 120s cap |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: |',
    ...report.fields.map(
      (field) =>
        `| ${field.game} | ${field.version} | ${field.profile} | ${number(field.scores.p10)} | ${number(field.scores.median)} | ${number(field.scores.p90)} | ${field.capRate === undefined ? '—' : percent(field.capRate)} |`
    ),
    '',
    '## Reference against the entire field',
    '',
    'Neutral skill profiles, largest roster. Strict wins exclude exact ties; ties use the game’s normal tie resolution. Margin = reference minus strongest opponent. Screenshot anchors are fixed observed scores; their original seeds and inputs are unavailable.',
    '',
    '| Game | Version | Reference | Reference median | Best AI median | Strict wins | Ties | Median margin | Median relative margin |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.rows
      .filter((row) => row.profile === 'neutral' && row.roster === Math.max(...report.rosters))
      .map(
        (row) =>
          `| ${row.game} | ${row.version} | ${row.reference} | ${number(row.referenceScore.median)} | ${number(row.bestOpponentScore.median)} | ${percent(row.strictWinRate)} | ${percent(row.topTieRate)} | ${number(row.margin.median)} | ${percent(row.relativeMargin.median)} |`
      ),
    '',
    '## Candidate roster sensitivity',
    '',
    '| Game | Roster | Reference | Strict wins | Ties | Median margin |',
    '| --- | ---: | --- | ---: | ---: | ---: |',
    ...report.rows
      .filter(
        (row) =>
          row.version === 'candidate' &&
          row.profile === 'neutral' &&
          ['threeFinger', 'strong', 'observed 1063.63', 'observed 97.780s'].includes(row.reference)
      )
      .map(
        (row) =>
          `| ${row.game} | ${row.roster} | ${row.reference} | ${percent(row.strictWinRate)} | ${percent(row.topTieRate)} | ${number(row.margin.median)} |`
      ),
    '',
    '## Limits and scope',
    '',
    '- Covered runtime paths: VIP Quick Tap Race, VIP Quick Tap Seasons, and Pressure Plank. Other minigames, including standard tapping variants and Deck of Light, require their own adapters and parity checks.',
    '- Finger-style weights, cadence ranges and controller reaction/error settings are explicit design assumptions, not measured population percentiles. Change these assumptions and rerun the report when evidence warrants it.',
    '- Strongest-field comparisons expose roster-size effects; average-opponent results alone are insufficient.',
    '- Pressure Plank has a real 120-second cap. Practiced controllers can reach it; capped ties must remain visible instead of being hidden by fabricated survival times.',
    '- Pointer tests verify live scoring separately. Device feel and human population calibration still need limited release feedback; this framework replaces repetitive manual regression play.',
    '',
  ]
  return lines.join('\n')
}

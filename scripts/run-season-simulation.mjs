import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function readOption(name, fallback) {
  const equalsPrefix = `--${name}=`
  const equalsArgument = process.argv.find((argument) => argument.startsWith(equalsPrefix))
  if (equalsArgument) return equalsArgument.slice(equalsPrefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function positiveInteger(name, value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer; received '${value}'.`)
  }
  return parsed
}

function validateBatchId(value) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value) || value === '.' || value === '..') {
    throw new Error('--batch-id may contain only letters, numbers, dots, underscores, and hyphens.')
  }
  return value
}

const runs = positiveInteger('runs', readOption('runs', '1'))
const fullSeason = process.argv.includes('--full-season') || runs > 1
const fullViewport = process.argv.includes('--full')
const viewport = readOption('viewport', fullSeason ? 'compact-mobile' : 'iphone-17')
const projectByViewport = {
  'iphone-17': 'iphone-17-chromium',
  'compact-mobile': 'compact-mobile-chromium',
}
if (!projectByViewport[viewport]) {
  throw new Error("--viewport must be 'iphone-17' or 'compact-mobile'.")
}
const requestedBatchId = readOption('batch-id', process.env.SEASON_SIM_BATCH_ID)
const batchId = fullSeason
  ? validateBatchId(requestedBatchId ?? `season-${Date.now().toString(36)}`)
  : undefined
const node = process.execPath
const playwrightCli = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url)
)
const projects = fullViewport
  ? ['--project=iphone-17-chromium', '--project=compact-mobile-chromium']
  : [`--project=${projectByViewport[viewport]}`]
const maxActions = readOption(
  'max-actions',
  process.env.SEASON_SIM_MAX_ACTIONS ?? (fullSeason ? '420' : '4')
)
const maxDays = readOption('max-days', process.env.SEASON_SIM_MAX_DAYS ?? (fullSeason ? '40' : '1'))

const runEnvironment = {
  ...process.env,
  SEASON_SIM_SKIP_UNLOAD_AUTOSAVE: '1',
  SEASON_SIM_MAX_ACTIONS: String(positiveInteger('max-actions', maxActions)),
  SEASON_SIM_MAX_DAYS: String(positiveInteger('max-days', maxDays)),
  SEASON_SIM_RUNS: String(runs),
  SEASON_SIM_VIEWPORT: viewport,
  // Full-season batches skip only optional play. Required decisions still use
  // the normal visible controls, and competition forfeits use the game's menu.
  SEASON_SIM_SKIP_COMPETITIONS:
    process.env.SEASON_SIM_SKIP_COMPETITIONS ?? (fullSeason ? 'true' : 'false'),
  SEASON_SIM_SKIP_OPTIONAL_CONFESSIONALS:
    process.env.SEASON_SIM_SKIP_OPTIONAL_CONFESSIONALS ?? (fullSeason ? 'true' : 'false'),
  VISUAL_AUDIT_WRITE: '1',
  ...(batchId ? { SEASON_SIM_BATCH_ID: batchId } : {}),
  ...(readOption('mode', process.env.SEASON_SIM_MODE)
    ? { SEASON_SIM_MODE: readOption('mode', process.env.SEASON_SIM_MODE) }
    : {}),
  ...(readOption('persona', process.env.SEASON_SIM_PERSONA)
    ? { SEASON_SIM_PERSONA: readOption('persona', process.env.SEASON_SIM_PERSONA) }
    : {}),
}

const playwrightArgs = [
  playwrightCli,
  'test',
  'e2e/playwright/season-simulation.spec.ts',
  ...projects,
  `--repeat-each=${runs}`,
  '--workers=1',
  '--retries=0',
]

const result = spawnSync(node, playwrightArgs, {
  env: runEnvironment,
  stdio: 'inherit',
})

if (result.error) throw result.error

let exitCode = result.status ?? 1
if (batchId) {
  const summary = spawnSync(
    node,
    ['scripts/summarize-season-simulations.mjs', '--batch-id', batchId],
    { env: runEnvironment, stdio: 'inherit' }
  )
  if (summary.error) throw summary.error
  if (summary.status !== 0) exitCode = summary.status ?? 1
}

process.exitCode = exitCode

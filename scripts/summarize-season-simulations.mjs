import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function readOption(name) {
  const prefix = `--${name}=`
  const equalsArgument = process.argv.find((argument) => argument.startsWith(prefix))
  if (equalsArgument) return equalsArgument.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function collectJsonFiles(directory) {
  const files = []
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return files
    throw error
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'season-simulation-batches') {
        files.push(...(await collectJsonFiles(fullPath)))
      }
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath)
    }
  }
  return files
}

const batchId = readOption('batch-id')
if (!batchId) throw new Error('Pass the batch to summarize with --batch-id <id>.')
if (!/^[a-zA-Z0-9._-]+$/.test(batchId) || batchId === '.' || batchId === '..') {
  throw new Error('--batch-id may contain only letters, numbers, dots, underscores, and hyphens.')
}

const testResults = path.resolve('test-results')
const reports = []
for (const file of await collectJsonFiles(testResults)) {
  let report
  try {
    report = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    continue
  }
  if (report?.schemaVersion !== 1 || report?.config?.batchId !== batchId) continue
  if (!report?.outcome) continue
  reports.push({ file, ...report })
}

reports.sort((left, right) => (left.config.runIndex ?? 0) - (right.config.runIndex ?? 0))
if (reports.length === 0) {
  throw new Error(`No simulation reports for batch '${batchId}' were found in ${testResults}.`)
}

const resolved = reports.filter((report) => report.outcome.resolved)
const wins = resolved.filter((report) => report.outcome.humanWon)
const placements = resolved
  .map((report) => report.outcome.humanPlacement)
  .filter((placement) => Number.isInteger(placement) && placement > 0)
const placementCounts = Object.fromEntries(
  [...new Set(placements)]
    .sort((left, right) => left - right)
    .map((placement) => [
      String(placement),
      placements.filter((candidate) => candidate === placement).length,
    ])
)
const terminalCounts = Object.fromEntries(
  [...new Set(reports.map((report) => report.terminal))]
    .sort()
    .map((terminal) => [terminal, reports.filter((report) => report.terminal === terminal).length])
)
const fullSeasonCount = reports.filter((report) => report.outcome.winnerId != null).length
const average = (values) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : null
const batch = {
  schemaVersion: 1,
  batchId,
  mode: reports[0].config.mode,
  persona: reports[0].config.personaId,
  viewport: reports[0].config.viewport,
  requestedRuns:
    reports[0].config.batchRuns ??
    (reports[0].config.runIndex
      ? Math.max(...reports.map((report) => report.config.runIndex ?? 0))
      : reports.length),
  reportsFound: reports.length,
  resolvedRuns: resolved.length,
  incompleteRuns: reports.length - resolved.length,
  humanWins: wins.length,
  humanWinRate: resolved.length ? wins.length / resolved.length : null,
  reachedFinalThree: resolved.filter((report) => report.outcome.humanReachedFinalThree).length,
  madeJury: resolved.filter((report) => report.outcome.humanMadeJury).length,
  fullSeasonCompleted: fullSeasonCount,
  averageHumanCompetitionWins: average(
    resolved.map(
      (report) => (report.outcome.humanLohWins ?? 0) + (report.outcome.humanPosWins ?? 0)
    )
  ),
  averageHumanNominations: average(resolved.map((report) => report.outcome.humanNominations ?? 0)),
  averageAiSocialActions: average(reports.map((report) => report.outcome.aiSocialActions ?? 0)),
  averageAiOnlyFactions: average(reports.map((report) => report.outcome.aiOnlyFactionCount ?? 0)),
  averageAiOnlyPacts: average(reports.map((report) => report.outcome.aiOnlyPactCount ?? 0)),
  averageAiStrategyMeetings: average(
    reports.map((report) => report.outcome.aiStrategyMeetings ?? 0)
  ),
  averageAiCoordinatedTargetMoves: average(
    reports.map((report) => report.outcome.aiCoordinatedTargetMoves ?? 0)
  ),
  averageAiAllianceDefections: average(
    reports.map((report) => report.outcome.aiAllianceDefections ?? 0)
  ),
  averageAiAllianceLeaks: average(reports.map((report) => report.outcome.aiAllianceLeaks ?? 0)),
  averageAiRomances: average(reports.map((report) => report.outcome.aiRomances ?? 0)),
  averageRunMinutes: average(
    reports
      .map((report) => report.durationMs)
      .filter((durationMs) => Number.isFinite(durationMs))
      .map((durationMs) => durationMs / 60_000)
  ),
  placementCounts,
  terminalCounts,
  runs: reports.map((report) => ({
    runIndex: report.config.runIndex ?? null,
    seeds: report.config.seeds,
    outcome: report.outcome.humanWon ? 'won' : report.outcome.resolved ? 'lost' : 'incomplete',
    placement: report.outcome.humanPlacement,
    humanStatus: report.outcome.humanStatus,
    humanCompetitionWins: (report.outcome.humanLohWins ?? 0) + (report.outcome.humanPosWins ?? 0),
    humanNominations: report.outcome.humanNominations ?? 0,
    aiSocialActions: report.outcome.aiSocialActions ?? 0,
    aiOnlyFactions: report.outcome.aiOnlyFactionCount ?? 0,
    aiOnlyPacts: report.outcome.aiOnlyPactCount ?? 0,
    aiStrategyMeetings: report.outcome.aiStrategyMeetings ?? 0,
    aiCoordinatedTargetMoves: report.outcome.aiCoordinatedTargetMoves ?? 0,
    aiAllianceDefections: report.outcome.aiAllianceDefections ?? 0,
    aiAllianceLeaks: report.outcome.aiAllianceLeaks ?? 0,
    aiRomances: report.outcome.aiRomances ?? 0,
    winner: report.outcome.winnerName,
    terminal: report.terminal,
  })),
}

const outputDirectory = path.join(testResults, 'season-simulation-batches')
await mkdir(outputDirectory, { recursive: true })
const jsonPath = path.join(outputDirectory, `${batchId}.json`)
const markdownPath = path.join(outputDirectory, `${batchId}.md`)
await writeFile(jsonPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8')

const winRateText = batch.humanWinRate == null ? 'n/a' : `${(batch.humanWinRate * 100).toFixed(1)}%`
const placementRows = Object.entries(placementCounts).map(
  ([placement, count]) =>
    `| ${placement} | ${count} | ${((count / Math.max(placements.length, 1)) * 100).toFixed(1)}% |`
)
const markdown = [
  `# Season simulation batch: ${batchId}`,
  '',
  `- Mode/persona/viewport: ${batch.mode} / ${batch.persona} / ${batch.viewport}`,
  `- Runs found: ${batch.reportsFound} of ${batch.requestedRuns}`,
  `- Resolved human outcomes: ${batch.resolvedRuns}; incomplete: ${batch.incompleteRuns}`,
  `- Human wins: ${batch.humanWins}; win rate among resolved runs: ${winRateText}`,
  `- Reached Final 3: ${batch.reachedFinalThree}; made jury: ${batch.madeJury}`,
  `- Full champion recorded: ${batch.fullSeasonCompleted}`,
  `- Average human competition wins: ${batch.averageHumanCompetitionWins?.toFixed(2) ?? 'n/a'}; nominations: ${batch.averageHumanNominations?.toFixed(2) ?? 'n/a'}`,
  `- Average AI social actions: ${batch.averageAiSocialActions?.toFixed(2) ?? 'n/a'}`,
  `- Average AI-only factions/pacts: ${batch.averageAiOnlyFactions?.toFixed(2) ?? 'n/a'} / ${batch.averageAiOnlyPacts?.toFixed(2) ?? 'n/a'}`,
  `- Average AI strategy meetings: ${batch.averageAiStrategyMeetings?.toFixed(2) ?? 'n/a'}; coordinated target moves: ${batch.averageAiCoordinatedTargetMoves?.toFixed(2) ?? 'n/a'}`,
  `- Average AI defections/leaks/romances: ${batch.averageAiAllianceDefections?.toFixed(2) ?? 'n/a'} / ${batch.averageAiAllianceLeaks?.toFixed(2) ?? 'n/a'} / ${batch.averageAiRomances?.toFixed(2) ?? 'n/a'}`,
  `- Average run time: ${batch.averageRunMinutes?.toFixed(1) ?? 'n/a'} minutes`,
  '',
  'Win rate counts a known elimination as a loss. The simulator can stop after the human is eliminated because Classic mode does not offer spectator continuation; those runs still give a resolved human outcome and placement.',
  '',
  '## Placement distribution',
  '',
  '| Place | Runs | Share of placed runs |',
  '| ---: | ---: | ---: |',
  ...(placementRows.length ? placementRows : ['| No recorded placements | 0 | 0.0% |']),
  '',
  '## Run details',
  '',
  '| Run | Roster seed | Season seed | Actor seed | Result | Place | Comp wins | Noms | AI factions | AI meetings | AI defections | Winner | Terminal |',
  '| ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ...batch.runs.map(
    (run) =>
      `| ${run.runIndex ?? '—'} | ${run.seeds.roster} | ${run.seeds.season} | ${run.seeds.actor} | ${run.outcome} | ${run.placement ?? '—'} | ${run.humanCompetitionWins} | ${run.humanNominations} | ${run.aiOnlyFactions} | ${run.aiStrategyMeetings} | ${run.aiAllianceDefections} | ${run.winner ?? 'not played to champion'} | ${run.terminal} |`
  ),
  '',
  '## Terminal reasons',
  '',
  ...Object.entries(terminalCounts).map(([terminal, count]) => `- ${terminal}: ${count}`),
].join('\n')
await writeFile(markdownPath, `${markdown}\n`, 'utf8')

console.log(
  `Found ${batch.reportsFound}/${batch.requestedRuns} reports; ${batch.humanWins} wins, ${batch.incompleteRuns} incomplete.`
)
console.log(`Batch report: ${markdownPath}`)

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function parseArgs(argv) {
  const inputs = []
  let out = null
  for (const arg of argv) {
    if (arg.startsWith('--out=')) out = arg.slice('--out='.length)
    else inputs.push(arg)
  }
  return { inputs: inputs.length > 0 ? inputs : ['test-results'], out }
}

function statSafe(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

function collectJsonFiles(path) {
  const stat = statSafe(path)
  if (!stat) return []
  if (stat.isFile()) return path.endsWith('.json') ? [path] : []

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name)
    return entry.isDirectory()
      ? collectJsonFiles(child)
      : entry.name.endsWith('.json')
        ? [child]
        : []
  })
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]
  const index = (sorted.length - 1) * Math.max(0, Math.min(1, fraction))
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  const weight = index - lower
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * weight)
}

function distribution(values) {
  const sorted = values
    .filter(Number.isFinite)
    .map((value) => Math.max(0, Math.floor(value)))
    .sort((a, b) => a - b)
  if (sorted.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      mean: null,
      p25: null,
      median: null,
      p75: null,
      p90: null,
      p95: null,
    }
  }
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted.at(-1),
    mean: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
  }
}

function readReports(files) {
  const reports = []
  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (!parsed || parsed.schemaVersion !== 1 || !parsed.config) continue
      reports.push({ file, report: parsed })
    } catch {
      // Ignore unrelated or partial JSON artifacts.
    }
  }
  return reports
}

function sampleKey(report, sample) {
  if (sample.seasonId) return 'season:' + sample.seasonId + ':' + sample.playerId
  const seeds = report.config?.seeds ?? {}
  return [
    'sim',
    report.config?.mode ?? 'unknown',
    report.config?.personaId ?? 'unknown',
    seeds.roster ?? 'x',
    seeds.season ?? 'x',
    seeds.actor ?? 'x',
    sample.playerId ?? 'unknown',
  ].join(':')
}

function buildReport(reports) {
  const invalidReports = reports.filter((entry) =>
    (entry.report.findings ?? []).some((finding) => finding?.severity === 'error')
  )
  const completedReports = reports.filter(
    (entry) =>
      entry.report.economySample &&
      !(entry.report.findings ?? []).some((finding) => finding?.severity === 'error')
  )
  const unique = new Map()
  for (const entry of completedReports) {
    const sample = entry.report.economySample
    unique.set(sampleKey(entry.report, sample), { ...entry, sample })
  }
  const entries = [...unique.values()]
  const totals = entries.map((entry) => entry.sample.total)
  const byPredicate = (predicate) =>
    distribution(entries.filter(predicate).map((entry) => entry.sample.total))
  const rewardSources = new Map()

  for (const entry of entries) {
    for (const reward of entry.sample.rewards ?? []) {
      const current = rewardSources.get(reward.code) ?? { awards: 0, total: 0 }
      current.awards += Number(reward.quantity ?? 0)
      current.total += Number(reward.amount ?? 0)
      rewardSources.set(reward.code, current)
    }
  }

  const totalMinted = totals.reduce((sum, value) => sum + value, 0)
  const sourceMix = [...rewardSources.entries()]
    .map(([code, value]) => ({
      code,
      awards: value.awards,
      total: value.total,
      shareOfMinted: totalMinted > 0 ? value.total / totalMinted : 0,
    }))
    .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code))

  const rank = (entry) => entry.sample.summary?.finalPlacement ?? null
  const compWins = (entry) =>
    Number(entry.sample.summary?.lohWins ?? 0) + Number(entry.sample.summary?.posWins ?? 0)

  const nonFinalistEntries = entries.filter((entry) => rank(entry) !== 1 && rank(entry) !== 2)
  const nonFinalistTotals = nonFinalistEntries.map((entry) => entry.sample.total)
  const threshold = (amount) => {
    if (nonFinalistTotals.length === 0) return { count: 0, share: 0 }
    const count = nonFinalistTotals.filter((value) => value >= amount).length
    return { count, share: count / nonFinalistTotals.length }
  }
  const anchorCodes = new Set(['season_winner', 'runner_up', 'public_favorite'])
  const secondaryMinted = sourceMix
    .filter((source) => !anchorCodes.has(source.code))
    .reduce((sum, source) => sum + source.total, 0)

  return {
    generatedAt: new Date().toISOString(),
    inputReports: reports.length,
    excludedWithErrors: invalidReports.length,
    excludedWithoutCompletedOutcome: reports.filter(
      (entry) =>
        !entry.report.economySample &&
        !(entry.report.findings ?? []).some((finding) => finding?.severity === 'error')
    ).length,
    sampleSize: entries.length,
    totalMinted,
    overall: distribution(totals),
    segments: {
      nonFinalist: byPredicate((entry) => rank(entry) !== 1 && rank(entry) !== 2),
      finalist: byPredicate((entry) => rank(entry) === 1 || rank(entry) === 2),
      runnerUp: byPredicate((entry) => rank(entry) === 2),
      winner: byPredicate((entry) => rank(entry) === 1),
      publicFavorite: byPredicate((entry) => entry.sample.summary?.wonPublicFavorite === true),
      comeback: byPredicate((entry) => Number(entry.sample.summary?.battleBackWins ?? 0) > 0),
      competitionHeavy: byPredicate((entry) => compWins(entry) >= 3),
    },
    rewardSources: sourceMix,
    pressure: {
      nonFinalistAtOrAboveRunnerUp: threshold(50_000),
      nonFinalistAtOrAbovePublicFavorite: threshold(25_000),
      secondaryRewardShareOfMinted: totalMinted > 0 ? secondaryMinted / totalMinted : 0,
    },
  }
}

function money(value) {
  return value == null ? 'n/a' : Math.round(value).toLocaleString('en-US')
}

function markdown(report) {
  const lines = [
    '# Eyeolean calibration report',
    '',
    'Simulation reports read: ' + report.inputReports,
    'Completed valid unique samples: ' + report.sampleSize,
    'Excluded with auditor errors: ' + report.excludedWithErrors,
    'Excluded without a completed authoritative outcome: ' + report.excludedWithoutCompletedOutcome,
    'Total Eyeoleans minted: ' + money(report.totalMinted),
    '',
    '| Segment | N | Median | P75 | P90 | Max |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ]

  const segments = [['All', report.overall], ...Object.entries(report.segments)]
  for (const [label, stats] of segments) {
    lines.push(
      '| ' +
        label +
        ' | ' +
        stats.count +
        ' | ' +
        money(stats.median) +
        ' | ' +
        money(stats.p75) +
        ' | ' +
        money(stats.p90) +
        ' | ' +
        money(stats.max) +
        ' |'
    )
  }

  lines.push(
    '',
    '## Balance pressure',
    '',
    '- Non-finalists at or above 50,000 runner-up anchor: ' +
      report.pressure.nonFinalistAtOrAboveRunnerUp.count +
      ' (' +
      (report.pressure.nonFinalistAtOrAboveRunnerUp.share * 100).toFixed(1) +
      '%)',
    '- Non-finalists at or above 25,000 Public Favorite anchor: ' +
      report.pressure.nonFinalistAtOrAbovePublicFavorite.count +
      ' (' +
      (report.pressure.nonFinalistAtOrAbovePublicFavorite.share * 100).toFixed(1) +
      '%)',
    '- Secondary rewards share of minted season currency: ' +
      (report.pressure.secondaryRewardShareOfMinted * 100).toFixed(1) +
      '%',
    '',
    '## Reward source mix',
    '',
    '| Reward | Awards | Minted | Share |',
    '| --- | ---: | ---: | ---: |'
  )
  for (const source of report.rewardSources) {
    lines.push(
      '| ' +
        source.code +
        ' | ' +
        source.awards +
        ' | ' +
        money(source.total) +
        ' | ' +
        (source.shareOfMinted * 100).toFixed(1) +
        '% |'
    )
  }

  return lines.join('\n')
}

const { inputs, out } = parseArgs(process.argv.slice(2))
const files = inputs.flatMap((input) => collectJsonFiles(resolve(input)))
const reports = readReports(files)
const report = buildReport(reports)
const rendered = markdown(report)

if (out) {
  const target = resolve(out)
  writeFileSync(target, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log('Wrote ' + target)
}
console.log(rendered)

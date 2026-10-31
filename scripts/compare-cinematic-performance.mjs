import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const getOption = (name, fallback = '') =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const reportDir = path.resolve(root, getOption('directory', 'artifacts/cinematic-performance'))

const baselinePrefix = getOption('baseline-prefix')
const candidatePrefix = getOption('candidate-prefix')
const refreshHz = Number(getOption('refresh-hz', '60'))
if (!baselinePrefix || !candidatePrefix) {
  throw new Error(
    'Pass --baseline-prefix=credits-baseline and --candidate-prefix=credits-candidate.'
  )
}
if (!Number.isFinite(refreshHz) || refreshHz <= 0) {
  throw new Error('Pass a positive --refresh-hz value.')
}

async function readRunSet(prefix) {
  const names = (await readdir(reportDir))
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.json'))
    .sort()
  const reports = await Promise.all(
    names.map(async (name) => JSON.parse(await readFile(path.join(reportDir, name), 'utf8')))
  )
  return reports
}

const baseline = await readRunSet(baselinePrefix)
const candidates = await readRunSet(candidatePrefix)
if (baseline.length < 7)
  throw new Error(`Need at least 7 baseline reports; found ${baseline.length}.`)
if (candidates.length < 7)
  throw new Error(`Need at least 7 candidate reports; found ${candidates.length}.`)

const comparisonFields = [
  'device',
  'operatingSystem',
  'webviewOrBrowser',
  'fixtureAndSeed',
  'animationSettings',
  'coldOrWarm',
  'thermalState',
  'buildKind',
  'fixtureServerPolicy',
  'dependencyFingerprint',
  'instrumentationFingerprint',
  'visibilityInterruption',
]
const referenceMetadata = baseline[0].metadata
const setupMismatches = []
for (const [name, runs] of [
  ['baseline', baseline],
  ['candidate', candidates],
]) {
  const fingerprints = new Set(runs.map((run) => run.metadata.sourceFingerprint).filter(Boolean))
  if (fingerprints.size > 1) setupMismatches.push(`${name}: mixed source fingerprints`)
}
for (const report of [...baseline, ...candidates]) {
  if (report.missingMetadata?.length) {
    setupMismatches.push(`${report.metadata.label}: missing ${report.missingMetadata.join(', ')}`)
  }
  for (const field of comparisonFields) {
    if (report.metadata[field] !== referenceMetadata[field]) {
      setupMismatches.push(`${report.metadata.label}: ${field} differs from baseline setup`)
    }
  }
  if (
    !report.checks?.enoughCycles ||
    !report.checks?.sawSkip ||
    !report.checks?.sawNormalCompletion ||
    !report.checks?.sawRouteExit ||
    !report.checks?.sawBackgroundResume ||
    report.checks.expectedPresentationCycles < 20
  ) {
    setupMismatches.push(
      `${report.metadata.label}: 20-cycle, Skip, normal-completion, route-exit or background/resume coverage is incomplete`
    )
  }
  if (
    !report.checks?.noActivePresentationRootsAtEnd ||
    !report.checks?.noActivePresentationVideosAtEnd ||
    !report.checks?.noAttachedPresentationVideoSourcesAtEnd ||
    !report.checks?.noPendingMediaPreparationAtEnd
  ) {
    setupMismatches.push(
      `${report.metadata.label}: a presentation root, video source or media preparation remained at capture end`
    )
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function valuesFor(report, metric) {
  const segmentMetric =
    /^(gameplay-before|gameplay-after):(frameGapP95Ms|inputResponseP95Ms|longTaskP95Ms|droppedFrameSharePercent)$/.exec(
      metric
    )
  if (segmentMetric) {
    const segment = report.segments?.find((entry) => entry.label === segmentMetric[1])
    if (!segment) return null
    if (segmentMetric[2] === 'droppedFrameSharePercent')
      return segment.frameSamples > 0
        ? (segment.droppedFramesOver33Ms / segment.frameSamples) * 100
        : null
    if (segmentMetric[2] === 'longTaskP95Ms' && segment.longTaskCount === 0) return 0
    return segment[segmentMetric[2]]
  }
  const summary = report.summary
  switch (metric) {
    case 'frameGapP95Ms':
      return summary.frameGapP95Ms
    case 'inputResponseP95Ms':
      return summary.inputResponseP95Ms
    case 'longTaskP95Ms':
      return summary.longTaskP95Ms
    case 'droppedFrameSharePercent':
      return summary.frameSamples > 0
        ? (summary.droppedFramesOver33Ms / summary.frameSamples) * 100
        : null
    case 'jsHeapAtCaptureEndMiB':
      return summary.endResources?.jsHeapBytes == null
        ? null
        : summary.endResources.jsHeapBytes / (1024 * 1024)
    case 'mediaFirstDataP95Ms':
      return summary.mediaFirstDataP95Ms
    case 'mediaPlaybackStartP95Ms':
      return summary.mediaPlaybackStartP95Ms
    case 'animationCallbacksAtCaptureEnd':
      return summary.endResources?.animationCallbacks
    case 'timersAtCaptureEnd':
      return summary.endResources?.timers
    case 'eventListenersAtCaptureEnd':
      return summary.endResources?.activeEventListeners
    case 'webAnimationsAtCaptureEnd':
      return summary.endResources?.runningWebAnimations
    case 'activeAudioAtCaptureEnd':
      return summary.endResources?.activeAudio
    case 'attachedAudioSourcesAtCaptureEnd':
      return summary.endResources?.attachedAudioSources
    case 'detachedPresentationRootsAtCaptureEnd':
      return summary.endResources?.survivingDetachedPresentationRoots?.length
    default:
      return null
  }
}

// Unknown refresh defaults to 60 above. An explicitly measured display uses
// its actual interval; clamping a known 240 Hz host to 60 loosened this rule.
const refreshFloorMs = 1000 / refreshHz
const metricDefinitions = [
  { name: 'frameGapP95Ms', unit: 'ms', floor: refreshFloorMs },
  { name: 'inputResponseP95Ms', unit: 'ms', floor: refreshFloorMs },
  { name: 'longTaskP95Ms', unit: 'ms', floor: 8 },
  { name: 'droppedFrameSharePercent', unit: 'percentage points', floor: 1 },
  { name: 'jsHeapAtCaptureEndMiB', unit: 'MiB', floor: 1 },
  { name: 'mediaFirstDataP95Ms', unit: 'ms', floor: refreshFloorMs },
  { name: 'mediaPlaybackStartP95Ms', unit: 'ms', floor: refreshFloorMs },
  { name: 'animationCallbacksAtCaptureEnd', unit: 'callbacks', floor: 1 },
  { name: 'timersAtCaptureEnd', unit: 'timers', floor: 1 },
  { name: 'eventListenersAtCaptureEnd', unit: 'listeners', floor: 1 },
  { name: 'webAnimationsAtCaptureEnd', unit: 'animations', floor: 1 },
  { name: 'activeAudioAtCaptureEnd', unit: 'players', floor: 1 },
  { name: 'attachedAudioSourcesAtCaptureEnd', unit: 'sources', floor: 1 },
  { name: 'detachedPresentationRootsAtCaptureEnd', unit: 'roots', floor: 1 },
  ...['gameplay-before', 'gameplay-after'].flatMap((segment) => [
    { name: `${segment}:frameGapP95Ms`, unit: 'ms', floor: refreshFloorMs },
    { name: `${segment}:inputResponseP95Ms`, unit: 'ms', floor: refreshFloorMs },
    { name: `${segment}:longTaskP95Ms`, unit: 'ms', floor: 8 },
    { name: `${segment}:droppedFrameSharePercent`, unit: 'percentage points', floor: 1 },
  ]),
]

const metrics = metricDefinitions.map((definition) => {
  const baselineValues = baseline
    .map((report) => valuesFor(report, definition.name))
    .filter(Number.isFinite)
  const candidateValues = candidates
    .map((report) => valuesFor(report, definition.name))
    .filter(Number.isFinite)
  if (baselineValues.length === 0 || candidateValues.length === 0) {
    return {
      ...definition,
      status: 'not-comparable',
      baselineSamples: baselineValues.length,
      candidateSamples: candidateValues.length,
    }
  }

  const baselineMedian = median(baselineValues)
  const baselineMad = median(baselineValues.map((value) => Math.abs(value - baselineMedian)))
  const candidateMedian = median(candidateValues)
  const allowedIncrease = Math.max(3 * baselineMad, definition.floor)
  const limit = baselineMedian + allowedIncrease
  return {
    ...definition,
    status: candidateMedian <= limit ? 'within-baseline-variation' : 'regression',
    baselineSamples: baselineValues.length,
    candidateSamples: candidateValues.length,
    baselineMedian,
    baselineMad,
    candidateMedian,
    allowedIncrease,
    limit,
  }
})

const resourceFields = [
  'activePresentationVideos',
  'attachedPresentationVideoSources',
  'pendingMediaPreparation',
  'activePresentationRoots',
]
const resourceRegressions = []
for (const field of resourceFields) {
  const baselineValues = baseline
    .map((report) => report.summary.endResources?.[field])
    .filter(Number.isFinite)
  const candidateValues = candidates
    .map((report) => report.summary.endResources?.[field])
    .filter(Number.isFinite)
  if (baselineValues.length === 0 || candidateValues.length === 0) continue
  if (median(baselineValues) === 0 && candidateValues.some((value) => value > 0)) {
    resourceRegressions.push(`${field} remained above zero after presentation handoff`)
  }
}

function lastFiveHeapRange(report) {
  const samples = report.summary.lastFiveCycleEndJsHeapBytes
  if (!Array.isArray(samples) || samples.length < 5 || !samples.every(Number.isFinite)) return null
  return Math.max(...samples) - Math.min(...samples)
}
const baselineHeapRanges = baseline.map(lastFiveHeapRange).filter(Number.isFinite)
const candidateHeapRanges = candidates.map(lastFiveHeapRange).filter(Number.isFinite)
let memoryPlateau = { status: 'not-measured', baselineRunCount: baselineHeapRanges.length }
if (baselineHeapRanges.length > 0 && candidateHeapRanges.length > 0) {
  const baselineRangeMedian = median(baselineHeapRanges)
  const baselineRangeMad = median(
    baselineHeapRanges.map((range) => Math.abs(range - baselineRangeMedian))
  )
  const limit = baselineRangeMedian + Math.max(3 * baselineRangeMad, 1024 * 1024)
  const regressedRanges = candidateHeapRanges.filter((range) => range > limit)
  memoryPlateau = {
    status: regressedRanges.length ? 'regression' : 'within-baseline-variation',
    baselineRunCount: baselineHeapRanges.length,
    baselineRangeMedianBytes: baselineRangeMedian,
    baselineRangeMadBytes: baselineRangeMad,
    candidateRunCount: candidateHeapRanges.length,
    candidateRangeMedianBytes: median(candidateHeapRanges),
    allowedRangeBytes: limit,
    regressedCandidateRangesBytes: regressedRanges,
  }
  if (regressedRanges.length) {
    resourceRegressions.push(
      'JavaScript heap did not plateau across the final five cycle-end samples'
    )
  }
}

const report = {
  baselineRuns: baseline.map((run) => run.metadata.label),
  candidateRuns: candidates.map((run) => run.metadata.label),
  refreshHz,
  refreshMeasurementFloorMs: refreshFloorMs,
  setupMismatches,
  resourceRegressions,
  memoryPlateau,
  metrics,
  result:
    setupMismatches.length > 0 ||
    resourceRegressions.length > 0 ||
    metrics.some((metric) => metric.status === 'regression') ||
    memoryPlateau.status === 'regression'
      ? 'regression-or-invalid-comparison'
      : metrics.some((metric) => metric.status === 'not-comparable')
        ? 'incomplete-metrics'
        : 'within-declared-baseline-tolerance',
  deviceGate: 'not evaluated; this comparator is for the Chromium recorder only',
}

console.log(JSON.stringify(report, null, 2))
if (report.result !== 'within-declared-baseline-tolerance') process.exitCode = 1

import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let directory: string
const prefix = resolve(tmpdir(), 'cinematic-comparison-test-')
beforeEach(async () => {
  directory = await mkdtemp(prefix)
})
afterEach(async () => {
  if (!resolve(directory).startsWith(prefix)) throw new Error('Unexpected unit fixture directory')
  await rm(directory, { recursive: true, force: true })
})

function fixture(variant: string, run: number, retainedVideo = false) {
  const resources = {
    activePresentationVideos: retainedVideo ? 1 : 0,
    attachedPresentationVideoSources: 0,
    pendingMediaPreparation: 0,
    activePresentationRoots: 0,
    animationCallbacks: 0,
    timers: 0,
    activeEventListeners: 12,
    runningWebAnimations: 0,
    activeAudio: 0,
    attachedAudioSources: 0,
    survivingDetachedPresentationRoots: [],
    jsHeapBytes: 10 * 1024 * 1024,
  }
  const common = {
    frameGapP95Ms: 4,
    inputResponseP95Ms: 2,
    longTaskP95Ms: 0,
    longTaskCount: 0,
    frameSamples: 1000,
    droppedFramesOver33Ms: 0,
  }
  return {
    metadata: {
      label: `${variant}-${run}`,
      sourceFingerprint: variant,
      device: 'synthetic unit fixture; no device',
      operatingSystem: 'fixture',
      webviewOrBrowser: 'fixture',
      fixtureAndSeed: 'synthetic seven-run inputs',
      animationSettings: 'fixture',
      coldOrWarm: 'fixture',
      thermalState: 'fixture',
      buildKind: 'synthetic unit input',
      dependencyFingerprint: 'unit',
      instrumentationFingerprint: 'unit',
      visibilityInterruption: 'unit',
      actualPhysicalDevice: false,
    },
    summary: {
      ...common,
      frameGapP95Ms: variant === 'candidate' ? 10 : 4,
      mediaFirstDataP95Ms: 5,
      mediaPlaybackStartP95Ms: 6,
      endResources: resources,
      lastFiveCycleEndJsHeapBytes: Array(5).fill(10 * 1024 * 1024),
    },
    segments: ['gameplay-before', 'gameplay-after'].map((label) => ({ ...common, label })),
    checks: {
      enoughCycles: true,
      sawSkip: true,
      sawNormalCompletion: true,
      sawRouteExit: true,
      sawBackgroundResume: true,
      expectedPresentationCycles: 20,
      noActivePresentationRootsAtEnd: true,
      noActivePresentationVideosAtEnd: true,
      noAttachedPresentationVideoSourcesAtEnd: true,
      noPendingMediaPreparationAtEnd: true,
    },
    errors: [],
    missingMetadata: [],
  }
}
async function writeFixtures(retainedVideo = false) {
  await Promise.all(
    ['baseline', 'candidate'].flatMap((variant) =>
      Array.from({ length: 7 }, async (_, index) => {
        await writeFile(
          join(directory, `${variant}-${index + 1}.json`),
          JSON.stringify(
            fixture(variant, index + 1, retainedVideo && variant === 'candidate' && index === 0)
          )
        )
      })
    )
  )
}
function compare(refresh?: number) {
  const result = spawnSync(
    process.execPath,
    [
      resolve('scripts/compare-cinematic-performance.mjs'),
      `--directory=${directory}`,
      '--baseline-prefix=baseline',
      '--candidate-prefix=candidate',
      ...(refresh ? [`--refresh-hz=${refresh}`] : []),
    ],
    { encoding: 'utf8' }
  )
  if (result.error) throw result.error
  return { status: result.status, report: JSON.parse(result.stdout) }
}

describe('cinematic comparison rejection rules (synthetic unit inputs)', () => {
  it('rejects a frame regression on a measured high-refresh display and defaults unknown refresh to 60 Hz', async () => {
    await writeFixtures()
    const measured = compare(240)
    expect(measured.status).toBe(1)
    expect(measured.report.setupMismatches).toEqual([])
    expect(
      measured.report.metrics.find((metric: { name: string }) => metric.name === 'frameGapP95Ms')
        .status
    ).toBe('regression')
    const unknown = compare()
    expect(unknown.status).toBe(0)
    expect(unknown.report.refreshHz).toBe(60)
  })

  it('rejects one surviving presentation video even when the candidate median is zero', async () => {
    await writeFixtures(true)
    const result = compare()
    expect(result.status).toBe(1)
    expect(result.report.resourceRegressions).toContain(
      'activePresentationVideos remained above zero after presentation handoff'
    )
  })
})

const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { chromium } = require('@playwright/test')
const catalog = require('../src/cinematic/ceremonies/cast.json')

const scenarios = [
  'ordinary',
  'halo',
  'force',
  'mission',
  'coLoh',
  'detox',
  'doubleTroubleOne',
  'doubleTroubleTwo',
  'doubleTroubleOriginals',
  'threePersonFinal',
  'voxOne',
  'voxMultiple',
  'cupid',
  'singleNominee',
  'singleVoxNominee',
  'coLohNominations',
  'dualPower',
  'voxRankFive',
  'voxFive',
]

// Read the projected artwork anchors after real WAAPI composition. This catches
// object-fit, camera and viewport errors that a selector-only unit test cannot.
async function inspect(page, at) {
  return page.evaluate(async (at) => {
    const clip = window.replacementClip
    clip.seek(at)
    await new Promise(requestAnimationFrame)
    const root = clip.root
    const bodies = [...root.querySelectorAll('.replacement-person, .nom-pod')]
    const people = bodies.flatMap((person) => {
      const image = person.querySelector('.replacement-body, .nom-person')
      let visible = 1
      for (let node = image; node && node !== root.parentElement; node = node.parentElement)
        visible *= Number(getComputedStyle(node).opacity)
      if (visible < 0.99) return []
      const platform =
        person.closest('.replacement-slot')?.querySelector('.replacement-platform') ??
        person.querySelector('.nom-platform')
      const bodyRect = image.getBoundingClientRect()
      const platformRect = platform.getBoundingClientRect()
      const feetY = parseFloat(image.style.getPropertyValue('--feet-y')) / 100
      const footY = bodyRect.top + bodyRect.height * feetY
      const supportY = platformRect.top + platformRect.height * (64 / 220)
      return [
        {
          id: person.dataset.actorId,
          footError: Math.abs(footY - supportY),
          center: bodyRect.x + bodyRect.width / 2,
          width: bodyRect.width,
          footY,
        },
      ]
    })
    const rectangle = root.getBoundingClientRect()
    const caption = root.querySelector('.replacement-caption, .c-caption').getBoundingClientRect()
    return {
      people,
      stageCenter: rectangle.x + rectangle.width / 2,
      captionTop: caption.top,
      solo: root.classList.contains('nom-solo'),
      podCount: root.querySelectorAll('.nom-pod').length,
      tinyChooser: root.querySelectorAll('.replacement-authority-figure').length,
    }
  }, at)
}

async function main() {
  const outputDir = path.resolve(process.argv[2] ?? 'artifacts/replacement-ceremonies')
  const base = process.env.REPLACEMENT_REVIEW_URL ?? 'http://127.0.0.1:4324/bbmobilenew'
  await fs.mkdir(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  const results = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(`${base}/tools/ceremony-replacements.html?capture=1&scenario=ordinary`)
    await page.waitForFunction(
      () => window.replacementClip?.counts.mounted || window.replacementError
    )
    assert.equal(await page.evaluate(() => window.replacementError), undefined)
    const cold = await page.evaluate(() => window.replacementClip.metrics)
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 360, height: 780 },
      { width: 430, height: 932 },
      { width: 390, height: 700 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport)
      for (const scenario of scenarios) {
        const duration = await page.evaluate(
          async (scenario) => (await window.previewScenario(scenario)).durationMs,
          scenario
        )
        const result = await inspect(page, duration - 300)
        assert.ok(result.people.length > 0, `${scenario}: no visible people`)
        assert.equal(result.tinyChooser, 0)
        for (const person of result.people) {
          assert.ok(person.footError <= 1, `${scenario}: foot mismatch ${person.footError}px`)
          assert.ok(person.footY + 10 < result.captionTop, `${scenario}: caption overlaps feet`)
        }
        if (result.solo) {
          assert.equal(result.podCount, 1)
          assert.ok(Math.abs(result.people[0].center - result.stageCenter) < 1)
        }
        results.push({ scenario, viewport, ...result })
      }
    }
    await page.setViewportSize({ width: 390, height: 844 })
    for (const actor of catalog.characters) {
      const duration = await page.evaluate(
        async (id) => (await window.previewScenario('ordinary', id)).durationMs,
        actor.id
      )
      const result = await inspect(page, duration - 300)
      assert.equal(result.people.length, 2, `${actor.id}: incomplete stage`)
      assert.ok(
        result.people.every((person) => person.footError <= 1),
        `${actor.id}: foot anchor mismatch`
      )
      results.push({ character: actor.id, ...result })
    }
    for (const scenario of ['detox', 'doubleTroubleTwo', 'ordinary', 'voxMultiple', 'voxFive']) {
      await page.evaluate((scenario) => window.previewScenario(scenario), scenario)
      const beats = await page.evaluate(() => window.replacementBeats)
      const occupants = new Set(
        scenario === 'detox'
          ? ['nova', 'ash']
          : scenario === 'voxFive'
            ? ['ash', 'nova', 'sol', 'dex', 'jax']
            : scenario === 'voxMultiple'
              ? ['ash', 'nova', 'sol']
              : ['ash', 'nova']
      )
      for (const beat of beats) {
        for (const [index, reveal] of beat.reveals.entries()) {
          const action = reveal.action
          if (action.kind === 'save') occupants.delete(action.playerId)
          if (action.kind === 'replacement') occupants.add(action.playerId)
          if (beat.reveals[index + 1]?.at === reveal.at) continue
          const result = await inspect(page, reveal.at + 700)
          assert.equal(
            result.people.length,
            occupants.size,
            `${scenario} at ${reveal.at}: wrong occupancy`
          )
          assert.deepEqual(result.people.map((person) => person.id).sort(), [...occupants].sort())
        }
      }
    }
    const performanceReport = await page.evaluate(async () => {
      window.replacementClip.stop()
      const longTasks = []
      const observer = new PerformanceObserver((list) =>
        longTasks.push(...list.getEntries().map((entry) => entry.duration))
      )
      observer.observe({ type: 'longtask' })
      const frameGaps = []
      let running = true,
        previous
      const sample = (time) => {
        if (previous) frameGaps.push(time - previous)
        previous = time
        if (running) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
      const started = performance.now()
      await window.previewScenario('ordinary')
      const warm = window.replacementClip.metrics
      await new Promise((resolve) => setTimeout(resolve, window.replacementDurationMs + 100))
      running = false
      observer.disconnect()
      const counts = window.replacementClip.counts
      frameGaps.sort((a, b) => a - b)
      return {
        warm,
        counts,
        elapsedMs: performance.now() - started,
        longTasksMs: longTasks,
        p95FrameGapMs: frameGaps[Math.floor(frameGaps.length * 0.95)],
        maxFrameGapMs: Math.max(...frameGaps),
        physicalDevice: false,
      }
    })
    assert.deepEqual(performanceReport.counts, {
      animations: 0,
      timers: 0,
      mounted: false,
      retainedImages: 0,
    })
    assert.deepEqual(errors, [])
    const report = {
      cold,
      performance: performanceReport,
      viewportCases: results.filter((result) => result.viewport).length,
      characterPacks: catalog.characters.length,
      results,
      errors,
    }
    await fs.writeFile(path.join(outputDir, 'verification.json'), JSON.stringify(report, null, 2))
    process.stdout.write(
      `Verified ${report.viewportCases} viewport/scenario combinations, ${report.characterPacks} character packs and cleanup.\n`
    )
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

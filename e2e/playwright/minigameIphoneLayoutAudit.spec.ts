import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { getAllGames, type GameRegistryEntry } from '../../src/minigames/registry'

type AuditStatus = 'PASS' | 'REVIEW' | 'FAIL_SCROLL' | 'FAIL_CONTROL_CLIP' | 'NOT_REACHED'

interface DeviceProfile {
  id: string
  label: string
  width: number
  height: number
  keyboardHeight: number
}

interface ScrollRegion {
  tag: string
  className: string
  clientHeight: number
  scrollHeight: number
  width: number
  height: number
  directChildOfPlayingRoot: boolean
}

interface ClippedElement {
  tag: string
  text: string
  className: string
  top: number
  bottom: number
  left: number
  right: number
}

interface LayoutMeasurement {
  viewport: { width: number; height: number }
  playingRoot: {
    top: number
    bottom: number
    left: number
    right: number
    width: number
    height: number
  } | null
  mainScrollRegions: ScrollRegion[]
  secondaryScrollRegions: ScrollRegion[]
  clippedInteractiveElements: ClippedElement[]
  clippedPrimaryChildren: ClippedElement[]
  documentOverflow: {
    horizontal: number
    vertical: number
  }
}

interface GameAuditResult {
  key: string
  title: string
  status: AuditStatus
  notes: string[]
  measurement: LayoutMeasurement | null
  keyboard?: {
    status: AuditStatus
    notes: string[]
    measurement: LayoutMeasurement | null
    inputFound: boolean
  }
}

const DEVICES: Record<string, DeviceProfile> = {
  'iphone-7': {
    id: 'iphone-7',
    label: 'iPhone 7 / 8 class',
    width: 375,
    height: 667,
    keyboardHeight: 417,
  },
  'iphone-x': {
    id: 'iphone-x',
    label: 'iPhone X / XS / 11 Pro compact class',
    width: 375,
    height: 812,
    keyboardHeight: 520,
  },
  'iphone-standard': {
    id: 'iphone-standard',
    label: 'Modern standard iPhone class',
    width: 390,
    height: 844,
    keyboardHeight: 540,
  },
  'iphone-pro': {
    id: 'iphone-pro',
    label: 'Modern iPhone Pro class',
    width: 393,
    height: 852,
    keyboardHeight: 545,
  },
  'iphone-pro-max': {
    id: 'iphone-pro-max',
    label: 'Modern iPhone Pro Max class',
    width: 430,
    height: 932,
    keyboardHeight: 596,
  },
}

const KEYBOARD_GAME_KEYS = new Set([
  'capitalization',
  'dontGoOver',
  'estimationGame',
  'famousFigures',
  'hangman',
  'threeDigitsQuiz',
])

const INTRO_BUTTON_PATTERNS = [
  /^begin$/i,
  /^begin round$/i,
  /^start$/i,
  /^start round$/i,
  /^start game$/i,
  /^start challenge$/i,
  /^start competition$/i,
  /^start duel$/i,
  /^draw cards$/i,
  /^build the chain$/i,
  /^deal$/i,
  /^play$/i,
  /^i(?:'|’)m ready$/i,
  /^ready$/i,
]

const ACTIVE_GAMES = getAllGames()
  .filter((game) => !game.retired && !game.legacy)
  .slice()
  .sort((left, right) => left.title.localeCompare(right.title) || left.key.localeCompare(right.key))

const requestedDevice = process.env.IPHONE_AUDIT_DEVICE ?? 'iphone-standard'
const device = DEVICES[requestedDevice]

if (!device) {
  throw new Error(
    `Unknown IPHONE_AUDIT_DEVICE "${requestedDevice}". Expected one of: ${Object.keys(DEVICES).join(', ')}`
  )
}

const outputDirectory = path.resolve(
  process.cwd(),
  'test-results',
  'iphone-layout-audit',
  device.id
)

function playerCountFor(game: GameRegistryEntry): number {
  const minimum = Math.max(2, game.minPlayers ?? 2)
  const maximum = game.maxPlayers ?? 12
  return Math.min(maximum, Math.max(minimum, 4))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function closeDebugPanelIfPresent(page: Page): Promise<void> {
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  if (!(await panel.isVisible().catch(() => false))) return

  const close = panel.getByRole('button', { name: 'Close Debug Panel' })
  if (await close.isVisible().catch(() => false)) {
    await close.evaluate((button) => (button as HTMLButtonElement).click())
  }
}

async function openGame(page: Page, game: GameRegistryEntry): Promise<void> {
  await page.setViewportSize({ width: device.width, height: device.height })
  const players = playerCountFor(game)
  await page.goto(
    `./#/minigame-lab?game=${encodeURIComponent(game.key)}&seed=424242&players=${players}&skipRules=1&skipCountdown=1&freeze=1&qa=1`
  )
  await closeDebugPanelIfPresent(page)

  await page.addStyleTag({
    content: `
      .minigame-lab__panel {
        display: none !important;
      }
    `,
  })

  const hostDialog = page.getByRole('dialog', {
    name: new RegExp(`${escapeRegExp(game.title)} minigame`, 'i'),
  })
  await expect(hostDialog).toBeVisible({ timeout: 15_000 })

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

async function advancePastSimpleIntro(page: Page): Promise<string[]> {
  const clicked: string[] = []

  for (let step = 0; step < 3; step += 1) {
    const buttons = page.locator('.minigame-host-playing button:visible')
    const count = await buttons.count()
    let clickedThisStep = false

    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index)
      if (await button.isDisabled().catch(() => true)) continue

      const text = (await button.innerText().catch(() => '')).trim().replace(/\s+/g, ' ')
      if (!INTRO_BUTTON_PATTERNS.some((pattern) => pattern.test(text))) continue

      await button.evaluate((element) => (element as HTMLButtonElement).click())
      clicked.push(text)
      clickedThisStep = true
      await page.waitForTimeout(450)
      break
    }

    if (!clickedThisStep) break
  }

  return clicked
}

async function measureLayout(page: Page): Promise<LayoutMeasurement> {
  return page.evaluate(() => {
    const playingRoot = document.querySelector<HTMLElement>('.minigame-host-playing')
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const isVisible = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number.parseFloat(style.opacity || '1') > 0.01 &&
        rect.width > 1 &&
        rect.height > 1
      )
    }

    const toClippedElement = (element: HTMLElement): ClippedElement => {
      const rect = element.getBoundingClientRect()
      return {
        tag: element.tagName.toLowerCase(),
        text: (element.innerText || element.getAttribute('aria-label') || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 80),
        className: element.className?.toString().slice(0, 140) ?? '',
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      }
    }

    const rootRect = playingRoot?.getBoundingClientRect() ?? null
    const elements = playingRoot
      ? Array.from(playingRoot.querySelectorAll<HTMLElement>('*')).filter(isVisible)
      : []

    const scrollRegions: ScrollRegion[] = []
    for (const element of elements) {
      const style = getComputedStyle(element)
      const overflowY = style.overflowY
      if (!['auto', 'scroll'].includes(overflowY)) continue
      if (element.scrollHeight <= element.clientHeight + 2) continue

      const rect = element.getBoundingClientRect()
      scrollRegions.push({
        tag: element.tagName.toLowerCase(),
        className: element.className?.toString().slice(0, 140) ?? '',
        clientHeight: Math.round(element.clientHeight),
        scrollHeight: Math.round(element.scrollHeight),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        directChildOfPlayingRoot: element.parentElement === playingRoot,
      })
    }

    const mainScrollRegions = scrollRegions.filter((region) => {
      if (region.directChildOfPlayingRoot) return true
      if (!rootRect) return false
      return (
        region.width >= rootRect.width * 0.72 &&
        region.height >= rootRect.height * 0.48
      )
    })
    const secondaryScrollRegions = scrollRegions.filter(
      (region) => !mainScrollRegions.includes(region)
    )

    const interactiveSelector =
      'button,input:not([type="hidden"]),textarea,select,[role="button"],[tabindex]:not([tabindex="-1"])'
    const interactives = playingRoot
      ? Array.from(playingRoot.querySelectorAll<HTMLElement>(interactiveSelector)).filter(isVisible)
      : []

    const clippedInteractiveElements = interactives
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const root = rootRect
        const outsideViewport =
          rect.left < -2 ||
          rect.top < -2 ||
          rect.right > viewportWidth + 2 ||
          rect.bottom > viewportHeight + 2
        const outsidePlayingRoot =
          root != null &&
          (rect.left < root.left - 2 ||
            rect.top < root.top - 2 ||
            rect.right > root.right + 2 ||
            rect.bottom > root.bottom + 2)
        return outsideViewport || outsidePlayingRoot
      })
      .map(toClippedElement)

    const primaryChildren = playingRoot
      ? Array.from(playingRoot.children).filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement && isVisible(element)
        )
      : []

    const clippedPrimaryChildren = primaryChildren
      .filter((element) => {
        if (!rootRect) return false
        const rect = element.getBoundingClientRect()
        return (
          rect.left < rootRect.left - 2 ||
          rect.top < rootRect.top - 2 ||
          rect.right > rootRect.right + 2 ||
          rect.bottom > rootRect.bottom + 2
        )
      })
      .map(toClippedElement)

    return {
      viewport: { width: viewportWidth, height: viewportHeight },
      playingRoot: rootRect
        ? {
            top: Math.round(rootRect.top),
            bottom: Math.round(rootRect.bottom),
            left: Math.round(rootRect.left),
            right: Math.round(rootRect.right),
            width: Math.round(rootRect.width),
            height: Math.round(rootRect.height),
          }
        : null,
      mainScrollRegions,
      secondaryScrollRegions,
      clippedInteractiveElements,
      clippedPrimaryChildren,
      documentOverflow: {
        horizontal: Math.max(
          0,
          document.documentElement.scrollWidth - document.documentElement.clientWidth
        ),
        vertical: Math.max(
          0,
          document.documentElement.scrollHeight - document.documentElement.clientHeight
        ),
      },
    }
  })
}

function classify(measurement: LayoutMeasurement): { status: AuditStatus; notes: string[] } {
  const notes: string[] = []

  if (measurement.clippedInteractiveElements.length > 0) {
    notes.push(
      `${measurement.clippedInteractiveElements.length} visible gameplay control(s) extend outside the usable playing viewport.`
    )
    return { status: 'FAIL_CONTROL_CLIP', notes }
  }

  if (measurement.clippedPrimaryChildren.length > 0) {
    notes.push(
      `${measurement.clippedPrimaryChildren.length} primary gameplay surface(s) extend outside the host and may be clipped.`
    )
    return { status: 'FAIL_CONTROL_CLIP', notes }
  }

  if (measurement.mainScrollRegions.length > 0) {
    const worst = Math.max(
      ...measurement.mainScrollRegions.map(
        (region) => region.scrollHeight - region.clientHeight
      )
    )
    notes.push(
      `Main gameplay surface requires vertical scrolling (up to ${worst}px beyond its visible height).`
    )
    return { status: 'FAIL_SCROLL', notes }
  }

  if (measurement.secondaryScrollRegions.length > 0) {
    notes.push(
      `${measurement.secondaryScrollRegions.length} secondary scroll region(s) are present; gameplay controls remain in view.`
    )
    return { status: 'REVIEW', notes }
  }

  if (measurement.documentOverflow.horizontal > 2) {
    notes.push(
      `Document exceeds the viewport horizontally by ${measurement.documentOverflow.horizontal}px.`
    )
    return { status: 'FAIL_CONTROL_CLIP', notes }
  }

  return { status: 'PASS', notes: ['No main gameplay scroll or clipped visible controls detected.'] }
}

async function auditKeyboardState(
  page: Page,
  game: GameRegistryEntry
): Promise<GameAuditResult['keyboard']> {
  const input = page
    .locator(
      '.minigame-host-playing input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), .minigame-host-playing textarea'
    )
    .filter({ visible: true })
    .first()

  if (!(await input.isVisible().catch(() => false))) {
    return {
      status: 'NOT_REACHED',
      notes: ['No visible text/number input was reached in the audited gameplay state.'],
      measurement: null,
      inputFound: false,
    }
  }

  await input.focus()
  await page.setViewportSize({ width: device.width, height: device.keyboardHeight })
  await page.waitForTimeout(200)

  const measurement = await measureLayout(page)
  const classification = classify(measurement)
  const focusedOutside = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    if (!element) return false
    const rect = element.getBoundingClientRect()
    return (
      rect.top < -2 ||
      rect.left < -2 ||
      rect.right > window.innerWidth + 2 ||
      rect.bottom > window.innerHeight + 2
    )
  })

  const notes = [...classification.notes]
  let status = classification.status

  if (focusedOutside) {
    status = 'FAIL_CONTROL_CLIP'
    notes.unshift('Focused keyboard input is outside the keyboard-reduced viewport.')
  }

  await page.screenshot({
    path: path.join(outputDirectory, `${game.key}-keyboard.png`),
    fullPage: false,
  })

  return { status, notes, measurement, inputFound: true }
}

function statusCounts(results: GameAuditResult[]): Record<AuditStatus, number> {
  const counts: Record<AuditStatus, number> = {
    PASS: 0,
    REVIEW: 0,
    FAIL_SCROLL: 0,
    FAIL_CONTROL_CLIP: 0,
    NOT_REACHED: 0,
  }
  for (const result of results) counts[result.status] += 1
  return counts
}

function buildMarkdown(results: GameAuditResult[]): string {
  const counts = statusCounts(results)
  const lines = [
    `# iPhone minigame layout audit — ${device.label}`,
    '',
    `Viewport: **${device.width}×${device.height} CSS px**`,
    `Keyboard-reduced viewport: **${device.width}×${device.keyboardHeight} CSS px**`,
    `Active non-retired, non-legacy games: **${results.length}**`,
    '',
    `Summary: PASS ${counts.PASS} · REVIEW ${counts.REVIEW} · FAIL_SCROLL ${counts.FAIL_SCROLL} · FAIL_CONTROL_CLIP ${counts.FAIL_CONTROL_CLIP}`,
    '',
    '| Game | Gameplay | Keyboard | Notes |',
    '| --- | --- | --- | --- |',
  ]

  for (const result of results) {
    const keyboard = result.keyboard?.status ?? '—'
    const notes = result.notes.join(' ').replaceAll('|', '\\|')
    lines.push(`| ${result.title} | ${result.status} | ${keyboard} | ${notes} |`)
  }

  lines.push('')
  lines.push(
    'Keyboard checks model the reduced usable viewport caused by the iOS on-screen keyboard. They are a layout stress simulation, not a hardware keyboard invocation.'
  )

  return `${lines.join('\n')}\n`
}

test.describe('iPhone active-minigame viewport audit @iphone-layout-audit', () => {
  test('audits active gameplay and keyboard-reduced states', async ({ page }) => {
    test.setTimeout(30 * 60_000)
    await mkdir(outputDirectory, { recursive: true })

    await page.addInitScript(() => {
      Object.defineProperty(window, '__E2E__', {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
      })

      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value: () => Promise.resolve(),
        writable: true,
      })
    })

    const results: GameAuditResult[] = []

    for (const game of ACTIVE_GAMES) {
      try {
        await openGame(page, game)
        const introButtonsClicked = await advancePastSimpleIntro(page)
        const measurement = await measureLayout(page)
        const classification = classify(measurement)
        const notes = [...classification.notes]

        if (introButtonsClicked.length > 0) {
          notes.push(`Advanced past intro control(s): ${introButtonsClicked.join(', ')}.`)
        }

        await page.screenshot({
          path: path.join(outputDirectory, `${game.key}.png`),
          fullPage: false,
        })

        const result: GameAuditResult = {
          key: game.key,
          title: game.title,
          status: classification.status,
          notes,
          measurement,
        }

        if (KEYBOARD_GAME_KEYS.has(game.key)) {
          result.keyboard = await auditKeyboardState(page, game)
        }

        results.push(result)
      } catch (error) {
        results.push({
          key: game.key,
          title: game.title,
          status: 'NOT_REACHED',
          notes: [
            `Audit could not reach a stable gameplay state: ${error instanceof Error ? error.message : String(error)}`,
          ],
          measurement: null,
          ...(KEYBOARD_GAME_KEYS.has(game.key)
            ? {
                keyboard: {
                  status: 'NOT_REACHED' as const,
                  notes: ['Keyboard state was not reached because the gameplay state failed.'],
                  measurement: null,
                  inputFound: false,
                },
              }
            : {}),
        })
      }
    }

    const report = {
      capturedAt: new Date().toISOString(),
      device,
      engine: 'webkit',
      methodology: {
        retiredExcluded: true,
        legacyExcluded: true,
        activeGameCount: ACTIVE_GAMES.length,
        simpleIntroAdvance: true,
        keyboardViewportSimulation: true,
      },
      counts: statusCounts(results),
      results,
    }

    await writeFile(
      path.join(outputDirectory, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`
    )
    await writeFile(path.join(outputDirectory, 'report.md'), buildMarkdown(results))

    expect(results).toHaveLength(ACTIVE_GAMES.length)
  })
})

import { closeDebugPanelIfOpen, expect, test, type Page } from './support/test'
import { buildHouseOfCardsBoard } from '../../src/components/HouseOfCardsComp/houseOfCardsUtils'

async function openDeckOfLight(page: Page, extra = '') {
  await page.goto(
    `./#/minigame-lab?game=cardClash&seed=424242&players=8&skipRules=1&skipCountdown=1&showLab=1&vipPreview=1${extra}`,
    { waitUntil: 'commit' }
  )
  const host = page.getByRole('dialog', { name: /Deck of Light minigame/i })
  await expect(host).toBeVisible({ timeout: 15_000 })
  const closeDebugPanel = page.getByRole('button', { name: 'Close Debug Panel' })
  if (await closeDebugPanel.isVisible().catch(() => false)) await closeDebugPanel.click()
  else {
    const debugToggle = page.getByRole('button', { name: 'Toggle Debug Panel' })
    if (await debugToggle.isVisible().catch(() => false)) {
      await closeDebugPanelIfOpen(page)
    }
  }
  await page.addStyleTag({
    content: `
      .minigame-lab__panel { visibility: hidden !important; pointer-events: none !important; }
      .dbg-fab { display: none !important; }
    `,
  })
}

test.describe('Deck of Light mobile presentation @minigame', () => {
  test('keeps finale opening choices compact and aligned on a phone', async ({ page }) => {
    await openDeckOfLight(page, '&stage=final')

    const host = page.getByRole('dialog', { name: /Deck of Light minigame/i })
    await expect(host.locator('.hoc-root[data-phase="opening_choice"]')).toBeVisible()
    const choices = host.locator('.hoc-opening-choice')
    await expect(choices).toHaveCount(2)

    const boxes = await choices.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect()
        return { x, y, width, height }
      })
    )
    expect(boxes[0]!.height).toBeLessThanOrEqual(170)
    expect(boxes[1]!.height).toBeLessThanOrEqual(170)
    expect(boxes[0]!.x + boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x + 2)

    const firstChoice = choices.nth(0)
    const mark = await firstChoice.locator('.hoc-opening-choice__mark svg').boundingBox()
    const title = await firstChoice.locator('strong').boundingBox()
    const description = await firstChoice.locator('.hoc-opening-choice__description').boundingBox()
    expect(mark).not.toBeNull()
    expect(title).not.toBeNull()
    expect(description).not.toBeNull()
    expect(mark!.y + mark!.height).toBeLessThanOrEqual(title!.y + 3)
    expect(title!.y + title!.height).toBeLessThanOrEqual(description!.y + 3)
  })

  test('shows one clean description when the selected tool expands', async ({ page }) => {
    await openDeckOfLight(page)

    const host = page.getByRole('dialog', { name: /Deck of Light minigame/i })
    await expect(host.locator('.hoc-root[data-phase="tool_select"]')).toBeVisible()
    const tools = host.locator('.hoc-tool-choice')
    await expect(tools).toHaveCount(3)
    await expect(host.locator('.hoc-tool-choice__icon svg')).toHaveCount(3)
    const legacyGlyphs = await tools.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node, '::after').content)
    )
    expect(legacyGlyphs).toEqual(['none', 'none', 'none'])

    await host.getByRole('button', { name: /^Peek/ }).click()
    const expanded = host.locator('.hoc-tool-choice[data-selected="true"]')
    await expect(expanded).toBeVisible()
    await expect(host.locator('.hoc-root')).toHaveAttribute('data-tool-transition', 'expand')
    await expect(expanded.locator('.hoc-tool-choice__copy')).toHaveText(
      'Use the glimpse to plan your next match before the card turns back.'
    )
    await expect(expanded).not.toContainText('Privately reveal one card you choose for a moment.')

    const title = await expanded.locator('strong').boundingBox()
    const copy = await expanded.locator('.hoc-tool-choice__copy').boundingBox()
    expect(title).not.toBeNull()
    expect(copy).not.toBeNull()
    expect(title!.y + title!.height).toBeLessThanOrEqual(copy!.y + 3)
  })

  test('keeps round standings and the next action together in a compact results panel', async ({
    page,
  }) => {
    const seed = 424242
    await openDeckOfLight(page)

    const host = page.getByRole('dialog', { name: /Deck of Light minigame/i })
    await host.getByRole('button', { name: /^Peek/ }).click()
    const cards = host.getByRole('gridcell')
    await expect(cards).toHaveCount(8)

    const board = buildHouseOfCardsBoard(seed, 4)
    const indexesBySymbol = new Map<string, number[]>()
    board.forEach((card) => {
      indexesBySymbol.set(card.symbol, [...(indexesBySymbol.get(card.symbol) ?? []), card.index])
    })

    for (const pair of indexesBySymbol.values()) {
      await expect(cards.nth(pair[0]!)).toBeEnabled()
      await cards.nth(pair[0]!).click()
      await expect(cards.nth(pair[1]!)).toBeEnabled()
      await cards.nth(pair[1]!).click()
    }

    await expect(host.getByRole('heading', { name: 'Round 1 complete' })).toBeVisible()
    const panel = host.locator('.hoc-round-results-panel')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.hoc-standing-row')).toHaveCount(8)
    const panelBox = await panel.boundingBox()
    const actionBox = await panel.locator('.minigame-continue-area').boundingBox()
    expect(panelBox).not.toBeNull()
    expect(actionBox).not.toBeNull()
    expect(actionBox!.y).toBeGreaterThanOrEqual(panelBox!.y)
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(panelBox!.y + panelBox!.height + 1)
    await expect(panel.getByRole('button', { name: 'Next round' })).toBeInViewport()
  })
})

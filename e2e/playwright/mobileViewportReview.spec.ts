import { closeDebugPanelIfOpen, expect, test } from './support/test'
import type { Locator } from '@playwright/test'

async function expectUnclipped(control: Locator) {
  await expect(control).toBeVisible()
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent)
          if (!['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)) continue
          const frame = parent.getBoundingClientRect()
          if (rect.top < frame.top - 1 || rect.bottom > frame.bottom + 1) return parent.className
        }
        return null
      })
    )
    .toBeNull()
}

for (const width of [320, 390]) {
  const height = width === 320 ? 568 : 844
  for (const [game, pad] of [
    ['dontGoOver', '.numeric-keypad'],
    ['threeDigitsQuiz', '.number-trivia__keypad'],
  ]) {
    test(`${game} full keypad fits ${width}px with native safe areas`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto(`./#/viewport-review?case=${game}&safe=1`)
      await closeDebugPanelIfOpen(page)
      await expect(page.locator(pad)).toBeVisible()
      for (const key of await page.locator(`${pad} button`).all()) await expectUnclipped(key)
      const submit = page.getByRole('button', {
        name: game === 'dontGoOver' ? 'Lock in guess' : /Lock in answer/,
      })
      await expectUnclipped(submit)
      await expect(page.locator('.minigame-host-playing')).toBeVisible()
    })
  }

  test(`Timing Bar elimination choices fit ${width}px beside a scrollable ranking`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('./#/viewport-review?case=timingBar&safe=1')
    await closeDebugPanelIfOpen(page)
    await expect(page.getByRole('button', { name: /Lock In/ })).toBeVisible()
    await page.clock.install()
    await page.clock.fastForward(25000)
    const spectate = page.getByRole('button', { name: /Remain as spectator/ })
    const skip = page.getByRole('button', { name: /Skip to final results/ })
    await expectUnclipped(spectate)
    await expectUnclipped(skip)
    const lastRow = page.locator('.tbg__leaderboard .tbg__entry').last()
    await lastRow.scrollIntoViewIfNeeded()
    await expectUnclipped(lastRow)
    await expectUnclipped(skip)
  })

  test(`Deck of Light and Battery Low keep their last choices accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('./#/viewport-review?case=cardClash&safe=1')
    await expect(page.locator('.hoc-tool-choice')).toHaveCount(3)
    for (const choice of await page.locator('.hoc-tool-choice').all()) await expectUnclipped(choice)
    await page.goto('./#/viewport-review?case=batteryLow&safe=1')
    await expect(page.locator('.vault-verdict__battery-grid button')).toHaveCount(24)
    for (const battery of await page.locator('.vault-verdict__battery-grid button').all())
      await expectUnclipped(battery)
  })
}

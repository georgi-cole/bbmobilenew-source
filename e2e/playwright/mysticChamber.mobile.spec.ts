import { closeDebugPanelIfOpen, expect, test } from './support/test'
import { assertNoHorizontalDocumentOverflow } from './support/layoutAssertions'

test.describe('Mystic Chamber mobile decision @smoke @minigame @mobile @accessibility', () => {
  test('keeps a real power choice and result usable on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.install()
    await page.goto(
      './#/minigame-lab?game=mysticChamber&seed=424242&players=4&skipRules=1&skipCountdown=1&showLab=1',
      { waitUntil: 'commit' }
    )
    await closeDebugPanelIfOpen(page)

    const host = page.getByRole('dialog', { name: /Mystic Chamber minigame/i })
    const chamber = host.getByTestId('mystic-chamber')
    await expect(page.getByTestId('minigame-lab-selected-title')).toHaveText('Mystic Chamber')
    await page.addStyleTag({
      content: `
        .minigame-lab__panel {
          visibility: hidden !important;
          pointer-events: none !important;
        }
        .dbg-fab {
          display: none !important;
        }
      `,
    })
    await expect(chamber.getByRole('heading', { name: 'Mystic Chamber' })).toBeVisible()
    await expect(chamber.getByRole('heading', { name: 'Choose a power' })).toBeVisible()
    await assertNoHorizontalDocumentOverflow(page)

    const offers = chamber.locator('button.mystic-chamber__offer').filter({
      hasNotText: /Forbidden Box/i,
    })
    const preferred = offers.filter({ hasText: /Gather power/i })
    const offer = (await preferred.count()) > 0 ? preferred.first() : offers.first()
    await expect(offer).toBeEnabled()
    await offer.click()

    const confirmChoice = chamber.getByRole('button', { name: 'Confirm choice', exact: true })
    if (await confirmChoice.isVisible().catch(() => false)) {
      await chamber.locator('.mystic-chamber__player.is-targetable').first().click()
      await expect(confirmChoice).toBeEnabled()
      await confirmChoice.click()
    } else {
      await chamber.getByRole('button', { name: 'Confirm power', exact: true }).click()
    }

    await page.clock.fastForward(2_000)
    await expect(chamber.locator('.mystic-chamber__result h2')).toBeVisible()
    await expect(chamber.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
    await assertNoHorizontalDocumentOverflow(page)
  })
})

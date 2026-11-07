import { errors, type Page } from '@playwright/test'

/** A shock may finish or hand off between its visibility check and the click. */
export async function dismissShockAcknowledgement(page: Page): Promise<boolean> {
  const cupidBreakOverlay = page.locator(
    '[data-testid="shock-intro-overlay"][data-cupid-mode="breaking"]'
  )
  if (await cupidBreakOverlay.isVisible().catch(() => false)) {
    // This cinematic has no OK button. It can overlap a queued shock, so wait
    // for just Cupid's layer instead of waiting for every shock on the page.
    await cupidBreakOverlay.waitFor({ state: 'hidden', timeout: 15_000 })
    return true
  }

  // Shock intros render in portals. Cupid's spell-break intro has no button,
  // so select the last visible acknowledgement across all mounted overlays.
  const overlays = page.getByTestId('shock-intro-overlay')
  const acknowledgement = overlays.locator('.shock-intro__ack:visible').last()
  const overlay = overlays.last()
  if (!(await overlay.isVisible().catch(() => false))) return false

  // The acknowledgement can mount a moment after the overlay during a shock
  // handoff. Give the visible screen a short chance to expose its OK control
  // before treating it as an automatic, no-button overlay.
  let acknowledgementVisible = await acknowledgement.isVisible().catch(() => false)
  if (!acknowledgementVisible) {
    try {
      await acknowledgement.waitFor({ state: 'visible', timeout: 3_000 })
      acknowledgementVisible = true
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error
    }
  }

  if (!acknowledgementVisible) {
    // A future no-button shock can hand control back automatically. Capture
    // this screen so a queued replacement does not extend the wait forever.
    const overlayElement = await overlay.elementHandle()
    if (!overlayElement) return true
    try {
      await overlayElement.waitForElementState('hidden', { timeout: 15_000 })
    } finally {
      await overlayElement.dispose()
    }
    return true
  }

  // Hold the actual DOM elements. A new shock can be queued while this one is
  // being acknowledged; waiting on a locator would then follow the replacement
  // overlay and mistake the next intro for a failed handoff.
  const acknowledgementElement = await acknowledgement.elementHandle().catch(() => null)
  if (!acknowledgementElement) return true
  const overlayElement = await acknowledgement
    .locator('xpath=ancestor::*[@data-testid="shock-intro-overlay"][1]')
    .elementHandle()

  try {
    await acknowledgementElement.click({ timeout: 3_000 })
  } catch (error) {
    if (!(error instanceof errors.TimeoutError)) throw error
    if (await acknowledgementElement.isVisible().catch(() => false)) throw error
  }
  try {
    await overlayElement?.waitForElementState('hidden', { timeout: 15_000 })
  } finally {
    await acknowledgementElement.dispose()
    await overlayElement?.dispose()
  }
  return true
}

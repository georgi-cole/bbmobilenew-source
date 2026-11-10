import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  test,
  type Page,
} from './support/test'

async function prepareSurveyevalVote(page: Page) {
  await page.goto('./#/?debug=1', { waitUntil: 'domcontentloaded' })
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  const toggle = page.getByRole('button', { name: 'Toggle Debug Panel' })
  await expect(toggle).toBeVisible({ timeout: 30_000 })
  if (!(await panel.isVisible())) await toggle.click()
  await dismissPermissionPromptIfPresent(page)
  await panel.getByRole('button', { name: 'Start Surveyeval Run', exact: true }).click()

  const { game } = await readAppState(page)
  const human = game.players.find((player) => player.isUser)
  const nominees = game.players.filter((player) => player.isRobo).slice(0, 2)
  if (!human || nominees.length !== 2) throw new Error('The Surveyeval QA cast is unavailable')

  const lohRow = panel.locator('.dbg-row').filter({
    has: page.getByText('Force LOH', { exact: true }),
  })
  await lohRow.getByRole('combobox').selectOption(human.id)
  await lohRow.getByRole('button', { name: 'Set', exact: true }).click()

  const nomineesRow = panel.locator('.dbg-row--col').filter({
    has: page.getByText('Force Nominees', { exact: true }),
  })
  await nomineesRow.getByRole('combobox').nth(0).selectOption(nominees[0].id)
  await nomineesRow.getByRole('combobox').nth(1).selectOption(nominees[1].id)
  await nomineesRow.getByRole('button', { name: 'Set', exact: true }).click()

  // Enter live_vote through advance(), which generates the actual ballots.
  // Human LOH + two robot nominees leaves five AI voters and cannot tie.
  const phaseRow = panel.locator('.dbg-row').filter({
    has: page.getByText('Set Phase', { exact: true }),
  })
  await phaseRow.getByRole('combobox').selectOption('social_2')
  await phaseRow.getByRole('button', { name: 'Set', exact: true }).click()
  await panel.getByRole('button', { name: 'Advance Phase', exact: true }).click()
  await panel.getByRole('button', { name: 'game', exact: true }).click()
  await closeDebugPanelIfOpen(page)

  await expect.poll(async () => (await readAppState(page)).game.phase).toBe('live_vote')
  await expect(page.locator('[data-houseguest-roster] [data-player-id]')).toHaveCount(8)
}

type ReplacementFrame = {
  opacity: number
  animationName: string
  animationState: string
  imageReady: boolean
  left: number
  top: number
  width: number
  height: number
}

function observeReplacement(page: Page): Promise<ReplacementFrame[]> {
  // Record rendered frames before Play rather than polling a completed state.
  // The shared fixture serves the portrait immediately: this regression must
  // fail even when network/image loading cannot explain an invisible tile.
  return page.evaluate(
    () =>
      new Promise<ReplacementFrame[]>((resolve, reject) => {
        const frames: ReplacementFrame[] = []
        let frameRequest = 0
        const timeout = window.setTimeout(() => {
          window.cancelAnimationFrame(frameRequest)
          reject(new Error('Surveyeval replacement did not finish'))
        }, 7_000)

        const sample = () => {
          const slot = document.querySelector('[data-replacement-target="true"]')
          const tile = slot?.querySelector('[data-ceremony-tile="true"]')
          if (slot && tile) {
            const image = tile.querySelector('img')
            const style = getComputedStyle(tile)
            const bounds = slot.getBoundingClientRect()
            frames.push({
              opacity: Number(style.opacity),
              animationName: style.animationName,
              animationState: style.animationPlayState,
              imageReady: Boolean(image?.complete && image.naturalWidth > 0),
              left: bounds.left,
              top: bounds.top,
              width: bounds.width,
              height: bounds.height,
            })
          } else if (frames.length > 0) {
            window.clearTimeout(timeout)
            resolve(frames)
            return
          }
          frameRequest = window.requestAnimationFrame(sample)
        }
        frameRequest = window.requestAnimationFrame(sample)
      })
  )
}

test.describe('Surveyeval roster choreography @smoke @core-journey', () => {
  test('plays the AI exit and keeps its replacement visible in the same slot', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await prepareSurveyevalVote(page)
    const play = page.getByRole('button', { name: 'Advance to next phase', exact: true })
    await expect(play).toBeEnabled()
    await play.click()

    const shock = page.locator('[data-player-id] [class*="surveyevalShock"]')
    await expect(shock).toBeAttached({ timeout: 20_000 })
    await expect(shock).toHaveCSS('animation-name', /surveyevalTileShock/)
    expect(
      await shock.evaluate((element) =>
        [element, ...element.children].map((part) => getComputedStyle(part).animationPlayState)
      )
    ).not.toContain('paused')

    await expect
      .poll(async () => {
        const { game } = await readAppState(page)
        return (
          game.modeSpecific?.kind === 'survival' && Boolean(game.modeSpecific.replacementPending)
        )
      })
      .toBe(true)
    const { game } = await readAppState(page)
    const pending =
      game.modeSpecific?.kind === 'survival' ? game.modeSpecific.replacementPending : null
    if (!pending) throw new Error('AI elimination did not queue a replacement')

    const roster = page.locator('[data-houseguest-roster]')
    const oldSlot = roster.locator(`[data-player-id="${pending.outgoingPlayerSnapshot.id}"]`)
    const oldBounds = await oldSlot.boundingBox()
    if (!oldBounds) throw new Error('The eliminated player has no visible roster slot')
    await expect(play).toBeEnabled()

    const [frames] = await Promise.all([observeReplacement(page), play.click()])
    await testInfo.attach('surveyeval-replacement-frames.json', {
      body: JSON.stringify(frames, null, 2),
      contentType: 'application/json',
    })
    expect(frames.length, 'capture the actual replacement interval').toBeGreaterThan(0)
    expect(frames.every((frame) => frame.animationName.includes('surveyevalAssembly'))).toBe(true)
    expect(frames.every((frame) => frame.animationState === 'running')).toBe(true)
    expect(
      frames.every((frame) => frame.opacity > 0),
      'the replacement never leaves a blank slot'
    ).toBe(true)
    expect(
      frames.some((frame) => frame.imageReady),
      'the replacement portrait is loaded'
    ).toBe(true)
    for (const frame of frames) {
      expect(Math.abs(frame.left - oldBounds.x)).toBeLessThan(2)
      expect(Math.abs(frame.top - oldBounds.y)).toBeLessThan(2)
      expect(Math.abs(frame.width - oldBounds.width)).toBeLessThan(2)
      expect(Math.abs(frame.height - oldBounds.height)).toBeLessThan(2)
    }

    const replacement = roster.locator(`[data-player-id="${pending.incomingPlayer.id}"]`)
    await expect(oldSlot).toHaveCount(0)
    await expect(replacement.locator('[data-ceremony-tile]')).toHaveCSS('opacity', '1')
    await expect(roster.locator('[data-player-id]')).toHaveCount(8)
    await expect(play).toBeEnabled()
    await expect.poll(async () => (await readAppState(page)).game.phase).toBe('week_end')

    await page.screenshot({ path: testInfo.outputPath('surveyeval-replacement-complete.png') })
  })
})

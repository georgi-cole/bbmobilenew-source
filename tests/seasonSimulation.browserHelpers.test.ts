import { errors, type Page } from '@playwright/test'
import { describe, expect, it, vi } from 'vitest'
import { getModeAdapter } from '../e2e/playwright/season-sim/modeAdapters'
import {
  advanceFinalePresentation,
  chooseAndConfirmSingleChoice,
  chooseWeekendHubSaysAnswer,
  dismissAnnouncement,
  exitVisibleMinigameWithZero,
  resolveDemocraciaVoteModal,
  resolveDayStartShock,
  startVisibleCompetitionBriefing,
  skipOptionalVoteReveal,
} from '../e2e/playwright/season-sim/runner'
import { isActiveGamePlayerStatus, seasonOutcome } from '../e2e/playwright/season-sim/auditor'
import { dismissShockAcknowledgement } from '../e2e/playwright/season-sim/shockAcknowledgement'
import { fixtureSeedsForRepeat, seedsForRepeat } from '../e2e/playwright/season-sim/seeds'
import { SeededRandom } from '../e2e/playwright/season-sim/seededRandom'
import {
  continueSurvivalAfterElimination,
  skipEliminationAnimation,
} from '../e2e/playwright/season-sim/eliminationAnimation'
import { createInitialGameState } from '../src/store/gameSlice'
import { store, type RootState } from '../src/store/store'

const pageWithoutTerminalUi = {
  getByRole: vi.fn(() => ({ isVisible: async () => false })),
} as unknown as Page

describe('browser repeat seeds', () => {
  it('uses the actual roster and season fixture fields for every repeat', () => {
    const fixture = { rosterSeed: 101, seasonSeed: 202 }
    expect(fixtureSeedsForRepeat(fixture, 303, 0)).toEqual({
      roster: 101,
      season: 202,
      actor: 303,
    })
    expect(fixtureSeedsForRepeat(fixture, 303, 1)).toEqual(
      seedsForRepeat({ roster: 101, season: 202, actor: 303 }, 1)
    )
  })
})

describe('saved journey action seed', () => {
  it('resumes the same next choice from a checkpoint', () => {
    const uninterrupted = new SeededRandom(12345)
    uninterrupted.next()
    const checkpointState = uninterrupted.snapshot()
    const expectedChoices = [uninterrupted.int(1, 10), uninterrupted.int(1, 10)]

    const resumed = new SeededRandom(12345)
    resumed.restore(checkpointState)
    expect([resumed.int(1, 10), resumed.int(1, 10)]).toEqual(expectedChoices)
  })
})

describe('required replacement confessional choice', () => {
  it('selects from the replacement group before confirming the required decision', async () => {
    let choiceSelected = false
    const choice = {
      isVisible: vi.fn().mockResolvedValue(true),
      isEnabled: vi.fn().mockResolvedValue(true),
      getAttribute: vi.fn().mockResolvedValue('Dex'),
      innerText: vi.fn().mockResolvedValue('Dex'),
      click: vi.fn().mockImplementation(async () => {
        choiceSelected = true
      }),
    }
    const choices = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(() => choice),
    }
    const group = { getByRole: vi.fn(() => choices) }
    const confirm = {
      isEnabled: vi.fn().mockImplementation(async () => choiceSelected),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const decisionSurface = {
      getByRole: vi.fn((role: string) => (role === 'group' ? group : confirm)),
    }

    const selectedLabel = await chooseAndConfirmSingleChoice(
      decisionSurface as never,
      /^Name the First Replacement$/,
      'Confirm replacement'
    )

    expect(decisionSurface.getByRole).toHaveBeenNthCalledWith(1, 'group', {
      name: /^Name the First Replacement$/,
    })
    expect(choice.click).toHaveBeenCalledOnce()
    expect(confirm.click).toHaveBeenCalledOnce()
    expect(selectedLabel).toBe('Dex')
  })
})

function freshState(): RootState {
  return {
    ...structuredClone(store.getState()),
    game: createInitialGameState({ seed: 933 }),
  }
}

describe('Morning shock confirmation', () => {
  function shockPage(visible = true, confirmationVisible = true) {
    const confirm = {
      isVisible: vi.fn().mockResolvedValue(confirmationVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const dialog = {
      isVisible: vi.fn().mockResolvedValue(visible),
      getByRole: vi.fn(() => confirm),
      waitFor: vi.fn().mockResolvedValue(undefined),
    }
    const page = { getByRole: vi.fn(() => dialog) } as unknown as Page
    return { page, dialog, confirm }
  }

  it('confirms the visible removal card and waits for it to close', async () => {
    const { page, dialog, confirm } = shockPage()

    expect(await resolveDayStartShock(page)).toBe(true)
    expect(page.getByRole).toHaveBeenCalledWith('dialog', { name: /^Pack your bags,/ })
    expect(dialog.getByRole).toHaveBeenCalledWith('button', { name: /^Give .+ the boot$/ })
    expect(confirm.click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(dialog.waitFor).toHaveBeenCalledWith({ state: 'hidden', timeout: expect.any(Number) })
  })

  it('does nothing when the removal card is not visible', async () => {
    const { page, dialog, confirm } = shockPage(false)

    expect(await resolveDayStartShock(page)).toBe(false)
    expect(dialog.getByRole).not.toHaveBeenCalled()
    expect(confirm.click).not.toHaveBeenCalled()
  })

  it('does nothing when the card has no visible confirmation', async () => {
    const { page, confirm } = shockPage(true, false)

    expect(await resolveDayStartShock(page)).toBe(false)
    expect(confirm.click).not.toHaveBeenCalled()
  })
})

describe('minigame briefing exit path', () => {
  function briefingPage({ visible = true, kickerVisible = true, startVisible = true } = {}) {
    const start = {
      isVisible: vi.fn().mockResolvedValue(startVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const kicker = { isVisible: vi.fn().mockResolvedValue(kickerVisible) }
    const briefing = {
      isVisible: vi.fn().mockResolvedValue(visible),
      getByText: vi.fn(() => kicker),
      getByRole: vi.fn(() => start),
    }
    const page = {
      getByRole: vi.fn(() => ({ last: () => briefing })),
    } as unknown as Page
    return { page, briefing, kicker, start }
  }

  it('starts a visible competition briefing so the helper can use the official exit controls', async () => {
    const { page, briefing, kicker, start } = briefingPage()

    expect(await startVisibleCompetitionBriefing(page)).toBe(true)
    expect(page.getByRole).toHaveBeenCalledWith('dialog', { name: /rules$/i })
    expect(briefing.getByText).toHaveBeenCalledWith('Competition briefing', { exact: true })
    expect(kicker.isVisible).toHaveBeenCalledOnce()
    expect(start.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('does not treat the in-game quick reference as a new competition briefing', async () => {
    const { page, start } = briefingPage({ kickerVisible: false })

    expect(await startVisibleCompetitionBriefing(page)).toBe(false)
    expect(start.click).not.toHaveBeenCalled()
  })

  it('opens a game rules screen only to reach the visible zero-score exit controls', async () => {
    let gameStarted = false
    let menuOpened = false
    let leaveSelected = false
    let exited = false
    const menu = {
      isVisible: vi.fn(async () => gameStarted),
      waitFor: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockImplementation(async () => {
        menuOpened = true
      }),
    }
    const startCompetition = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockImplementation(async () => {
        gameStarted = true
      }),
    }
    const rules = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn(() => startCompetition),
    }
    const leaveCompetition = {
      click: vi.fn().mockImplementation(async () => {
        leaveSelected = true
      }),
    }
    const exitWithZero = {
      click: vi.fn().mockImplementation(async () => {
        exited = true
      }),
    }
    const continueButton = {
      first: vi.fn(() => continueButton),
      waitFor: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const page = {
      getByRole: vi.fn((role: string, options?: { name?: RegExp | string }) => {
        if (role === 'button' && options?.name === 'Open minigame menu') return menu
        if (role === 'dialog' && options?.name instanceof RegExp) return { last: () => rules }
        if (role === 'menuitem' && options?.name instanceof RegExp) {
          return { click: leaveCompetition.click, isVisible: async () => menuOpened }
        }
        if (role === 'button' && options?.name === 'Exit with 0') {
          return { click: exitWithZero.click, isVisible: async () => leaveSelected }
        }
        if (role === 'button' && options?.name instanceof RegExp) return continueButton
        return { isVisible: async () => false }
      }),
    } as unknown as Page

    expect(await exitVisibleMinigameWithZero(page)).toBe(true)
    expect(startCompetition.click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(menu.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 5_000 })
    expect(leaveCompetition.click).toHaveBeenCalledOnce()
    expect(exitWithZero.click).toHaveBeenCalledOnce()
    expect(continueButton.click).toHaveBeenCalledOnce()
    expect(exited).toBe(true)
  })
})

describe('TV announcement acknowledgement', () => {
  it('waits for the Tribunal overlay instead of clicking Play behind it', async () => {
    const invisible = { isVisible: async () => false }
    const playClick = vi.fn()
    const page = {
      viewportSize: () => null,
      mouse: { move: vi.fn() },
      locator: () => invisible,
      getByTestId: () => ({ locator: () => ({ last: () => invisible }), last: () => invisible }),
      getByRole: (_role: string, options?: { name?: RegExp | string }) => {
        if (_role === 'dialog' && typeof options?.name === 'string') return invisible
        if (_role === 'dialog' && options?.name instanceof RegExp) {
          if (options.name.source.startsWith('^Announcement:')) {
            return {
              isVisible: async () => true,
              getByRole: () => ({ first: () => invisible }),
            }
          }
          return { filter: () => ({ first: () => ({ isVisible: async () => true }) }) }
        }
        if (_role === 'button') return { filter: () => ({ first: () => invisible }) }
        return {
          getByRole: () => ({ filter: () => ({ first: () => ({ click: playClick }) }) }),
        }
      },
    } as unknown as Page

    expect(await dismissAnnouncement(page)).toBe(false)
    expect(playClick).not.toHaveBeenCalled()
  })

  it('uses a visible OK control beside the Back 2 the Game announcement dialog', async () => {
    const acknowledgement = {
      isVisible: vi.fn().mockResolvedValue(false),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const announcement = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn(() => ({ first: () => ({ isVisible: async () => false }) })),
    }
    const overlays = {
      locator: vi.fn(() => ({ last: () => acknowledgement })),
      last: () => ({ isVisible: async () => false }),
    }
    const standaloneAcknowledgement = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
      filter: vi.fn(() => standaloneAcknowledgement),
      first: vi.fn(() => standaloneAcknowledgement),
    }
    const page = {
      viewportSize: vi.fn(() => null),
      mouse: { move: vi.fn().mockResolvedValue(undefined) },
      locator: vi.fn(() => ({ isVisible: async () => false })),
      getByTestId: vi.fn(() => overlays),
      getByRole: vi.fn((role: string, options?: { name?: RegExp | string }) => {
        if (role === 'dialog' && options?.name instanceof RegExp) {
          return options.name.source.startsWith('^Announcement:')
            ? announcement
            : { isVisible: async () => false }
        }
        if (role === 'button' && options?.name === 'OK') return standaloneAcknowledgement
        return { isVisible: async () => false }
      }),
    } as unknown as Page

    expect(await dismissAnnouncement(page)).toBe(true)
    expect(standaloneAcknowledgement.filter).toHaveBeenCalledWith({ visible: true })
    expect(standaloneAcknowledgement.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })
})

function acknowledgementPage(
  visibility: boolean[],
  clickError?: Error,
  overlayVisible = true,
  cupidBreakVisibility = false,
  latestOverlayHasAcknowledgement = true
) {
  const isVisible = vi.fn().mockResolvedValue(false)
  visibility.forEach((visible) => isVisible.mockResolvedValueOnce(visible))
  const click = vi.fn().mockResolvedValue(undefined)
  if (clickError) click.mockRejectedValueOnce(clickError)
  const overlayHandle = {
    waitForElementState: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
  const overlay = {
    elementHandle: vi.fn().mockResolvedValue(overlayHandle),
    isVisible: vi.fn().mockResolvedValue(overlayVisible),
    waitFor: vi.fn().mockResolvedValue(undefined),
  }
  const latestOverlay = latestOverlayHasAcknowledgement
    ? overlay
    : {
        isVisible: vi.fn().mockResolvedValue(overlayVisible),
        elementHandle: vi.fn().mockResolvedValue(overlayHandle),
      }
  const acknowledgement = {
    isVisible,
    waitFor: vi.fn().mockResolvedValue(undefined),
    elementHandle: vi.fn().mockResolvedValue({
      click,
      isVisible,
      dispose: vi.fn().mockResolvedValue(undefined),
    }),
    locator: vi.fn(() => overlay),
  }
  const overlays = {
    locator: vi.fn(() => ({ last: () => acknowledgement })),
    last: () => latestOverlay,
  }
  const cupidBreakOverlay = {
    isVisible: vi.fn().mockResolvedValue(cupidBreakVisibility),
    waitFor: vi.fn().mockResolvedValue(undefined),
  }
  const page = {
    locator: vi.fn(() => cupidBreakOverlay),
    getByTestId: vi.fn(() => overlays),
  } as unknown as Page
  return { page, click, overlay, overlayHandle, latestOverlay, cupidBreakOverlay, acknowledgement }
}

describe('shock acknowledgement handoff', () => {
  it('skips an acknowledgement that is not visible', async () => {
    const { page, click } = acknowledgementPage([false], undefined, false)

    expect(await dismissShockAcknowledgement(page)).toBe(false)
    expect(click).not.toHaveBeenCalled()
  })

  it('waits briefly for OK to appear as a shock screen mounts', async () => {
    const { page, click, acknowledgement, overlayHandle } = acknowledgementPage([false, true])

    expect(await dismissShockAcknowledgement(page)).toBe(true)
    expect(acknowledgement.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 3_000 })
    expect(click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(overlayHandle.waitForElementState).toHaveBeenCalledWith('hidden', { timeout: 15_000 })
  })

  it('waits on the exact overlay when a visible shock has no acknowledgement button', async () => {
    const { page, acknowledgement, latestOverlay, overlayHandle } = acknowledgementPage(
      [false, false],
      undefined,
      true,
      false,
      false
    )
    acknowledgement.waitFor.mockRejectedValueOnce(new errors.TimeoutError('no OK control'))

    expect(await dismissShockAcknowledgement(page)).toBe(true)
    expect(latestOverlay.elementHandle).toHaveBeenCalledOnce()
    expect(overlayHandle.waitForElementState).toHaveBeenCalledWith('hidden', { timeout: 15_000 })
  })

  it('clicks the visible acknowledgement with a bounded timeout', async () => {
    const { page, click, overlay, overlayHandle } = acknowledgementPage([true])

    expect(await dismissShockAcknowledgement(page)).toBe(true)
    expect(click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(overlay.elementHandle).toHaveBeenCalledOnce()
    expect(overlayHandle.waitForElementState).toHaveBeenCalledWith('hidden', { timeout: 15_000 })
  })

  it('finds the visible acknowledgement when a newer overlay has no button', async () => {
    const { page, click, overlayHandle, latestOverlay } = acknowledgementPage(
      [true],
      undefined,
      true,
      false,
      false
    )

    expect(await dismissShockAcknowledgement(page)).toBe(true)
    expect(click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(overlayHandle.waitForElementState).toHaveBeenCalledWith('hidden', { timeout: 15_000 })
    expect(latestOverlay.elementHandle).not.toHaveBeenCalled()
  })

  it('waits for Cupid’s automatic spell-break screen to finish before using controls beneath it', async () => {
    const { page, click, cupidBreakOverlay } = acknowledgementPage([false], undefined, true, true)

    expect(await dismissShockAcknowledgement(page)).toBe(true)
    expect(click).not.toHaveBeenCalled()
    expect(cupidBreakOverlay.waitFor).toHaveBeenCalledWith({ state: 'hidden', timeout: 15_000 })
  })

  it('handles Cupid’s spell break before the shock announcement queued underneath it', async () => {
    const { page, click, overlayHandle, cupidBreakOverlay } = acknowledgementPage(
      [true],
      undefined,
      true,
      true
    )

    expect(await dismissShockAcknowledgement(page)).toBe(true)
    expect(cupidBreakOverlay.waitFor).toHaveBeenCalledWith({ state: 'hidden', timeout: 15_000 })
    expect(click).not.toHaveBeenCalled()
    expect(overlayHandle.waitForElementState).not.toHaveBeenCalled()

    cupidBreakOverlay.isVisible.mockResolvedValue(false)
    expect(await dismissShockAcknowledgement(page)).toBe(true)
    expect(click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(overlayHandle.waitForElementState).toHaveBeenCalledWith('hidden', { timeout: 15_000 })
  })

  it('accepts a handoff that removes the acknowledgement before its click', async () => {
    const { page } = acknowledgementPage([true, false], new errors.TimeoutError('removed'))

    expect(await dismissShockAcknowledgement(page)).toBe(true)
  })

  it('reports a timed-out acknowledgement that remains visible', async () => {
    const failure = new errors.TimeoutError('button remains blocked')
    const { page } = acknowledgementPage([true, true], failure)

    await expect(dismissShockAcknowledgement(page)).rejects.toBe(failure)
  })

  it('preserves failures other than a click timeout', async () => {
    const failure = new Error('page crashed')
    const { page } = acknowledgementPage([true, false], failure)

    await expect(dismissShockAcknowledgement(page)).rejects.toBe(failure)
  })
})

describe('overlapping Cupid elimination animations', () => {
  function eliminationPage(
    visible = true,
    enabled = true,
    activeModalCount = 0,
    evictionModalCount = 0
  ) {
    const selectedButton = {
      click: vi.fn().mockResolvedValue(undefined),
      waitForElementState: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const partnerButton = { waitForElementState: vi.fn() }
    const latestVisibleSkip = {
      isVisible: vi.fn().mockResolvedValue(visible),
      isEnabled: vi.fn().mockResolvedValue(enabled),
      elementHandle: vi
        .fn()
        .mockResolvedValueOnce(selectedButton)
        .mockResolvedValueOnce(partnerButton),
    }
    const last = vi.fn(() => latestVisibleSkip)
    const filter = vi.fn(() => ({ last }))
    const activeModal = { count: vi.fn().mockResolvedValue(activeModalCount) }
    const evictionModal = { count: vi.fn().mockResolvedValue(evictionModalCount) }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: string }) =>
        options?.name === 'Surveyeval run ended' ? { isVisible: async () => false } : { filter }
      ),
      locator: vi.fn((selector: string) => ({
        filter: vi.fn(() =>
          selector.startsWith('[data-presentation-root="eviction-spotlight"]')
            ? evictionModal
            : activeModal
        ),
      })),
    } as unknown as Page
    return {
      page,
      selectedButton,
      partnerButton,
      latestVisibleSkip,
      last,
      filter,
      activeModal,
      evictionModal,
    }
  }

  it('waits for the clicked button rather than resolving the overlapping partner button', async () => {
    const fixture = eliminationPage()

    expect(await skipEliminationAnimation(fixture.page)).toBe(true)
    expect(fixture.filter).toHaveBeenCalledWith({ visible: true })
    expect(fixture.last).toHaveBeenCalledOnce()
    expect(fixture.latestVisibleSkip.elementHandle).toHaveBeenCalledOnce()
    expect(fixture.selectedButton.click).toHaveBeenCalledWith({
      noWaitAfter: true,
      timeout: 5_000,
    })
    expect(fixture.selectedButton.waitForElementState).toHaveBeenCalledWith('hidden', {
      timeout: 30_000,
    })
    expect(fixture.partnerButton.waitForElementState).not.toHaveBeenCalled()
    expect(fixture.selectedButton.dispose).toHaveBeenCalledOnce()
  })

  it('uses the skip control inside its own eviction modal', async () => {
    const fixture = eliminationPage(true, true, 1, 1)

    expect(await skipEliminationAnimation(fixture.page)).toBe(true)
    expect(fixture.selectedButton.click).toHaveBeenCalledOnce()
  })

  it('does not click through an unrelated modal beside the eviction presentation', async () => {
    const fixture = eliminationPage(true, true, 2, 1)

    expect(await skipEliminationAnimation(fixture.page)).toBe(false)
    expect(fixture.selectedButton.click).not.toHaveBeenCalled()
  })

  it.each([
    { visible: false, enabled: true },
    { visible: true, enabled: false },
  ])('does not click an unavailable skip control (%j)', async ({ visible, enabled }) => {
    const fixture = eliminationPage(visible, enabled)

    expect(await skipEliminationAnimation(fixture.page)).toBe(false)
    expect(fixture.selectedButton.click).not.toHaveBeenCalled()
  })

  it('preserves a failure when the selected animation does not disappear', async () => {
    const fixture = eliminationPage()
    const failure = new errors.TimeoutError('selected elimination remains visible')
    fixture.selectedButton.waitForElementState.mockRejectedValueOnce(failure)

    await expect(skipEliminationAnimation(fixture.page)).rejects.toBe(failure)
    expect(fixture.selectedButton.dispose).toHaveBeenCalledOnce()
  })
})

describe('explicit Survival recovery', () => {
  it('does not trigger ad recovery while skipping an elimination presentation', async () => {
    const adButton = { click: vi.fn() }
    const ended = { getByRole: vi.fn(() => adButton) }
    const page = {
      getByRole: vi.fn(() => ended),
      locator: vi.fn((selector: string) => ({
        filter: () => ({
          count: async () =>
            selector.startsWith('[data-presentation-root="eviction-spotlight"]') ? 0 : 1,
        }),
      })),
    } as unknown as Page

    expect(await skipEliminationAnimation(page)).toBe(false)
    expect(page.getByRole).not.toHaveBeenCalled()
    expect(adButton.click).not.toHaveBeenCalled()
  })

  it('uses the visible continue and reassemble controls when offered', async () => {
    const recoveryButton = {
      click: vi.fn().mockResolvedValue(undefined),
    }
    const recovery = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      getByRole: vi.fn(() => recoveryButton),
    }
    const anotherChance = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const ended = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn(() => anotherChance),
      waitFor: vi.fn().mockResolvedValue(undefined),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: string }) =>
        options?.name === 'Surveyeval run ended' ? ended : recovery
      ),
    } as unknown as Page

    expect(await continueSurvivalAfterElimination(page)).toBe(true)
    expect(anotherChance.click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(recoveryButton.click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(recovery.waitFor).toHaveBeenNthCalledWith(1, { state: 'visible', timeout: 15_000 })
    expect(recovery.waitFor).toHaveBeenNthCalledWith(2, { state: 'hidden', timeout: 30_000 })
    expect(ended.waitFor).toHaveBeenCalledWith({ state: 'hidden', timeout: 30_000 })
  })

  it('leaves Survival ended when no further recovery is available', async () => {
    const anotherChance = {
      isVisible: vi.fn().mockResolvedValue(false),
      click: vi.fn(),
    }
    const ended = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn(() => anotherChance),
    }
    const page = {
      getByRole: vi.fn(() => ended),
    } as unknown as Page

    expect(await continueSurvivalAfterElimination(page)).toBe(false)
    expect(anotherChance.click).not.toHaveBeenCalled()
  })
})

describe('season audit contestant statuses', () => {
  it.each(['active', 'nominated', 'loh', 'pos', 'loh+pos', 'nominated+pos'] as const)(
    'counts %s as still in the game',
    (status) => expect(isActiveGamePlayerStatus(status)).toBe(true)
  )

  it.each(['evicted', 'jury'] as const)('does not count %s as still in the house', (status) => {
    expect(isActiveGamePlayerStatus(status)).toBe(false)
  })
})
describe('required Democracia vote prompt', () => {
  function votePrompt({ visible = true, confirmVisible = false, selected = false } = {}) {
    const option = { click: vi.fn().mockResolvedValue(undefined) }
    const options = { count: vi.fn().mockResolvedValue(3), first: vi.fn(() => option) }
    const selectedOptions = { count: vi.fn().mockResolvedValue(selected ? 1 : 0) }
    const confirm = {
      isVisible: vi.fn().mockResolvedValue(confirmVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const dialog = {
      isVisible: vi.fn().mockResolvedValue(visible),
      getByRole: vi.fn(() => confirm),
      locator: vi.fn((selector: string) =>
        selector === 'button[aria-pressed="true"]' ? selectedOptions : options
      ),
      waitFor: vi.fn().mockResolvedValue(undefined),
    }
    const page = { getByRole: vi.fn(() => dialog) } as unknown as Page
    return { page, dialog, option, confirm }
  }

  it('selects a visible candidate before confirming the vote', async () => {
    const fixture = votePrompt()

    expect(await resolveDemocraciaVoteModal(fixture.page)).toBe(true)
    expect(fixture.option.click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(fixture.confirm.click).not.toHaveBeenCalled()
  })

  it('confirms a selected candidate and waits for the vote prompt to close', async () => {
    const fixture = votePrompt({ confirmVisible: true, selected: true })

    expect(await resolveDemocraciaVoteModal(fixture.page)).toBe(true)
    expect(fixture.confirm.click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(fixture.dialog.waitFor).toHaveBeenCalledWith({ state: 'hidden', timeout: 30_000 })
  })

  it('does nothing when the Democracia vote prompt is not visible', async () => {
    const fixture = votePrompt({ visible: false })

    expect(await resolveDemocraciaVoteModal(fixture.page)).toBe(false)
    expect(fixture.option.click).not.toHaveBeenCalled()
  })
})
describe('optional ballot reveal prompt', () => {
  it('keeps the secret ballots private without opening the ad offer', async () => {
    const keepSecret = {
      click: vi.fn().mockResolvedValue(undefined),
    }
    const prompt = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn(() => keepSecret),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: string }) =>
        options?.name === 'Reveal the Secret Ballots?' ? prompt : { isVisible: async () => false }
      ),
    } as unknown as Page

    expect(await skipOptionalVoteReveal(page)).toBe(true)
    expect(prompt.getByRole).toHaveBeenCalledWith('button', {
      name: 'Keep the Ballots Secret',
      exact: true,
    })
    expect(keepSecret.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })
})
describe('weekend Hub Says poll helper', () => {
  function pollPage({ visible = true, alreadySelected = false } = {}) {
    const choice = {
      isEnabled: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const choices = {
      count: vi.fn().mockResolvedValue(4),
      first: vi.fn(() => choice),
    }
    const selected = { count: vi.fn().mockResolvedValue(alreadySelected ? 1 : 0) }
    const poll = {
      isVisible: vi.fn().mockResolvedValue(visible),
      locator: vi.fn((selector: string) =>
        selector === 'button[aria-pressed="true"]' ? selected : choices
      ),
    }
    const page = { getByRole: vi.fn(() => poll) } as unknown as Page
    return { page, poll, choice }
  }

  it('chooses one visible Hub Says response so the primary action can submit it', async () => {
    const fixture = pollPage()

    expect(await chooseWeekendHubSaysAnswer(fixture.page)).toBe(true)
    expect(fixture.choice.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('does not replace a response that is already selected', async () => {
    const fixture = pollPage({ alreadySelected: true })

    expect(await chooseWeekendHubSaysAnswer(fixture.page)).toBe(false)
    expect(fixture.choice.click).not.toHaveBeenCalled()
  })

  it('ignores the helper when no Hub Says poll is visible', async () => {
    const fixture = pollPage({ visible: false })

    expect(await chooseWeekendHubSaysAnswer(fixture.page)).toBe(false)
    expect(fixture.choice.click).not.toHaveBeenCalled()
  })
})
describe('finale presentation controls', () => {
  function spectatorPage() {
    const skip = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const spectator = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn(() => skip),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) =>
        options?.name instanceof RegExp && options.name.source.startsWith('^Spectator Mode:')
          ? spectator
          : { isVisible: async () => false }
      ),
    } as unknown as Page
    return { page, spectator, skip }
  }

  function final3PleaPage({ skipVisible = false, continueVisible = false } = {}) {
    const skip = {
      isVisible: vi.fn().mockResolvedValue(skipVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const continueButton = {
      isVisible: vi.fn().mockResolvedValue(continueVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const chat = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) =>
        options?.name === 'Skip to end' ? skip : continueButton
      ),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) =>
        options?.name === 'The Finale plea chat' ? chat : { isVisible: async () => false }
      ),
    } as unknown as Page
    return { page, chat, skip, continueButton }
  }

  function final3AnnouncementPage({ skipVisible = false, continueVisible = false } = {}) {
    const skip = {
      isVisible: vi.fn().mockResolvedValue(skipVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const continueButton = {
      isVisible: vi.fn().mockResolvedValue(continueVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const announcement = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) =>
        options?.name === 'Skip to end' ? skip : continueButton
      ),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) =>
        options?.name === 'The Finale elimination announcement'
          ? announcement
          : { isVisible: async () => false }
      ),
    } as unknown as Page
    return { page, announcement, skip, continueButton }
  }

  function finalPowerHolderPage() {
    const play = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const reveal = { isVisible: vi.fn().mockResolvedValue(true) }
    const page = {
      getByRole: vi.fn((role: string, options?: { name?: RegExp | string }) => {
        if (
          role === 'dialog' &&
          options?.name instanceof RegExp &&
          options.name.source.includes('Final Power holder')
        ) {
          return reveal
        }
        if (role === 'button' && options?.name === 'Play finale scene') return play
        return { isVisible: async () => false }
      }),
    } as unknown as Page
    return { page, play, reveal }
  }

  function tribunalRevealPage({ skipVisible = false, enterVoteVisible = false } = {}) {
    const skip = {
      isVisible: vi.fn().mockResolvedValue(skipVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const enterVote = {
      isVisible: vi.fn().mockResolvedValue(enterVoteVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const reveal = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) =>
        options?.name === 'Skip sequence' ? skip : enterVote
      ),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) =>
        options?.name === 'The Tribunal Takes Control' ? reveal : { isVisible: async () => false }
      ),
    } as unknown as Page
    return { page, reveal, skip, enterVote }
  }

  function final4Page({ voteVisible = false, skipVisible = false, continueVisible = false } = {}) {
    const vote = {
      isVisible: vi.fn().mockResolvedValue(voteVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const voteChoices = {
      isVisible: vi.fn().mockResolvedValue(voteVisible),
      getByRole: vi.fn(() => ({ first: () => vote })),
    }
    const skip = {
      isVisible: vi.fn().mockResolvedValue(skipVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const continueButton = {
      isVisible: vi.fn().mockResolvedValue(continueVisible),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const chat = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) => {
        if (options?.name === 'Final 4 vote choices') return voteChoices
        if (options?.name instanceof RegExp) return skip
        return continueButton
      }),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) =>
        options?.name === 'Final 4 plea chat' ? chat : { isVisible: async () => false }
      ),
    } as unknown as Page
    return { page, chat, vote, skip, continueButton }
  }

  it('skips the Final Three plea chat through its visible control', async () => {
    const fixture = final3PleaPage({ skipVisible: true })

    expect(await advanceFinalePresentation(fixture.page)).toBe(true)
    expect(fixture.chat.getByRole).toHaveBeenCalledWith('button', {
      name: 'Skip to end',
      exact: true,
    })
    expect(fixture.skip.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('skips a spectator competition through its visible results control', async () => {
    const fixture = spectatorPage()

    expect(await advanceFinalePresentation(fixture.page)).toBe(true)
    expect(fixture.spectator.getByRole).toHaveBeenCalledWith('button', {
      name: 'Skip to Results',
      exact: true,
    })
    expect(fixture.skip.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('presses the visible finale control after the Final Power holder reveal', async () => {
    const fixture = finalPowerHolderPage()

    expect(await advanceFinalePresentation(fixture.page)).toBe(true)
    expect(fixture.page.getByRole).toHaveBeenCalledWith('dialog', {
      name: /, Final Power holder$/,
    })
    expect(fixture.page.getByRole).toHaveBeenCalledWith('button', {
      name: 'Play finale scene',
      exact: true,
    })
    expect(fixture.play.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('skips the Tribunal handoff animation through its visible control', async () => {
    const fixture = tribunalRevealPage({ skipVisible: true })

    expect(await advanceFinalePresentation(fixture.page)).toBe(true)
    expect(fixture.skip.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('enters the Final Two vote through the visible Tribunal control', async () => {
    const fixture = tribunalRevealPage({ enterVoteVisible: true })

    expect(await advanceFinalePresentation(fixture.page)).toBe(true)
    expect(fixture.enterVote.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('waits for the recap handoff when the final Tribunal control is disabled', async () => {
    const hiddenControl = {
      isVisible: vi.fn().mockResolvedValue(false),
      first: vi.fn(() => hiddenControl),
    }
    const startingRecap = {
      isVisible: vi.fn().mockResolvedValue(true),
    }
    const tribunal = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) =>
        options?.name === 'Starting recap…' ? startingRecap : hiddenControl
      ),
    }
    const recapArchive = {
      isVisible: vi.fn().mockResolvedValue(false),
      waitFor: vi.fn().mockResolvedValue(undefined),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) => {
        if (options?.name === 'Tribunal Finale') return tribunal
        if (options?.name === 'Season recap archive') return recapArchive
        return hiddenControl
      }),
    } as unknown as Page

    expect(await advanceFinalePresentation(page)).toBe(true)
    expect(recapArchive.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 15_000 })
  })

  it('accepts the winner announcement when Continue detaches during the Tribunal handoff', async () => {
    const hiddenControl = {
      isVisible: vi.fn().mockResolvedValue(false),
      first: vi.fn(() => hiddenControl),
    }
    const continueButton = {
      isVisible: vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false),
      click: vi.fn().mockRejectedValue(new errors.TimeoutError('detached during handoff')),
    }
    const tribunal = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) =>
        options?.name instanceof RegExp && options.name.source.startsWith('^Continue')
          ? continueButton
          : hiddenControl
      ),
    }
    const winnerAnnouncement = { isVisible: vi.fn().mockResolvedValue(true) }
    const recapArchive = { isVisible: vi.fn().mockResolvedValue(false) }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: RegExp | string }) => {
        if (options?.name === 'Tribunal Finale') return tribunal
        if (options?.name === 'Season recap archive') return recapArchive
        if (options?.name instanceof RegExp && options.name.source.startsWith('^Announcement:')) {
          return winnerAnnouncement
        }
        return hiddenControl
      }),
    } as unknown as Page

    expect(await advanceFinalePresentation(page)).toBe(true)
    expect(continueButton.click).toHaveBeenCalledWith({ timeout: 3_000 })
    expect(winnerAnnouncement.isVisible).toHaveBeenCalledOnce()
  })

  it('continues the Final Three plea chat when no skip control is visible', async () => {
    const fixture = final3PleaPage({ continueVisible: true })

    expect(await advanceFinalePresentation(fixture.page)).toBe(true)
    expect(fixture.continueButton.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('skips the Final Three elimination announcement through its visible control', async () => {
    const fixture = final3AnnouncementPage({ skipVisible: true })

    expect(await advanceFinalePresentation(fixture.page)).toBe(true)
    expect(fixture.announcement.getByRole).toHaveBeenCalledWith('button', {
      name: 'Skip to end',
      exact: true,
    })
    expect(fixture.skip.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('uses the visible Continue button after the Final 4 pleas finish', async () => {
    const fixture = final4Page({ continueVisible: true })

    expect(await advanceFinalePresentation(fixture.page)).toBe(true)
    expect(fixture.continueButton.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('casts a visible Final 4 vote when the player holds the sole vote', async () => {
    const fixture = final4Page({ voteVisible: true })

    expect(await advanceFinalePresentation(fixture.page)).toBe(true)
    expect(fixture.vote.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('skips the Final 4 plea presentation through its visible control', async () => {
    const fixture = final4Page({ skipVisible: true })

    expect(await advanceFinalePresentation(fixture.page)).toBe(true)
    expect(fixture.skip.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('skips the Final 4 elimination announcement through its visible control', async () => {
    const skip = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const announcement = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn(() => skip),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: string }) =>
        options?.name === 'Final 4 elimination announcement'
          ? announcement
          : { isVisible: async () => false }
      ),
    } as unknown as Page

    expect(await advanceFinalePresentation(page)).toBe(true)
    expect(announcement.getByRole).toHaveBeenCalledWith('button', {
      name: 'Skip to end',
      exact: true,
    })
    expect(skip.click).toHaveBeenCalledWith({ timeout: 3_000 })
  })

  it('exits the season recap archive so the completed season can be observed', async () => {
    const exit = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const archive = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn((_role: string, options?: { name?: string }) =>
        options?.name === 'Exit season recap' ? exit : { isVisible: async () => false }
      ),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: string }) =>
        options?.name === 'Season recap archive' ? archive : { isVisible: async () => false }
      ),
    } as unknown as Page

    expect(await advanceFinalePresentation(page)).toBe(true)
    expect(archive.getByRole).toHaveBeenCalledWith('button', { name: 'Exit season recap' })
    expect(exit.click).toHaveBeenCalledWith({ timeout: 30_000 })
  })

  it('locks the public favorite forecast before trying to fast forward the vote', async () => {
    const lock = {
      isVisible: vi.fn().mockResolvedValue(true),
      isEnabled: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const vote = { isVisible: async () => true, getByRole: vi.fn(() => lock) }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: string | RegExp }) =>
        options?.name instanceof RegExp && options.name.source.includes('Public')
          ? vote
          : { isVisible: async () => false }
      ),
    } as unknown as Page

    expect(await advanceFinalePresentation(page)).toBe(true)
    expect(vote.getByRole).toHaveBeenCalledWith('button', {
      name: 'Lock forecast',
      exact: true,
    })
    expect(lock.click).toHaveBeenCalledWith({ timeout: 30_000 })
  })
  it('uses the final-two showcase skip instead of clicking behind the modal', async () => {
    const skip = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const showcase = {
      isVisible: vi.fn().mockResolvedValue(true),
      getByRole: vi.fn(() => skip),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: string }) =>
        options?.name === 'Meet the final two' ? showcase : { isVisible: async () => false }
      ),
    } as unknown as Page

    expect(await advanceFinalePresentation(page)).toBe(true)
    expect(showcase.getByRole).toHaveBeenCalledWith('button', {
      name: 'Skip presentation',
      exact: true,
    })
    expect(skip.click).toHaveBeenCalledOnce()
  })

  it('does not report progress while a final-two showcase has no visible control', async () => {
    const showcase = {
      isVisible: async () => true,
      getByRole: () => ({ isVisible: async () => false }),
    }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: string }) =>
        options?.name === 'Meet the final two' ? showcase : { isVisible: async () => false }
      ),
    } as unknown as Page

    expect(await advanceFinalePresentation(page)).toBe(false)
  })

  it('rechecks a new announcement when the final-two showcase disappears before the click', async () => {
    const skip = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockRejectedValue(new errors.TimeoutError('showcase replaced')),
    }
    const showcase = {
      isVisible: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      getByRole: vi.fn(() => skip),
    }
    const announcement = { isVisible: vi.fn().mockResolvedValue(true) }
    const page = {
      getByRole: vi.fn((_role: string, options?: { name?: string | RegExp }) => {
        if (options?.name === 'Meet the final two') return showcase
        if (options?.name instanceof RegExp && options.name.source === '^Announcement:') {
          return announcement
        }
        return { isVisible: async () => false }
      }),
    } as unknown as Page

    expect(await advanceFinalePresentation(page)).toBe(true)
    expect(skip.click).toHaveBeenCalledWith({ timeout: 1_500 })
  })
})

describe.each(['classic', 'voxPopuli', 'cupidArrow'] as const)(
  '%s browser simulation completion',
  (mode) => {
    it('keeps playing a fresh finite season without an explicit run status', async () => {
      const state = freshState()
      delete state.game.status
      const adapter = getModeAdapter(mode)

      expect(await adapter.isTerminal(pageWithoutTerminalUi, state)).toBe(false)
      expect(await adapter.describeTerminal(pageWithoutTerminalUi, state)).toBeNull()
      expect(seasonOutcome(state, 'action-budget-reached').resolved).toBe(false)
    })

    it('still recognizes a completed run with an explicit status', async () => {
      const state = freshState()
      state.game.status = 'completed'
      const adapter = getModeAdapter(mode)

      expect(await adapter.isTerminal(pageWithoutTerminalUi, state)).toBe(true)
      expect(await adapter.describeTerminal(pageWithoutTerminalUi, state)).toBe('run-completed')
      expect(seasonOutcome(state, 'run-completed').resolved).toBe(true)
    })

    it('still recognizes an eliminated human when the run status is absent', async () => {
      const state = freshState()
      delete state.game.status
      const human = state.game.players.find((player) => player.isUser)!
      human.status = 'evicted'
      human.seasonPlacement = 8
      const adapter = getModeAdapter(mode)

      expect(await adapter.isTerminal(pageWithoutTerminalUi, state)).toBe(true)
      expect(await adapter.describeTerminal(pageWithoutTerminalUi, state)).toBe(
        'human-out-of-game-evicted'
      )
      expect(seasonOutcome(state, 'human-out-of-game-evicted').resolved).toBe(true)
    })
  }
)

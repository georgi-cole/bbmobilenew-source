/**
 * Tests for the SocialPanelV2 component.
 *
 * Covers:
 *  1. Does not render when game phase is not a social phase.
 *  2. Renders the modal during social_1 phase with a human player.
 *  3. Renders the modal during social_2 phase with a human player.
 *  4. Displays the human player's energy chip.
 *  5. Shows energy as 0 when no entry exists in energyBank.
 *  6. Renders player roster and action grid placeholders.
 *  7. Renders a disabled Execute button in the footer.
 *  8. Close button hides the modal.
 *  9. Does not render when there is no human player.
 * 10. Modal re-opens when transitioning between social_1 and social_2 after being closed.
 * 11. Execute button enabled when idle action (needsTargets: false) is selected.
 * 12. Execute button disabled when target-requiring action is selected without a player.
 * 13. Execute button enabled when action and a player are both selected.
 * 14. Execute shows success feedback after idle action is performed.
 * 15. Execute shows 'Insufficient resources' feedback when player cannot afford action.
 * 16. After successful execute, action selection is cleared (button returns to disabled).
 * 17. Execute button gains the pulse class immediately after a successful execution.
 * 18. Execute button pulse class is removed after 850 ms.
 * 19. [A11y] Resource chips have aria-live="polite".
 * 20. [A11y] Execute button has aria-busy attribute (false when idle).
 * 21. [A11y] Skip link is rendered inside the dialog.
 * 22. [A11y] Skip link href points to the body section (#sp2-body).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { Profiler } from 'react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { configureStore } from '@reduxjs/toolkit'
import settingsReducer from '../../../store/settingsSlice'
import gameReducer, { setPhase } from '../../../store/gameSlice'
import socialReducer, {
  setEnergyBankEntry,
  setInfluenceBankEntry,
  openSocialPanel,
  replaceRealityDomain,
} from '../../../social/socialSlice'
import { initManeuvers } from '../../../social/SocialManeuvers'
import SocialPanelV2 from '../SocialPanelV2'
import type { RootState } from '../../../store/store'
import { I18nProvider } from '../../../i18n/I18nProvider'
import { createInitialRealityDomainState } from '../../../social/reality/state'
import { createRealityAlliance } from '../../../social/reality/relationshipForms'
import {
  allianceRequestDecisionActors,
  manageAlliance,
  type AllianceManagementContext,
} from '../../../social/reality/allianceManagement'
import { markSocialTutorialHandled } from '../../../onboarding/tutorialGuidePreference'
import type { WeekendInterludeState } from '../../../types'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(overrides?: {
  phase?: string
  energyBank?: Record<string, number>
  hasHuman?: boolean
  humanStatus?: RootState['game']['players'][number]['status']
  /** Override status for specific players by id. */
  playerStatusOverrides?: Record<string, RootState['game']['players'][number]['status']>
  lohId?: string | null
  dramaMode?: boolean
  weekendInterlude?: WeekendInterludeState | null
  posWinnerId?: string | null
  povSavedId?: string | null
  nomineeIds?: string[]
}) {
  const base = configureStore({
    reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
  })
  const defaultState = base.getState() as RootState

  // Build the preloaded state by patching the default game state.
  let players =
    overrides?.hasHuman === false
      ? defaultState.game.players.map((p) => ({ ...p, isUser: false }))
      : defaultState.game.players.map((player) =>
          player.isUser && overrides?.humanStatus
            ? { ...player, status: overrides.humanStatus }
            : player
        )

  // Apply per-player status overrides (e.g. set a player to 'loh').
  if (overrides?.playerStatusOverrides) {
    const statusMap = overrides.playerStatusOverrides
    players = players.map((p) => {
      const newStatus = statusMap[p.id]
      return newStatus ? { ...p, status: newStatus } : p
    })
  }

  const preloadedState = {
    game: {
      ...defaultState.game,
      players,
      phase: (overrides?.phase ?? defaultState.game.phase) as RootState['game']['phase'],
      lohId: overrides?.lohId ?? defaultState.game.lohId,
      posWinnerId: overrides?.posWinnerId ?? defaultState.game.posWinnerId,
      povSavedId: overrides?.povSavedId ?? defaultState.game.povSavedId,
      nomineeIds: overrides?.nomineeIds ?? defaultState.game.nomineeIds,
      weekendInterlude: overrides?.weekendInterlude ?? defaultState.game.weekendInterlude,
    },
    social: defaultState.social,
    settings: {
      ...defaultState.settings,
      gameUX: { ...defaultState.settings.gameUX, dramaMode: overrides?.dramaMode ?? false },
    },
  }

  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
    preloadedState,
  })

  if (overrides?.energyBank) {
    for (const [id, value] of Object.entries(overrides.energyBank)) {
      store.dispatch(setEnergyBankEntry({ playerId: id, value }))
    }
  }

  return store
}

function renderPanel(store: ReturnType<typeof makeStore>) {
  // These action-flow tests assert the Social dialog directly; onboarding is
  // covered by its own integration suite and must not add a second dialog.
  markSocialTutorialHandled(null, false, 'reality')
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <I18nProvider>
          <SocialPanelV2 />
        </I18nProvider>
      </Provider>
    </MemoryRouter>
  )
}

function allianceContextForStore(
  store: ReturnType<typeof makeStore>,
  viewerActorId: string
): AllianceManagementContext {
  const game = store.getState().game
  const activePlayers = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  return {
    at: { day: game.week, phase: game.phase },
    activeActorIds: activePlayers.map((player) => player.id),
    humanActorIds: activePlayers.map((player) => player.id),
    displayNames: Object.fromEntries(game.players.map((player) => [player.id, player.name])),
    viewerActorId,
    seed: game.seed ?? 1,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SocialPanelV2 – visibility', () => {
  it('does not render when phase is not social', () => {
    const store = makeStore({ phase: 'loh_comp' })
    renderPanel(store)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not render during social_1 unless explicitly opened', () => {
    const store = makeStore({ phase: 'social_1' })
    renderPanel(store)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('skips resource-driven renders while closed and refreshes when opened again', () => {
    const store = makeStore({ phase: 'social_1' })
    const humanId = store.getState().game.players.find((player) => player.isUser)!.id
    store.dispatch(openSocialPanel())
    markSocialTutorialHandled(null, false, 'reality')
    let renderCount = 0
    render(
      <Profiler
        id="social-panel"
        onRender={() => {
          renderCount += 1
        }}
      >
        <MemoryRouter>
          <Provider store={store}>
            <I18nProvider>
              <SocialPanelV2 />
            </I18nProvider>
          </Provider>
        </MemoryRouter>
      </Profiler>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))
    const closedRenderCount = renderCount
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 8 }))
    })
    expect(renderCount).toBe(closedRenderCount)

    act(() => store.dispatch(openSocialPanel()))
    expect(screen.getByLabelText('Energy: 8')).toBeInTheDocument()
  })

  it('renders during social_1 phase when opened via FAB', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('renders during social_2 phase when opened via FAB', () => {
    const store = makeStore({ phase: 'social_2' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('keeps weekend resources in the header beside Weekend Social without the subtitle', () => {
    const store = makeStore({
      phase: 'social_2',
      weekendInterlude: {
        active: true,
        afterDay: 5,
        weekendDay: 1,
        episode: 'party',
        stage: 'social',
        wallet: { energy: 23, influence: 999, info: 999 },
      },
    })
    act(() => store.dispatch(openSocialPanel()))
    renderPanel(store)

    const dialog = screen.getByRole('dialog', { name: 'Weekend Social' })
    const header = dialog.querySelector('.sp2-header')
    expect(header).not.toBeNull()
    expect(within(header as HTMLElement).getByText('Weekend Social')).toBeInTheDocument()
    expect(within(header as HTMLElement).queryByText(/Weekend Day/)).toBeNull()
    expect(within(header as HTMLElement).getByLabelText('Energy: 23')).toBeInTheDocument()
    expect(within(header as HTMLElement).getByLabelText('Influence: 999')).toBeInTheDocument()
    expect(within(header as HTMLElement).getByLabelText('Info: 999')).toBeInTheDocument()
  })

  it('renders for a nominated human player while still in the house', () => {
    const store = makeStore({ phase: 'social_1', humanStatus: 'nominated' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('does not render when there is no human player', () => {
    const store = makeStore({ phase: 'social_1', hasHuman: false })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('SocialPanelV2 – energy display', () => {
  it('displays the human player energy chip', () => {
    const store = makeStore({ phase: 'social_1' })
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 7 }))
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByLabelText(/Energy: 7/)).toBeDefined()
  })

  it('shows energy as 0 when no energyBank entry exists', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByLabelText(/Energy: 0/)).toBeDefined()
  })
})

describe('SocialPanelV2 – layout', () => {
  it('starts with targetless moves and reveals targeted moves after choosing a housemate', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)

    expect(screen.getByRole('button', { name: /Watch Room/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lay Low/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Compliment/i })).not.toBeInTheDocument()

    const target = store.getState().game.players.find((player) => !player.isUser)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(target.name, 'i') })[0])

    expect(screen.getByRole('button', { name: /Compliment/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Watch Room/i })).toBeInTheDocument()
  })

  it('clears a targeted move if the selected housemate is deselected', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)

    const target = store.getState().game.players.find((player) => !player.isUser)!
    const targetButton = screen.getAllByRole('button', { name: new RegExp(target.name, 'i') })[0]

    fireEvent.click(targetButton)
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    expect(screen.getByRole('button', { name: /Compliment/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    fireEvent.click(targetButton)

    expect(screen.queryByRole('button', { name: /Compliment/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Watch Room/i })).toBeInTheDocument()
  })

  it('renders player roster placeholder', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByLabelText('Player roster')).toBeDefined()
  })

  it('renders action grid placeholder', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByLabelText('Action grid')).toBeDefined()
  })

  it('renders a disabled Execute button', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders the Recent Activity log above the footer', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByLabelText('Recent Activity log')).toBeDefined()
  })

  it('Recent Activity log is outside the Action grid column', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const actionsColumn = screen.getByLabelText('Action grid')
    const recentLog = screen.getByLabelText('Recent Activity log')
    expect(actionsColumn.contains(recentLog)).toBe(false)
  })

  it('starts with no housemate selected and lets the same tap deselect them', () => {
    const store = makeStore({ phase: 'social_1' })
    const player = store.getState().game.players.find((candidate) => !candidate.isUser)!
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)

    const card = screen.getAllByRole('button', { name: new RegExp(player.name, 'i') })[0]!
    expect(card).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('SocialPanelV2 – close behaviour', () => {
  it('hides the modal when the close button is clicked', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByRole('dialog')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not re-open when the phase transitions after closing (FAB-only open)', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)

    // Close the modal.
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    // Phase transition should NOT re-open the panel.
    act(() => {
      store.dispatch(setPhase('social_2'))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes and logs the reason when the phase changes to live vote', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)

    expect(screen.getByRole('dialog')).toBeDefined()

    act(() => {
      store.dispatch(setPhase('live_vote'))
    })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(store.getState().social.panelOpen).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Outgoing social module did not open: Outgoing social actions are blocked during the live_vote phase.'
      ),
      expect.objectContaining({ phase: 'live_vote' })
    )

    warnSpy.mockRestore()
  })
})

// ── Execute flow ───────────────────────────────────────────────────────────

describe('SocialPanelV2 – execute flow', () => {
  let store: ReturnType<typeof makeStore>
  let humanId: string

  beforeEach(() => {
    store = makeStore({ phase: 'social_1' })
    humanId = store.getState().game.players.find((p) => p.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)
  })

  it('execute button is enabled when a targetless action (idle) is selected', () => {
    fireEvent.click(screen.getByRole('button', { name: /Lay Low/i }))
    expect(
      within(screen.getByRole('button', { name: /Lay Low/i })).getByLabelText('Energy cost: 0')
    ).toBeVisible()
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
    expect(btn).toHaveClass('sp2-moves__execute')
    expect(btn.closest('.sp2-moves__heading')).not.toBeNull()
  })

  it('execute stays disabled until a target and action have both been selected', () => {
    expect(screen.queryByRole('button', { name: /Compliment/i })).toBeNull()
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    const player = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(player.name, 'i') })[0])
    expect(btn).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    expect(btn).toBeEnabled()
  })

  it('group chat requires two people and its cost grows with the group', () => {
    const players = store
      .getState()
      .game.players.filter((p) => !p.isUser)
      .slice(0, 3)
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(players[0].name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Group Chat/i }))
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(players[1].name, 'i') })[0])
    expect((btn as HTMLButtonElement).disabled).toBe(false)
    expect(
      within(screen.getByRole('button', { name: /Group Chat/i })).getByLabelText('Energy cost: 2')
    ).toBeVisible()

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(players[2].name, 'i') })[0])
    expect(
      within(screen.getByRole('button', { name: /Group Chat/i })).getByLabelText('Energy cost: 3')
    ).toBeVisible()
  })

  it('does not execute any group target when the aggregate price is unaffordable', () => {
    const players = store
      .getState()
      .game.players.filter((p) => !p.isUser)
      .slice(0, 6)
    act(() => store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 3 })))
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(players[0].name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Group Chat/i }))
    players.slice(1).forEach((player) => {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(player.name, 'i') })[0])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    expect(store.getState().social.energyBank[humanId]).toBe(3)
    expect(store.getState().social.sessionLogs).toHaveLength(0)
    expect(screen.getByText(/Nothing was spent/)).toBeDefined()
  }, 60_000)

  it('keeps multi-select active for compatible actions and charges once per selected player', () => {
    const players = store
      .getState()
      .game.players.filter((p) => !p.isUser)
      .slice(0, 3)
    act(() => store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 })))
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(players[0].name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Group Chat/i }))
    players.slice(1).forEach((player) => {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(player.name, 'i') })[0])
    })
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    expect(
      within(screen.getByRole('button', { name: /Compliment/i })).getByLabelText('Energy cost: 3')
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    expect(store.getState().social.energyBank[humanId]).toBe(2)
    const logs = store
      .getState()
      .social.sessionLogs.filter((entry) => entry.actionId === 'compliment')
    expect(logs.map((entry) => entry.targetId).sort()).toEqual(
      players.map((player) => player.id).sort()
    )
  })

  it('clears action and player selection after closing and reopening the panel', () => {
    const player = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(player.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(
      false
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))
    act(() => store.dispatch(openSocialPanel()))

    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    expect(screen.queryByRole('button', { name: /Compliment/i })).toBeNull()
  })

  it('keeps target-dependent actions visible when a targetless move is selected', () => {
    cleanup()
    store = makeStore({ phase: 'social_1', dramaMode: true })
    humanId = store.getState().game.players.find((player) => player.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    const target = store.getState().game.players.find((player) => !player.isUser)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(target.name, 'i') })[0])

    expect(screen.getByRole('button', { name: /Propose Personal Pact/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Watch Room/i }))

    expect(
      within(screen.getByRole('button', { name: /Watch Room/i })).getByLabelText('Energy cost: 2')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /Propose Personal Pact/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Propose Personal Pact/i }).getAttribute('aria-pressed')
    ).toBe('false')
    expect(screen.getByRole('button', { name: /Watch Room/i }).getAttribute('aria-pressed')).toBe(
      'true'
    )
  })

  it('Drama Mode group chat uses plain taps for multi-select and scales its displayed cost', () => {
    cleanup()
    store = makeStore({ phase: 'social_1', dramaMode: true })
    humanId = store.getState().game.players.find((player) => player.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)
    const people = store
      .getState()
      .game.players.filter((player) => !player.isUser)
      .slice(0, 3)
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(people[0].name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Group Chat/i }))
    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(
      true
    )

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(people[1].name, 'i') })[0])
    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(
      false
    )
    expect(
      within(screen.getByRole('button', { name: /Group Chat/i })).getByLabelText('Energy cost: 2')
    ).toBeVisible()

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(people[2].name, 'i') })[0])
    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(
      false
    )
    expect(
      within(screen.getByRole('button', { name: /Group Chat/i })).getByLabelText('Energy cost: 3')
    ).toBeVisible()
  })

  it('execute button is enabled when action and a player are both selected', () => {
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))

    expect(
      within(screen.getByRole('button', { name: /Compliment/i })).getByLabelText('Energy cost: 1')
    ).toBeVisible()
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('charges energy and records the action only once after two rapid execute taps', () => {
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))

    const execute = screen.getByRole('button', { name: 'Execute' })
    fireEvent.click(execute)
    fireEvent.click(execute)

    expect(store.getState().social.energyBank[humanId]).toBe(4)
    expect(
      store.getState().social.sessionLogs.filter((entry) => entry.actionId === 'compliment')
    ).toHaveLength(1)
  })

  it('shows feedback after executing idle action', () => {
    fireEvent.click(screen.getByRole('button', { name: /Lay Low/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(screen.getByRole('status')).toBeDefined()
  })

  it('shows the complete saved response once in Hub Wire without a repeated selected-action row', () => {
    fireEvent.click(screen.getByRole('button', { name: /Lay Low/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    const entry = store.getState().social.sessionLogs.at(-1)
    const receipt = entry?.receipt
    expect(receipt?.summary).toBeTruthy()
    const activity = screen.getByLabelText('Recent Activity')
    const displayedNarrative = activity.querySelector('.ra-entry__narrative')
    expect(displayedNarrative?.textContent?.trim()).toBeTruthy()
    expect(activity.querySelectorAll('.ra-entry__narrative')).toHaveLength(1)
    expect(activity).not.toHaveTextContent(receipt!.summary)
    expect(document.querySelector('.sp2-moves__selection')).toBeNull()
    expect(document.querySelector('.sp2-footer__cost')).toBeNull()
    expect(document.querySelector('.sp2-footer__feedback')).toBeNull()
    expect(activity.closest('.sp2-footer')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Dismiss current result' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /full response|expand the full result/i })
    ).toBeNull()
  })

  it('targetless actions ignore previously selected non-user targets when executing', () => {
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))

    fireEvent.click(screen.getByRole('button', { name: /Lay Low/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    const logs = store.getState().social.sessionLogs
    expect(logs.at(-1)?.targetId).toBe(humanId)
  })

  it('shows "Insufficient energy" when player cannot afford the action', () => {
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 0 }))
    })
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(screen.getByRole('status').textContent).toContain('Insufficient resources')
  })

  it('execute button stays enabled after a successful execution (action grid remains stable)', () => {
    // Bug fix regression: after a successful execute the state must NOT be
    // cleared so that (a) the action grid stays visible and (b) no stray
    // preview popup "%" appears because selectedTarget became null while
    // previewActionId was still set.
    fireEvent.click(screen.getByRole('button', { name: /Lay Low/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    // After success, action stays selected → button remains enabled
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('action grid remains visible (cards are rendered) after a successful execution', () => {
    // Regression test: cards must not disappear from the DOM after execute.
    fireEvent.click(screen.getByRole('button', { name: /Lay Low/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    // The action grid wrapper should still be present
    expect(screen.getByLabelText('Action grid')).toBeDefined()
    // And it must contain at least one action card
    const grid = screen.getByLabelText('Action grid')
    const cards = grid.querySelectorAll('[data-action-id]')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('uses the clicked player as the primary target after a reverse shift selection', () => {
    const players = store.getState().game.players.filter((p) => !p.isUser)
    const firstTarget = players[0]
    const secondTarget = players[1]

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(secondTarget.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(firstTarget.name, 'i') })[0], {
      shiftKey: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    const logs = store.getState().social.sessionLogs
    expect(logs.at(-1)?.targetId).toBe(firstTarget.id)
  })
})

// ── Success pulse animation ────────────────────────────────────────────────

describe('SocialPanelV2 – success pulse', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('execute button gains the pulse class immediately after a successful execution', () => {
    vi.useFakeTimers()
    const store = makeStore({ phase: 'social_1' })
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getByRole('button', { name: /Lay Low/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    const btn = screen.getByRole('button', { name: 'Execute' })
    const frozenMoveControls = btn.closest('.sp2-moves__top')
    expect(frozenMoveControls).not.toBeNull()
    expect(
      within(frozenMoveControls as HTMLElement).getByRole('tab', { name: 'All moves' })
    ).toBeVisible()
    expect(btn.closest('.sp2-footer')).toBeNull()
    expect(document.querySelector('.ra-action-control')).toBeNull()
    expect((btn as HTMLElement).className).toContain('sp2-execute--pulse')
  })

  it('clears the current action result when the player changes action tabs and keeps it in History', () => {
    const store = makeStore({ phase: 'social_1' })
    const humanId = store.getState().game.players.find((player) => player.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getByRole('button', { name: /Lay Low/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    const activity = screen.getByLabelText('Recent Activity')
    const currentResult = activity.querySelector('.ra-entry__narrative')?.textContent
    expect(currentResult).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Strategy' }))
    expect(activity.querySelector('.ra-entry__narrative')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'History · 1' }))
    expect(activity.querySelector('.ra-entry__narrative')?.textContent).toBe(currentResult)
  })

  it('execute button pulse class is removed after 850 ms', () => {
    vi.useFakeTimers()
    const store = makeStore({ phase: 'social_1' })
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getByRole('button', { name: /Lay Low/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    act(() => {
      vi.advanceTimersByTime(850)
    })

    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLElement).className).not.toContain('sp2-execute--pulse')
  })
})

// ── Accessibility attributes ───────────────────────────────────────────────

describe('SocialPanelV2 – accessibility', () => {
  it('resource chips have aria-live="polite"', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const energyChip = screen.getByLabelText(/Energy: 0/)
    expect(energyChip.getAttribute('aria-live')).toBe('polite')
    const influenceChip = screen.getByLabelText(/Influence: 0/)
    expect(influenceChip.getAttribute('aria-live')).toBe('polite')
    const infoChip = screen.getByLabelText(/Info: 0/)
    expect(infoChip.getAttribute('aria-live')).toBe('polite')
  })

  it('execute button has aria-busy="false" when idle', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect(btn.getAttribute('aria-busy')).toBe('false')
  })

  it('skip link is rendered in the dialog', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const dialog = screen.getByRole('dialog')
    const skipLink = dialog.querySelector('.sp2-skip-link')
    expect(skipLink).not.toBeNull()
  })

  it('skip link href points to the body section', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const dialog = screen.getByRole('dialog')
    const skipLink = dialog.querySelector('.sp2-skip-link') as HTMLAnchorElement | null
    expect(skipLink?.getAttribute('href')).toBe('#sp2-body')
  })

  it('body section has id sp2-body for skip link target', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(document.getElementById('sp2-body')).not.toBeNull()
  })
})

describe('SocialPanelV2 – scoped alliance consultation', () => {
  it('consults one selected official alliance as a group and keeps pacts out of the picker', () => {
    const seedStore = makeStore({ phase: 'social_1', dramaMode: true })
    const lohId = seedStore.getState().game.players.filter((player) => !player.isUser)[0]!.id
    const store = makeStore({
      phase: 'social_1',
      dramaMode: true,
      lohId,
      playerStatusOverrides: { [lohId]: 'loh' },
    })
    const humanId = store.getState().game.players.find((player) => player.isUser)!.id
    const allies = store
      .getState()
      .game.players.filter((player) => !player.isUser)
      .slice(0, 3)
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'consult-scope-ui',
      founderIds: [humanId, allies[0].id],
      memberIds: [allies[1].id],
      purpose: 'Coordinate the block',
      at: { day: 1, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'
    alliance.name = 'The Numbers'
    const otherAlliance = createRealityAlliance(reality, {
      id: 'consult-scope-ui-overlap',
      founderIds: [humanId, allies[0].id],
      memberIds: [allies[2].id],
      purpose: 'Mutual protection',
      at: { day: 1, phase: 'social_1' },
    })
    otherAlliance.status = 'ACTIVE'
    otherAlliance.name = 'The Winners'
    const unrelatedAlliance = createRealityAlliance(reality, {
      id: 'consult-scope-unrelated',
      founderIds: [
        humanId,
        ...store
          .getState()
          .game.players.filter((player) => !player.isUser)
          .slice(2, 4)
          .map((player) => player.id),
      ],
      memberIds: [],
      purpose: 'A separate group',
      at: { day: 1, phase: 'social_1' },
    })
    unrelatedAlliance.status = 'ACTIVE'
    unrelatedAlliance.name = 'A separate group'
    const legacyPact = createRealityAlliance(reality, {
      id: 'consult-scope-legacy-pact',
      founderIds: [humanId, allies[0].id],
      memberIds: [],
      purpose: 'Migrated strategic pact',
      name: 'Migrated strategic pact',
      kind: 'PACT',
      at: { day: 1, phase: 'social_1' },
    })
    legacyPact.status = 'ACTIVE'
    store.dispatch(replaceRealityDomain(reality))
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    expect(screen.getByLabelText('Avatar rings: Nemesis, Still forming, Ally')).toBeInTheDocument()
    const roster = screen.getByRole('region', { name: 'Player roster' })
    fireEvent.click(within(roster).getByRole('button', { name: new RegExp(allies[0].name) }))
    fireEvent.click(screen.getByRole('tab', { name: 'Strategy' }))
    expect(screen.queryByRole('button', { name: /Consult Alliance/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Alliances' }))
    fireEvent.click(screen.getByRole('button', { name: /Consult Alliance/i }))
    expect(screen.getByRole('tab', { name: 'Alliances' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Choose an alliance' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Player roster' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Selected allies' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Whole alliance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Alliance/i })).not.toBeInTheDocument()
    const alliancePicker = within(screen.getByRole('group', { name: 'Official alliances' }))
    expect(alliancePicker.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'The Numbers',
      'The Winners',
    ])
    expect(alliancePicker.queryByRole('button', { name: /Migrated strategic pact/i })).toBeNull()
    expect(alliancePicker.getByRole('button', { name: 'The Winners' })).toHaveAttribute(
      'title',
      'The Winners'
    )
    expect(alliancePicker.getByRole('button', { name: 'The Winners' })).toHaveTextContent(
      'The Winners'
    )
    fireEvent.click(alliancePicker.getByRole('button', { name: 'The Winners' }))
    expect(alliancePicker.getByRole('button', { name: 'The Winners' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(alliancePicker.getByRole('button', { name: 'The Numbers' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )

    const execute = screen.getByRole('button', { name: 'Execute' })
    expect(execute).toBeEnabled()
    fireEvent.click(execute)
    expect(
      store
        .getState()
        .social.reality.events.some(
          (event) =>
            event.type === 'ALLIANCE_STRATEGY_MEETING' &&
            event.reason.startsWith(`strategy_meeting:${otherAlliance.id}:`)
        )
    ).toBe(true)
  })

  it('consults a current fractured alliance after the returning LOH member is readmitted', () => {
    const seedStore = makeStore({ phase: 'social_1', dramaMode: true })
    const lohId = seedStore.getState().game.players.find((player) => !player.isUser)!.id
    const store = makeStore({
      phase: 'social_1',
      dramaMode: true,
      lohId,
      playerStatusOverrides: { [lohId]: 'loh' },
    })
    const human = store.getState().game.players.find((player) => player.isUser)!
    const candidates = store.getState().game.players.filter((player) => !player.isUser)
    const ally = candidates.find((player) => player.id === lohId)!
    const outsider = candidates[1]!
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'selected-consult-member',
      founderIds: [human.id, ally.id, candidates[2]!.id],
      memberIds: [],
      purpose: 'Shared strategy',
      at: { day: 1, phase: 'social_1' },
    })
    alliance.status = 'FRACTURED'
    store.dispatch(replaceRealityDomain(reality))
    store.dispatch(setEnergyBankEntry({ playerId: human.id, value: 10 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    const roster = screen.getByRole('region', { name: 'Player roster' })
    fireEvent.click(within(roster).getByRole('button', { name: new RegExp(outsider.name) }))
    expect(screen.queryByRole('button', { name: /Consult Alliance/i })).not.toBeInTheDocument()

    fireEvent.click(within(roster).getByRole('button', { name: new RegExp(ally.name) }))
    expect(screen.getByRole('button', { name: /Consult Alliance/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Consult Alliance/i }))
    expect(
      screen.getByRole('button', { name: alliance.name ?? alliance.purpose })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(
      store
        .getState()
        .social.reality.events.some(
          (event) =>
            event.type === 'ALLIANCE_STRATEGY_MEETING' &&
            event.reason.startsWith(`strategy_meeting:${alliance.id}:`)
        )
    ).toBe(true)
    expect(
      within(screen.getByRole('group', { name: 'Official alliances' })).getAllByRole('button')
    ).toHaveLength(1)
  })

  it('hides Consult Alliance for a selected housemate when no group alliance exists', () => {
    const store = makeStore({ phase: 'social_1', dramaMode: true })
    const unrelated = store.getState().game.players.find((player) => !player.isUser)!
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(
      within(screen.getByRole('region', { name: 'Player roster' })).getByRole('button', {
        name: new RegExp(unrelated.name),
      })
    )
    expect(screen.queryByRole('button', { name: /Consult Alliance/i })).not.toBeInTheDocument()
  })

  it('shows Pact on the focused relationship read for a personal pact', () => {
    const store = makeStore({ phase: 'social_1', dramaMode: true })
    const humanId = store.getState().game.players.find((player) => player.isUser)!.id
    const target = store.getState().game.players.find((player) => !player.isUser)!
    const reality = createInitialRealityDomainState()
    const pact = createRealityAlliance(reality, {
      id: 'focused-personal-pact',
      founderIds: [humanId],
      memberIds: [target.id],
      purpose: 'Test focused pact badge',
      kind: 'PACT',
      at: { day: 1, phase: 'social_1' },
    })
    pact.status = 'ACTIVE'
    store.dispatch(replaceRealityDomain(reality))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(
      within(screen.getByRole('region', { name: 'Player roster' })).getByRole('button', {
        name: new RegExp(target.name),
      })
    )

    const focusTags = document.querySelector('.sp2-focus__tags')
    expect(focusTags).not.toBeNull()
    expect(within(focusTags as HTMLElement).getByText('Pact')).toBeInTheDocument()
    expect(within(focusTags as HTMLElement).queryByText('Alliance')).not.toBeInTheDocument()
  })
})

// ── Subject picker ─────────────────────────────────────────────────────────

describe('SocialPanelV2 – subject picker', () => {
  let store: ReturnType<typeof makeStore>
  let humanId: string
  let lohPlayer: RootState['game']['players'][number]

  beforeEach(() => {
    // Create the store first, then derive the LOH player from the same instance
    // to avoid player-id mismatches when the roster is randomised across stores.
    store = makeStore({ phase: 'social_1' })
    const firstNonUser = store.getState().game.players.find((p) => !p.isUser)!
    // Re-create with the LOH override now that we know the correct player id.
    store = makeStore({
      phase: 'social_1',
      dramaMode: true,
      playerStatusOverrides: { [firstNonUser.id]: 'loh' },
    })
    humanId = store.getState().game.players.find((p) => p.isUser)!.id
    lohPlayer = store.getState().game.players.find((p) => p.id === firstNonUser.id)!
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)
  })

  it('subject picker is not rendered when no action is selected', () => {
    expect(screen.queryByLabelText('Choose subject')).toBeNull()
  })

  it('subject picker is not rendered for primary-mode actions', () => {
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    expect(screen.queryByLabelText('Choose subject')).toBeNull()
  })

  it('subject picker appears when a primaryPlusSubject action is selected with a target', () => {
    // First select the LOH player, then select Pitch Target action
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(lohPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Pitch Target/i }))
    expect(screen.getByLabelText('Choose subject')).toBeDefined()
  })

  it('execute button is disabled for primaryPlusSubject action without a subject', () => {
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(lohPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Pitch Target/i }))
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('execute button is enabled once subject is selected for primaryPlusSubject action', () => {
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(lohPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Pitch Target/i }))
    // Pick a subject chip — the chip buttons are inside the subject picker
    const subjectPicker = screen.getByLabelText('Choose subject')
    const subjectChips = subjectPicker.querySelectorAll('[aria-pressed]')
    if (subjectChips.length > 0) {
      fireEvent.click(subjectChips[0])
      const btn = screen.getByRole('button', { name: 'Execute' })
      expect((btn as HTMLButtonElement).disabled).toBe(false)
    } else {
      // If no eligible subjects (e.g. no nominees in test data), verify empty state
      expect(screen.queryByText('No eligible targets')).not.toBeNull()
    }
  })

  it('subject selection is cleared when primary target changes', () => {
    const players = store.getState().game.players.filter((p) => !p.isUser)
    if (players.length < 3) return // need at least 3 non-user players

    // Select LOH player first so pitch_target appears
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(lohPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Pitch Target/i }))
    const subjectPicker = screen.getByLabelText('Choose subject')
    const subjectChips = subjectPicker.querySelectorAll('[aria-pressed]')
    if (subjectChips.length === 0) return // no candidates, skip

    fireEvent.click(subjectChips[0])
    expect((subjectChips[0] as HTMLElement).getAttribute('aria-pressed')).toBe('true')

    // Switch primary target to another non-LOH player — action should be cleared
    // because the new target doesn't have LOH status, so pitch_target disappears.
    const altTarget = players.find((p) => p.id !== lohPlayer.id)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(altTarget.name, 'i') })[0])
    // After switching to a non-LOH target, pitch_target is no longer available
    // and the subject picker should no longer be rendered.
    expect(screen.queryByLabelText('Choose subject')).toBeNull()
  })

  it('counts nominated+pos players as nominee subjects for Ask to Use Safety', () => {
    const basePlayers = store.getState().game.players.filter((p) => !p.isUser)
    if (basePlayers.length < 2) return

    const posHolder = basePlayers[0]
    const nomineeWithPos = basePlayers[1]
    cleanup()
    store = makeStore({
      phase: 'pos_results',
      dramaMode: true,
      posWinnerId: posHolder.id,
      nomineeIds: [nomineeWithPos.id],
      playerStatusOverrides: {
        [posHolder.id]: 'pos',
        [nomineeWithPos.id]: 'nominated+pos',
      },
    })
    humanId = store.getState().game.players.find((p) => p.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }))
    store.dispatch(setInfluenceBankEntry({ playerId: humanId, value: 20 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(posHolder.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Ask to Use Safety/i }))

    const subjectPicker = screen.getByLabelText('Choose subject')
    expect(subjectPicker).toHaveTextContent(nomineeWithPos.name)
  })

  it('lets a nominated user ask the POS holder to use safety on them', () => {
    const basePlayers = store.getState().game.players.filter((p) => !p.isUser)
    const posHolder = basePlayers[0]
    const otherNominee = basePlayers[1]
    cleanup()
    store = makeStore({
      phase: 'pos_results',
      dramaMode: true,
      posWinnerId: posHolder.id,
      nomineeIds: [humanId, otherNominee.id],
      humanStatus: 'nominated',
      playerStatusOverrides: {
        [posHolder.id]: 'pos',
        [otherNominee.id]: 'nominated',
      },
    })
    const human = store.getState().game.players.find((p) => p.isUser)!
    store.dispatch(setEnergyBankEntry({ playerId: human.id, value: 10 }))
    store.dispatch(setInfluenceBankEntry({ playerId: human.id, value: 20 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(posHolder.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Ask to Use Safety/i }))

    const subjectPicker = screen.getByLabelText('Choose subject')
    expect(subjectPicker).toHaveTextContent(human.name)
    expect(subjectPicker).toHaveTextContent(otherNominee.name)
    fireEvent.click(within(subjectPicker).getByRole('button', { name: human.name }))
    expect(screen.getByRole('button', { name: 'Execute' })).toBeEnabled()
  })
})

describe('LOH target question integration', () => {
  afterEach(() => cleanup())

  it('executes while the LOH controls nominations and logs a concrete answer', () => {
    const seedStore = makeStore()
    const loh = seedStore.getState().game.players.find((player) => !player.isUser)!
    const store = makeStore({
      phase: 'social_1',
      lohId: loh.id,
      playerStatusOverrides: { [loh.id]: 'loh' },
      dramaMode: true,
    })
    const human = store.getState().game.players.find((player) => player.isUser)!
    store.dispatch(setEnergyBankEntry({ playerId: human.id, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(loh.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Ask LOH Plan/i }))
    const execute = screen.getByRole('button', { name: 'Execute' })
    expect(execute).toBeEnabled()
    fireEvent.click(execute)

    const recentActivity = screen.getByLabelText('Recent Activity')
    const receipt = store.getState().social.sessionLogs.at(-1)?.receipt
    expect(receipt?.summary).toBeTruthy()
    expect(recentActivity).toHaveTextContent(receipt!.summary)
    expect(recentActivity).not.toHaveTextContent('You performed')
  })
})

describe('SocialPanelV2 – integrated alliance actions', () => {
  it('charges two energy for a new pact from the integrated alliance action card', () => {
    const store = makeStore({ phase: 'social_1', dramaMode: true })
    const human = store.getState().game.players.find((player) => player.isUser)!
    const candidate = store
      .getState()
      .game.players.find((player) => !player.isUser && player.status !== 'jury')!
    store.dispatch(setEnergyBankEntry({ playerId: human.id, value: 3 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    const socialDialog = screen.getByRole('dialog', { name: 'Social Phase' })
    fireEvent.click(within(socialDialog).getByRole('tab', { name: 'Alliances' }))
    expect(within(socialDialog).queryByRole('region', { name: 'Your alliances' })).toBeNull()
    expect(within(socialDialog).queryByLabelText('Personal pact with')).toBeNull()
    expect(within(socialDialog).getByRole('button', { name: /Found an alliance/i })).toBeVisible()
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(candidate.name, 'i') })[0]!)
    const pactCard = screen.getByRole('button', { name: /Propose Personal Pact/i })
    expect(pactCard).not.toHaveTextContent(/cap|per pair/i)
    fireEvent.click(pactCard)
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    expect(store.getState().social.energyBank[human.id]).toBe(1)
    expect(
      Object.values(store.getState().social.reality.alliances).some(
        (alliance) =>
          alliance.memberIds.includes(human.id) && alliance.memberIds.includes(candidate.id)
      )
    ).toBe(false)
    expect(
      Object.values(store.getState().social.reality.allianceManagement.requests).some(
        (request) => request.kind === 'PACT' && request.proposerId === human.id
      )
    ).toBe(true)
  })

  it('keeps group founding in the shared action-card flow and defers naming', () => {
    const store = makeStore({ phase: 'social_1', dramaMode: true })
    const human = store.getState().game.players.find((player) => player.isUser)!
    store.dispatch(setEnergyBankEntry({ playerId: human.id, value: 5 }))
    store.dispatch(setInfluenceBankEntry({ playerId: human.id, value: 5 }))
    const candidates = store
      .getState()
      .game.players.filter((player) => !player.isUser && player.status !== 'jury')
      .slice(0, 2)
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    const socialDialog = screen.getByRole('dialog', { name: 'Social Phase' })
    fireEvent.click(within(socialDialog).getByRole('tab', { name: 'Alliances' }))
    expect(within(socialDialog).queryByRole('region', { name: 'Your alliances' })).toBeNull()
    expect(within(socialDialog).queryByLabelText('Personal pact with')).toBeNull()
    const foundAllianceCard = screen.getByRole('button', { name: /Found an alliance/i })
    expect(
      within(foundAllianceCard).getByText(
        'Choose at least two hubmates. Everyone must agree before the group becomes active.'
      )
    ).toBeVisible()
    expect(foundAllianceCard).not.toHaveTextContent(/costs|additional founder/i)
    expect(within(foundAllianceCard).getByLabelText('Energy cost: 3')).toBeVisible()
    expect(within(foundAllianceCard).getByLabelText('Influence cost: 5')).toBeVisible()
    fireEvent.click(foundAllianceCard)
    expect(screen.getByRole('button', { name: 'Propose group' })).toBeDisabled()
    expect(screen.queryByRole('dialog', { name: 'Give your group a name' })).toBeNull()
    for (const candidate of candidates) {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(candidate.name, 'i') })[0]!)
    }
    for (const candidate of candidates) {
      expect(
        screen.getAllByRole('button', { name: new RegExp(candidate.name, 'i') })[0]
      ).toHaveClass('pc--selected')
    }
    expect(within(foundAllianceCard).getByLabelText('Energy cost: 3')).toBeVisible()
    expect(within(foundAllianceCard).getByLabelText('Influence cost: 5')).toBeVisible()
    expect(document.querySelector('.sp2-footer__cost')).toBeNull()
    expect(screen.getByRole('button', { name: 'Propose group' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Propose group' }))
    const formedReality = structuredClone(store.getState().social.reality)
    const request = Object.values(formedReality.allianceManagement.requests).find(
      (entry) => entry.kind === 'FOUND'
    )!
    expect(request.memberIds).toEqual(
      expect.arrayContaining([human.id, ...candidates.map((p) => p.id)])
    )
    expect(screen.queryByRole('dialog', { name: 'Give your group a name' })).toBeNull()
  })

  it('asks its founder to name the alliance only after formation', () => {
    const store = makeStore({ phase: 'social_1', dramaMode: true })
    const human = store.getState().game.players.find((player) => player.isUser)!
    const candidates = store
      .getState()
      .game.players.filter((player) => !player.isUser && player.status !== 'jury')
      .slice(0, 2)
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'initial-alliance-name-test',
      kind: 'GROUP',
      createdById: human.id,
      founderIds: [human.id, ...candidates.map((player) => player.id)],
      memberIds: [],
      purpose: 'Mutual protection',
      name: 'The Winners',
      leaderId: human.id,
      at: { day: 1, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'
    store.dispatch(replaceRealityDomain(reality))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    expect(screen.queryByRole('dialog', { name: 'Give your group a name' })).toBeNull()
    const formedReality = structuredClone(store.getState().social.reality)
    formedReality.alliances[alliance.id].initialNamePending = true
    act(() => store.dispatch(replaceRealityDomain(formedReality)))
    expect(screen.getByRole('dialog', { name: 'Give your group a name' })).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', { name: 'Alliance name' }), {
      target: { value: 'The Shield' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Name alliance' }))
    expect(store.getState().social.reality.alliances[alliance.id].name).toBe('The Shield')
  })

  it('invites a selected player from All moves only after selecting one eligible alliance', () => {
    const store = makeStore({ phase: 'social_1', dramaMode: true })
    const human = store.getState().game.players.find((player) => player.isUser)!
    const [allyA, allyB, candidate, otherAlly] = store
      .getState()
      .game.players.filter((player) => !player.isUser && player.status !== 'jury')
      .slice(0, 4)
    const reality = createInitialRealityDomainState()
    for (const [id, name, thirdMemberId] of [
      ['compact-shield', 'The Shield', allyB.id],
      ['compact-circle', 'The Circle', otherAlly.id],
    ]) {
      const group = createRealityAlliance(reality, {
        id,
        founderIds: [human.id, allyA.id],
        memberIds: [thirdMemberId],
        purpose: 'Mutual protection',
        at: { day: 1, phase: 'social_1' },
      })
      group.name = name
      group.status = 'ACTIVE'
    }
    store.dispatch(replaceRealityDomain(reality))
    store.dispatch(setEnergyBankEntry({ playerId: human.id, value: 5 }))
    store.dispatch(setInfluenceBankEntry({ playerId: human.id, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    const roster = screen.getByRole('region', { name: 'Player roster' })
    fireEvent.click(within(roster).getByRole('button', { name: new RegExp(allyA.name, 'i') }))
    fireEvent.click(screen.getByRole('button', { name: /Group Chat/i }))
    fireEvent.click(within(roster).getByRole('button', { name: new RegExp(candidate.name, 'i') }))
    const grid = screen.getByRole('group', { name: 'Action grid' })
    const invitation = within(grid).getByRole('button', {
      name: new RegExp(`Invite ${candidate.name} to an alliance`, 'i'),
    })
    expect(invitation).not.toHaveTextContent(/proposal costs|cap|limit/i)
    expect(within(invitation).getByLabelText('Energy cost: 1')).toBeVisible()
    expect(within(invitation).getByLabelText('Influence cost: 5')).toBeVisible()
    fireEvent.click(invitation)
    expect(
      within(roster)
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
    ).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Start vote' })).toBeDisabled()
    const startVote = screen.getByRole('button', { name: 'Start vote' })
    expect(startVote).toHaveClass('sp2-moves__execute')
    expect(startVote.closest('.sp2-moves__heading')).not.toBeNull()
    expect(Object.keys(store.getState().social.reality.allianceManagement.requests)).toHaveLength(0)
    const picker = within(screen.getByRole('group', { name: 'Official alliances' }))
    expect(picker.getAllByRole('button')).toHaveLength(2)
    fireEvent.click(picker.getByRole('button', { name: 'The Shield' }))
    expect(screen.getByRole('button', { name: 'Start vote' })).toBeEnabled()
    fireEvent.click(picker.getByRole('button', { name: 'The Circle' }))
    expect(
      within(screen.getByRole('region', { name: 'Selected alliance' })).getByRole('heading', {
        name: 'The Circle',
      })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start vote' }))
    const requests = Object.values(store.getState().social.reality.allianceManagement.requests)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      kind: 'ADMIT',
      allianceId: 'compact-circle',
      candidateId: candidate.id,
    })
    expect(requests[0].history?.some((event) => event.type === 'ALLIANCE_REQUEST_SUBMITTED')).toBe(
      true
    )
    expect(store.getState().social.energyBank[human.id]).toBe(4)
    expect(store.getState().social.influenceBank[human.id]).toBe(0)
  })

  it('shows leader rename and member rename-suggestion actions in the Alliances cards', async () => {
    const store = makeStore({ phase: 'social_1', dramaMode: true })
    const human = store.getState().game.players.find((player) => player.isUser)!
    const members = store
      .getState()
      .game.players.filter((player) => !player.isUser && player.status !== 'jury')
      .slice(0, 2)
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'name-actions-test',
      kind: 'GROUP',
      founderIds: [human.id, ...members.map((player) => player.id)],
      memberIds: [],
      purpose: 'Mutual protection',
      name: 'The Shield',
      leaderId: human.id,
      at: { day: 1, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'
    store.dispatch(replaceRealityDomain(reality))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getByRole('tab', { name: 'Alliances' }))
    expect(screen.queryByRole('button', { name: /Rename The Shield/i })).toBeNull()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Official alliances' })).getByRole('button', {
        name: 'The Shield',
      })
    )
    fireEvent.click(screen.getByRole('button', { name: /Rename The Shield/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New alliance name' }), {
      target: { value: 'The Night Shift' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rename alliance' }))
    expect(store.getState().social.reality.alliances[alliance.id].name).toBe('The Night Shift')
    await act(async () => new Promise((resolve) => setTimeout(resolve, 275)))

    const memberLedReality = structuredClone(store.getState().social.reality)
    const context = allianceContextForStore(store, human.id)
    const transfer = manageAlliance(
      memberLedReality,
      {
        type: 'PROPOSE',
        kind: 'TRANSFER',
        actorId: human.id,
        allianceId: alliance.id,
        candidateId: members[0].id,
      },
      context
    )
    expect(transfer.requestId).toBeTruthy()
    const transferRequest = memberLedReality.allianceManagement.requests[transfer.requestId!]
    for (const actorId of allianceRequestDecisionActors(transferRequest)) {
      manageAlliance(
        memberLedReality,
        { type: 'RESPOND', requestId: transferRequest.id, actorId, accept: true },
        context
      )
    }
    act(() => store.dispatch(replaceRealityDomain(memberLedReality)))
    fireEvent.click(screen.getByRole('button', { name: /Suggest a new name for The Night Shift/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Suggested alliance name' }), {
      target: { value: 'The Night Crew' },
    })
    expect(screen.getByRole('button', { name: 'Suggest name' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest name' }))
    expect(
      Object.values(store.getState().social.reality.allianceManagement.requests).some(
        (request) =>
          request.kind === 'RENAME_SUGGESTION' && request.proposedName === 'The Night Crew'
      )
    ).toBe(true)
  })
})

describe('SocialPanelV2 – alliance context and history', () => {
  function contextPanel() {
    const store = makeStore({ phase: 'social_1', dramaMode: true })
    const human = store.getState().game.players.find((player) => player.isUser)!
    const [a, b, candidate] = store
      .getState()
      .game.players.filter((player) => !player.isUser && player.status !== 'jury')
      .slice(0, 3)
    const reality = createInitialRealityDomainState()
    for (const [id, name, leaderId, thirdMemberId] of [
      ['scope-shield', 'The Shield', human.id, b.id],
      ['scope-circle', 'The Circle', a.id, candidate.id],
    ]) {
      createRealityAlliance(reality, {
        id,
        name,
        kind: 'GROUP',
        leaderId,
        founderIds: [human.id, a.id],
        memberIds: [thirdMemberId],
        purpose: 'Protection',
        at: { day: 1, phase: 'social_1' },
      }).status = 'ACTIVE'
    }
    store.dispatch(replaceRealityDomain(reality))
    store.dispatch(setEnergyBankEntry({ playerId: human.id, value: 10 }))
    store.dispatch(setInfluenceBankEntry({ playerId: human.id, value: 20 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)
    return { store, human, a, b, candidate }
  }

  it('shows generic actions first and scopes group actions and member controls to one selected alliance', () => {
    const { a } = contextPanel()
    fireEvent.click(screen.getByRole('tab', { name: 'Alliances' }))
    const grid = within(screen.getByRole('group', { name: 'Action grid' }))
    expect(
      grid.queryByRole('button', { name: /Leave|Rename|Dissolve|Suggest a new name/i })
    ).toBeNull()
    const picker = within(screen.getByRole('group', { name: 'Official alliances' }))
    fireEvent.click(picker.getByRole('button', { name: 'The Shield' }))
    expect(grid.getByRole('button', { name: /Rename The Shield/i })).toBeInTheDocument()
    expect(grid.getByRole('button', { name: /Dissolve The Shield/i })).toBeInTheDocument()
    expect(grid.queryByRole('button', { name: /The Circle/i })).toBeNull()
    expect(
      grid.queryByRole('button', { name: /Found an alliance|Propose Personal Pact/i })
    ).toBeNull()
    fireEvent.click(screen.getByText("Read your alliance's story"))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Alliance members' })).getByRole('button', {
        name: new RegExp(a.name),
      })
    )
    expect(
      grid.getByRole('button', { name: new RegExp(`Offer co-leader to ${a.name}`, 'i') })
    ).toBeInTheDocument()
    fireEvent.click(picker.getByRole('button', { name: 'The Circle' }))
    expect(
      grid.getByRole('button', { name: /Suggest a new name for The Circle/i })
    ).toBeInTheDocument()
    expect(
      grid.queryByRole('button', { name: /The Shield|Dissolve The Circle|Offer co-leader/i })
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'All alliance actions' }))
    expect(screen.queryByRole('region', { name: 'Selected alliance' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Player roster' })).toBeInTheDocument()
  })

  it('keeps the full roster available for consultation, invitations, and member management', () => {
    const { a, candidate } = contextPanel()
    fireEvent.click(screen.getByRole('tab', { name: 'Alliances' }))
    const picker = within(screen.getByRole('group', { name: 'Official alliances' }))
    fireEvent.click(picker.getByRole('button', { name: 'The Shield' }))

    const roster = within(screen.getByRole('region', { name: 'Player roster' }))
    const grid = within(screen.getByRole('group', { name: 'Action grid' }))
    expect(grid.getByRole('button', { name: /Consult Alliance/i })).toBeInTheDocument()

    fireEvent.click(roster.getByText(candidate.name, { exact: true }).closest('button')!)
    expect(
      grid.getByRole('button', { name: new RegExp(`Invite ${candidate.name} to an alliance`, 'i') })
    ).toBeInTheDocument()

    fireEvent.click(roster.getByText(a.name, { exact: true }).closest('button')!)
    expect(
      grid.getByRole('button', { name: new RegExp(`Remove ${a.name}`, 'i') })
    ).toBeInTheDocument()
  })

  it('clears a prepared rename when switching groups and displays the founding day and history', () => {
    const { store } = contextPanel()
    fireEvent.click(screen.getByRole('tab', { name: 'Alliances' }))
    const picker = within(screen.getByRole('group', { name: 'Official alliances' }))
    fireEvent.click(picker.getByRole('button', { name: 'The Shield' }))
    expect(screen.getByText('Founded Day 1')).toBeInTheDocument()
    fireEvent.click(screen.getByText("Read your alliance's story"))
    expect(screen.getByText(/You founded The Shield with/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Rename The Shield/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New alliance name' }), {
      target: { value: 'Wrong group' },
    })
    fireEvent.click(picker.getByRole('button', { name: 'The Circle' }))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Execute' })).toBeDisabled()
    expect(store.getState().social.reality.alliances['scope-shield'].name).toBe('The Shield')
    expect(store.getState().social.reality.alliances['scope-circle'].name).toBe('The Circle')
  })

  it('disables an invitation if its candidate becomes a member before execution without charging resources', () => {
    const { store, human, candidate } = contextPanel()
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Player roster' })).getByRole('button', {
        name: new RegExp(candidate.name, 'i'),
      })
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Alliances' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`Invite ${candidate.name} to an alliance`, 'i'),
      })
    )
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Official alliances' })).getByRole('button', {
        name: 'The Shield',
      })
    )
    expect(screen.getByRole('button', { name: 'Start vote' })).toBeEnabled()
    const changed = structuredClone(store.getState().social.reality)
    changed.alliances['scope-shield'].memberIds.push(candidate.id)
    act(() => store.dispatch(replaceRealityDomain(changed)))
    expect(screen.getByRole('button', { name: 'Execute' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(store.getState().social.energyBank[human.id]).toBe(10)
    expect(Object.values(store.getState().social.reality.allianceManagement.requests)).toHaveLength(
      0
    )
  })

  it('keeps a dissolved alliance selected as a read-only record and can reopen it from Today', () => {
    const { store } = contextPanel()
    fireEvent.click(screen.getByRole('tab', { name: 'Alliances' }))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Official alliances' })).getByRole('button', {
        name: 'The Shield',
      })
    )
    fireEvent.click(screen.getByRole('button', { name: /Dissolve The Shield/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Dissolve group' }))
    expect(store.getState().social.reality.alliances['scope-shield'].status).toBe('DISSOLVED')
    expect(screen.getByRole('region', { name: 'Selected alliance' })).toHaveTextContent('Dissolved')
    expect(
      screen.queryByRole('button', { name: /Rename The Shield|Leave The Shield|Consult Alliance/i })
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'All alliance actions' }))
    fireEvent.click(screen.getByRole('button', { name: /My Pulse/i }))
    const pulse = within(screen.getByRole('dialog', { name: 'My Pulse' }))
    const chronicle = pulse.getByRole('article', { name: 'The Hub Chronicles' })
    fireEvent.click(
      within(chronicle).getByRole('button', { name: "Read The Shield's alliance story" })
    )
    expect(screen.getByRole('region', { name: 'Selected alliance' })).toHaveTextContent(
      'The Shield'
    )
    expect(screen.getByRole('region', { name: 'Selected alliance' })).toHaveTextContent('Dissolved')
  })
})

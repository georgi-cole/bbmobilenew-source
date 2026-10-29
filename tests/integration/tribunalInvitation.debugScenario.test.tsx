import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import adsReducer from '../../src/store/adsSlice'
import challengeReducer from '../../src/store/challengeSlice'
import finaleReducer from '../../src/store/finaleSlice'
import gameReducer from '../../src/store/gameSlice'
import profilesReducer from '../../src/store/profilesSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import settingsReducer from '../../src/store/settingsSlice'
import socialReducer from '../../src/social/socialSlice'
import uiReducer from '../../src/store/uiSlice'
import vipReducer from '../../src/store/vipSlice'
import DebugPanel from '../../src/components/DebugPanel/DebugPanel'
import GameScreen from '../../src/screens/GameScreen/GameScreen'

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/components/Capitalization/Capitalization', () => ({
  default: () => <div data-testid="battle-back-minigame" />,
}))

vi.mock('../../src/components/ui/SpectatorView', () => ({
  default: () => <div data-testid="battle-back-spectator" />,
}))

vi.mock('../../src/components/ui/TvZone', () => ({
  default: function TvZoneMock({
    priorityAnnouncement,
  }: {
    priorityAnnouncement?: { key?: string; title?: string; subtitle?: string } | null
  }) {
    return (
      <div data-testid="tv-zone">
        {priorityAnnouncement?.key === 'tribunal_invitation' && (
          <div data-testid="tribunal-invitation-announcement">
            <p>{priorityAnnouncement.title}</p>
            <p>{priorityAnnouncement.subtitle}</p>
          </div>
        )}
      </div>
    )
  },
}))

function makeStore() {
  return configureStore({
    reducer: {
      ads: adsReducer,
      challenge: challengeReducer,
      finale: finaleReducer,
      game: gameReducer,
      profiles: profilesReducer,
      publicOpinion: publicOpinionReducer,
      settings: settingsReducer,
      social: socialReducer,
      ui: uiReducer,
      vip: vipReducer,
    },
  })
}

describe('Tribunal invitation QA scenario', () => {
  it('loads the production invitation and keeps it suppressed during Back 2 the Game', async () => {
    const user = userEvent.setup()
    const store = makeStore()

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game?debug=1&qa=1']}>
          <DebugPanel />
          <GameScreen />
        </MemoryRouter>
      </Provider>
    )

    await user.click(screen.getByRole('button', { name: 'Load Tribunal invitation preview' }))

    const invitation = screen.getByTestId('tribunal-invitation-announcement')
    expect(invitation).toHaveTextContent("Your Story Isn't Over")
    expect(store.getState().game.players.find((player) => player.isUser)?.status).toBe('jury')
    expect(store.getState().game.tribunalInvitationAcknowledged).toBe(false)
    expect(screen.queryByRole('complementary', { name: 'Debug Panel' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Toggle Debug Panel' }))
    await user.click(
      screen.getByRole('button', { name: 'Load Back 2 the Game suppression preview' })
    )

    expect(store.getState().game.battleBack?.active).toBe(true)
    expect(store.getState().game.battleBack?.candidates).toContain('user')
    expect(screen.queryByTestId('tribunal-invitation-announcement')).toBeNull()
    expect(screen.getByTestId('battle-back-minigame')).toBeInTheDocument()
  })
})

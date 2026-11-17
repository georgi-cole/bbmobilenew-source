import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import gameReducer, { addTvEvent, consumeBroadcastEvent, setPhase } from '../../../store/gameSlice'
import { store as baseline } from '../../../store/store'
import TvZone from '../TvZone'
import { I18nContext, type I18nContextValue } from '../../../i18n/I18nContext'
import { translate } from '../../../i18n/messages'

vi.mock('../../../cinematic/ceremonies/shock', () => ({
  default: ({
    active,
    shockKey,
    onComplete,
  }: {
    active: boolean
    shockKey: string
    onComplete: () => void
  }) => (active ? <button onClick={onComplete}>Finish shock {shockKey}</button> : null),
}))
const i18n: I18nContextValue = {
  preference: 'en-US',
  language: 'en-US',
  systemLanguage: 'en-US',
  t: (key, params) => translate('en-US', key, params),
  formatNumber: String,
  formatDate: String,
}
afterEach(cleanup)
function fixture() {
  const initial = structuredClone(baseline.getState())
  const store = configureStore({
    reducer: (state = initial, action) => ({
      ...state,
      game: gameReducer(state.game, action),
    }),
  })
  store.dispatch(setPhase('social_1'))
  for (const id of store.getState().game.broadcastQueue ?? [])
    store.dispatch(consumeBroadcastEvent(id))
  return store
}
function mount(store: ReturnType<typeof fixture>, props = {}) {
  return render(
    <I18nContext.Provider value={i18n}>
      <Provider store={store}>
        <MemoryRouter>
          <TvZone {...props} />
        </MemoryRouter>
      </Provider>
    </I18nContext.Provider>
  )
}
describe('pre-release Faux TV continuity', () => {
  it.each(['democracia', 'depression_shock_start'])(
    'plays %s once when a second source and remount follow',
    (major) => {
      const store = fixture()
      const enqueue = () =>
        store.dispatch(
          addTvEvent({
            text: 'A shock changes the Hub.',
            type: 'twist',
            source: 'system',
            channels: ['tv', 'mainLog'],
            meta: {
              major,
              phase: 'social_1',
              week: store.getState().game.week,
              forceOnTv: true,
              broadcastLevel: 'critical',
            },
          })
        )
      enqueue()
      const first = mount(store)
      fireEvent.click(screen.getByRole('button', { name: `Finish shock ${major}` }))
      act(() => {
        for (const id of store.getState().game.broadcastQueue ?? [])
          store.dispatch(consumeBroadcastEvent(id))
        enqueue()
      })
      expect(screen.queryByRole('button', { name: `Finish shock ${major}` })).toBeNull()
      first.unmount()
      mount(store)
      expect(screen.queryByRole('button', { name: `Finish shock ${major}` })).toBeNull()
    }
  )
  it('keeps readable state copy under a pending challenge while its covering host leaves', () => {
    const store = fixture()
    const initial = store.getState()
    const covered = configureStore({
      reducer: () => ({
        ...initial,
        challenge: { ...initial.challenge, pending: { id: 'accepted-result' } },
      }),
    })
    mount(covered as unknown as ReturnType<typeof fixture>, { playOwnedExternally: true })
    const message = document.querySelector('.tv-zone__now')!
    expect(message).not.toHaveAttribute('aria-hidden', 'true')
    expect(message.textContent?.trim().length).toBeGreaterThan(0)
  })
})

import { configureStore } from '@reduxjs/toolkit'
import { cleanup, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Ceremony from './ceremony.jsx'

vi.mock('./session.js', () => ({
  useCinematicSession: (scene: string | null) => Boolean(scene),
}))
vi.mock('./bridge.jsx', () => ({
  PremiumBridge: ({ scene, badgeOnlyHandoff }: { scene: string; badgeOnlyHandoff: boolean }) => (
    <div
      data-testid="premium-ceremony"
      data-scene={scene}
      data-compact={String(badgeOnlyHandoff)}
    />
  ),
}))
vi.mock('../../components/CeremonyOverlay/CeremonyOverlay', () => ({
  default: () => <div data-testid="standard-ceremony" />,
}))

const store = configureStore({
  reducer: { game: (state = { mode: 'classic', players: [] }) => state },
})

afterEach(cleanup)

function renderCeremony(caption: string) {
  render(
    <Provider store={store}>
      <Ceremony tiles={[]} caption={caption} ariaLabel={caption} onDone={() => {}} />
    </Provider>
  )
}

describe('VIP ceremony badge handoffs', () => {
  it.each([
    [{ lohId: 'a', posWinnerId: 'a' }, 'allPower'],
    [
      {
        lohId: 'a',
        posWinnerId: 'b',
        cupidArrow: { status: 'active', pairs: [{ memberIds: ['a', 'b'] }] },
      },
      'cupidPower',
    ],
    [{ lohId: 'a', posWinnerId: 'a', voxPopuli: { status: 'active' } }, 'safety'],
  ])(
    'respects shared leadership precedence without applying All the Power to Vox',
    (roles, scene) => {
      const rolesStore = configureStore({
        reducer: { game: (state = { mode: 'classic', players: [], ...roles }) => state },
      })
      render(
        <Provider store={rolesStore}>
          <Ceremony
            tiles={[]}
            actorIds={[roles.posWinnerId]}
            caption="Power of Safety"
            ariaLabel="Safety"
            onDone={() => {}}
          />
        </Provider>
      )
      expect(screen.getByTestId('premium-ceremony').dataset.scene).toBe(scene)
    }
  )
  it.each([
    ['Nova has been saved!', 'save'],
    ['Nova and Ash have been nominated', 'nominations'],
    ['Nova wins Power of Safety', 'safety'],
  ])('shortens the handoff for %s', (caption, scene) => {
    renderCeremony(caption)
    const premium = screen.getByTestId('premium-ceremony')
    expect(premium.dataset.scene).toBe(scene)
    expect(premium.dataset.compact).toBe('true')
  })

  it('keeps backup nominations on the native badge route without a film', () => {
    renderCeremony('Backup nominee named')
    expect(screen.queryByTestId('premium-ceremony')).toBeNull()
    expect(screen.getByTestId('standard-ceremony')).toBeTruthy()
  })
})

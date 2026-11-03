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

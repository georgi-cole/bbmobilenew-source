import { configureStore } from '@reduxjs/toolkit'
import { cleanup, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Player } from '../../types'
import Exit from './exit.jsx'

const presentation = vi.hoisted(() => ({
  cinematic: true,
  bridge: vi.fn(),
  standard: vi.fn(),
}))

vi.mock('./session.js', () => ({ useCinematicSession: () => presentation.cinematic }))
vi.mock('./roster-exit-state', () => ({
  hasCoveredRosterExit: () => false,
  clearRosterExit: vi.fn(),
}))
vi.mock('./bridge.jsx', () => ({
  PremiumBridge: (props: { scene: string }) => {
    presentation.bridge(props)
    return <div data-testid="premium-exit" data-scene={props.scene} />
  },
}))
vi.mock('../../components/Eviction/SpotlightEvictionOverlay', () => ({
  default: (props: { evictee: Player }) => {
    presentation.standard(props)
    return <div data-testid="native-exit" data-player-id={props.evictee.id} />
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  presentation.cinematic = true
})
afterEach(cleanup)

function renderExit({
  phase = 'final3_decision',
  decisionAlreadyPresented,
  variant,
}: {
  phase?: string
  decisionAlreadyPresented?: boolean
  variant?: 'return'
} = {}) {
  const evictee = { id: 'dex', name: 'Dex' } as Player
  const store = configureStore({
    reducer: () => ({
      game: { gameId: 'exit-routing-fixture', week: 1, phase, players: [evictee] },
    }),
  })
  render(
    <Provider store={store}>
      <Exit
        evictee={evictee}
        onDone={vi.fn()}
        decisionAlreadyPresented={decisionAlreadyPresented}
        variant={variant}
      />
    </Provider>
  )
}

describe('Final Three departure handoff', () => {
  it('retains the full final3 film for the existing default callers', () => {
    renderExit()
    expect(screen.getByTestId('premium-exit')).toHaveAttribute('data-scene', 'final3')
  })

  it('starts the existing exit-only film after the interactive decision has finished', () => {
    renderExit({ decisionAlreadyPresented: true })
    expect(screen.getByTestId('premium-exit')).toHaveAttribute('data-scene', 'exit')
    const original = presentation.bridge.mock.calls[0][0].original
    expect(original.evictee.id).toBe('dex')
    expect(original).not.toHaveProperty('decisionAlreadyPresented')
  })

  it('does not change another ceremony when the completion flag is supplied', () => {
    renderExit({ phase: 'final4_eviction', decisionAlreadyPresented: true })
    expect(screen.getByTestId('premium-exit')).toHaveAttribute('data-scene', 'final4')
  })

  it('preserves native and return fallbacks without forwarding the internal routing flag', () => {
    presentation.cinematic = false
    renderExit({ decisionAlreadyPresented: true, variant: 'return' })
    expect(screen.getByTestId('native-exit')).toHaveAttribute('data-player-id', 'dex')
    expect(presentation.bridge).not.toHaveBeenCalled()
    expect(presentation.standard.mock.calls[0][0]).not.toHaveProperty('decisionAlreadyPresented')
  })
})

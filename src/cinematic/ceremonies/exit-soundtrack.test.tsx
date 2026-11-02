import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { store as baseline } from '../../store/store'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
  PRESENTATION_PRIORITY,
} from '../../services/presentation/presentationOwnership'
import Exit from './exit.jsx'

const film = vi.hoisted(() => ({
  prepare: vi.fn(async () => ({})),
  handoff: null as (() => void) | null,
  done: null as (() => void) | null,
}))
vi.mock('./renderer.js', () => ({
  createClip: () => ({
    prepare: film.prepare,
    mount: (_parent: HTMLElement, handoff: () => void, done: () => void) => {
      film.handoff = handoff
      film.done = done
    },
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    setVisible: vi.fn(),
    nativeReady: vi.fn(),
  }),
}))
vi.mock('./roster-exit', () => ({
  default: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Confirm exit</button>,
}))
vi.mock('../../components/Eviction/SpotlightEvictionOverlay', () => ({
  default: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Confirm exit</button>,
}))

beforeEach(() => {
  vi.clearAllMocks()
  film.prepare.mockResolvedValue({})
  film.handoff = null
  film.done = null
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await act(async () => {
    await Promise.resolve()
  })
})

function openExit(
  options: { phase?: 'final3_decision' | 'eviction_results'; reduced?: boolean } = {}
) {
  const state = structuredClone(baseline.getState())
  state.vip.isActive = true
  state.settings.gameUX.animations = true
  state.settings.gameUX.animationMode = 'cinematic'
  state.settings.display.reduceMotion = Boolean(options.reduced)
  state.game.mode = 'classic'
  state.game.voxPopuli = undefined
  state.game.gameId = 'retained-final-decision-music'
  state.game.phase = options.phase ?? 'final3_decision'
  const evictee = {
    ...state.game.players[0],
    id: 'dex',
    name: 'Dex',
    avatar: 'assets/skins/Dex_avatar.webp',
  }
  state.game.players = [evictee]
  const store = configureStore({ reducer: (current = state) => current })
  const soundtrack = {
    presentationGroupId: 'final-three-decision:retained-final-decision-music',
    setActive: vi.fn(),
    finish: vi.fn(),
  }
  const releaseDecision = acquirePresentationOwnership(
    createPresentationOwnerToken(),
    soundtrack.presentationGroupId,
    PRESENTATION_PRIORITY.finale
  )
  const onDone = vi.fn()
  const view = render(
    <Provider store={store}>
      <Exit
        evictee={evictee}
        decisionAlreadyPresented
        soundtrackContinuation={soundtrack}
        onDone={onDone}
      />
    </Provider>
  )
  return { ...view, soundtrack, releaseDecision, onDone }
}

describe('departure soundtrack continuation', () => {
  it('preserves ownership across the scene transition and follows foreground suspension until the film hands off', async () => {
    const { soundtrack, releaseDecision, onDone } = openExit()
    try {
      await waitFor(() => expect(film.handoff).toBeTypeOf('function'))
      expect(film.prepare).toHaveBeenCalledWith(
        'exit',
        expect.anything(),
        'generic',
        expect.objectContaining({ closingBrand: true })
      )
      expect(soundtrack.setActive).toHaveBeenCalledWith(true)
      expect(soundtrack.setActive).not.toHaveBeenCalledWith(false)
      await act(async () => releaseDecision())
      expect(soundtrack.setActive).not.toHaveBeenCalledWith(false)
      expect(soundtrack.finish).not.toHaveBeenCalled()

      let releaseGameplay = () => {}
      act(() => {
        releaseGameplay = acquirePresentationOwnership(
          createPresentationOwnerToken(),
          'gameplay-over-departure',
          PRESENTATION_PRIORITY.gameplay
        )
      })
      expect(soundtrack.setActive).toHaveBeenLastCalledWith(false)
      await act(async () => releaseGameplay())
      expect(soundtrack.setActive).toHaveBeenLastCalledWith(true)
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      fireEvent(document, new Event('visibilitychange'))
      expect(soundtrack.setActive).toHaveBeenLastCalledWith(false)
      hidden.mockReturnValue(false)
      fireEvent(document, new Event('visibilitychange'))
      expect(soundtrack.setActive).toHaveBeenLastCalledWith(true)

      act(() => {
        film.handoff?.()
        film.done?.()
      })
      expect(soundtrack.finish).toHaveBeenCalledTimes(1)
      expect(onDone).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Confirm exit' }))
      expect(onDone).toHaveBeenCalledTimes(1)
      expect(soundtrack.finish).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => releaseDecision())
    }
  })

  it('finishes the retained music once when Skip moves directly to the exit confirmation', async () => {
    const { soundtrack, releaseDecision } = openExit()
    try {
      await waitFor(() => expect(film.handoff).toBeTypeOf('function'))
      fireEvent.click(screen.getByRole('button', { name: 'Skip cinematic' }))
      expect(soundtrack.finish).toHaveBeenCalledTimes(1)
      act(() => film.done?.())
      expect(soundtrack.finish).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Confirm exit' })).toBeInTheDocument()
    } finally {
      await act(async () => releaseDecision())
    }
  })

  it('finishes the continuation if departure artwork preparation falls back', async () => {
    film.prepare.mockRejectedValueOnce(new Error('unavailable departure artwork'))
    const { soundtrack, releaseDecision } = openExit()
    try {
      await screen.findByRole('button', { name: 'Confirm exit' })
      expect(soundtrack.finish).toHaveBeenCalledTimes(1)
      expect(film.handoff).toBeNull()
    } finally {
      await act(async () => releaseDecision())
    }
  })

  it('does not add the final-day ident to an ordinary weekly exit', async () => {
    const { releaseDecision } = openExit({ phase: 'eviction_results' })
    try {
      await waitFor(() => expect(film.handoff).toBeTypeOf('function'))
      expect(film.prepare).toHaveBeenCalledWith(
        'exit',
        expect.anything(),
        'generic',
        expect.not.objectContaining({ closingBrand: true })
      )
    } finally {
      await act(async () => releaseDecision())
    }
  })

  it('keeps reduced-motion exits native without preparing the brand and finishes music once', async () => {
    const { soundtrack, releaseDecision, onDone } = openExit({ reduced: true })
    try {
      await screen.findByRole('button', { name: 'Confirm exit' })
      expect(film.prepare).not.toHaveBeenCalled()
      expect(soundtrack.finish).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'Confirm exit' }))
      expect(onDone).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => releaseDecision())
    }
  })
})

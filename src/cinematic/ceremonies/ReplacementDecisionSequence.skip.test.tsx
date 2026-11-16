import { useLayoutEffect, useRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, expect, it, vi } from 'vitest'
import gameReducer, {
  claimPresentationEvent,
  createInitialGameState,
  hydrateGame,
  submitPovSaveTarget,
} from '../../store/gameSlice'
import { useAppSelector } from '../../store/hooks'
import { useReplacementSequence } from '../../screens/GameScreen/flows/useReplacementSequence'
import { gameScreenGameEquality } from '../../screens/GameScreen/gameScreenGameEquality'
import { replacementPresentationMiddleware } from './replacementPresentationMiddleware'
import ReplacementDecisionSequence from './ReplacementDecisionSequence'

interface FilmFixture {
  scene: string
  mounted: boolean
  done: () => void
  stop: ReturnType<typeof vi.fn>
}
const { controllers } = vi.hoisted(() => ({ controllers: [] as FilmFixture[] }))
vi.mock('./renderer.js', () => ({
  createClip: () => {
    const clip: FilmFixture = { scene: '', mounted: false, done: () => {}, stop: vi.fn() }
    controllers.push(clip)
    return {
      prepare: vi.fn(async (scene: string) => {
        clip.scene = scene
        return { images: {} }
      }),
      mount: (_parent: HTMLElement, _handoff: () => void, done: () => void) => {
        clip.done = done
        clip.mounted = true
      },
      stop: clip.stop,
      pause: vi.fn(),
      resume: vi.fn(),
      setVisible: vi.fn(),
    }
  },
}))
vi.mock('./runtime.mjs', async (original) => ({
  ...(await original<typeof import('./runtime.mjs')>()),
  ceremonyCast: vi.fn(() => ({ a: { id: 'fixture' } })),
}))
afterEach(async () => {
  cleanup()
  await act(async () => {
    await Promise.resolve()
  })
  vi.useRealTimers()
})

const interruptions = [1, 2].flatMap((gap) =>
  (['skip', 'natural'] as const).map((completion) => ({ gap, completion }))
)
it.each(interruptions)(
  'continues after a media claim races handoff $gap ($completion), without another broadcast',
  async ({ gap, completion }) => {
    localStorage.clear()
    controllers.length = 0
    const initial = createInitialGameState({ seed: 730 })
    const human = initial.players.find((p) => p.isUser)!
    const [a, b, c, d] = initial.players.filter((p) => !p.isUser)
    const store = configureStore({
      reducer: { game: gameReducer },
      middleware: (get) => get().concat(replacementPresentationMiddleware),
    })
    store.dispatch(
      hydrateGame({
        ...initial,
        gameId: 'skip-claim-race',
        week: 3,
        phase: 'pos_ceremony_results',
        status: 'active',
        lohId: d.id,
        posWinnerId: c.id,
        nomineeIds: [a.id, b.id],
        replacementNeeded: false,
        awaitingPovDecision: false,
        awaitingPovSaveTarget: true,
        specialVeto: { ...initial.specialVeto!, activeType: 'vip', vipUseStage: 0 },
        players: initial.players.map((p) => ({
          ...p,
          status: p.id === human.id ? 'jury' : [a.id, b.id].includes(p.id) ? 'nominated' : 'active',
        })),
      })
    )
    const observed: { sequence: ReturnType<typeof useReplacementSequence> | null } = {
      sequence: null,
    }
    function Flow() {
      const game = useAppSelector((s) => s.game, gameScreenGameEquality)
      const sequence = useReplacementSequence(game, true)
      useLayoutEffect(() => {
        observed.sequence = sequence
      }, [sequence])
      return (
        <>
          <ClaimDuringHandoff empty={sequence.active && !sequence.playing && !sequence.held} />
          <ReplacementDecisionSequence sequence={sequence} onRequestDecision={() => {}}>
            <div>Season screen</div>
          </ReplacementDecisionSequence>
        </>
      )
    }
    function ClaimDuringHandoff({ empty }: { empty: boolean }) {
      const claimed = useRef(false)
      const gaps = useRef(0)
      useLayoutEffect(() => {
        if (!empty || claimed.current) return
        gaps.current++
        if (gaps.current !== gap) return
        claimed.current = true
        // This is also the action used by the Depression Shock chocolate beat.
        // Force it between render and passive effects to cover the rare ordering.
        store.dispatch(
          claimPresentationEvent({
            gameId: 'skip-claim-race',
            runId: 'day2',
            eventId: 'depression-chocolates',
          })
        )
      }, [empty])
      return null
    }
    render(
      <Provider store={store}>
        <Flow />
      </Provider>
    )
    act(() => {
      store.dispatch(submitPovSaveTarget(b.id))
    })
    await waitFor(() => expect(controllers[0]?.mounted).toBe(true))
    expect(controllers[0].scene).toBe('save')
    for (let index = 0; index < gap; index++) {
      await waitFor(() => expect(controllers[index]?.mounted).toBe(true))
      if (completion === 'natural') act(() => controllers[index].done())
      else {
        const skip = screen.getByRole('button', { name: 'Skip this ceremony scene' })
        act(() => {
          skip.click()
          skip.click()
        })
      }
    }
    // No timer, extra Play press, or addTvEvent should be needed to progress.
    await waitFor(() =>
      expect(Boolean(observed.sequence?.playing) || observed.sequence?.active === false).toBe(true)
    )
    expect(store.getState().game.presentationEventClaims).toContainEqual(
      expect.objectContaining({ eventId: 'depression-chocolates' })
    )
    expect(store.getState().game.phase).toBe('pos_ceremony_results')
    for (let index = 0; index < 8 && observed.sequence?.active; index++) {
      await waitFor(() => expect(observed.sequence?.playing).not.toBeNull())
      fireEvent.click(screen.getByRole('button', { name: 'Skip this ceremony scene' }))
    }
    await waitFor(() => expect(screen.getByText('Season screen')).toBeInTheDocument())
    expect(observed.sequence?.active).toBe(false)
    expect(store.getState().game.specialVeto?.vipUseStage).toBe(-1)
    expect(controllers.slice(0, 2).map((controller) => controller.scene)).toEqual([
      'save',
      'replacement',
    ])
  }
)

it('releases an unexpectedly empty ceremony to the native flow after a bounded wait', async () => {
  vi.useFakeTimers()
  const store = configureStore({ reducer: { game: gameReducer } })
  const sequence = { active: true, playing: null, held: null, onDone: vi.fn(), onError: vi.fn() }
  const view = (active: boolean) => (
    <Provider store={store}>
      <ReplacementDecisionSequence sequence={{ ...sequence, active }} onRequestDecision={vi.fn()}>
        <div>Native recovery</div>
      </ReplacementDecisionSequence>
    </Provider>
  )
  const { rerender } = render(view(true))
  fireEvent.click(screen.getByRole('button', { name: 'Skip this ceremony scene' }))
  expect(sequence.onDone).toHaveBeenCalledTimes(1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1999)
  })
  expect(sequence.onError).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(sequence.onError).toHaveBeenCalledTimes(1)
  rerender(view(false))
  expect(screen.getByText('Native recovery')).toBeInTheDocument()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(sequence.onError).toHaveBeenCalledTimes(1)
})

it('keeps a real human save choice open and requests it only once on repeated Skip', async () => {
  localStorage.clear()
  controllers.length = 0
  const initial = createInitialGameState({ seed: 730 })
  const human = initial.players.find((player) => player.isUser)!
  const [a, b] = initial.players.filter((player) => !player.isUser)
  const store = configureStore({
    reducer: { game: gameReducer },
    middleware: (get) => get().concat(replacementPresentationMiddleware),
  })
  store.dispatch(
    hydrateGame({
      ...initial,
      gameId: 'skip-pending-human-choice',
      phase: 'pos_ceremony_results',
      lohId: human.id,
      posWinnerId: human.id,
      nomineeIds: [a.id, b.id],
      awaitingPovDecision: false,
      awaitingPovSaveTarget: true,
      specialVeto: { ...initial.specialVeto!, activeType: null },
    })
  )
  const requestDecision = vi.fn()
  const observed: { sequence: ReturnType<typeof useReplacementSequence> | null } = {
    sequence: null,
  }
  function Flow() {
    const sequence = useReplacementSequence(
      useAppSelector((state) => state.game, gameScreenGameEquality),
      true
    )
    useLayoutEffect(() => {
      observed.sequence = sequence
    }, [sequence])
    return (
      <ReplacementDecisionSequence sequence={sequence} onRequestDecision={requestDecision}>
        <div>Season screen</div>
      </ReplacementDecisionSequence>
    )
  }
  render(
    <Provider store={store}>
      <Flow />
    </Provider>
  )
  await waitFor(() => expect(controllers[0]?.mounted).toBe(true))
  const before = store.getState().game
  vi.useFakeTimers()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
  expect(observed.sequence?.held?.decision?.kind).toBe('save')
  expect(observed.sequence?.active).toBe(true)
  const skip = screen.getByRole('button', { name: 'Continue to Confessional' })
  fireEvent.click(skip)
  fireEvent.click(skip)
  expect(requestDecision).toHaveBeenCalledTimes(1)
  expect(store.getState().game).toBe(before)
  expect(store.getState().game.awaitingPovSaveTarget).toBe(true)
  expect(controllers[0].stop).not.toHaveBeenCalled()
})

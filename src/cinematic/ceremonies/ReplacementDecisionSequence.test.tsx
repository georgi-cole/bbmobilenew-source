import { act, cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import gameReducer, {
  createInitialGameState,
  hydrateGame,
  submitPovSaveTarget,
  setReplacementNominee,
} from '../../store/gameSlice'
import { useAppSelector } from '../../store/hooks'
import { useReplacementSequence } from '../../screens/GameScreen/flows/useReplacementSequence'
import { replacementPresentationMiddleware } from './replacementPresentationMiddleware'
import ReplacementDecisionSequence from './ReplacementDecisionSequence'
import { ceremonyCast } from './runtime.mjs'

const { controllers } = vi.hoisted(() => ({
  controllers: [] as Array<{ scene: string; done: () => void; stop: ReturnType<typeof vi.fn> }>,
}))
vi.mock('./renderer.js', () => ({
  createClip: () => {
    const clip = { scene: '', done: () => {}, stop: vi.fn() }
    controllers.push(clip)
    return {
      prepare: vi.fn(async (scene: string) => {
        clip.scene = scene
        return { images: {} }
      }),
      mount: (_parent: HTMLElement, _handoff: () => void, done: () => void) => {
        clip.done = done
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
beforeEach(() => {
  localStorage.clear()
  controllers.length = 0
  vi.clearAllMocks()
})
afterEach(cleanup)

function fixture() {
  const store = configureStore({
    reducer: { game: gameReducer },
    middleware: (get) => get().concat(replacementPresentationMiddleware),
  })
  const game = createInitialGameState({ seed: 730 })
  const human = game.players.find((p) => p.isUser)!
  const [a, b, c] = game.players.filter((p) => !p.isUser)
  store.dispatch(
    hydrateGame({
      ...game,
      gameId: 'actual-sequence-handoff',
      status: 'active',
      phase: 'pos_ceremony_results',
      lohId: human.id,
      posWinnerId: human.id,
      nomineeIds: [a.id, b.id],
      awaitingPovSaveTarget: true,
      specialVeto: { ...game.specialVeto!, activeType: null },
    })
  )
  function Flow() {
    const sequence = useReplacementSequence(
      useAppSelector((s) => s.game),
      true
    )
    return (
      <ReplacementDecisionSequence sequence={sequence} onRequestDecision={() => {}}>
        <div>Season screen</div>
      </ReplacementDecisionSequence>
    )
  }
  render(
    <Provider store={store}>
      <Flow />
    </Provider>
  )
  act(() => {
    store.dispatch(submitPovSaveTarget(b.id))
    store.dispatch(setReplacementNominee(c.id))
  })
  return { store, savedId: b.id }
}

it('hands the individual off-block film directly into the backup film without a Play click', async () => {
  const { store, savedId } = fixture()
  await waitFor(() => expect(controllers[0]?.scene).toBe('save'))
  expect(ceremonyCast).toHaveBeenCalledWith(
    'save',
    expect.objectContaining({ targetIds: [savedId] }),
    expect.anything(),
    expect.anything()
  )
  await act(async () => controllers[0].done())
  await waitFor(() => expect(controllers[1]?.scene).toBe('replacement'))
  expect(controllers[0].stop).toHaveBeenCalled()
  await act(async () => controllers[1].done())
  await waitFor(() => expect(screen.getByText('Season screen')).toBeInTheDocument())
  expect(controllers.map((c) => c.scene)).toEqual(['save', 'replacement'])
  expect(store.getState().game.phase).toBe('pos_ceremony_results')
})

it('skips only the current save film and still shows the committed replacement next', async () => {
  fixture()
  await waitFor(() => expect(controllers[0]?.scene).toBe('save'))
  fireEvent.click(screen.getByRole('button', { name: 'Skip this ceremony scene' }))
  await waitFor(() => expect(controllers[1]?.scene).toBe('replacement'))
  await act(async () => controllers[1].done())
  await waitFor(() => expect(screen.getByText('Season screen')).toBeInTheDocument())
})

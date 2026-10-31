import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { store as baseline } from '../../store/store'
import VoteResults from './vote-results'
import type { AnimatedVoteResultsModalProps } from '../../components/AnimatedVoteResultsModal/AnimatedVoteResultsModal'

const film = vi.hoisted(() => ({
  prepare: vi.fn(async (_scene: string, _cast: unknown, _shock: string, _details: unknown) => ({})),
  resolvePrepare: null as ((value: object) => void) | null,
  complete: null as (() => void) | null,
}))
vi.mock('./renderer.js', () => ({
  createClip: () => ({
    prepare: film.prepare,
    mount: (_parent: HTMLElement, _handoff: () => void, done: () => void) => {
      film.complete = done
    },
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    setVisible: vi.fn(),
  }),
}))
vi.mock('../../components/AnimatedVoteResultsModal/AnimatedVoteResultsModal', () => ({
  default: ({ onDone }: AnimatedVoteResultsModalProps) => (
    <button onClick={onDone}>Native vote result</button>
  ),
}))
afterEach(cleanup)
beforeEach(() => {
  film.prepare.mockReset()
  film.prepare.mockImplementation(async () => ({}))
  film.resolvePrepare = null
  film.complete = null
})
function fixture(
  overrides: { survival?: boolean; vip?: boolean; standard?: boolean; off?: boolean } = {}
) {
  const state = structuredClone(baseline.getState())
  state.vip.isActive = overrides.vip ?? true
  state.settings.gameUX.animations = !overrides.off
  state.settings.gameUX.animationMode = overrides.standard ? 'standard' : 'cinematic'
  state.settings.display.reduceMotion = false
  state.game.mode = overrides.survival ? 'survival' : 'classic'
  state.game.gameId = 'vox-result-test'
  state.game.voxPopuli = { ...state.game.voxPopuli!, status: 'active' }
  const names = ['Aria', 'Ash', 'Nova']
  state.game.players = names.map((name, i) => ({
    ...state.game.players[i],
    id: name.toLowerCase(),
    name,
    avatar: `assets/skins/${name}_avatar.webp`,
    status: 'nominated',
  }))
  const store = configureStore({ reducer: (current = state) => current })
  return {
    store,
    nominees: state.game.players.map((nominee, i) => ({ nominee, voteCount: [52, 31, 17][i] })),
  }
}
it.each([{ survival: true }, { vip: false }, { standard: true }, { off: true }])(
  'keeps native public results without preparing media for %j',
  async (options) => {
    const { store, nominees } = fixture(options)
    const done = vi.fn()
    render(
      <Provider store={store}>
        <VoteResults
          resultMode="public"
          nominees={nominees}
          evictee={nominees[0].nominee}
          onDone={done}
        />
      </Provider>
    )
    fireEvent.click(screen.getByText('Native vote result'))
    expect(done).toHaveBeenCalledTimes(1)
    expect(film.prepare).not.toHaveBeenCalled()
  }
)
it('replaces the public result once, including Skip; a double result does not resolve twice', async () => {
  const { store, nominees } = fixture()
  const done = vi.fn()
  render(
    <Provider store={store}>
      <VoteResults
        resultMode="public"
        nominees={nominees}
        evictee={nominees[0].nominee}
        evicteeIds={['aria', 'ash']}
        onDone={done}
      />
    </Provider>
  )
  await waitFor(() => expect(film.complete).toBeTypeOf('function'))
  expect(screen.queryByText('Native vote result')).toBeNull()
  fireEvent.click(screen.getByLabelText('Skip cinematic'))
  film.complete?.()
  expect(done).toHaveBeenCalledTimes(1)
  expect(film.prepare.mock.calls[0][0]).toBe('voxResults')
})
it('covers asset preparation with the cinematic entrance and lets Skip continue immediately', async () => {
  const { store, nominees } = fixture()
  const done = vi.fn()
  film.prepare.mockImplementation(
    () =>
      new Promise((resolve) => {
        film.resolvePrepare = resolve
      })
  )

  render(
    <Provider store={store}>
      <VoteResults
        resultMode="public"
        nominees={nominees}
        evictee={nominees[0].nominee}
        onDone={done}
      />
    </Provider>
  )

  await waitFor(() => expect(film.prepare).toHaveBeenCalled())
  expect(screen.getByText('Public vote reveal')).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Skip cinematic'))
  expect(done).toHaveBeenCalledTimes(1)
  film.resolvePrepare?.({})
})
it('does not commit a tied result before the existing tiebreak callback', async () => {
  const { store, nominees } = fixture()
  const done = vi.fn(),
    tie = vi.fn()
  const tied = nominees.slice(0, 2).map((t) => ({ ...t, voteCount: 50 }))
  render(
    <Provider store={store}>
      <VoteResults resultMode="public" nominees={tied} onDone={done} onTiebreakerRequired={tie} />
    </Provider>
  )
  await waitFor(() => expect(film.complete).toBeTypeOf('function'))
  film.complete?.()
  expect(tie).toHaveBeenCalledExactlyOnceWith(['aria', 'ash'])
  expect(done).not.toHaveBeenCalled()
})
it('resolves an audience approval tiebreak before advancing, without an LOH decision', async () => {
  const { store, nominees } = fixture()
  const calls: string[] = []
  const resolve = vi.fn((ids: string[]) => calls.push('resolve:' + ids.join(',')))
  render(
    <Provider store={store}>
      <VoteResults
        resultMode="public"
        nominees={nominees}
        publicTiebreak={{
          tiedNominees: nominees.slice(0, 2).map((t) => ({ nominee: t.nominee, approval: 40 })),
          evicteeIds: ['ash'],
        }}
        onPublicTiebreakResolved={resolve}
        onDone={() => calls.push('done')}
      />
    </Provider>
  )
  await waitFor(() => expect(film.complete).toBeTypeOf('function'))
  film.complete?.()
  film.complete?.()
  expect(calls).toEqual(['resolve:ash', 'done'])
})

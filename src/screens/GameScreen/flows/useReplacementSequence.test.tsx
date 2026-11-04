import { act, cleanup, renderHook } from '@testing-library/react'
import { configureStore, type Middleware } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import gameReducer, {
  createInitialGameState,
  hydrateGame,
  setReplacementNominee,
  submitPovSaveTarget,
  submitPovDecision,
  submitVipSecondSaveTarget,
  submitVipSecondUseDecision,
} from '../../../store/gameSlice'
import { replacementPresentationMiddleware } from '../../../cinematic/ceremonies/replacementPresentationMiddleware'
import { useReplacementSequence } from './useReplacementSequence'
import { useAppSelector } from '../../../store/hooks'
import { missionPowerMiddleware } from '../../../store/missionPowerMiddleware'

beforeEach(() => localStorage.clear())
afterEach(cleanup)
function fixture(withMissionMiddleware = false) {
  const initial = createInitialGameState({ seed: 730 })
  const human = initial.players.find((p) => p.isUser)!
  const [a, b, c, d] = initial.players.filter((p) => !p.isUser)
  const game = {
    ...initial,
    gameId: 'interactive-double-trouble',
    week: 3,
    phase: 'pos_ceremony_results' as const,
    status: 'active' as const,
    lohId: human.id,
    posWinnerId: human.id,
    nomineeIds: [a.id, b.id],
    replacementNeeded: false,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: true,
    specialVeto: { ...initial.specialVeto!, activeType: 'vip' as const, vipUseStage: 0 as const },
    players: initial.players.map((p) => ({
      ...p,
      status: [a.id, b.id].includes(p.id) ? ('nominated' as const) : ('active' as const),
    })),
  }
  const store = configureStore({
    reducer: { game: gameReducer },
    middleware: (getDefault) =>
      withMissionMiddleware
        ? getDefault().concat(
            missionPowerMiddleware as Middleware,
            replacementPresentationMiddleware
          )
        : getDefault().concat(replacementPresentationMiddleware),
  })
  store.dispatch(hydrateGame(game))
  return { store, a, b, c, d, human }
}
describe('human decisions within the live replacement sequence', () => {
  it('enters the real binary decision without a film and leaves a declined use on faux TV', () => {
    const { store } = fixture()
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        awaitingPovDecision: true,
        awaitingPovSaveTarget: false,
        specialVeto: { ...store.getState().game.specialVeto!, activeType: null },
      })
    )
    const { result } = renderHook(
      () =>
        useReplacementSequence(
          useAppSelector((s) => s.game),
          true
        ),
      { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> }
    )
    expect(result.current.held?.skipAuthority).toBe(true)
    expect(result.current.held?.decision?.kind).toBe('use')
    act(() => store.dispatch(submitPovDecision(false)))
    expect(result.current.active).toBe(false)
    expect(result.current.playing).toBeNull()
    expect(result.current.held).toBeNull()
    expect(
      store.getState().game.tvFeed.some((event) => /not to use|not use/i.test(event.text))
    ).toBe(true)
  })
  it('queues a later committed action without restarting the currently playing receipt', () => {
    const { store, b, c } = fixture()
    const { result } = renderHook(
      () =>
        useReplacementSequence(
          useAppSelector((s) => s.game),
          true
        ),
      {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
      }
    )
    act(() => {
      store.dispatch(submitPovSaveTarget(b.id))
    })
    const eventKey = result.current.playing?.eventKey
    act(() => {
      store.dispatch(setReplacementNominee(c.id))
    })
    expect(result.current.playing?.eventKey).toBe(eventKey)
    expect(result.current.playing?.actionHistory).toHaveLength(1)
    act(() => result.current.onDone())
    expect(result.current.playing?.actionHistory).toEqual([
      expect.objectContaining({ kind: 'replacement', playerId: c.id }),
    ])
  })
  it('waits for each human choice, shows only its committed result, and never replays the first round', () => {
    const { store, b, c, d } = fixture()
    const { result } = renderHook(
      () =>
        useReplacementSequence(
          useAppSelector((s) => s.game),
          true
        ),
      {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
      }
    )
    expect(result.current.held?.decision?.kind).toBe('save')
    expect(result.current.playing).toBeNull()
    act(() => result.current.onDone()) // Skip cannot supply a missing decision.
    expect(store.getState().game.awaitingPovSaveTarget).toBe(true)
    act(() => {
      store.dispatch(submitPovSaveTarget(b.id))
    })
    expect(result.current.playing?.actionHistory).toEqual([
      expect.objectContaining({ kind: 'save', playerId: b.id }),
    ])
    expect(result.current.playing?.replacementIds).toEqual([])
    act(() => result.current.onDone())
    expect(result.current.held?.decision?.kind).toBe('replacement')
    expect(store.getState().game.replacementNeeded).toBe(true)
    act(() => {
      store.dispatch(setReplacementNominee(c.id))
    })
    expect(result.current.playing?.actionHistory).toEqual([
      expect.objectContaining({ kind: 'replacement', playerId: c.id }),
    ])
    act(() => result.current.onDone())
    expect(result.current.held?.decision?.kind).toBe('secondUse')
    act(() => {
      store.dispatch(submitVipSecondUseDecision(true))
    })
    expect(result.current.held?.decision?.kind).toBe('save')
    act(() => {
      store.dispatch(submitVipSecondSaveTarget(c.id))
    })
    expect(result.current.playing?.actionHistory).toEqual([
      expect.objectContaining({ kind: 'save', playerId: c.id }),
    ])
    act(() => result.current.onDone())
    expect(result.current.held?.decision?.kind).toBe('replacement')
    act(() => {
      store.dispatch(setReplacementNominee(d.id))
    })
    expect(result.current.playing?.actionHistory).toEqual([
      expect.objectContaining({ kind: 'replacement', playerId: d.id }),
    ])
    act(() => result.current.onDone())
    expect(result.current.active).toBe(false)
    expect(result.current.handled).toBe(true)
    expect(store.getState().game.phase).toBe('pos_ceremony_results')
  })
  it('keeps Standard mode outside the new controller', () => {
    const { store } = fixture()
    const { result } = renderHook(
      () =>
        useReplacementSequence(
          useAppSelector((s) => s.game),
          false
        ),
      {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
      }
    )
    expect(result.current.active).toBe(false)
    expect(result.current.interceptDecision).toBe(false)
    expect(result.current.handled).toBe(false)
  })
  it('runs AI substeps between finished scenes, without advancing out of the ceremony', () => {
    const { store, b, c, d, human } = fixture()
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        posWinnerId: c.id,
        lohId: d.id,
        players: store
          .getState()
          .game.players.map((p) => (p.id === human.id ? { ...p, status: 'jury' as const } : p)),
      })
    )
    const { result } = renderHook(
      () =>
        useReplacementSequence(
          useAppSelector((s) => s.game),
          true
        ),
      {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
      }
    )
    act(() => {
      store.dispatch(submitPovSaveTarget(b.id))
    })
    expect(store.getState().game.aiReplacementStep).toBe(1)
    const seen = []
    for (let index = 0; result.current.playing && index < 8; index++) {
      seen.push(result.current.playing.actionHistory.map((a) => a.kind).join(','))
      act(() => result.current.onDone())
    }
    expect(seen.slice(0, 2)).toEqual(['save', 'replacement'])
    expect(['decline', 'replacement']).toContain(seen.at(-1))
    expect(result.current.active).toBe(false)
    expect(store.getState().game.specialVeto?.vipUseStage).toBe(-1)
    expect(store.getState().game.phase).toBe('pos_ceremony_results')
  })
  it('does not replay completed decisions when Cinematic is enabled halfway through', () => {
    const { store, b, c } = fixture()
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useReplacementSequence(
          useAppSelector((s) => s.game),
          enabled
        ),
      {
        initialProps: { enabled: false },
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
      }
    )
    act(() => {
      store.dispatch(submitPovSaveTarget(b.id))
      store.dispatch(setReplacementNominee(c.id))
    })
    rerender({ enabled: true })
    expect(result.current.playing).toBeNull()
    expect(result.current.held?.decision?.kind).toBe('secondUse')
  })
  it('leaves a declined second use on faux TV without saving or nominating anyone else', () => {
    const { store, b, c } = fixture()
    const { result } = renderHook(
      () =>
        useReplacementSequence(
          useAppSelector((s) => s.game),
          true
        ),
      {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
      }
    )
    act(() => {
      store.dispatch(submitPovSaveTarget(b.id))
      store.dispatch(setReplacementNominee(c.id))
    })
    act(() => result.current.onDone())
    act(() => result.current.onDone())
    const before = store.getState().game.nomineeIds
    act(() => {
      store.dispatch(submitVipSecondUseDecision(false))
    })
    expect(result.current.playing).toBeNull()
    expect(store.getState().game.nomineeIds).toEqual(before)
    act(() => result.current.onDone())
    expect(result.current.active).toBe(false)
  })
  it('commits an ordinary Safety intent once through its real middleware before asking for the backup', () => {
    const { store, b } = fixture(true)
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        secretMission: undefined,
        specialVeto: { ...store.getState().game.specialVeto!, activeType: null },
      })
    )
    const { result } = renderHook(
      () =>
        useReplacementSequence(
          useAppSelector((s) => s.game),
          true
        ),
      {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
      }
    )
    act(() => {
      store.dispatch(submitPovSaveTarget(b.id))
    })
    expect(store.getState().game.missionPowers?.safetyIntent).toBeUndefined()
    expect(result.current.playing?.actionHistory).toHaveLength(1)
    expect(result.current.playing?.actionHistory[0].playerId).toBe(b.id)
    act(() => result.current.onDone())
    expect(result.current.held?.decision?.kind).toBe('replacement')
  })
  it('releases presentation on failure without choosing the human backup', () => {
    const { store, b } = fixture()
    const { result } = renderHook(
      () =>
        useReplacementSequence(
          useAppSelector((s) => s.game),
          true
        ),
      {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
      }
    )
    act(() => {
      store.dispatch(submitPovSaveTarget(b.id))
    })
    const nominees = store.getState().game.nomineeIds
    act(() => result.current.onError())
    expect(result.current.active).toBe(false)
    expect(result.current.handled).toBe(false)
    expect(result.current.interceptDecision).toBe(false)
    expect(store.getState().game.replacementNeeded).toBe(true)
    expect(store.getState().game.nomineeIds).toEqual(nominees)
  })
})

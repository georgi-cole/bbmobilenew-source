import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import BattleBackCompetition from './BattleBackCompetition'
import { store } from '../../store/store'
import {
  createInitialGameState,
  hydrateGame,
  acceptBattleBackRetry,
  offerBattleBackRetry,
} from '../../store/gameSlice'
import CompetitionResultCheckpoint from '../../minigames/CompetitionResultCheckpoint'
import type { GenericMinigameProps } from '../../minigames/reactComponents'

const save = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../../store/store', async () => ({
  ...(await vi.importActual<typeof import('../../store/store')>('../../store/store')),
  persistCompetitionCheckpoint: save,
}))
vi.mock('../../i18n/I18nContext', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('./Capitalization', async () => ({
  ...(await vi.importActual<typeof import('./Capitalization')>('./Capitalization')),
  default: ReturnGame,
}))

function ReturnGame({ participants = [], onFinish }: GenericMinigameProps) {
  const [done, setDone] = React.useState(false)
  const result = {
    rawValue: 700,
    partial: false,
    completion: {
      rawValue: 700,
      authoritativeWinnerId: participants[0].id,
      rawResults: Object.fromEntries(
        participants.map((player, index) => [player.id, 700 - index * 100])
      ),
    },
  }
  return done ? (
    <>
      <CompetitionResultCheckpoint result={result} />
      <button onClick={() => onFinish?.(700, undefined, result.completion)}>
        Continue return game
      </button>
    </>
  ) : (
    <button onClick={() => setDone(true)}>Finish return game</button>
  )
}
beforeEach(() => {
  save.mockReset().mockResolvedValue(true)
  const game = createInitialGameState({ seed: 791, seasonArchives: [] })
  game.week = 7
  game.players.slice(0, 3).forEach((player) => {
    player.status = 'jury'
  })
  game.battleBack = {
    used: false,
    active: true,
    competitionActive: true,
    weekDecided: 7,
    candidates: game.players.slice(0, 3).map((player) => player.id),
    attemptIndex: 0,
    retryCount: 0,
    retryLimit: 3,
    winnerId: null,
  }
  store.dispatch(hydrateGame(game))
})
afterEach(cleanup)

function mount(onFinish = vi.fn()) {
  const bb = store.getState().game.battleBack!
  const participants = bb.candidates.map((id, index) => ({
    id,
    name: `Returnee ${index}`,
    isHuman: index === 0,
    precomputedScore: 100 - index,
    previousPR: null,
  }))
  return {
    onFinish,
    ...render(
      <Provider store={store}>
        <BattleBackCompetition
          attemptIndex={bb.attemptIndex ?? 0}
          seed={791}
          participantIds={bb.candidates}
          participants={participants}
          onFinish={onFinish}
        />
      </Provider>
    ),
  }
}

describe('Back 2 the Game attempt recovery', () => {
  it('keeps an unfinished attempt lost across remounts and uses the existing returnee winner callback', async () => {
    const first = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Start competition' }))
    await screen.findByRole('button', { name: 'Finish return game' })
    expect(store.getState().game.battleBack?.attemptCheckpoint?.status).toBe('playing')
    first.unmount()
    const restored = mount()
    expect(screen.queryByRole('button', { name: 'Finish return game' })).toBeNull()
    await waitFor(() =>
      expect(store.getState().game.battleBack?.attemptCheckpoint?.status).toBe('finished')
    )
    const saved = store.getState().game.battleBack!.attemptCheckpoint!
    if (!('result' in saved)) throw new Error('Missing result')
    expect(saved.result.partial).toBe(true)
    expect(saved.result.completion?.authoritativeWinnerId).not.toBe(
      store.getState().game.battleBack!.candidates[0]
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() =>
      expect(restored.onFinish).toHaveBeenCalledWith(0, undefined, saved.result.completion)
    )
  })

  it('restores the actual finished winner before Continue rather than forfeiting it', async () => {
    const first = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Start competition' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Finish return game' }))
    await waitFor(() =>
      expect(store.getState().game.battleBack?.attemptCheckpoint?.status).toBe('finished')
    )
    expect(first.onFinish).not.toHaveBeenCalled()
    first.unmount()
    const restored = mount()
    expect(screen.queryByRole('button', { name: 'Finish return game' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() =>
      expect(restored.onFinish).toHaveBeenCalledWith(
        700,
        undefined,
        expect.objectContaining({
          authoritativeWinnerId: store.getState().game.battleBack!.candidates[0],
        })
      )
    )
  })

  it('allows only an explicitly granted retry to open another returnee attempt', async () => {
    const first = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Start competition' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Finish return game' }))
    await waitFor(() =>
      expect(store.getState().game.battleBack?.attemptCheckpoint?.status).toBe('finished')
    )
    first.unmount()
    act(() => {
      store.dispatch(offerBattleBackRetry(store.getState().game.battleBack!.candidates[1]))
      store.dispatch(acceptBattleBackRetry())
    })
    expect(store.getState().game.battleBack?.attemptCheckpoint).toEqual({
      number: 1,
      status: 'ready',
    })
    mount()
    expect(screen.getByRole('button', { name: 'Start competition' })).toBeVisible()
    expect(store.getState().game.battleBack?.retryCount).toBe(1)
  })
})

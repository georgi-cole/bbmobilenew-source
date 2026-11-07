import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TetrisAiRoundPerformance } from '../../../ai/competition/tetrisSimulation'
import TetrisComp from '../TetrisComp'

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), sliced: vi.fn() }))
vi.mock('../../../store/hooks', () => ({ useAppDispatch: () => mocks.dispatch }))
vi.mock('../../../i18n/I18nContext', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../../ai/competition/tetrisSimulation', () => ({
  simulateTetrisAiRunsInSlices: mocks.sliced,
}))
vi.mock('../../ResolvedAvatarImage/ResolvedAvatarImage', () => ({ default: () => null }))

const participants = ['human', 'ai-1', 'ai-2', 'ai-3'].map((id) => ({
  id,
  name: id,
  isHuman: id === 'human',
  precomputedScore: 50,
  previousPR: null,
}))
const results: TetrisAiRoundPerformance[] = [1, 2, 3].map((score) => ({
  score,
  lines: 0,
  pieces: 1,
  maxStackHeight: 10,
}))

describe('Fit Me In round work scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.dispatch.mockClear()
    mocks.sliced.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('can display the transition while AI work is pending, then show the round standings', async () => {
    let complete!: (results: TetrisAiRoundPerformance[]) => void
    mocks.sliced.mockReturnValue(
      new Promise<TetrisAiRoundPerformance[]>((resolve) => {
        complete = resolve
      })
    )
    render(
      <TetrisComp
        participantIds={participants.map((p) => p.id)}
        participants={participants}
        prizeType="LOH"
        seed={42}
        onComplete={vi.fn()}
      />
    )
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('fitMeIn.calculatingStandings')).toBeVisible()
    expect(mocks.sliced).toHaveBeenCalledOnce()
    await act(async () => {
      complete(results)
    })
    await act(async () => {
      vi.advanceTimersByTime(650)
    })
    expect(screen.getByRole('button', { name: 'fitMeIn.revealWinner' })).toBeVisible()
  })

  it('cancels pending AI work when the player leaves the game', async () => {
    let complete!: (results: TetrisAiRoundPerformance[]) => void
    mocks.sliced.mockReturnValue(
      new Promise<TetrisAiRoundPerformance[]>((resolve) => {
        complete = resolve
      })
    )
    const onComplete = vi.fn()
    const view = render(
      <TetrisComp
        participantIds={participants.map((p) => p.id)}
        participants={participants}
        prizeType="LOH"
        seed={42}
        onComplete={onComplete}
      />
    )
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    const shouldCancel = mocks.sliced.mock.calls[0][1].shouldCancel as () => boolean
    expect(shouldCancel()).toBe(false)
    view.unmount()
    expect(shouldCancel()).toBe(true)
    await act(async () => {
      complete(results)
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(onComplete).not.toHaveBeenCalled()
    expect(
      mocks.dispatch.mock.calls.some(
        ([action]) => action.type === 'tetris/completeTetrisTournament'
      )
    ).toBe(false)
  })
})

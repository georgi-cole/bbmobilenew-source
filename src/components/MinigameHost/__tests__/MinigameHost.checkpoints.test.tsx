import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MinigameHost from '../MinigameHost'
import CompetitionResultCheckpoint from '../../../minigames/CompetitionResultCheckpoint'
import type { GenericMinigameProps } from '../../../minigames/reactComponents'
import type { GameRegistryEntry } from '../../../minigames/registry'
import { store } from '../../../store/store'
import { createInitialGameState, hydrateGame } from '../../../store/gameSlice'
import {
  hydrateChallenge,
  setPendingChallenge,
  setPendingPhase,
  type PendingChallenge,
} from '../../../store/challengeSlice'

const mocks = vi.hoisted(() => ({ save: vi.fn(async () => true) }))
vi.mock('../../../store/store', async () => ({
  ...(await vi.importActual<typeof import('../../../store/store')>('../../../store/store')),
  persistCompetitionCheckpoint: mocks.save,
}))
vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn(), stop: vi.fn() },
}))
vi.mock('../../../i18n/I18nContext', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../../minigames/reactComponents', () => ({
  default: { TiltedLedge: ScoreGame },
  preloadReactMinigame: vi.fn(async () => undefined),
}))

function ScoreGame({ participants = [], onFinish }: GenericMinigameProps) {
  const [finished, setFinished] = React.useState(false)
  const humanId = participants.find((player) => player.isHuman)!.id
  const result = {
    rawValue: 123,
    partial: false,
    completion: {
      rawValue: 123,
      authoritativeWinnerId: humanId,
      authoritativeLastPlaceId: participants.find((player) => !player.isHuman)!.id,
      rawResults: Object.fromEntries(
        participants.map((player) => [player.id, player.isHuman ? 123 : 50])
      ),
    },
  }
  return finished ? (
    <>
      <CompetitionResultCheckpoint result={result} />
      <p>Final score: 123</p>
      <button onClick={() => onFinish?.(123, undefined, result.completion)}>Continue game</button>
    </>
  ) : (
    <>
      <button onClick={() => setFinished(true)}>Finish run</button>
      <button onClick={() => onFinish?.(222)}>Finish with host results</button>
    </>
  )
}

const game: GameRegistryEntry = {
  key: 'checkpoint-test',
  title: 'Checkpoint Test',
  description: '',
  instructions: [],
  metricKind: 'points',
  metricLabel: 'Points',
  timeLimitMs: 0,
  authoritative: false,
  scoringAdapter: 'raw',
  implementation: 'react',
  reactComponentKey: 'TiltedLedge',
  legacy: false,
  weight: 1,
  category: 'arcade',
  retired: false,
}
let pending: PendingChallenge
beforeEach(() => {
  mocks.save.mockReset().mockResolvedValue(true)
  const campaign = createInitialGameState({ seed: 733, seasonArchives: [] })
  campaign.players = campaign.players.slice(0, 2)
  campaign.phase = 'loh_comp'
  store.dispatch(hydrateGame(campaign))
  pending = {
    id: 'host-checkpoint',
    game,
    seed: 733,
    participants: campaign.players.map((player) => player.id),
    phase: 'rules',
    aiScores: { [campaign.players[1].id]: 50 },
    prizeType: 'LOH',
    origin: { gameId: campaign.gameId, week: campaign.week, phase: campaign.phase },
    attempt: { number: 0, status: 'ready' },
  }
  store.dispatch(setPendingChallenge(pending))
})
afterEach(() => {
  cleanup()
  store.dispatch(setPendingChallenge(null))
})

function mount(onDone = vi.fn(), onWatch = (reward: () => void) => reward()) {
  return {
    onDone,
    ...render(
      <Provider store={store}>
        <MinigameHost
          game={game}
          gameOptions={{ sessionId: pending.id }}
          skipRules
          skipCountdown
          onDone={onDone}
          onPhaseChange={(phase) => store.dispatch(setPendingPhase(phase))}
          participants={store.getState().game.players.map((player) => ({
            id: player.id,
            name: player.name,
            isHuman: Boolean(player.isUser),
            precomputedScore: 50,
            previousPR: null,
          }))}
          competitionRetry={{ enabled: true, onWatch }}
        />
      </Provider>
    ),
  }
}

describe('competition checkpoint boundaries', () => {
  it('waits for the start checkpoint to finish before mounting gameplay', async () => {
    let finishSave!: (ok: boolean) => void
    mocks.save.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishSave = resolve
      })
    )
    mount()
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
    expect(store.getState().challenge.pending?.attempt?.status).toBe('playing')
    expect(screen.queryByRole('button', { name: 'Finish run' })).toBeNull()
    await act(async () => finishSave(true))
    expect(await screen.findByRole('button', { name: 'Finish run' })).toBeVisible()
  })

  it('blocks gameplay on a failed write and retries the same attempt', async () => {
    mocks.save.mockResolvedValueOnce(false)
    mount()
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Finish run' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try saving again' }))
    expect(await screen.findByRole('button', { name: 'Finish run' })).toBeVisible()
    expect(store.getState().challenge.pending?.attempt?.number).toBe(0)
  })

  it('saves the final score before either Continue and restores it without remounting the game', async () => {
    const first = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Finish run' }))
    await waitFor(() =>
      expect(store.getState().challenge.pending?.attempt?.status).toBe('finished')
    )
    expect(first.onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Continue game' })).toBeVisible()
    const saved = JSON.parse(JSON.stringify(store.getState().challenge))
    first.unmount()
    store.dispatch(hydrateChallenge(saved))
    const restored = mount()
    expect(screen.queryByRole('button', { name: 'Finish run' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue game' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }))
    await waitFor(() =>
      expect(restored.onDone).toHaveBeenCalledWith(
        123,
        false,
        expect.objectContaining({
          authoritativeWinnerId: pending.participants[0],
          rawResults: { [pending.participants[0]]: 123, [pending.participants[1]]: 50 },
        })
      )
    )
  })

  it('checkpoints a score-only game when its timer hands results to the host', async () => {
    const host = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Finish with host results' }))
    await waitFor(() =>
      expect(store.getState().challenge.pending?.attempt).toMatchObject({
        status: 'finished',
        result: { rawValue: 222, partial: false },
      })
    )
    expect(host.onDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }))
    await waitFor(() => expect(host.onDone).toHaveBeenCalledWith(222, false))
  })

  it('keeps a finished win when the player uses the exit menu on the game result screen', async () => {
    const host = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Finish run' }))
    await waitFor(() =>
      expect(store.getState().challenge.pending?.attempt?.status).toBe('finished')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Leave competition/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Exit with 0' }))
    expect(screen.queryByRole('button', { name: 'Reverse time' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }))
    await waitFor(() =>
      expect(host.onDone).toHaveBeenCalledWith(
        123,
        false,
        expect.objectContaining({ authoritativeWinnerId: pending.participants[0] })
      )
    )
  })

  it('keeps a live game running when the app only becomes hidden', async () => {
    mount()
    expect(await screen.findByRole('button', { name: 'Finish run' })).toBeVisible()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.getByRole('button', { name: 'Finish run' })).toBeVisible()
    expect(store.getState().challenge.pending?.attempt?.status).toBe('playing')
  })

  it('treats an uncompleted remount as leaving rather than resetting its gameplay', async () => {
    const first = mount()
    await screen.findByRole('button', { name: 'Finish run' })
    first.unmount()
    mount()
    expect(screen.queryByRole('button', { name: 'Finish run' })).toBeNull()
    expect(store.getState().challenge.pending?.attempt).toMatchObject({
      status: 'finished',
      result: { partial: true },
    })
  })

  it('checkpoints a granted retry before consuming its next gameplay attempt', async () => {
    const observed: unknown[] = []
    mocks.save.mockImplementation(async () => {
      observed.push(structuredClone(store.getState().challenge.pending?.attempt))
      return true
    })
    mount()
    await screen.findByRole('button', { name: 'Finish run' })
    fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Leave competition/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Exit with 0' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reverse time' }))
    await screen.findByRole('button', { name: 'Finish run' })
    expect(observed).toContainEqual({ number: 1, status: 'ready' })
    expect(observed).toContainEqual({ number: 1, status: 'playing' })
  })
})

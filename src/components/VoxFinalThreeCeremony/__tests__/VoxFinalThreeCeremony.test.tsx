import { configureStore, type Middleware } from '@reduxjs/toolkit'
import { StrictMode, useRef, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
  PRESENTATION_PRIORITY,
} from '../../../services/presentation/presentationOwnership'
import Exit from '../../../cinematic/ceremonies/exit.jsx'
import type { ExitSoundtrackContinuation } from '../../../cinematic/ceremonies/exit'
import gameReducer, {
  commitVoxAudienceVote,
  createInitialGameState,
  hydrateGame,
  resolvePendingVoxAudienceVote,
  submitVoxFinalThreeAppeal,
} from '../../../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../../../store/hooks'
import settingsReducer, {
  DEFAULT_SETTINGS,
  setAudio,
  setGameUX,
} from '../../../store/settingsSlice'
import vipReducer, { loadVipState } from '../../../store/vipSlice'
import publicOpinionReducer from '../../../publicOpinion/publicOpinionSlice'
import type { PlayerPublicProfile } from '../../../publicOpinion/types'
import { resolveVoxAudienceEviction } from '../../../features/twists/voxPopuli'
import { useEvictionFlow } from '../../../screens/GameScreen/flows/useEvictionFlow'
import type { Final4Stage } from '../../../screens/GameScreen/flows/useEndgameFlow'
import type { GameState, Player } from '../../../types'
import type {
  FinalAudienceVoteResult,
  FinalDecisionCheckpoint,
  FinalDecisionSceneConfig,
} from '../../Final3Ceremony/finalDecisionScene.mjs'
import VoxFinalThreeAppeal from '../../VoxFinalThreeAppeal/VoxFinalThreeAppeal'
import VoxFinalThreeCeremony from '../VoxFinalThreeCeremony'
import { useVoxFinalThreeCeremony } from '../useVoxFinalThreeCeremony'
import { getVoxFinalThreeCast, isVoxFinalThreeAppealRequired } from '../voxFinalThreeData'

const movie = vi.hoisted(() => ({
  mount: vi.fn(),
  prepare: vi.fn(async () => ({ assets: {} })),
  pause: vi.fn(),
  resume: vi.fn(),
  dispose: vi.fn(),
  skip: vi.fn(),
  setAudienceVote: vi.fn<(result: FinalAudienceVoteResult) => boolean>(() => true),
}))
const soundtrack = vi.hoisted(() => ({
  create: vi.fn(),
  setActive: vi.fn(),
  setPreferences: vi.fn(),
  setStage: vi.fn(),
  cue: vi.fn(),
  finish: vi.fn(),
  dispose: vi.fn(),
}))
vi.mock('../../Final3Ceremony/finalDecisionAudio', () => ({
  createFinalDecisionAudio: (id: string, preferences: unknown) => {
    soundtrack.create(id, preferences)
    return soundtrack
  },
}))
vi.mock('../voxFinalThreeAssets', () => ({ prepareVoxFinalThreeArtwork: movie.prepare }))
vi.mock('../../Final3Ceremony/finalDecisionScene.mjs', () => ({
  mountFinalDecision: (root: HTMLElement, config: FinalDecisionSceneConfig) => {
    movie.mount(root, config)
    const transcript = document.createElement('p')
    transcript.tabIndex = 0
    transcript.setAttribute('role', 'region')
    transcript.setAttribute('aria-label', 'Complete message')
    root.appendChild(transcript)
    return {
      pause: movie.pause,
      resume: movie.resume,
      dispose: movie.dispose,
      skip: movie.skip,
      setAudienceVote: movie.setAudienceVote,
      getState: vi.fn(),
    }
  },
}))
vi.mock('../../../cinematic/ceremonies/exit.jsx', () => ({
  default: ({
    evictee,
    onDone,
    soundtrackContinuation,
  }: {
    evictee: Player
    onDone: () => void
    soundtrackContinuation?: ExitSoundtrackContinuation
  }) => (
    <button
      data-testid="actual-exit-handoff"
      data-player-id={evictee.id}
      data-group={soundtrackContinuation?.presentationGroupId}
      onClick={() => {
        soundtrackContinuation?.finish()
        onDone()
      }}
    >
      Finish existing exit
    </button>
  ),
}))

interface Options {
  role?: 'immune' | 'nominee' | 'spectator'
  humanLeaves?: boolean
  vip?: boolean
  standard?: boolean
  off?: boolean
  reduced?: boolean
  resolved?: boolean
}

function fixture(options: Options = {}) {
  const initial = createInitialGameState({ seed: 111 })
  const role = options.role ?? 'nominee'
  const human = initial.players.find((player) => player.isUser)!
  const ai = initial.players.filter((player) => !player.isUser).slice(0, 3)
  const holder = role === 'immune' ? human : ai[0]
  const nominees = role === 'nominee' ? [human, ai[1]] : [ai[1], ai[2]]
  const castIds = [holder.id, ...nominees.map((player) => player.id)]
  const game: GameState = {
    ...initial,
    gameId: 'vox-finale-integration',
    mode: 'classic',
    phase: 'final3_decision',
    week: 12,
    lohId: holder.id,
    nomineeIds: nominees.map((player) => player.id),
    players: initial.players.map((player) => ({
      ...player,
      status: castIds.includes(player.id) ? 'active' : 'jury',
    })),
    voxPopuli: {
      ...initial.voxPopuli!,
      status: 'active',
      immunityWinnerId: holder.id,
      awaitingPublicVote: true,
      publicVoteContext: 'final3',
      publicVotePercentages: null,
      finalThreeAppeal: null,
      finalThreeAppealUsed: false,
    },
    finalThree: {
      mode: 'vox_populi',
      stage: 'decision',
      openingSeen: true,
      blockRevealSeen: true,
      spectatorFinalPowerRevealSeen: true,
      participantIds: castIds,
      part1: null,
      part2: null,
      part3: null,
      finalPowerHolderId: holder.id,
      nomineeIds: nominees.map((player) => player.id),
      evicteeId: null,
    },
    tvFeed: [
      {
        id: 'this-appeal-prelude',
        text: 'The final appeals',
        type: 'social',
        timestamp: 1,
        meta: { week: 12, phase: 'final3_decision', finalThreePacingKey: 'public_decision' },
      },
      {
        id: 'other-broadcast',
        text: 'Keep this unrelated story',
        type: 'social',
        timestamp: 2,
        meta: { week: 12, phase: 'final3_decision', major: 'unrelated' },
      },
      {
        id: 'older-appeal-prelude',
        text: 'Older prelude',
        type: 'social',
        timestamp: 0,
        meta: { week: 11, finalThreePacingKey: 'public_decision' },
      },
    ],
    broadcastQueue: ['this-appeal-prelude', 'other-broadcast'],
  }
  const evicteeId = role === 'nominee' && !options.humanLeaves ? nominees[1].id : nominees[0].id
  const profiles: Record<string, PlayerPublicProfile> = Object.fromEntries(
    initial.players.map((player) => {
      const approval = player.id === evicteeId ? 5 : 90
      return [
        player.id,
        {
          playerId: player.id,
          approval,
          previousApproval: approval,
          seasonApprovals: Array(10).fill(approval),
          completedDirectionCount: 0,
          cumulativePositiveDelta: 0,
        },
      ]
    })
  )
  const actions: string[] = []
  const recording: Middleware = () => (next) => (action) => {
    if (typeof action === 'object' && action && 'type' in action) actions.push(String(action.type))
    return next(action)
  }
  const store = configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      vip: vipReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: {
      game,
      settings: {
        ...DEFAULT_SETTINGS,
        gameUX: {
          ...DEFAULT_SETTINGS.gameUX,
          animations: !options.off,
          animationMode: options.standard ? ('standard' as const) : ('cinematic' as const),
        },
        display: { ...DEFAULT_SETTINGS.display, reduceMotion: Boolean(options.reduced) },
      },
      vip: { ...loadVipState(), isActive: options.vip ?? true, debugUnlocked: false },
      publicOpinion: {
        ...publicOpinionReducer(undefined, { type: '@@INIT' }),
        profiles,
      },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(recording),
  })
  if (options.resolved) {
    store.dispatch(
      commitVoxAudienceVote({
        context: 'final3',
        percentages: { [nominees[0].id]: 50, [nominees[1].id]: 50 },
        rankedIds: [nominees[1].id, nominees[0].id],
      })
    )
  }
  return { store, holder, nominees, human, evicteeId, actions }
}

function Harness() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const profiles = useAppSelector((state) => state.publicOpinion.profiles)
  const human = game.players.find((player) => player.isUser)!
  const [, setAdPending] = useState(false)
  const [final4Stage, setFinal4Stage] = useState<Final4Stage>('idle')
  const isMountedRef = useRef(true)
  const eviction = useEvictionFlow({
    game,
    humanPlayerEliminated: human.status === 'evicted' || human.status === 'jury',
    humanIsHoH: human.id === game.lohId,
    final4Stage,
    setFinal4Stage,
    publicOpinionProfiles: profiles,
    isMountedRef,
    setAdPending,
    dispatch,
  })
  const ceremony = useVoxFinalThreeCeremony(eviction.handleVoteResultsDone)
  const cast = getVoxFinalThreeCast(game)
  return (
    <>
      <span
        data-testid="soundtrack-scope"
        data-group={ceremony.soundtrackContinuation?.presentationGroupId}
      />
      {ceremony.sceneProps && (
        <VoxFinalThreeCeremony key={ceremony.sceneProps.sceneId} {...ceremony.sceneProps} />
      )}
      {!ceremony.active && cast && isVoxFinalThreeAppealRequired(game, cast) && (
        <VoxFinalThreeAppeal
          player={human}
          onSelect={(appeal) => dispatch(submitVoxFinalThreeAppeal(appeal))}
        />
      )}
      {!ceremony.active && game.voxPopuli?.awaitingPublicVote && (
        <button onClick={() => dispatch(resolvePendingVoxAudienceVote())}>Native vote</button>
      )}
      {!ceremony.active && eviction.showVoteResults && (
        <button onClick={eviction.handleVoteResultsDone}>Native result</button>
      )}
      {eviction.showEvictionSplash && eviction.pendingEvictionPlayer && (
        <Exit
          evictee={eviction.pendingEvictionPlayer}
          onDone={eviction.handleEvictionSplashDone}
          soundtrackContinuation={ceremony.soundtrackContinuation}
        />
      )}
    </>
  )
}

function activeConfig(): FinalDecisionSceneConfig {
  return movie.mount.mock.lastCall![1] as FinalDecisionSceneConfig
}

async function openMovie(options: Options = {}, strict = false) {
  const data = fixture(options)
  const view = (
    <Provider store={data.store}>
      <Harness />
    </Provider>
  )
  const rendered = render(strict ? <StrictMode>{view}</StrictMode> : view)
  await waitFor(() => expect(movie.mount).toHaveBeenCalledTimes(1))
  return { ...data, ...rendered, config: activeConfig() }
}

async function resolveVote(config = activeConfig()) {
  if (config.audienceVote?.appeal) act(() => config.onAppeal?.('loyalty'))
  act(() => {
    config.onVoteRequested?.()
    config.onVoteRequested?.()
  })
  await waitFor(() => expect(movie.setAudienceVote).toHaveBeenCalledTimes(1))
  return movie.setAudienceVote.mock.lastCall![0] as FinalAudienceVoteResult
}

function outcome(config: FinalDecisionSceneConfig, result: FinalAudienceVoteResult) {
  return {
    sceneId: config.sceneId,
    holderId: config.fixture.holder.id,
    evicteeId: result.evicteeId,
    keptId: config.fixture.nominees.find((player) => player.id !== result.evicteeId)!.id,
  }
}

beforeEach(() => {
  Object.values(soundtrack).forEach((mock) => mock.mockClear())
  movie.mount.mockClear()
  movie.prepare.mockReset().mockResolvedValue({ assets: {} })
  movie.setAudienceVote.mockReset().mockReturnValue(true)
  movie.pause.mockClear()
  movie.resume.mockClear()
  movie.dispose.mockClear()
  movie.skip.mockClear()
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.classList.remove('reduce-motion')
  await act(async () => {
    await Promise.resolve()
  })
})

describe('Vox Final Three continuous ceremony', () => {
  it.each<Options>([
    { role: 'immune' },
    { role: 'nominee', humanLeaves: false },
    { role: 'nominee', humanLeaves: true },
    { role: 'spectator' },
  ])('uses the real vote and existing exit for %j', async (options) => {
    const { config, store, human, evicteeId, actions } = await openMovie(options)
    expect(config.viewerId).toBe(human.id)
    expect(Boolean(config.audienceVote?.appeal)).toBe(options.role === 'nominee')
    expect(config.audienceVote?.result).toBeUndefined()
    expect(store.getState().game.pendingEviction).toBeNull()
    expect(screen.queryByText('Native result')).toBeNull()
    const result = await resolveVote(config)
    expect(result.evicteeId).toBe(evicteeId)
    expect(result.percentages).toEqual(store.getState().game.voteResults)
    expect(actions.filter((type) => type === 'game/commitVoxAudienceVote')).toHaveLength(1)
    expect(movie.mount).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Native result')).toBeNull()
    expect(store.getState().game.players.find((player) => player.id === evicteeId)?.status).toBe(
      'active'
    )
    const receipt = outcome(config, result)
    act(() => config.onComplete(receipt))
    expect(screen.queryByTestId('actual-exit-handoff')).toBeNull()
    act(() => {
      config.onDecision(receipt)
      config.onCheckpoint({ stage: 'complete', canSkip: false } as FinalDecisionCheckpoint)
      config.onComplete(receipt)
      config.onComplete(receipt)
    })
    const exit = screen.getByTestId('actual-exit-handoff')
    expect(exit).toHaveAttribute('data-player-id', evicteeId)
    expect(exit).toHaveAttribute('data-group', `vox-final-three:${config.sceneId}`)
    expect(actions.filter((type) => type === 'game/dismissVoteResults')).toHaveLength(1)
    expect(store.getState().game.finalThree?.evicteeId).toBeNull()
    expect(soundtrack.dispose).not.toHaveBeenCalled()
    fireEvent.click(exit)
    expect(soundtrack.finish).toHaveBeenCalledTimes(1)
    expect(store.getState().game.finalThree?.evicteeId).toBe(evicteeId)
    expect(
      store.getState().game.players.find((player) => player.id === evicteeId)?.seasonPlacement
    ).toBe(3)
    expect(actions.filter((type) => type === 'game/finalizePendingEviction')).toHaveLength(1)
  })

  it('preserves the required real appeal before requesting the vote and blocks shared Play', async () => {
    const { config, store, human, actions } = await openMovie()
    const play = new CustomEvent('ui:playPressed', { cancelable: true })
    act(() => {
      window.dispatchEvent(play)
      config.onVoteRequested?.()
    })
    expect(play.defaultPrevented).toBe(true)
    expect(store.getState().game.voteResults).toBeNull()
    const before = store.getState().publicOpinion.profiles[human.id].approval
    act(() => {
      config.onAppeal?.('loyalty')
      config.onAppeal?.('resume')
    })
    expect(store.getState().game.voxPopuli?.finalThreeAppeal).toBe('loyalty')
    expect(store.getState().publicOpinion.profiles[human.id].approval).toBeGreaterThan(before)
    expect(actions.filter((type) => type === 'publicOpinion/updateApproval')).toHaveLength(1)
    const game = store.getState().game
    const expected = resolveVoxAudienceEviction({
      nomineeIds: game.nomineeIds,
      profiles: store.getState().publicOpinion.profiles,
      seed: game.seed,
      week: game.week,
    })
    act(() => config.onVoteRequested?.())
    await waitFor(() => expect(movie.setAudienceVote).toHaveBeenCalledTimes(1))
    expect(movie.setAudienceVote).toHaveBeenCalledWith({
      evicteeId: expected.rankedIds[0],
      percentages: expected.percentages,
    })
  })

  it('keeps the committed 50/50 evictee and never asks a holder to break that display tie', async () => {
    const { config, store, nominees } = await openMovie({ role: 'immune' })
    act(() =>
      store.dispatch(
        commitVoxAudienceVote({
          context: 'final3',
          percentages: { [nominees[0].id]: 50, [nominees[1].id]: 50 },
          rankedIds: [nominees[1].id, nominees[0].id],
        })
      )
    )
    await waitFor(() => expect(movie.setAudienceVote).toHaveBeenCalledTimes(1))
    const result = movie.setAudienceVote.mock.lastCall![0] as FinalAudienceVoteResult
    expect(result).toEqual({
      evicteeId: nominees[1].id,
      percentages: { [nominees[0].id]: 50, [nominees[1].id]: 50 },
    })
    expect(result.approvalTiebreak).toBeUndefined()
    const receipt = outcome(config, result)
    act(() => {
      config.onDecision(receipt)
      config.onComplete(receipt)
    })
    expect(screen.getByTestId('actual-exit-handoff')).toHaveAttribute(
      'data-player-id',
      nominees[1].id
    )
    expect(store.getState().game.awaitingTieBreak).toBeFalsy()
  })

  it('consumes only broadcasts already represented by this ceremony', async () => {
    const { config, store } = await openMovie()
    expect(store.getState().game.broadcastQueue).toContain('this-appeal-prelude')
    act(() => config.onCheckpoint({ stage: 'establish', canSkip: true } as FinalDecisionCheckpoint))
    expect(store.getState().game.broadcastQueue).not.toContain('this-appeal-prelude')
    expect(store.getState().game.broadcastQueue).toContain('other-broadcast')
    expect(
      store.getState().game.tvFeed.find((event) => event.id === 'older-appeal-prelude')?.meta
        ?.broadcastConsumed
    ).not.toBe(true)
    const result = await resolveVote(config)
    const receipt = outcome(config, result)
    act(() => {
      config.onDecision(receipt)
      config.onComplete(receipt)
    })
    for (const key of ['vox_final_three_appeal', 'vox_populi_public_vote_closed']) {
      expect(
        store.getState().game.tvFeed.find((event) => event.meta?.major === key)?.meta
          ?.broadcastConsumed
      ).toBe(true)
    }
    expect(
      store.getState().game.tvFeed.find((event) => event.id === 'other-broadcast')?.meta
        ?.broadcastConsumed
    ).not.toBe(true)
  })

  it('uses shared Skip only for skippable beats and keeps transcript in the focus loop', async () => {
    const { config } = await openMovie()
    act(() => config.onCheckpoint({ stage: 'appeal', canSkip: false } as FinalDecisionCheckpoint))
    expect(screen.queryByRole('button', { name: /^Skip presentation/ })).toBeNull()
    act(() => config.onCheckpoint({ stage: 'plea-a', canSkip: true } as FinalDecisionCheckpoint))
    const skip = screen.getByRole('button', {
      name: 'Skip presentation; the audience result stays the same',
    })
    expect(skip).toHaveClass('cinematic-skip-button')
    skip.focus()
    fireEvent.keyDown(skip, { key: 'Tab' })
    expect(screen.getByRole('region', { name: 'Complete message' })).toHaveFocus()
    fireEvent.click(skip)
    expect(movie.skip).toHaveBeenCalledTimes(1)
  })

  it.each<Options>([
    { vip: false },
    { standard: true },
    { off: true },
    { reduced: true },
    { role: 'immune', resolved: true },
  ])('keeps native presentation without preparing assets for %j', async (options) => {
    const { store } = fixture(options)
    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(movie.prepare).not.toHaveBeenCalled()
    expect(movie.mount).not.toHaveBeenCalled()
    expect(screen.getByText(options.resolved ? 'Native result' : 'Native vote')).toBeVisible()
  })

  it('falls back before preparation without consuming the appeal or its prelude', async () => {
    movie.prepare.mockRejectedValueOnce(new Error('Missing character artwork'))
    const { store } = fixture()
    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    )
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Final appeal to the audience' })).toBeVisible()
    )
    expect(store.getState().game.voxPopuli?.finalThreeAppealUsed).toBe(false)
    expect(store.getState().game.broadcastQueue).toContain('this-appeal-prelude')
    expect(movie.mount).not.toHaveBeenCalled()
  })

  it('ignores old appeal, vote and broadcast callbacks when a replacement run is hydrated', async () => {
    const { config, store, human, actions } = await openMovie()
    const replacement = {
      ...store.getState().game,
      gameId: 'replacement-vox-finale',
    }
    const approval = store.getState().publicOpinion.profiles[human.id].approval
    act(() => {
      store.dispatch(hydrateGame(replacement))
      // Exercise the interval before React commits and cleans up the old film.
      config.onCheckpoint({ stage: 'establish', canSkip: true } as FinalDecisionCheckpoint)
      config.onAppeal?.('loyalty')
      config.onVoteRequested?.()
    })
    expect(store.getState().game.gameId).toBe(replacement.gameId)
    expect(store.getState().game.voxPopuli?.finalThreeAppealUsed).toBe(false)
    expect(store.getState().game.voteResults).toBeNull()
    expect(store.getState().publicOpinion.profiles[human.id].approval).toBe(approval)
    expect(
      store.getState().game.tvFeed.find((event) => event.id === 'this-appeal-prelude')?.meta
        ?.broadcastConsumed
    ).not.toBe(true)
    expect(actions.filter((type) => type === 'game/commitVoxAudienceVote')).toHaveLength(0)
  })

  it('cannot complete a replacement run with the same actors and committed evictee', async () => {
    const { config, store, actions } = await openMovie({ role: 'immune' })
    const result = await resolveVote(config)
    const receipt = outcome(config, result)
    act(() => config.onDecision(receipt))
    act(() => {
      store.dispatch(hydrateGame({ ...store.getState().game, gameId: 'replacement-vox-finale' }))
      config.onComplete(receipt)
    })
    expect(store.getState().game.voteResults).toEqual(result.percentages)
    expect(screen.getByText('Native result')).toBeVisible()
    expect(screen.getByTestId('soundtrack-scope')).not.toHaveAttribute('data-group')
    expect(actions.filter((type) => type === 'game/dismissVoteResults')).toHaveLength(0)
  })

  it('does not attach the retained exit soundtrack to another pending evictee or game', async () => {
    const { config, store } = await openMovie({ role: 'immune' })
    const result = await resolveVote(config)
    const receipt = outcome(config, result)
    act(() => {
      config.onDecision(receipt)
      config.onComplete(receipt)
    })
    expect(screen.getByTestId('soundtrack-scope')).toHaveAttribute(
      'data-group',
      `vox-final-three:${config.sceneId}`
    )
    const sameRun = store.getState().game
    act(() =>
      store.dispatch(
        hydrateGame({
          ...sameRun,
          pendingEviction: { ...sameRun.pendingEviction!, evicteeId: receipt.keptId },
        })
      )
    )
    expect(screen.getByTestId('soundtrack-scope')).not.toHaveAttribute('data-group')
    act(() => store.dispatch(hydrateGame({ ...sameRun, gameId: 'replacement-vox-finale' })))
    expect(screen.getByTestId('soundtrack-scope')).not.toHaveAttribute('data-group')
    expect(soundtrack.dispose).toHaveBeenCalled()
  })

  it('falls back to the native result if the renderer cannot accept its committed vote', async () => {
    const { config, store } = await openMovie({ role: 'immune' })
    movie.setAudienceVote.mockReturnValueOnce(false)
    act(() => config.onVoteRequested?.())
    await waitFor(() => expect(screen.getByText('Native result')).toBeVisible())
    expect(store.getState().game.pendingEviction?.evicteeId).toBeTruthy()
    expect(store.getState().game.finalThree?.evicteeId).toBeNull()
  })

  it.each(['appeal', 'resolved'] as const)(
    'returns to the correct native state after preference fallback during %s',
    async (phase) => {
      const { config, store } = await openMovie()
      if (phase === 'resolved') await resolveVote(config)
      act(() => store.dispatch(setGameUX({ animationMode: 'standard' })))
      if (phase === 'appeal')
        expect(screen.getByRole('dialog', { name: 'Final appeal to the audience' })).toBeVisible()
      else expect(screen.getByText('Native result')).toBeVisible()
      expect(movie.dispose).toHaveBeenCalledTimes(1)
      expect(soundtrack.dispose).toHaveBeenCalledTimes(1)
      act(() => store.dispatch(setGameUX({ animationMode: 'cinematic' })))
      expect(movie.mount).toHaveBeenCalledTimes(1)
    }
  )

  it('suspends under gameplay ownership and preserves settings through the exit transfer', async () => {
    const { config, store, unmount } = await openMovie({ role: 'immune' }, true)
    let release: () => void
    act(() => {
      release = acquirePresentationOwnership(
        createPresentationOwnerToken(),
        'foreground-gameplay',
        PRESENTATION_PRIORITY.gameplay
      )
    })
    expect(movie.pause).toHaveBeenCalledWith('presentation')
    expect(soundtrack.setActive).toHaveBeenLastCalledWith(false)
    await act(async () => {
      release!()
      await Promise.resolve()
    })
    expect(movie.resume).toHaveBeenCalledWith('presentation')
    const result = await resolveVote(config)
    const receipt = outcome(config, result)
    act(() => {
      config.onDecision(receipt)
      config.onComplete(receipt)
    })
    act(() => store.dispatch(setAudio({ musicOn: false, sfxOn: false })))
    expect(soundtrack.setPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ musicOn: false, sfxOn: false })
    )
    expect(soundtrack.dispose).not.toHaveBeenCalled()
    unmount()
    expect(soundtrack.dispose).toHaveBeenCalledTimes(1)
  })
})

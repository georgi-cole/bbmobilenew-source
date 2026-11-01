import { configureStore, type Middleware } from '@reduxjs/toolkit'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
  PRESENTATION_PRIORITY,
} from '../../../services/presentation/presentationOwnership'
import gameReducer, {
  closeSpectator,
  createInitialGameState,
  hydrateGame,
  openSpectator,
} from '../../../store/gameSlice'
import settingsReducer, {
  DEFAULT_SETTINGS,
  setDisplay,
  setGameUX,
} from '../../../store/settingsSlice'
import vipReducer, { loadVipState } from '../../../store/vipSlice'
import type { GameState, Player } from '../../../types'
import FinalThreeCompetitionBroadcast from '../FinalThreeCompetitionBroadcast'
import type { CompetitionBroadcastArtwork } from '../competitionBroadcastArtwork'
import { buildCompetitionBroadcastSimulation } from '../competitionBroadcastSimulation'
import {
  competitionBroadcastTimings,
  type FinalThreeCompetitionPart,
} from '../competitionBroadcastTimeline'

const media = vi.hoisted(() => ({
  prepare: vi.fn(),
  audio: vi.fn(),
}))
let releaseExternalOwner: (() => void) | undefined

vi.mock('../competitionBroadcastArtwork', () => ({
  prepareCompetitionBroadcastArtwork: media.prepare,
}))
vi.mock('../useFinalThreeCompetitionAudio', () => ({
  useFinalThreeCompetitionAudio: media.audio,
}))

interface FixtureOptions {
  part?: FinalThreeCompetitionPart
  vox?: boolean
  viewer?: 'jury' | 'qualified' | 'waiting'
  standard?: boolean
  animations?: boolean
  reduced?: boolean
  vip?: boolean
}

function artwork(players: readonly Player[]): CompetitionBroadcastArtwork {
  return {
    background: '/qa/backyard.webp',
    eye: '/qa/eye.webp',
    monitor: '/qa/monitor.webp',
    mist: '/qa/mist.webp',
    contestants: Object.fromEntries(players.map((player) => [player.id, `/qa/${player.id}.webp`])),
  }
}

function fixture(options: FixtureOptions = {}) {
  const initial = createInitialGameState({ seed: 111 })
  const base = initial.players[0]
  const part = options.part ?? 1
  const players: Player[] = ['Dex', 'Aria', 'Ash'].map((name) => ({
    ...base,
    id: name.toLowerCase(),
    name,
    isUser: false,
    status: 'active',
    appearance: undefined,
    avatar: `assets/skins/${name}_avatar.webp`,
    stats: {
      ...base.stats,
      lohWins: name === 'Dex' ? 2 : name === 'Aria' ? 1 : 0,
      posWins: name === 'Aria' ? 3 : name === 'Dex' ? 1 : 0,
      timesNominated: name === 'Ash' ? 4 : name === 'Dex' ? 3 : 2,
    },
  }))
  const viewer = options.viewer ?? 'jury'
  players.push({
    ...base,
    id: 'user',
    name: 'You',
    isUser: true,
    status: viewer === 'jury' ? 'jury' : 'active',
    avatar: 'assets/skins/Character3_avatar.webp',
    appearance: { kind: 'catalog', lookId: 'pc-003', revision: 1 },
    stats: { ...base.stats, lohWins: 0, posWins: 1, timesNominated: 1 },
  })
  if (viewer !== 'jury') players[2].status = 'jury'
  const part1WinnerId = viewer === 'qualified' ? 'user' : 'dex'
  const part2WinnerId = 'aria'
  const competitorIds =
    part === 1
      ? ['dex', 'aria', 'ash']
      : part === 2 && viewer === 'jury'
        ? ['aria', 'ash']
        : ['dex', 'aria']
  const expectedWinnerId = competitorIds[competitorIds.length - 1]
  const phase = part === 1 ? 'final3' : part === 2 ? 'final3_comp2' : 'final3_comp3'
  const game: GameState = {
    ...initial,
    gameId: 'competition-broadcast-test',
    phase,
    week: 12,
    season: 4,
    players,
    lohId: 'dex',
    nomineeIds: [],
    tvFeed: [],
    spectatorActive: null,
    f3Part1WinnerId: part > 1 ? part1WinnerId : null,
    f3Part2WinnerId: part > 2 ? part2WinnerId : null,
    finalThree: {
      mode: options.vox ? 'vox_populi' : 'classic',
      stage: part === 1 ? 'part1' : part === 2 ? 'part2' : 'part3',
      openingSeen: true,
      blockRevealSeen: true,
      spectatorFinalPowerRevealSeen: false,
      participantIds: players
        .filter((player) => player.status === 'active')
        .map((player) => player.id),
      part1:
        part > 1
          ? { participantIds: ['dex', 'aria', 'ash'], winnerId: part1WinnerId, seed: 10 }
          : null,
      part2:
        part > 2 ? { participantIds: ['aria', 'ash'], winnerId: part2WinnerId, seed: 20 } : null,
      part3: null,
      finalPowerHolderId: null,
      nomineeIds: [],
      evicteeId: null,
    },
    voxPopuli: options.vox
      ? { ...initial.voxPopuli!, status: 'active', immunityWinnerId: null }
      : initial.voxPopuli,
  }
  const actions: string[] = []
  const recording: Middleware = () => (next) => (action) => {
    if (typeof action === 'object' && action && 'type' in action) actions.push(String(action.type))
    return next(action)
  }
  const store = configureStore({
    reducer: { game: gameReducer, settings: settingsReducer, vip: vipReducer },
    preloadedState: {
      game,
      settings: {
        ...DEFAULT_SETTINGS,
        gameUX: {
          ...DEFAULT_SETTINGS.gameUX,
          animationMode: options.standard ? ('standard' as const) : ('cinematic' as const),
          animations: options.animations ?? true,
        },
        display: { ...DEFAULT_SETTINGS.display, reduceMotion: Boolean(options.reduced) },
      },
      vip: { ...loadVipState(), isActive: options.vip ?? true, debugUnlocked: false },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(recording),
  })
  const simulation = buildCompetitionBroadcastSimulation({
    game,
    part,
    competitorIds,
    expectedWinnerId,
  })
  const timings = competitionBroadcastTimings(part, simulation?.durationMs)
  return { store, game, actions, part, competitorIds, expectedWinnerId, simulation, timings }
}

type Fixture = ReturnType<typeof fixture>
type BroadcastProps = React.ComponentProps<typeof FinalThreeCompetitionBroadcast>

async function mountBroadcast(
  subject: Fixture,
  overrides: Partial<BroadcastProps> = {},
  strict = false
) {
  const onDone = overrides.onDone ?? vi.fn()
  const onPlayAvailabilityChange = overrides.onPlayAvailabilityChange ?? vi.fn()
  const content = (
    <Provider store={subject.store}>
      <FinalThreeCompetitionBroadcast
        part={subject.part}
        competitorIds={subject.competitorIds}
        expectedWinnerId={subject.expectedWinnerId}
        onDone={onDone}
        onPlayAvailabilityChange={onPlayAvailabilityChange}
        {...overrides}
      />
    </Provider>
  )
  const result = render(strict ? <StrictMode>{content}</StrictMode> : content)
  await act(async () => {})
  return { ...result, onDone, onPlayAvailabilityChange }
}

function stageRoot() {
  return document.querySelector<HTMLElement>('[data-part][data-stage]')!
}

function shownScores() {
  return [...document.querySelectorAll<HTMLElement>('[data-score-player]')].map((element) => ({
    id: element.dataset.scorePlayer,
    score: Number(element.dataset.score),
    progress: Number(element.dataset.progress),
    lives: element.dataset.lives === undefined ? undefined : Number(element.dataset.lives),
  }))
}

async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
  document.body.classList.remove('no-animations', 'reduce-motion')
  media.prepare
    .mockReset()
    .mockImplementation(async (players: readonly Player[]) => artwork(players))
  media.audio.mockReset()
})

afterEach(async () => {
  cleanup()
  await act(async () => {
    releaseExternalOwner?.()
    releaseExternalOwner = undefined
  })
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.classList.remove('no-animations', 'reduce-motion')
})

describe('Final Three competition broadcast', () => {
  it.each<FinalThreeCompetitionPart>([1, 2, 3])(
    'autostarts Part %s and keeps its real winner hidden until the verdict',
    async (part) => {
      const subject = fixture({ part })
      const { onDone, onPlayAvailabilityChange } = await mountBroadcast(subject)
      const { timings } = subject

      expect(screen.getByRole('dialog')).toBeTruthy()
      expect(stageRoot()).toHaveAttribute('data-part', String(part))
      expect(stageRoot()).toHaveAttribute('data-stage', 'establish')
      expect(stageRoot()).toHaveAttribute('data-active', 'true')
      // The station Eye is a centered set element, not a child of the moving camera.
      const eye = document.querySelector('.f3-broadcast__eye')!
      expect(eye.parentElement).toHaveClass('f3-broadcast__frame')
      expect(eye.closest('.f3-broadcast__camera')).toBeNull()
      expect(screen.queryByRole('button', { name: /begin|start|pause/i })).toBeNull()
      expect(document.querySelector('.cinematic-skip-button')).toBeTruthy()
      expect(document.querySelector('[data-winner-id]')).toBeNull()
      expect(subject.store.getState().game.spectatorActive?.competitorIds).toEqual(
        subject.competitorIds
      )
      expect(onPlayAvailabilityChange).toHaveBeenLastCalledWith(false)

      await elapse(timings.verdict - 100)
      expect(document.querySelector('[data-winner-id]')).toBeNull()
      expect(onDone).not.toHaveBeenCalled()

      await elapse(150)
      expect(document.querySelector('[data-winner-id]')).toHaveAttribute(
        'data-winner-id',
        subject.expectedWinnerId
      )
      expect(screen.getAllByRole('status')).toHaveLength(1)
      expect(screen.getByRole('status')).toHaveTextContent(
        subject.game.players.find((player) => player.id === subject.expectedWinnerId)!.name
      )
      expect(subject.store.getState().game.seed).toBe(subject.game.seed)
      expect(subject.store.getState().game.phase).toBe(subject.game.phase)
      expect(subject.actions.filter((type) => type === 'game/advance')).toHaveLength(0)

      await elapse(timings.end - timings.verdict + 200)
      expect(onDone).toHaveBeenCalledTimes(1)
      expect(subject.store.getState().game.spectatorActive).toBeNull()
      await elapse(10_000)
      expect(onDone).toHaveBeenCalledTimes(1)
    }
  )

  it.each([false, true])('describes the actual Part 3 reward in Vox mode=%s', async (vox) => {
    const subject = fixture({ part: 3, vox })
    await mountBroadcast(subject)
    await elapse(subject.timings.verdict + 50)
    const text = screen.getByRole('dialog').textContent ?? ''
    expect(text).toMatch(vox ? /immunity/i : /final power/i)
    if (vox) expect(text).not.toMatch(/final power holder|decides who joins/i)
  })

  it.each<FinalThreeCompetitionPart>([1, 2, 3])(
    'shows a distinct live Part %s competition whose final scores support the real winner',
    async (part) => {
      const subject = fixture({ part })
      const simulation = subject.simulation!
      await mountBroadcast(subject)
      await elapse(subject.timings.live + 200)
      expect(stageRoot()).toHaveAttribute('data-stage', 'live')
      expect(stageRoot()).toHaveAttribute('data-competition', simulation.kind)
      expect(stageRoot()).toHaveTextContent(simulation.title)
      const first = shownScores()
      expect(first.map((entry) => entry.id)).toEqual(subject.competitorIds)
      expect(first.every((entry) => Number.isFinite(entry.score))).toBe(true)

      await elapse(6500)
      expect(shownScores()).not.toEqual(first)
      expect(stageRoot()).toHaveAttribute('data-beat')
      expect(subject.actions.filter((type) => type === 'game/advance')).toHaveLength(0)

      await elapse(subject.timings.lock - subject.timings.live - 6700 + 50)
      expect(stageRoot()).toHaveAttribute('data-stage', 'lock')
      const final = shownScores()
      const metric = (entry: ReturnType<typeof shownScores>[number]) =>
        part === 3 ? entry.lives! : entry.score
      const highest = Math.max(...final.map(metric))
      expect(final.filter((entry) => metric(entry) === highest).map((entry) => entry.id)).toEqual([
        subject.expectedWinnerId,
      ])
      if (part === 3) {
        expect(final.find((entry) => entry.id !== subject.expectedWinnerId)?.lives).toBe(0)
      }
      expect(document.querySelector('[data-winner-id]')).toBeNull()
    }
  )

  it('shows a real season question during the live memory duel', async () => {
    const subject = fixture({ part: 3 })
    const first = subject.simulation!.frames[0]
    expect(first.kind).toBe('memory')
    if (first.kind !== 'memory') throw new Error('Expected memory replay')
    await mountBroadcast(subject)
    await elapse(subject.timings.live + 200)
    const monitor = document.querySelector('.f3-broadcast__screen')!
    expect(monitor).toHaveTextContent(first.memory.question.prompt)
    expect(shownScores().map((entry) => entry.lives)).toEqual([5, 5])
    await elapse(3600)
    expect(
      shownScores()
        .map((entry) => entry.lives)
        .sort()
    ).toEqual([4, 5])
  })

  it('retains the exact live score and action while backgrounded', async () => {
    const subject = fixture({ part: 1 })
    const { onDone } = await mountBroadcast(subject)
    await elapse(subject.timings.live + 6800)
    const held = { beat: stageRoot().dataset.beat, scores: shownScores() }
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await elapse(90_000)
    expect({ beat: stageRoot().dataset.beat, scores: shownScores() }).toEqual(held)
    expect(onDone).not.toHaveBeenCalled()
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await elapse(2000)
    expect(stageRoot()).toHaveAttribute('data-stage', 'live')
    expect(stageRoot().dataset.beat).not.toBe(held.beat)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('uses the shared exit Eye and title for the closing hold before completing', async () => {
    const subject = fixture({ part: 2, viewer: 'qualified' })
    const { onDone } = await mountBroadcast(subject)
    await elapse(subject.timings.handoff - 100)
    expect(document.querySelector('.finale-closing-brand .exit-brand')).toBeNull()
    await elapse(1200)
    expect(stageRoot()).toHaveAttribute('data-stage', 'handoff')
    const brand = document.querySelector('.finale-closing-brand .exit-brand')!
    expect(brand).toBeTruthy()
    expect(brand.querySelector('.exit-brand-title')).toHaveTextContent('THE BIG EYE')
    expect(brand.querySelector('.exit-brand-face')).toHaveAttribute('src', '/qa/eye.webp')
    expect(onDone).not.toHaveBeenCalled()
    await elapse(subject.timings.end - subject.timings.handoff - 1100 + 100)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('uses the real result fallback if there are too few season players for memory questions', async () => {
    const subject = fixture({ part: 3 })
    act(() =>
      subject.store.dispatch(
        hydrateGame({
          ...subject.game,
          players: subject.game.players.filter((player) => player.id !== 'ash'),
          history: [],
          tvFeed: [],
        })
      )
    )
    const { onDone } = await mountBroadcast(subject)
    expect(stageRoot()).toHaveClass('f3-broadcast--static')
    expect(shownScores()).toEqual([])
    expect(stageRoot()).toHaveAttribute('data-winner-id', subject.expectedWinnerId)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('skips once with the shared control and releases the store blocker before completion', async () => {
    const subject = fixture({ part: 2, viewer: 'qualified' })
    const onDone = vi.fn(() => expect(subject.store.getState().game.spectatorActive).toBeNull())
    await mountBroadcast(subject, { onDone }, true)
    const skip = screen.getByRole('button', { name: /skip/i })
    expect(skip).toHaveClass('cinematic-skip-button')
    fireEvent.click(skip)
    fireEvent.click(skip)
    act(() => window.dispatchEvent(new Event('ui:playPressed', { cancelable: true })))
    await elapse(90_000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('suspends its timeline and effects while the document is hidden', async () => {
    const subject = fixture({ part: 3 })
    const { onDone } = await mountBroadcast(subject)
    await elapse(6000)
    const heldStage = stageRoot().dataset.stage
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(stageRoot()).toHaveAttribute('data-active', 'false')
    await elapse(90_000)
    expect(stageRoot().dataset.stage).toBe(heldStage)
    expect(onDone).not.toHaveBeenCalled()
    expect(media.audio.mock.calls.at(-1)?.[2]).toBe(false)
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await elapse(subject.timings.end - 6000 + 150)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('preserves elapsed time during a higher-priority presentation and ignores hidden controls', async () => {
    const subject = fixture({ part: 1 })
    const { onDone } = await mountBroadcast(subject)
    await elapse(6000)
    let release = () => {}
    act(() => {
      release = acquirePresentationOwnership(
        createPresentationOwnerToken(),
        'test-gameplay',
        PRESENTATION_PRIORITY.gameplay
      )
    })
    expect(stageRoot()).toHaveAttribute('data-active', 'false')
    releaseExternalOwner = release
    fireEvent.click(document.querySelector<HTMLButtonElement>('.cinematic-skip-button')!)
    await elapse(90_000)
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => release())
    expect(stageRoot()).toHaveAttribute('data-active', 'true')
    await elapse(subject.timings.end - 6000 + 150)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it.each<FixtureOptions>([
    { standard: true },
    { animations: false },
    { reduced: true },
    { vip: false },
  ])('keeps a readable, truthful result with manual continuation for %j', async (options) => {
    const subject = fixture({ part: 2, ...options })
    const { onDone, onPlayAvailabilityChange } = await mountBroadcast(subject)
    expect(document.querySelector('[data-winner-id]')).toHaveAttribute(
      'data-winner-id',
      subject.expectedWinnerId
    )
    expect(onPlayAvailabilityChange).toHaveBeenLastCalledWith(true)
    await elapse(90_000)
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, 'not-a-competitor'])(
    'never invents a winner when expectedWinnerId is %s',
    async (expectedWinnerId) => {
      const subject = fixture({ part: 3 })
      const { onDone } = await mountBroadcast(subject, { expectedWinnerId })
      expect(document.querySelector('[data-winner-id]')).toBeNull()
      expect(screen.getByRole('dialog')).not.toHaveTextContent(/Dex wins|Dex is the winner/i)
      fireEvent.click(screen.getByRole('button', { name: /continue/i }))
      expect(onDone).toHaveBeenCalledTimes(1)
    }
  )

  it('retains the real result when artwork preparation fails', async () => {
    media.prepare.mockRejectedValueOnce(new Error('missing artwork'))
    const subject = fixture({ part: 3 })
    const { onDone } = await mountBroadcast(subject)
    expect(document.querySelector('[data-winner-id]')).toHaveAttribute(
      'data-winner-id',
      subject.expectedWinnerId
    )
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('switches safely to the readable result when motion is disabled mid-broadcast', async () => {
    const subject = fixture({ part: 1 })
    const { onDone } = await mountBroadcast(subject)
    await elapse(6000)
    act(() => subject.store.dispatch(setDisplay({ reduceMotion: true })))
    expect(document.querySelector('[data-winner-id]')).toHaveAttribute(
      'data-winner-id',
      subject.expectedWinnerId
    )
    await elapse(90_000)
    expect(onDone).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new Event('ui:playPressed', { cancelable: true })))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('keeps a readable result when rotation leaves too little height for the stage', async () => {
    const subject = fixture({ part: 3 })
    const { onDone } = await mountBroadcast(subject)
    await elapse(6000)
    act(() => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 })
      window.dispatchEvent(new Event('resize'))
    })
    expect(document.querySelector('[data-winner-id]')).toHaveAttribute(
      'data-winner-id',
      subject.expectedWinnerId
    )
    act(() => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
      window.dispatchEvent(new Event('resize'))
    })
    await elapse(90_000)
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('cancels preparation and all callbacks when unmounted before artwork is ready', async () => {
    let resolveArtwork: (value: CompetitionBroadcastArtwork) => void = () => {}
    let signal: AbortSignal | undefined
    media.prepare.mockImplementationOnce((_players: readonly Player[], abort: AbortSignal) => {
      signal = abort
      return new Promise<CompetitionBroadcastArtwork>((resolve) => {
        resolveArtwork = resolve
      })
    })
    const subject = fixture({ part: 1 })
    const { onDone, unmount } = await mountBroadcast(subject)
    unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => resolveArtwork(artwork(subject.game.players)))
    await elapse(90_000)
    expect(onDone).not.toHaveBeenCalled()
    expect(subject.store.getState().game.spectatorActive).toBeNull()
  })

  it('does not clear a newer spectator owner during old-scene cleanup', async () => {
    const subject = fixture({ part: 3 })
    const { unmount } = await mountBroadcast(subject)
    const replacement = {
      competitorIds: ['new-a', 'new-b'],
      minigameId: 'replacement-competition',
      startedAt: 99,
    }
    act(() => {
      subject.store.dispatch(closeSpectator())
      subject.store.dispatch(openSpectator(replacement))
    })
    unmount()
    expect(subject.store.getState().game.spectatorActive).toEqual(replacement)
  })

  it('ignores a captured control callback after the broadcast has unmounted', async () => {
    const listen = vi.spyOn(window, 'addEventListener')
    const subject = fixture({ part: 3 })
    const { onDone, unmount } = await mountBroadcast(subject)
    const listener = listen.mock.calls.filter(([event]) => event === 'ui:playPressed').at(-1)?.[1]
    expect(typeof listener).toBe('function')
    unmount()

    act(() => {
      ;(listener as EventListener)(new Event('ui:playPressed', { cancelable: true }))
    })
    await elapse(90_000)
    expect(onDone).not.toHaveBeenCalled()
    expect(subject.store.getState().game.spectatorActive).toBeNull()
  })

  it('never completes against a replacement game even if its old timer reaches the end', async () => {
    const subject = fixture({ part: 3 })
    const { onDone } = await mountBroadcast(subject)
    await elapse(3000)
    act(() =>
      subject.store.dispatch(
        hydrateGame({ ...subject.game, gameId: 'replacement-game', spectatorActive: null })
      )
    )
    await elapse(90_000)
    expect(onDone).not.toHaveBeenCalled()
    expect(subject.store.getState().game.gameId).toBe('replacement-game')
    expect(subject.store.getState().game.spectatorActive).toBeNull()
  })

  it('does not restart a completed presentation when animation preferences change', async () => {
    const subject = fixture({ part: 3 })
    const { onDone } = await mountBroadcast(subject)
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    act(() => subject.store.dispatch(setGameUX({ animations: false })))
    act(() => subject.store.dispatch(setGameUX({ animations: true })))
    await elapse(90_000)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(subject.store.getState().game.spectatorActive).toBeNull()
  })
})

import { act } from 'react'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FinalFaceoff from '../src/components/FinalFaceoff/FinalFaceoff'
import {
  FIRST_CLUE_DELAY_MS,
  clueReadingHoldMs,
  PUBLIC_VOTE_RECAP_HOLD_MS,
  VOTE_REVEAL_INITIAL_DELAY_MS,
  VOTE_REVEAL_STAGGER_MS,
} from '../src/components/FinalFaceoff/finaleTiming'
import {
  PHRASE_TYPING_CHAR_INTERVAL_MS,
  PHRASE_TYPING_START_DELAY_MS,
} from '../src/components/TribunalMemberStage/tribunalMemberStageTiming'
import gameReducer from '../src/store/gameSlice'
import finaleReducer from '../src/store/finaleSlice'
import { selectRevealedJurors } from '../src/store/finaleSlice'
import type { RootState } from '../src/store/store'
import settingsReducer from '../src/store/settingsSlice'
import uiReducer from '../src/store/uiSlice'
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice'
import { SoundManager } from '../src/services/sound/SoundManager'
import type { PlayerPublicProfile } from '../src/publicOpinion/types'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
} from '../src/services/presentation/presentationOwnership'

const MIN_TYPED_CHARS_VISIBLE = 1

const mockPlay = vi.fn()
const mockRequestBgm = vi.fn()
const mockReleaseBgm = vi.fn()

vi.mock('../src/hooks/useSound', () => ({
  default: () => ({
    play: mockPlay,
    requestBgm: mockRequestBgm,
    releaseBgm: mockReleaseBgm,
  }),
}))

vi.mock('../src/components/SeasonRecapCinematic/SeasonRecapCinematic', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="season-recap">
      <span>Season recap</span>
      <button type="button" onClick={onComplete}>
        Finish recap
      </button>
    </div>
  ),
}))

function makeProfile(
  playerId: string,
  approval: number,
  overrides: Partial<PlayerPublicProfile> = {}
): PlayerPublicProfile {
  return {
    playerId,
    approval,
    previousApproval: approval,
    seasonApprovals: [approval],
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
    ...overrides,
  }
}

function makeStore() {
  const baseGame = gameReducer(undefined, { type: '@@INIT' })
  const baseFinale = finaleReducer(undefined, { type: '@@INIT' })
  const baseSettings = settingsReducer(undefined, { type: '@@INIT' })
  const basePublicOpinion = publicOpinionReducer(undefined, { type: '@@INIT' })

  return configureStore({
    reducer: {
      game: gameReducer,
      finale: finaleReducer,
      settings: settingsReducer,
      ui: uiReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: {
      game: {
        ...baseGame,
        season: 3,
        week: 12,
        phase: 'jury',
        seed: 42,
        cfg: { ...baseGame.cfg, publicFinalVoteEnabled: true },
        players: [
          { id: 'f1', name: 'Avery', avatar: '😀', status: 'active' as const },
          { id: 'f2', name: 'Blake', avatar: '😎', status: 'active' as const },
          { id: 'j1', name: 'Casey', avatar: '🧠', status: 'jury' as const },
        ],
      },
      finale: baseFinale,
      settings: baseSettings,
      ui: uiReducer(undefined, { type: '@@INIT' }),
      publicOpinion: {
        ...basePublicOpinion,
        profiles: {
          f1: makeProfile('f1', 62),
          f2: makeProfile('f2', 78),
        },
      },
    },
  })
}

function beginTribunal() {
  act(() => {
    window.dispatchEvent(new Event('ui:playPressed'))
  })
}

function latestClueHold(store: ReturnType<typeof makeStore>) {
  return clueReadingHoldMs(selectRevealedJurors(store.getState() as RootState).at(-1)?.phrase)
}

async function advanceToRecapBoundary(store: ReturnType<typeof makeStore>) {
  // The finale flow crosses two exact timeout boundaries:
  // 1) the opening delay, then each phrase's reading hold
  // 2) PUBLIC_VOTE_RECAP_HOLD_MS of extra hold time after the public vote appears
  // Splitting each phase into (n - 1) ms + 1 ms keeps the assertions pinned to the edge so we can
  // prove the recap does not render early.
  await act(async () => {
    vi.advanceTimersByTime(FIRST_CLUE_DELAY_MS - 1)
  })

  await act(async () => {
    vi.advanceTimersByTime(1)
  })

  await act(async () => {
    vi.advanceTimersByTime(latestClueHold(store))
  })

  await act(async () => {
    vi.advanceTimersByTime(PUBLIC_VOTE_RECAP_HOLD_MS - 1)
  })
}

async function advanceToRecap(store: ReturnType<typeof makeStore>) {
  await advanceToRecapBoundary(store)

  await act(async () => {
    vi.advanceTimersByTime(1)
  })
}

function getTypedPhraseText(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\|/g, '').trim()
}

describe('FinalFaceoff public vote pacing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('uses a non-public full-body fallback when a juror lacks a formal cutout', async () => {
    const store = makeStore()

    const { container } = render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>
    )
    beginTribunal()

    await act(async () => {
      vi.advanceTimersByTime(FIRST_CLUE_DELAY_MS)
    })

    expect(screen.getByText('Casey')).toBeTruthy()
    expect(screen.getByAltText('Casey').getAttribute('src')).toBe(
      'assets/full_body_fallback_neutral.png'
    )
    expect(container.querySelector('.tms-public-placeholder')).toBeNull()
  })

  it('keeps the public vote message visible for its full reading hold before the recap', async () => {
    const store = makeStore()
    // One typed character is enough to prove the public line is visibly rendering
    // before the recap hold window expires.
    const phraseLeadInMs =
      PHRASE_TYPING_START_DELAY_MS + MIN_TYPED_CHARS_VISIBLE * PHRASE_TYPING_CHAR_INTERVAL_MS
    const remainingHoldMs = Math.max(0, PUBLIC_VOTE_RECAP_HOLD_MS - 1 - phraseLeadInMs)

    render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>
    )
    beginTribunal()

    await act(async () => {
      vi.advanceTimersByTime(FIRST_CLUE_DELAY_MS - 1)
    })

    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    await act(async () => {
      vi.advanceTimersByTime(latestClueHold(store))
    })

    await act(async () => {
      vi.advanceTimersByTime(phraseLeadInMs)
    })

    expect(
      screen.getByText((_, element) => {
        if (!element?.matches('.tms-phrase')) return false
        return getTypedPhraseText(element).length >= MIN_TYPED_CHARS_VISIBLE
      })
    ).toBeTruthy()
    expect(screen.queryByTestId('season-recap')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(remainingHoldMs)
    })

    expect(screen.queryByTestId('season-recap')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByTestId('season-recap')).toBeTruthy()
    expect(store.getState().ui.musicScene).toBe('season_recap')
  })

  it('switches the shared music scene to the season recap', async () => {
    const fadeOutMusicSpy = vi.spyOn(SoundManager, 'fadeOutMusic').mockResolvedValue(undefined)
    const store = makeStore()

    render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>
    )

    beginTribunal()
    await advanceToRecapBoundary(store)

    expect(fadeOutMusicSpy).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    expect(fadeOutMusicSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('season-recap')).toBeTruthy()
    // With the mock returning a resolved Promise, the .then() dispatch fires as
    // a microtask which act() flushes — musicScene must already be 'season_recap'.
    expect(store.getState().ui.musicScene).toBe('season_recap')
  })

  it('reveals post-recap tribunal votes one-by-one before declaring the winner', async () => {
    const store = makeStore()

    render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>
    )

    beginTribunal()
    await advanceToRecap(store)

    expect(screen.getByTestId('season-recap')).toBeTruthy()

    await act(async () => {
      screen.getByRole('button', { name: 'Finish recap' }).click()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(store.getState().ui.musicScene).toBe('jury_voting')
    expect(screen.getByText('0 / 2 votes revealed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue 🎉' })).toBeNull()
    expect(screen.queryByLabelText('Current Tribunal vote')).toBeNull()
    expect(screen.getAllByText('0', { selector: '.fo-finalist__votes' })).toHaveLength(2)

    await act(async () => {
      vi.advanceTimersByTime(VOTE_REVEAL_INITIAL_DELAY_MS - 1)
    })

    expect(screen.getByText('0 / 2 votes revealed')).toBeTruthy()
    expect(screen.queryByLabelText('Current Tribunal vote')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByText('1 / 2 votes revealed')).toBeTruthy()
    expect(screen.getByLabelText('Current Tribunal vote')).toBeTruthy()
    expect(store.getState().finale.isComplete).toBe(false)
    expect(screen.queryByRole('button', { name: 'Continue 🎉' })).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(VOTE_REVEAL_STAGGER_MS)
    })

    expect(store.getState().finale.isComplete).toBe(true)
    expect(screen.getByRole('button', { name: 'Continue 🎉' })).toBeTruthy()
    expect(screen.getByText(/wins The Big Eye!/)).toBeTruthy()
  })

  it('suspends clue advancement and phrase typing while gameplay owns the screen', async () => {
    const store = makeStore()
    const { container } = render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>
    )
    beginTribunal()
    act(() => vi.advanceTimersByTime(700))
    let release = () => {}
    try {
      act(() => {
        release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
      })
      expect(container.querySelector('.fo-overlay')).toHaveAttribute('inert')
      act(() => vi.advanceTimersByTime(30_000))
      expect(store.getState().finale.revealedCount).toBe(0)
      await act(async () => {
        release()
        await Promise.resolve()
      })
      act(() => vi.advanceTimersByTime(FIRST_CLUE_DELAY_MS - 701))
      expect(store.getState().finale.revealedCount).toBe(0)
      act(() => vi.advanceTimersByTime(1))
      expect(store.getState().finale.revealedCount).toBe(1)
      act(() =>
        vi.advanceTimersByTime(PHRASE_TYPING_START_DELAY_MS + 2 * PHRASE_TYPING_CHAR_INTERVAL_MS)
      )
      const phrase = container.querySelector('.tms-phrase')
      const text = phrase?.textContent ?? ''
      expect(text.length).toBeGreaterThan(0)
      act(() => {
        release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
      })
      act(() => vi.advanceTimersByTime(30_000))
      expect(phrase?.textContent).toBe(text)
      await act(async () => {
        release()
        await Promise.resolve()
      })
      act(() => vi.advanceTimersByTime(PHRASE_TYPING_CHAR_INTERVAL_MS))
      expect(phrase?.textContent?.length).toBeGreaterThan(text.length)
    } finally {
      release()
    }
  })

  it('resumes the remaining vote delay without repeating cues and cancels the winner handoff on unmount', async () => {
    const store = makeStore()
    const { unmount } = render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>
    )
    beginTribunal()
    await advanceToRecap(store)
    act(() => screen.getByRole('button', { name: 'Finish recap' }).click())
    act(() => vi.advanceTimersByTime(VOTE_REVEAL_INITIAL_DELAY_MS))
    expect(mockPlay.mock.calls.filter(([key]) => key === 'ui:tribunal_vote_reveal')).toHaveLength(1)
    let release = () => {}
    try {
      act(() => {
        release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
      })
      act(() => vi.advanceTimersByTime(30_000))
      expect(store.getState().finale.isComplete).toBe(false)
      await act(async () => {
        release()
        await Promise.resolve()
      })
      act(() => vi.advanceTimersByTime(VOTE_REVEAL_STAGGER_MS - 1))
      expect(mockPlay.mock.calls.filter(([key]) => key === 'ui:tribunal_vote_reveal')).toHaveLength(
        1
      )
      act(() => vi.advanceTimersByTime(1))
      expect(mockPlay.mock.calls.filter(([key]) => key === 'ui:tribunal_vote_reveal')).toHaveLength(
        2
      )
      expect(store.getState().finale.isComplete).toBe(true)
      unmount()
      act(() => vi.advanceTimersByTime(30_000))
      expect(store.getState().game.seasonFinale).toBeNull()
    } finally {
      release()
    }
  })
})

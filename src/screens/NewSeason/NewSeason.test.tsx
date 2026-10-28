import { trackProductEvent } from '../../services/liveOps/productTelemetry'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import NewSeason from './NewSeason'
import { launchSeasonWithContestant } from '../../modes/launchSeason'
import {
  clearSavedRun,
  flushSavePersistence,
  loadSavedRunProfile,
} from '../../store/saveStatePersistence'
import type { SeasonContestant } from '../../appearance/seasonContestant'
import { rememberContestant } from '../../store/profilesSlice'

vi.mock('../../services/liveOps/productTelemetry', () => ({ trackProductEvent: vi.fn() }))

const { dispatch, navigate, state } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  navigate: vi.fn(),
  state: {
    profiles: {
      profiles: [
        {
          id: 'player',
          name: 'Real player',
          avatar: '🧑',
          createdAt: '2026-10-27',
          bio: { age: '35', sex: 'Male' },
          eyeoleans: 900,
          contestantDefaults: undefined as SeasonContestant | undefined,
        },
      ],
      activeProfileId: 'player',
      isGuest: false,
    },
    vip: { isActive: true, entitlements: {} },
  },
}))

vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useNavigate: () => navigate,
}))
vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(state),
}))
vi.mock('../../modes/launchSeason', async () => ({
  ...(await vi.importActual<typeof import('../../modes/launchSeason')>('../../modes/launchSeason')),
  launchSeasonWithContestant: vi.fn(),
}))
vi.mock('../../store/store', () => ({
  flushPendingRunSnapshots: vi.fn(),
  persistCurrentRunSnapshot: vi.fn(),
}))
vi.mock('../../store/saveStatePersistence', () => ({
  clearSavedRun: vi.fn(),
  flushSavePersistence: vi.fn(async () => true),
  loadSavedRunProfile: vi.fn(() => null),
  retrySavePersistenceWrites: vi.fn(),
}))
vi.mock('../../store/archivePersistence', () => ({ loadSeasonArchives: vi.fn(() => []) }))
vi.mock('../../services/sound/audioRouteOwnership', () => ({ beginGameplayAudioExit: vi.fn() }))
vi.mock('../../services/sound/SoundManager', () => ({
  SoundManager: { unlockFromGesture: vi.fn() },
}))
// Exercise stored ownership even when this checkout enables development access.
vi.mock('../../vip/effectiveEntitlements', async () => {
  const actual = await vi.importActual<typeof import('../../vip/effectiveEntitlements')>(
    '../../vip/effectiveEntitlements'
  )
  return {
    ...actual,
    hasEffectiveStoreEntitlement: (
      vip: Parameters<typeof actual.hasEffectiveStoreEntitlement>[0],
      key: Parameters<typeof actual.hasEffectiveStoreEntitlement>[1]
    ) => actual.hasEffectiveStoreEntitlement(vip, key, false),
  }
})

function show(mode = 'classic') {
  return render(
    <MemoryRouter initialEntries={[`/new-season?mode=${mode}`]}>
      <NewSeason />
    </MemoryRouter>
  )
}

describe('new season setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.vip.isActive = true
    state.profiles.profiles[0].contestantDefaults = undefined
    vi.mocked(flushSavePersistence).mockResolvedValue(true)
    vi.mocked(loadSavedRunProfile).mockReturnValue(null as never)
  })
  afterEach(cleanup)

  it('chooses a character without changing the player profile, wallet, or real age', async () => {
    const before = JSON.stringify(state.profiles)
    show()
    fireEvent.click(screen.getByText('Change contestant (optional)'))
    fireEvent.change(screen.getByLabelText('Contestant name'), { target: { value: 'Maya' } })
    fireEvent.change(screen.getByLabelText('Contestant age'), { target: { value: '52' } })
    fireEvent.change(screen.getByLabelText('Contestant sex'), { target: { value: 'Female' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Look 2' }))
    expect(launchSeasonWithContestant).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start Season' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/game', { replace: true }))
    expect(launchSeasonWithContestant).toHaveBeenCalledWith(
      dispatch,
      'classic',
      expect.objectContaining({
        name: 'Maya',
        presetId: 'pc-002',
        bio: expect.objectContaining({ age: '52', sex: 'Female' }),
      }),
      []
    )
    expect(JSON.stringify(state.profiles)).toBe(before)
    // Finite launch analytics belong to the existing reset middleware.
    expect(trackProductEvent).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith(
      rememberContestant({
        profileId: 'player',
        contestant: expect.objectContaining({
          name: 'Maya',
          bio: expect.objectContaining({ age: '52' }),
        }),
      })
    )
  })

  it('reuses the remembered contestant without requiring selection or editing', async () => {
    state.profiles.profiles[0].contestantDefaults = {
      version: 1,
      name: 'Maya',
      avatar: '👩',
      bio: { age: '52', sex: 'Female' },
    }
    show()
    expect(screen.getByText('Maya')).toBeVisible()
    expect(screen.getByLabelText('Contestant name')).not.toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Start Season' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/game', { replace: true }))
    expect(launchSeasonWithContestant).toHaveBeenCalledWith(
      dispatch,
      'classic',
      expect.objectContaining({ name: 'Maya', bio: expect.objectContaining({ age: '52' }) }),
      []
    )
  })

  it('retains the explicit survival launch events without duplicating finite launch events', async () => {
    show('survival')
    fireEvent.click(screen.getByRole('button', { name: 'Start Season' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/game', { replace: true }))
    expect(vi.mocked(trackProductEvent).mock.calls.map(([event]) => event)).toEqual([
      'game_mode_selected',
      'season_started',
    ])
  })

  it.each(['cupidArrow', 'voxPopuli', 'survival'])(
    'keeps the %s launch gate on the direct setup route',
    (mode) => {
      state.vip.isActive = false
      show(mode)
      expect(screen.getByRole('button', { name: 'Open Market' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Start Season' })).toBeNull()
      expect(launchSeasonWithContestant).not.toHaveBeenCalled()
    }
  )

  it('does not replace a save until the player confirms, and cancellation preserves it', async () => {
    vi.mocked(loadSavedRunProfile).mockReturnValue({
      version: 2,
      profileId: 'player',
      activeRunId: 'original',
      lastPlayedRunId: 'original',
      runs: { classic: { savedAt: '2026-10-27', game: { gameId: 'original' } } },
    } as never)
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Start Season' }))
    expect(screen.getByRole('dialog', { name: 'Replace saved run?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(clearSavedRun).not.toHaveBeenCalled()
    expect(launchSeasonWithContestant).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start Season' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace and Start' }))
    await waitFor(() => expect(launchSeasonWithContestant).toHaveBeenCalledOnce())
    // Same-slot saving replaces the record; clearing it would erase the new run.
    expect(clearSavedRun).not.toHaveBeenCalled()
  })

  it('preserves the old save when pending writes cannot be flushed', async () => {
    vi.mocked(flushSavePersistence).mockResolvedValue(false)
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Start Season' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(clearSavedRun).not.toHaveBeenCalled()
    expect(launchSeasonWithContestant).not.toHaveBeenCalled()
  })
})

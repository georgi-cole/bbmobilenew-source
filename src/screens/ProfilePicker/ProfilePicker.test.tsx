import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePicker from './ProfilePicker'
import { installSafetyFixture } from '../../safety/__tests__/safetyFixture'

const mockNavigate = vi.fn()
const mockDispatch = vi.fn()
const mockLoadSavedRunProfile = vi.fn()
let mockLocationState: { from?: string } | null = null

const mockState: {
  profiles: {
    profiles: Array<{
      id: string
      name: string
      avatar: string
      createdAt: string
      photoId?: string
      bio?: { age?: string }
    }>
    activeProfileId: string | null
    isGuest: boolean
  }
  game: {
    status?: string
    week: number
    phase: string
    mode?: string
    runId?: string
    pendingEviction?: unknown
    seasonFinale?: unknown
  }
} = {
  profiles: {
    profiles: [],
    activeProfileId: null,
    isGuest: false,
  },
  game: {
    week: 1,
    phase: 'week_start',
  },
}

function emptySavedProfile(profileId: string) {
  return {
    version: 2 as const,
    profileId,
    savedAt: new Date(0).toISOString(),
    activeRunId: null,
    lastPlayedRunId: null,
    runs: {},
    stats: { maxSurvivorDaysSurvived: 0, survivorAchievementsUnlocked: {} },
  }
}

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}))

vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}))

vi.mock('../../store/archivePersistence', () => ({
  loadSeasonArchives: vi.fn(() => []),
}))

vi.mock('../../store/saveStatePersistence', () => ({
  loadSavedRunProfile: (...args: unknown[]) => mockLoadSavedRunProfile(...args),
  clearSavedRun: vi.fn(),
  flushSavePersistence: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../../store/store', () => ({
  persistCurrentRunSnapshot: vi.fn(),
}))

vi.mock('../../utils/imageDb', () => ({
  imageIdToDataUrl: vi.fn(() => Promise.resolve(null)),
  saveImage: vi.fn(() => Promise.resolve()),
  deleteImage: vi.fn(() => Promise.resolve()),
  pruneProfilePhotos: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../utils/imageUtils', () => ({
  resizeAndCompressImage: vi.fn(),
}))

vi.mock('../../components/ConfirmExitModal/ConfirmExitModal', () => ({
  default: () => null,
}))
vi.mock('../../safety/LocalProfileRemoval', () => ({ default: () => null }))

describe('ProfilePicker', () => {
  beforeEach(() => {
    installSafetyFixture(28)
    mockNavigate.mockReset()
    mockDispatch.mockReset()
    mockLoadSavedRunProfile.mockReset()
    mockLoadSavedRunProfile.mockImplementation((id: string) => emptySavedProfile(id))
    mockLocationState = null
    mockState.profiles = {
      profiles: [],
      activeProfileId: null,
      isGuest: false,
    }
    mockState.game = {
      week: 1,
      phase: 'week_start',
    }
  })

  it('replaces the picker history entry after creating a profile', async () => {
    render(<ProfilePicker />)

    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    expect(screen.queryByPlaceholderText(/enter display name/i)).toBeNull()
    fireEvent.change(screen.getByLabelText('Player age'), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByRole('button', { name: /continue as guest/i })).toBeNull()
    fireEvent.change(screen.getByPlaceholderText(/enter display name/i), {
      target: { value: 'Jordan' },
    })
    fireEvent.change(screen.getByLabelText(/age/i), { target: { value: '28' } })
    fireEvent.change(screen.getByLabelText(/sex/i), { target: { value: 'Female' } })
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile', {
        replace: true,
        state: { from: '/game' },
      })
    })
  })

  it('adopts an in-progress guest game into the new profile without resetting it', async () => {
    mockState.profiles.isGuest = true
    mockState.game = {
      week: 2,
      phase: 'nomination',
      runId: 'guest-run-1',
    }
    render(<ProfilePicker />)

    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    fireEvent.change(screen.getByLabelText('Player age'), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(screen.getByPlaceholderText(/enter display name/i), {
      target: { value: 'Jordan' },
    })
    fireEvent.change(screen.getByLabelText(/age/i), { target: { value: '28' } })
    fireEvent.change(screen.getByLabelText(/sex/i), { target: { value: 'Female' } })
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/game', {
        replace: true,
        state: { from: '/game' },
      })
    })
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'profiles/createProfile',
        payload: expect.objectContaining({ bio: { age: '28', sex: 'Female' } }),
      })
    )
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'game/updateUserPlayerIdentity',
      })
    )
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'game/resetGame',
      })
    )
  })

  it('shows a direct way back home from the picker', () => {
    mockLocationState = { from: '/' }
    render(<ProfilePicker />)

    fireEvent.click(screen.getByRole('button', { name: /back to home/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('checks the modern split-save profile before switching profiles', () => {
    mockState.profiles = {
      profiles: [
        { id: 'profile-a', name: 'A', avatar: '🧑', createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'profile-b', name: 'B', avatar: '👩', createdAt: '2026-08-02T00:00:00.000Z' },
      ],
      activeProfileId: 'profile-a',
      isGuest: false,
    }

    render(<ProfilePicker />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    expect(mockLoadSavedRunProfile).toHaveBeenCalledWith('profile-b')
    expect(mockNavigate).toHaveBeenCalledWith('/profile', {
      replace: true,
      state: { from: '/game' },
    })
  })

  it('screens guest entry and keeps an under-13 guest out of the game', () => {
    render(<ProfilePicker />)
    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }))
    expect(mockDispatch).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Player age'), { target: { value: '11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: /For parents and guardians/ })).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('checks age before allowing a new profile name or photo', () => {
    render(<ProfilePicker />)
    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    expect(screen.queryByLabelText(/upload profile photo/i)).toBeNull()
    fireEvent.change(screen.getByLabelText('Player age'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByPlaceholderText(/enter display name/i)).toBeNull()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('blocks selecting a saved under-13 profile before loading its run', () => {
    mockState.profiles.profiles = [
      { id: 'child', name: 'Child', avatar: '🧑', createdAt: '2026-08-01', bio: { age: '11' } },
    ]
    render(<ProfilePicker />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(mockLoadSavedRunProfile).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: /For parents and guardians/ })).toBeInTheDocument()
  })
})

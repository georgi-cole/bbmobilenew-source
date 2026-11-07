import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EditProfile from '../../screens/Profile/EditProfile'
import PlayerAdmissionBoundary from '../PlayerAdmissionBoundary'
import { declarePlayerAge } from '../playerSafety'
import { installSafetyFixture } from './safetyFixture'
import { deleteImage, saveImage } from '../../utils/imageDb'

const dispatch = vi.fn()
const state = {
  profiles: {
    activeProfileId: 'player',
    isGuest: false,
    profiles: [
      {
        id: 'player',
        name: 'Player',
        avatar: '🧑',
        photoId: 'old-photo',
        createdAt: '2026-01-01',
        bio: { age: '28' },
      },
    ],
  },
}
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null }),
}))
vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}))
vi.mock('../../store/gameSlice', () => ({
  resetGame: () => ({ type: 'game/resetGame' }),
  resolveProfileAge: (age: string) => Number(age),
  resolveProfileSex: () => undefined,
  updateUserPlayerIdentity: (payload: unknown) => ({
    type: 'game/updateUserPlayerIdentity',
    payload,
  }),
}))
vi.mock('../../store/saveStatePersistence', () => ({
  clearProfileSaveStorage: vi.fn(),
  flushSavePersistence: vi.fn(async () => true),
}))
vi.mock('../../store/archivePersistence', () => ({ clearSeasonArchives: vi.fn() }))
vi.mock('../../utils/imageDb', () => ({
  imageIdToDataUrl: vi.fn(async () => null),
  saveImage: vi.fn(async () => undefined),
  deleteImage: vi.fn(async () => undefined),
  pruneProfilePhotos: vi.fn(async () => undefined),
}))
vi.mock('../../utils/imageUtils', () => ({
  resizeAndCompressImage: vi.fn(async () => new Blob(['image'], { type: 'image/png' })),
}))
vi.mock('../LocalProfileRemoval', () => ({ default: () => null }))

describe('profile edits respect player admission', () => {
  beforeEach(() => {
    installSafetyFixture(28)
    dispatch.mockClear()
    vi.mocked(saveImage).mockReset()
    vi.mocked(deleteImage).mockClear()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:profile-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('routes a lower age to the locked parent screen before saving profile details', () => {
    render(
      <PlayerAdmissionBoundary>
        <EditProfile />
      </PlayerAdmissionBoundary>
    )
    const age = screen.getByLabelText('Your age')
    fireEvent.change(age, { target: { value: '12' } })
    fireEvent.blur(age)
    expect(screen.getByRole('heading', { name: 'For parents and guardians' })).toBeInTheDocument()
    expect(dispatch).not.toHaveBeenCalled()
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('removes an unfinished new photo and preserves the old one when admission is withdrawn during save', async () => {
    let finishSave: (() => void) | undefined
    vi.mocked(saveImage).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        })
    )
    const { container } = render(
      <PlayerAdmissionBoundary>
        <EditProfile />
      </PlayerAdmissionBoundary>
    )
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['image'], 'image.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Profile' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(saveImage).toHaveBeenCalledOnce())
    act(() => {
      declarePlayerAge(12)
    })
    await act(async () => {
      finishSave!()
    })
    await waitFor(() =>
      expect(deleteImage).toHaveBeenCalledWith(expect.stringMatching(/^photo-player-/))
    )
    expect(deleteImage).not.toHaveBeenCalledWith('old-photo')
    expect(dispatch).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { savedProfilePhotoIds } from './profilePhotos'
import { loadSavedRunProfile } from '../store/saveStatePersistence'

vi.mock('../store/saveStatePersistence', () => ({ loadSavedRunProfile: vi.fn() }))

describe('saved contestant photo retention', () => {
  it('keeps both snapshot and legacy avatar photo references across all run slots', () => {
    vi.mocked(loadSavedRunProfile).mockReturnValue({
      runs: {
        classic: {
          game: {
            seasonContestant: { photoId: 'original-photo' },
            players: [{ avatar: 'profile-photo:original-photo' }],
          },
        },
        survival: {
          game: { players: [{ avatar: 'profile-photo:legacy-photo' }, { avatar: '🧑' }] },
        },
      },
    } as never)
    expect(savedProfilePhotoIds('owner')).toEqual(['original-photo', 'legacy-photo'])
    expect(loadSavedRunProfile).toHaveBeenCalledWith('owner')
  })
})

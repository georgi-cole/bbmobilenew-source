import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { store } from '../../store/store'
import { createProfile, selectActiveProfile } from '../../store/profilesSlice'
import { clearProfileSaveStorage, flushSavePersistence } from '../../store/saveStatePersistence'
import { pruneProfilePhotos } from '../../utils/imageDb'
import LocalProfileRemoval from '../LocalProfileRemoval'
import { canPlayWithSafety } from '../playerSafety'
import { installSafetyFixture } from './safetyFixture'

vi.mock('../../store/store', async () => {
  const { configureStore } = await import('@reduxjs/toolkit')
  const { default: profiles } = await import('../../store/profilesSlice')
  return { store: configureStore({ reducer: { profiles } }) }
})
vi.mock('../../store/gameSlice', () => ({ resetGame: () => ({ type: 'game/resetGame' }) }))
vi.mock('../../store/saveStatePersistence', () => ({
  clearProfileSaveStorage: vi.fn(),
  flushSavePersistence: vi.fn(async () => true),
  loadSavedRunProfile: vi.fn(() => ({ runs: {} })),
}))
vi.mock('../../store/archivePersistence', () => ({ clearSeasonArchives: vi.fn() }))
vi.mock('../../utils/imageDb', () => ({ pruneProfilePhotos: vi.fn(async () => undefined) }))

describe('profile removal while age-locked', () => {
  beforeEach(() => {
    installSafetyFixture(11)
    vi.clearAllMocks()
  })
  afterEach(cleanup)

  it('requires explicit confirmation, removes only the selected profile, and retains the age lock', async () => {
    act(() => {
      store.dispatch(
        createProfile({
          name: 'Child profile',
          avatar: '🧑',
          photoId: 'child-photo',
          bio: { age: '11' },
        })
      )
      store.dispatch(createProfile({ name: 'Other profile', avatar: '🧑', bio: { age: '28' } }))
    })
    const child = store
      .getState()
      .profiles.profiles.find((profile) => profile.name === 'Child profile')!
    store.dispatch(selectActiveProfile(child.id))
    render(<LocalProfileRemoval />)
    expect(screen.getByRole('button', { name: 'Remove selected profile' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Remove a saved profile and its games'), {
      target: { value: child.id },
    })
    expect(screen.getByRole('button', { name: 'Remove selected profile' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected profile' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('were removed'))
    expect(clearProfileSaveStorage).toHaveBeenCalledWith(child.id)
    expect(flushSavePersistence).toHaveBeenCalledOnce()
    expect(pruneProfilePhotos).toHaveBeenCalledWith(child.id, [], ['child-photo'])
    expect(store.getState().profiles.profiles.map((profile) => profile.name)).toEqual([
      'Other profile',
    ])
    expect(canPlayWithSafety()).toBe(false)
  })
})

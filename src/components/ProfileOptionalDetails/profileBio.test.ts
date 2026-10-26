import { afterEach, describe, expect, it } from 'vitest'
import profilesReducer, {
  createProfile,
  loadActiveProfile,
  loadProfilesState,
  saveProfilesState,
  updateProfile,
} from '../../store/profilesSlice'
import { normalizeProfileBio } from './profileBio'

afterEach(() => localStorage.removeItem('bbmobilenew:profiles:v1'))

describe('optional profile biography persistence', () => {
  it('persists all creation categories and exposes the reproductive settings to new seasons', () => {
    const bio = normalizeProfileBio({
      age: ' 28 ',
      sex: ' Other ',
      story: ' Music ',
      location: ' Sofia ',
      profession: ' Nurse ',
      motto: ' Live. ',
      funFact: ' Cats ',
      zodiac: ' Libra ',
      education: ' College ',
      familyStatus: ' Single ',
      kids: ' None ',
      pets: ' Two cats ',
      religion: ' Agnostic ',
      sexuality: ' Queer ',
      reproductiveProfile: { canBecomePregnant: false, canCausePregnancy: true },
    })
    const state = profilesReducer(
      undefined,
      createProfile({
        name: 'Alex',
        avatar: 'placeholder',
        bio,
        appearanceSelection: { kind: 'catalog', lookId: 'pc-001', revision: 1 },
      })
    )
    saveProfilesState(state)
    expect(loadProfilesState().profiles[0].bio).toEqual(bio)
    expect(loadActiveProfile().bio).toEqual(bio)
    expect(bio.location).toBe('Sofia')
    expect(bio.sexuality).toBe('Queer')
  })

  it('allows clearing one saved field without losing the other collapsed details', () => {
    let state = profilesReducer(
      undefined,
      createProfile({
        name: 'Alex',
        avatar: 'placeholder',
        bio: { age: '28', sex: 'Other', location: 'Sofia', pets: 'Cats', religion: 'Agnostic' },
      })
    )
    const edited = { ...state.profiles[0].bio, location: '' }
    state = profilesReducer(
      state,
      updateProfile({ bio: normalizeProfileBio(edited, { clearEmptyFields: true }) })
    )
    saveProfilesState(state)
    expect(loadProfilesState().profiles[0].bio).toEqual({
      age: '28',
      sex: 'Other',
      pets: 'Cats',
      religion: 'Agnostic',
    })
  })
})

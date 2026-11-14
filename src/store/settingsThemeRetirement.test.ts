import { beforeEach, describe, expect, it } from 'vitest'
import settingsReducer, {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  importSettings,
  loadSettings,
  setDisplay,
  type ThemePreset,
} from './settingsSlice'

describe('retired player themes', () => {
  beforeEach(() => localStorage.clear())

  it.each<ThemePreset>(['neon', 'sunset', 'ocean', 'surveyeval'])(
    'restores %s saves to the standard theme without losing accessibility preferences',
    (themePreset) => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...DEFAULT_SETTINGS,
          display: { themePreset, reduceMotion: true, highContrast: true },
        })
      )
      expect(loadSettings().display).toEqual({
        themePreset: 'midnight',
        reduceMotion: true,
        highContrast: true,
      })
    }
  )

  it('normalizes imported and legacy setter choices', () => {
    const imported = settingsReducer(
      undefined,
      importSettings({
        ...DEFAULT_SETTINGS,
        display: { themePreset: 'neon', reduceMotion: true, highContrast: false },
      })
    )
    expect(imported.display).toMatchObject({ themePreset: 'midnight', reduceMotion: true })
    const updated = settingsReducer(
      imported,
      setDisplay({ themePreset: 'ocean', highContrast: true })
    )
    expect(updated.display).toEqual({
      themePreset: 'midnight',
      reduceMotion: true,
      highContrast: true,
    })
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import reducer, { DEFAULT_SETTINGS, loadSettings, setGameUX, STORAGE_KEY } from './settingsSlice'
describe('animation style preference', () => {
  afterEach(() => localStorage.clear())
  it('defaults older saves to automatic access-based selection', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ gameUX: { animations: true } }))
    expect(loadSettings().gameUX.animationMode).toBe('auto')
  })
  it.each(['standard', 'cinematic'] as const)(
    'preserves an explicit %s choice across saving and loading',
    (animationMode) => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ gameUX: { animations: true, animationMode } })
      )
      expect(loadSettings().gameUX.animationMode).toBe(animationMode)
    }
  )
  it('turning animations off does not erase the chosen style', () => {
    let state = reducer(DEFAULT_SETTINGS, setGameUX({ animationMode: 'cinematic' }))
    state = reducer(state, setGameUX({ animations: false }))
    expect(state.gameUX).toMatchObject({ animationMode: 'cinematic', animations: false })
    state = reducer(state, setGameUX({ animations: true }))
    expect(state.gameUX.animationMode).toBe('cinematic')
  })
  it('treats an invalid imported style as automatic, while preserving the master toggle', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ gameUX: { animations: false, animationMode: 'broken' } })
    )
    expect(loadSettings().gameUX).toMatchObject({ animationMode: 'auto', animations: false })
  })
})

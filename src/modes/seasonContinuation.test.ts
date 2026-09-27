import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState } from '../store/gameSlice'
import { startNewVoxPopuliSeason } from './seasonContinuation'

describe('startNewVoxPopuliSeason', () => {
  it('resets into a newly active Vox Populi season instead of Classic', () => {
    const initial = createInitialGameState({ seed: 41026 })
    const store = configureStore({ reducer: { game: gameReducer }, preloadedState: { game: initial } })

    startNewVoxPopuliSeason(store.dispatch)

    const next = store.getState().game
    expect(next.expansionMode).toBe('voxPopuli')
    expect(next.voxPopuli?.status).toBe('active')
    expect(next.voxPopuli?.activatedSeason).toBe(next.season)
    expect(next.cupidArrow?.scheduledSeason).toBeNull()
  })
})

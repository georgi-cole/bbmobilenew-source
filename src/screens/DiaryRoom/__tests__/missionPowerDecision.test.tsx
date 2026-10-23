import { getConfessionalDecisionKey } from '../../../store/confessionalDecisionSelectors'
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import gameReducer, { createInitialGameState } from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import socialReducer from '../../../social/socialSlice'
import ConfessionalDecisionPanel from '../ConfessionalDecisionPanel'
import { getConfessionalDecisionPresentation } from '../confessionalDecisionPresentation'
import { createSecretMissionState } from '../../../bb/secretMission'
import { createMissionPowerReward } from '../../../bb/missionPowers'
import type { MissionPowerDecisionKind } from '../../../bb/missionPowers'

function renderDecision(kind: MissionPowerDecisionKind = 'noAmbush') {
  const game = createInitialGameState({ seed: 51 })
  game.week = 6
  game.phase = 'pos_ceremony_results'
  game.cupidArrow = undefined
  const others = game.players.filter((p) => !p.isUser)
  game.lohId = others[0].id
  game.posWinnerId = others[1].id
  game.secretMission = {
    ...createSecretMissionState(3),
    rewardVersion: 2,
    status: 'rewardClaimed',
    reward: createMissionPowerReward('noAmbush', 6, 'week_start'),
  }
  game.missionPowers = { decision: { id: 'test-opportunity', kind } }
  const store = configureStore({
    reducer: { game: gameReducer, settings: settingsReducer, social: socialReducer },
    preloadedState: { game },
  })
  const decision = { type: 'mission_power' as const, week: 6, phase: game.phase }
  const presentation = getConfessionalDecisionPresentation(decision, game, game.players)
  const committed = vi.fn()
  render(
    <Provider store={store}>
      <p>{presentation.prompt}</p>
      <ConfessionalDecisionPanel decision={decision} onDecisionCommitted={committed} />
    </Provider>
  )
  return { store, committed }
}

describe('Big Eye mission-power decisions in the actual chat panel', () => {
  it('explains the tradeoff and requires confirmation before spending No Ambush', () => {
    const { store, committed } = renderDecision()
    expect(screen.getByText(/the block is about to shift/i)).toHaveTextContent(/decline.*spent/i)
    const confirm = screen.getByRole('button', { name: 'Confirm decision' })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Use mission power' }))
    expect(store.getState().game.secretMission?.reward?.consumed).toBe(false)
    fireEvent.click(confirm)
    expect(store.getState().game.secretMission?.reward?.consumed).toBe(true)
    expect(store.getState().game.missionPowers?.noAmbushDay).toBe(6)
    expect(committed).toHaveBeenCalledTimes(1)
  })
  it('labels a decline that spends the one-ceremony power explicitly', () => {
    const { store } = renderDecision()
    fireEvent.click(screen.getByRole('button', { name: 'Decline and spend power' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decision' }))
    expect(store.getState().game.secretMission?.reward?.consumed).toBe(true)
    expect(store.getState().game.missionPowers?.noAmbushDay).toBeUndefined()
  })
  it('explains that switching returns unused Store powers and does not pause deadlines', () => {
    renderDecision('storeConflict')
    expect(screen.getByText(/two powers, one spotlight/i)).toHaveTextContent(/inventory/i)
    expect(screen.getByRole('button', { name: 'Keep Store power' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch to mission power' })).toBeInTheDocument()
  })
})

it('gives each mission decision step its own Play/navigation identity', () => {
  const decision = {
    type: 'mission_power' as const,
    week: 6,
    phase: 'pos_ceremony_results' as const,
  }
  const first = getConfessionalDecisionKey(decision, {
    missionPowers: { decision: { kind: 'pickBackup', id: 'backup' } },
  })
  const second = getConfessionalDecisionKey(decision, {
    missionPowers: { decision: { kind: 'backupTarget', id: 'backup:target' } },
  })
  expect(first).not.toBe(second)
})

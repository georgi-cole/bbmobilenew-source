import { describe, expect, it } from 'vitest'
import { createSecretMissionState } from '../../bb/secretMission'
import gameReducer, { addTvEvent, claimMissionReward, createInitialGameState } from '../gameSlice'

describe('secret mission completion broadcast', () => {
  it('keeps the explicit critical key when creating the reward reminder', () => {
    const state = createInitialGameState({ seed: 13 })
    const result = gameReducer(
      state,
      addTvEvent({
        text: 'SECRET MISSION COMPLETE! Your reward is waiting in the Confessional. 🎁',
        type: 'game',
        meta: {
          forceOnTv: true,
          broadcastPriority: 'critical',
          major: 'secret_mission_complete',
        },
      })
    )

    expect(result.tvFeed[0]).toMatchObject({
      major: 'secret_mission_complete',
      meta: {
        major: 'secret_mission_complete',
        broadcastLevel: 'critical',
        broadcastPriority: 'critical',
      },
    })
  })

  it('retires a queued reward reminder when the Confessional reward is claimed', () => {
    let state = createInitialGameState({ seed: 17 })
    const mission = createSecretMissionState(4, { missionNumber: 1 })
    mission.status = 'rewardPending'
    state.secretMission = mission

    state.tvFeed.unshift({
      id: 'mission-complete-event',
      text: 'SECRET MISSION COMPLETE! Your reward is waiting in the Confessional.',
      type: 'game',
      timestamp: 1,
      meta: {
        forceOnTv: true,
        broadcastPriority: 'critical',
        major: 'secret_mission_complete',
        secretMissionNumber: 1,
      },
    })
    state.broadcastQueue = ['mission-complete-event']
    const reminder = state.tvFeed.find((event) => event.meta?.major === 'secret_mission_complete')
    expect(reminder).toBeDefined()
    expect(state.broadcastQueue).toContain(reminder?.id)

    state = gameReducer(state, claimMissionReward('doubleVote'))

    const claimedReminder = state.tvFeed.find((event) => event.id === reminder?.id)
    expect(claimedReminder?.meta).toMatchObject({
      broadcastConsumed: true,
      rewardClaimed: true,
    })
    expect(state.broadcastQueue).not.toContain(reminder?.id)
    expect(state.tvFeed).toContain(claimedReminder)
    expect(state.secretMission?.status).toBe('rewardClaimed')
  })
})

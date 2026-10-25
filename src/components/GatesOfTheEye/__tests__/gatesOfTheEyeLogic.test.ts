import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../store/rng'
import {
  chooseAiDoor,
  chooseRoundSeed,
  createInitialParticipants,
  drawCollapsingDoor,
  GATES_OF_THE_EYE_PROFILES,
  getShuffledProfiles,
  getStreakBonusPercent,
  getStreakReward,
  resolveGateRound,
  validateDoorProfile,
} from '../gatesOfTheEyeLogic'

describe('Bigg Gates rules', () => {
  it('offers ten valid four-door profiles with shared odds totaling 100%', () => {
    expect(GATES_OF_THE_EYE_PROFILES).toHaveLength(10)
    GATES_OF_THE_EYE_PROFILES.forEach((profile) => {
      expect(validateDoorProfile(profile), profile.id).toBe(true)
      expect(profile.doors).toHaveLength(4)
    })
  })

  it('shuffles profiles deterministically and draws the shared collapsing door by its odds', () => {
    expect(getShuffledProfiles(424242)).toEqual(getShuffledProfiles(424242))
    const profile = GATES_OF_THE_EYE_PROFILES[0]!
    const drawAt = (roll: number) => drawCollapsingDoor(profile, () => roll)
    expect(drawAt(0)).toBe('door-1')
    expect(drawAt(0.1)).toBe('door-2')
    expect(drawAt(0.25)).toBe('door-3')
    expect(drawAt(0.5)).toBe('door-4')
  })

  it('ramps the safe-crossing streak bonus from the second survival', () => {
    expect(getStreakBonusPercent(0)).toBe(0)
    expect(getStreakBonusPercent(1)).toBe(0)
    expect(getStreakBonusPercent(2)).toBe(10)
    expect(getStreakBonusPercent(3)).toBe(15)
    expect(getStreakReward(20, 3)).toBe(23)
  })

  it('banks safe points and resets a collapsed player’s life and streak', () => {
    const participants = createInitialParticipants([
      { id: 'human', name: 'You', isHuman: true },
      { id: 'ai', name: 'AI', isHuman: false },
    ]).map((player) =>
      player.id === 'human'
        ? { ...player, score: 10, lives: 2, streak: 1 }
        : { ...player, score: 5, streak: 1 }
    )
    const profile = GATES_OF_THE_EYE_PROFILES[0]!
    const result = resolveGateRound({
      participants,
      choices: { human: 'door-1', ai: 'door-2' },
      profile,
      collapsedDoorId: 'door-1',
      roundOrdinal: 2,
      isOvertime: false,
    })

    expect(result.participants.find(({ id }) => id === 'human')).toMatchObject({
      score: 10,
      lives: 1,
      streak: 0,
    })
    expect(result.participants.find(({ id }) => id === 'ai')).toMatchObject({
      score: 27,
      lives: 3,
      streak: 2,
    })
    expect(result.crossings.find(({ participantId }) => participantId === 'human')).toMatchObject({
      collapsed: true,
      livesLost: 1,
      pointsGained: 0,
    })
  })

  it('reprieves a tied all-player collapse and awards a unique top scorer the win', () => {
    const participants = createInitialParticipants([
      { id: 'a', name: 'A', isHuman: true },
      { id: 'b', name: 'B', isHuman: false },
    ]).map((player) => ({ ...player, lives: 1 }))
    const profile = GATES_OF_THE_EYE_PROFILES[0]!
    const sharedChoices = { a: 'door-1', b: 'door-1' }
    const tied = resolveGateRound({
      participants,
      choices: sharedChoices,
      profile,
      collapsedDoorId: 'door-1',
      roundOrdinal: 4,
      isOvertime: false,
    })
    expect(tied.winnerId).toBeNull()
    expect(tied.reprievedIds).toEqual(['a', 'b'])
    expect(tied.participants.map(({ lives }) => lives)).toEqual([1, 1])

    const leadingParticipants = participants.map((player) =>
      player.id === 'b' ? { ...player, score: 1 } : player
    )
    const awarded = resolveGateRound({
      participants: leadingParticipants,
      choices: sharedChoices,
      profile,
      collapsedDoorId: 'door-1',
      roundOrdinal: 4,
      isOvertime: false,
    })
    expect(awarded.winnerId).toBe('b')
    expect(awarded.participants.map(({ lives }) => lives)).toEqual([0, 0])
  })

  it('gives AI rivals distinct styles that produce varied choices', () => {
    const participants = createInitialParticipants([
      { id: 'human', name: 'You', isHuman: true },
      { id: 'one', name: 'AI 1', isHuman: false },
      { id: 'two', name: 'AI 2', isHuman: false },
      { id: 'three', name: 'AI 3', isHuman: false },
    ])
    const rivals = participants.filter((player) => !player.isHuman)
    expect(new Set(rivals.map(({ aiStyle }) => aiStyle)).size).toBe(3)
    const profile = GATES_OF_THE_EYE_PROFILES[0]!
    let variedRounds = 0
    for (let seed = 1; seed <= 64; seed += 1) {
      const choices = rivals.map((participant) =>
        chooseAiDoor({
          participant,
          activeParticipants: participants,
          profile,
          roundOrdinal: 3,
          rng: mulberry32(chooseRoundSeed(seed, 3, participant.id)),
        })
      )
      if (new Set(choices).size > 1) variedRounds += 1
    }
    expect(variedRounds).toBeGreaterThan(0)
  })
})

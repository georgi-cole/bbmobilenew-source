import { mulberry32 } from '../../store/rng'

export const GATES_OF_THE_EYE_DOORS = 4
export const GATES_OF_THE_EYE_LIVES = 3
export const GATES_OF_THE_EYE_ROUNDS = 10

export interface DoorOffer {
  id: string
  points: number
  collapseChance: number
}

export interface DoorProfile {
  id: string
  doors: readonly DoorOffer[]
}

export interface GateParticipant {
  id: string
  name: string
  isHuman: boolean
  avatar?: string
  score: number
  lives: number
  streak: number
  aiStyle: GateAiStyle | null
  eliminatedRound: number | null
}

export type GateAiStyle = 'guardian' | 'analyst' | 'opportunist'

const AI_STYLES: readonly GateAiStyle[] = ['guardian', 'analyst', 'opportunist']

export interface CrossingResult {
  participantId: string
  doorId: string
  collapsed: boolean
  basePointsGained: number
  pointsGained: number
  streakAfter: number
  streakBonusPercent: number
  livesLost: number
}

export interface RoundResolution {
  participants: GateParticipant[]
  crossings: CrossingResult[]
  collapsedDoorId: string
  reprievedIds: string[]
  winnerId: string | null
  roundLabel: string
}

/**
 * A profile is a fresh set of offers for one round. Door IDs identify the four
 * positions for the reveal animation only; reward and risk are redrawn per profile.
 */
export const GATES_OF_THE_EYE_PROFILES: readonly DoorProfile[] = [
  {
    id: 'first-light',
    doors: [
      { id: 'door-1', points: 16, collapseChance: 10 },
      { id: 'door-2', points: 20, collapseChance: 15 },
      { id: 'door-3', points: 27, collapseChance: 25 },
      { id: 'door-4', points: 42, collapseChance: 50 },
    ],
  },
  {
    id: 'golden-echo',
    doors: [
      { id: 'door-1', points: 27, collapseChance: 5 },
      { id: 'door-2', points: 34, collapseChance: 20 },
      { id: 'door-3', points: 43, collapseChance: 45 },
      { id: 'door-4', points: 36, collapseChance: 30 },
    ],
  },
  {
    id: 'deep-current',
    doors: [
      { id: 'door-1', points: 24, collapseChance: 15 },
      { id: 'door-2', points: 30, collapseChance: 20 },
      { id: 'door-3', points: 39, collapseChance: 25 },
      { id: 'door-4', points: 48, collapseChance: 40 },
    ],
  },
  {
    id: 'thin-ice',
    doors: [
      { id: 'door-1', points: 12, collapseChance: 8 },
      { id: 'door-2', points: 19, collapseChance: 17 },
      { id: 'door-3', points: 30, collapseChance: 30 },
      { id: 'door-4', points: 43, collapseChance: 45 },
    ],
  },
  {
    id: 'sunken-crown',
    doors: [
      { id: 'door-1', points: 18, collapseChance: 10 },
      { id: 'door-2', points: 28, collapseChance: 20 },
      { id: 'door-3', points: 42, collapseChance: 30 },
      { id: 'door-4', points: 56, collapseChance: 40 },
    ],
  },
  {
    id: 'quiet-storm',
    doors: [
      { id: 'door-1', points: 24, collapseChance: 10 },
      { id: 'door-2', points: 29, collapseChance: 15 },
      { id: 'door-3', points: 40, collapseChance: 30 },
      { id: 'door-4', points: 55, collapseChance: 45 },
    ],
  },
  {
    id: 'broken-orbit',
    doors: [
      { id: 'door-1', points: 40, collapseChance: 5 },
      { id: 'door-2', points: 45, collapseChance: 20 },
      { id: 'door-3', points: 50, collapseChance: 35 },
      { id: 'door-4', points: 55, collapseChance: 40 },
    ],
  },
  {
    id: 'blue-flame',
    doors: [
      { id: 'door-1', points: 17, collapseChance: 5 },
      { id: 'door-2', points: 22, collapseChance: 15 },
      { id: 'door-3', points: 35, collapseChance: 30 },
      { id: 'door-4', points: 49, collapseChance: 50 },
    ],
  },
  {
    id: 'last-lantern',
    doors: [
      { id: 'door-1', points: 20, collapseChance: 10 },
      { id: 'door-2', points: 29, collapseChance: 20 },
      { id: 'door-3', points: 45, collapseChance: 25 },
      { id: 'door-4', points: 62, collapseChance: 45 },
    ],
  },
  {
    id: 'eye-of-ash',
    doors: [
      { id: 'door-1', points: 25, collapseChance: 5 },
      { id: 'door-2', points: 40, collapseChance: 20 },
      { id: 'door-3', points: 42, collapseChance: 25 },
      { id: 'door-4', points: 48, collapseChance: 50 },
    ],
  },
]

export function hashSeed(seed: number, value: string): number {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  }
  return hash >>> 0
}

export function getShuffledProfiles(seed: number): DoorProfile[] {
  const profiles = [...GATES_OF_THE_EYE_PROFILES]
  const rng = mulberry32(hashSeed(seed, 'gates-profiles'))
  for (let index = profiles.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[profiles[index], profiles[swapIndex]] = [profiles[swapIndex]!, profiles[index]!]
  }
  return profiles
}

export function getProfileForRound(
  profiles: readonly DoorProfile[],
  roundOrdinal: number
): DoorProfile {
  const index = (roundOrdinal - 1) % profiles.length
  return profiles[index]!
}

export function validateDoorProfile(profile: DoorProfile): boolean {
  return (
    profile.doors.length === GATES_OF_THE_EYE_DOORS &&
    new Set(profile.doors.map((door) => door.id)).size === GATES_OF_THE_EYE_DOORS &&
    profile.doors.every(
      (door) =>
        Number.isInteger(door.points) &&
        door.points > 0 &&
        Number.isInteger(door.collapseChance) &&
        door.collapseChance > 0
    ) &&
    profile.doors.reduce((total, door) => total + door.collapseChance, 0) === 100
  )
}

/** The second consecutive safe crossing earns +10%; every later one adds 5%. */
export function getStreakBonusPercent(streakAfterCrossing: number): number {
  const completedStreak = Number.isFinite(streakAfterCrossing)
    ? Math.max(0, Math.floor(streakAfterCrossing))
    : 0
  return completedStreak < 2 ? 0 : 10 + (completedStreak - 2) * 5
}

export function getStreakReward(points: number, streakAfterCrossing: number): number {
  const bonusPercent = getStreakBonusPercent(streakAfterCrossing)
  return points + Math.round((points * bonusPercent) / 100)
}

/** One unbiased integer draw in 1..100 selects exactly one shared collapsing door. */
export function drawCollapsingDoor(profile: DoorProfile, rng: () => number): string {
  if (!validateDoorProfile(profile)) throw new Error(`Invalid door profile: ${profile.id}`)
  const roll = Math.floor(rng() * 100) + 1
  let cumulativeChance = 0
  for (const door of profile.doors) {
    cumulativeChance += door.collapseChance
    if (roll <= cumulativeChance) return door.id
  }
  throw new Error(`Collapse roll out of range: ${roll}`)
}

export function chooseAiDoor(options: {
  participant: GateParticipant
  activeParticipants: readonly GateParticipant[]
  profile: DoorProfile
  roundOrdinal: number
  rng: () => number
}): string {
  const { participant, activeParticipants, profile, roundOrdinal, rng } = options
  const leaderScore = Math.max(...activeParticipants.map((player) => player.score))
  const scoreGap = participant.score - leaderScore
  const roundsLeft = Math.max(0, GATES_OF_THE_EYE_ROUNDS - roundOrdinal)
  const profiles = {
    guardian: {
      lifeValue: 1.42,
      streakValue: 1.45,
      comeback: 0.38,
      exploration: [0.76, 0.2, 0.04],
      noise: 3.2,
    },
    analyst: {
      lifeValue: 1.08,
      streakValue: 1.2,
      comeback: 0.85,
      exploration: [0.82, 0.16, 0.02],
      noise: 1.25,
    },
    opportunist: {
      lifeValue: 0.68,
      streakValue: 0.62,
      comeback: 1.45,
      exploration: [0.58, 0.29, 0.13],
      noise: 3.8,
    },
  } as const
  const style = profiles[participant.aiStyle ?? 'analyst']
  const lifeCost =
    (7 + (GATES_OF_THE_EYE_LIVES - participant.lives) * 13 + roundsLeft * 1.3) * style.lifeValue
  const comebackPressure =
    scoreGap < 0
      ? Math.min(16, Math.abs(scoreGap) / 8 + (roundsLeft === 0 ? 8 : 0)) * style.comeback
      : 0

  const ranked = profile.doors
    .map((door) => {
      const risk = door.collapseChance / 100
      const nextStreak = participant.streak + 1
      const expectedPoints = getStreakReward(door.points, nextStreak) * (1 - risk)
      const streakProtection =
        participant.streak > 0
          ? (4 + getStreakBonusPercent(participant.streak) * 0.45) * style.streakValue
          : 0
      const survivalCost = risk * Math.max(1, lifeCost + streakProtection - comebackPressure)
      const noise = (rng() - 0.5) * style.noise
      return { id: door.id, value: expectedPoints - survivalCost + noise }
    })
    .sort((left, right) => right.value - left.value)

  // Each rival has a recognizable decision style and a different mistake rate.
  // Even the analyst explores alternatives, so the public odds do not create a
  // perfect, unbeatable opponent.
  const roll = rng()
  let cumulativeChance = 0
  for (let index = 0; index < style.exploration.length; index += 1) {
    cumulativeChance += style.exploration[index]!
    if (roll < cumulativeChance && ranked[index]) return ranked[index]!.id
  }
  return ranked[0]!.id
}

export function resolveGateRound(options: {
  participants: readonly GateParticipant[]
  choices: Readonly<Record<string, string>>
  profile: DoorProfile
  collapsedDoorId: string
  roundOrdinal: number
  isOvertime: boolean
}): RoundResolution {
  const { participants, choices, profile, collapsedDoorId, roundOrdinal, isOvertime } = options
  const active = participants.filter((player) => player.lives > 0)
  const activeIds = new Set(active.map((player) => player.id))
  const crossingById = new Map<string, CrossingResult>()
  const updated = participants.map((player) => {
    if (!activeIds.has(player.id)) return player
    const doorId = choices[player.id]
    const door = profile.doors.find((offer) => offer.id === doorId)
    if (!door) throw new Error(`Missing valid gate choice for ${player.id}`)
    const collapsed = doorId === collapsedDoorId
    const streakAfter = collapsed ? 0 : player.streak + 1
    const bonusPercent = getStreakBonusPercent(streakAfter)
    const basePointsGained = collapsed ? 0 : door.points
    const result: CrossingResult = {
      participantId: player.id,
      doorId,
      collapsed,
      basePointsGained,
      pointsGained: collapsed ? 0 : getStreakReward(door.points, streakAfter),
      streakAfter,
      streakBonusPercent: bonusPercent,
      livesLost: collapsed ? 1 : 0,
    }
    crossingById.set(player.id, result)
    return {
      ...player,
      score: player.score + result.pointsGained,
      lives: player.lives - result.livesLost,
      streak: streakAfter,
      eliminatedRound: collapsed && player.lives === 1 ? roundOrdinal : player.eliminatedRound,
    }
  })

  const stillAlive = updated.filter((player) => activeIds.has(player.id) && player.lives > 0)
  let reprievedIds: string[] = []
  let winnerId: string | null = null

  if (stillAlive.length === 0) {
    const highestScore = Math.max(
      ...active.map((player) => updated.find((entry) => entry.id === player.id)!.score)
    )
    const highestIds = active
      .filter((player) => updated.find((entry) => entry.id === player.id)!.score === highestScore)
      .map((player) => player.id)
    if (highestIds.length === 1) {
      winnerId = highestIds[0]!
    } else {
      reprievedIds = active.map((player) => player.id)
      const activeIdSet = new Set(reprievedIds)
      for (let index = 0; index < updated.length; index += 1) {
        const player = updated[index]!
        if (activeIdSet.has(player.id)) {
          updated[index] = { ...player, lives: 1, eliminatedRound: null }
        }
      }
    }
  } else if (stillAlive.length === 1) {
    winnerId = stillAlive[0]!.id
  } else if (roundOrdinal >= GATES_OF_THE_EYE_ROUNDS || isOvertime) {
    const highestScore = Math.max(...stillAlive.map((player) => player.score))
    const highest = stillAlive.filter((player) => player.score === highestScore)
    if (highest.length === 1) winnerId = highest[0]!.id
  }

  return {
    participants: updated,
    crossings: [...crossingById.values()],
    collapsedDoorId,
    reprievedIds,
    winnerId,
    roundLabel: isOvertime
      ? `Overtime ${roundOrdinal - GATES_OF_THE_EYE_ROUNDS}`
      : `Round ${roundOrdinal}`,
  }
}

export function createInitialParticipants(
  input?: Array<{
    id: string
    name: string
    isHuman: boolean
    avatar?: string
  }>
): GateParticipant[] {
  const source = input?.length
    ? input
    : [
        { id: 'human', name: 'You', isHuman: true },
        { id: 'mira', name: 'Mira', isHuman: false },
        { id: 'alex', name: 'Alex', isHuman: false },
        { id: 'nina', name: 'Nina', isHuman: false },
      ]
  const firstHumanIndex = source.findIndex((participant) => participant.isHuman)
  let aiIndex = 0
  return source.map((participant, index) => {
    const isHuman = firstHumanIndex < 0 ? index === 0 : index === firstHumanIndex
    const aiStyle = isHuman ? null : AI_STYLES[aiIndex++ % AI_STYLES.length]!
    return {
      ...participant,
      isHuman,
      score: 0,
      lives: GATES_OF_THE_EYE_LIVES,
      streak: 0,
      aiStyle,
      eliminatedRound: null,
    }
  })
}

export function rankGateParticipants(
  participants: readonly GateParticipant[],
  winnerId: string
): GateParticipant[] {
  return [...participants].sort((left, right) => {
    if (left.id === winnerId) return -1
    if (right.id === winnerId) return 1
    const leftAlive = left.lives > 0
    const rightAlive = right.lives > 0
    if (leftAlive !== rightAlive) return leftAlive ? -1 : 1
    if (!leftAlive && left.eliminatedRound !== right.eliminatedRound) {
      return (right.eliminatedRound ?? 0) - (left.eliminatedRound ?? 0)
    }
    return (
      right.score - left.score || right.lives - left.lives || left.name.localeCompare(right.name)
    )
  })
}

export function chooseRoundSeed(seed: number, roundOrdinal: number, stream: string): number {
  return hashSeed(seed ^ Math.imul(roundOrdinal, 0x9e3779b1), stream)
}

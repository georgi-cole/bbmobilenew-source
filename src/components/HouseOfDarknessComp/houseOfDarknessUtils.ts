import { mulberry32 } from '../../store/rng'

export const HOUSE_OF_DARKNESS_STARTING_HEALTH = 100
export const HOUSE_OF_DARKNESS_BASE_PAIRS = 4
export const HOUSE_OF_DARKNESS_MAX_ROUNDS = 6
export const HOUSE_OF_DARKNESS_COLUMNS = 4
export const HOUSE_OF_DARKNESS_HEAL_RATE = 0.2
export const HOUSE_OF_DARKNESS_MAX_CURSE_CHARGES = 4

export type HouseOfDarknessCharmId =
  | 'heal'
  | 'shield'
  | 'bargain'
  | 'peek'
  | 'curse'
  | 'cleanse'
  | 'last-chance'
export type HouseOfDarknessOmenId = 'blood-moon' | 'veiled-mirror' | 'open-grave'

export interface HouseOfDarknessCharm {
  id: HouseOfDarknessCharmId
  name: string
  description: string
}

export const HOUSE_OF_DARKNESS_CHARMS: HouseOfDarknessCharm[] = [
  { id: 'heal', name: 'Heal', description: 'Restore 8 lifespan after surviving the board.' },
  {
    id: 'shield',
    name: 'Shield',
    description: 'Reduce each of your first 2 mistakes by up to 5 damage.',
  },
  {
    id: 'bargain',
    name: 'Bargain',
    description: 'Restore 14 after surviving; each mistake deals 3 extra damage.',
  },
  {
    id: 'peek',
    name: 'Peek',
    description: 'Privately reveal one hidden card for a moment this board.',
  },
  {
    id: 'curse',
    name: 'Curse',
    description: 'Choose a rival; their next 2 mistakes deal 4 extra damage.',
  },
  { id: 'cleanse', name: 'Cleanse', description: 'Remove all queued Curse charges from yourself.' },
  {
    id: 'last-chance',
    name: 'Last Chance',
    description: 'Survive one lethal mistake at 1 lifespan; this board gives no recovery.',
  },
]

export const HOUSE_OF_DARKNESS_SYMBOLS = [
  '🕯️',
  '🦇',
  '💀',
  '🕸️',
  '🧿',
  '🪦',
  '🗝️',
  '🩸',
  '👁️',
  '🦴',
  '🐦‍⬛',
  '🌑',
  '🪬',
  '⚰️',
  '🕷️',
] as const

export interface HouseOfDarknessCard {
  index: number
  symbol: string
  isFlipped: boolean
  isMatched: boolean
  isMismatch: boolean
  isPlaceholder: boolean
  portraitPlayerId?: string
  portraitName?: string
  portraitAvatar?: string
  portraitBadge?: string
}

export interface DamageResolution {
  health: number
  /** Actual lifespan lost after prevention and Last Chance. */
  damage: number
  lethalMistakeIndex: number | null
  bonusMistakesConsumed: number
  curseChargesConsumed: number
  shieldBlocksConsumed: number
  blockedDamage: number
  lastChanceUsed: boolean
}

export interface CharmOfferContext {
  aliveCount?: number
  lowHealthPresent?: boolean
  queuedCursePresent?: boolean
  mode?: 'depth' | 'endless'
  round?: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function shuffle<T>(values: T[], rng: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!]
  }
  return values
}

export function hashHouseOfDarknessId(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function getHouseOfDarknessPairCount(round: number): number {
  return Math.min(8, HOUSE_OF_DARKNESS_BASE_PAIRS + Math.max(0, round - 1))
}

export function getHouseOfDarknessCharmOffers(
  seed: number,
  round: number,
  context: CharmOfferContext = {}
): HouseOfDarknessCharm[] {
  const rng = mulberry32((seed ^ Math.imul(round, 0x27d4eb2d) ^ 0x6d2b79f5) >>> 0)
  const charmById = new Map(HOUSE_OF_DARKNESS_CHARMS.map((charm) => [charm.id, charm]))
  const sustain = shuffle(['heal', 'bargain'] as HouseOfDarknessCharmId[], rng)[0]!
  const lastChanceEligible = context.lowHealthPresent ?? false
  const protection = shuffle(
    (lastChanceEligible ? ['shield', 'last-chance'] : ['shield']) as HouseOfDarknessCharmId[],
    rng
  )[0]!
  const tacticalPool: HouseOfDarknessCharmId[] = ['peek']
  const aliveCount = context.aliveCount ?? Number.POSITIVE_INFINITY
  const isDepthFinalBoard =
    (context.mode ?? 'depth') === 'depth' &&
    (context.round ?? round) >= HOUSE_OF_DARKNESS_MAX_ROUNDS
  if (aliveCount <= 4 && !isDepthFinalBoard) tacticalPool.push('curse')
  if (context.queuedCursePresent) tacticalPool.push('cleanse')
  const tactical = shuffle(tacticalPool, rng)[0]!
  return [sustain, protection, tactical].map((id) => charmById.get(id)!)
}

export function getHouseOfDarknessOmen(
  round: number,
  sessionSeed = 0
): {
  id: HouseOfDarknessOmenId
  name: string
  description: string
  damageBonus: number
  firstMistakeBonus: number
  recoveryBonus: number
} {
  const omens = shuffle(
    [
      {
        id: 'blood-moon' as const,
        name: 'Blood Moon',
        description: 'Every mistake deals 2 extra damage.',
        damageBonus: 2,
        firstMistakeBonus: 0,
        recoveryBonus: 0,
      },
      {
        id: 'veiled-mirror' as const,
        name: 'Veiled Mirror',
        description: 'Your first mistake deals 6 extra damage.',
        damageBonus: 0,
        firstMistakeBonus: 6,
        recoveryBonus: 0,
      },
      {
        id: 'open-grave' as const,
        name: 'Open Grave',
        description: 'Surviving the board restores 6 extra lifespan.',
        damageBonus: 0,
        firstMistakeBonus: 0,
        recoveryBonus: 6,
      },
    ],
    mulberry32((sessionSeed ^ 0x94d049bb) >>> 0)
  )
  return omens[(Math.max(1, round) - 1) % omens.length]!
}

export function getHouseOfDarknessPlaceholderCount(
  pairCount: number,
  columns: number = HOUSE_OF_DARKNESS_COLUMNS
): number {
  const playableCards = pairCount * 2
  return (columns - (playableCards % columns)) % columns
}

export function buildHouseOfDarknessBoard(
  seed: number,
  pairCount: number,
  columns: number = HOUSE_OF_DARKNESS_COLUMNS
): HouseOfDarknessCard[] {
  if (pairCount > HOUSE_OF_DARKNESS_SYMBOLS.length) {
    throw new Error(
      `HouseOfDarkness: ${pairCount} pairs requested, but only ${HOUSE_OF_DARKNESS_SYMBOLS.length} symbols exist.`
    )
  }
  const rng = mulberry32((seed ^ Math.imul(pairCount, 0x9e3779b9) ^ 0x6d2b79f5) >>> 0)
  const selected = HOUSE_OF_DARKNESS_SYMBOLS.slice(0, pairCount)
  const symbols = shuffle([...selected, ...selected], rng)
  const playableCards = symbols.map((symbol, index) => ({
    index,
    symbol,
    isFlipped: false,
    isMatched: false,
    isMismatch: false,
    isPlaceholder: false,
  }))
  const placeholders = Array.from(
    { length: getHouseOfDarknessPlaceholderCount(pairCount, columns) },
    (_, offset) => ({
      index: playableCards.length + offset,
      symbol: '',
      isFlipped: false,
      isMatched: false,
      isMismatch: false,
      isPlaceholder: true,
    })
  )
  return [...playableCards, ...placeholders]
}

export function getHouseOfDarknessMistakeDamage(
  sessionSeed: number,
  playerId: string,
  round: number,
  mistakeIndex: number,
  damageBonus = 0
): number {
  const rng = mulberry32(
    (sessionSeed ^
      hashHouseOfDarknessId(playerId) ^
      Math.imul(round, 0x85ebca6b) ^
      Math.imul(mistakeIndex + 1, 0xc2b2ae35)) >>>
      0
  )
  return Math.max(1, 3 + Math.max(0, round - 1) + Math.floor(rng() * 3) + damageBonus)
}

export function applyHouseOfDarknessMistakes(params: {
  health: number
  sessionSeed: number
  playerId: string
  round: number
  mistakeStartIndex: number
  mistakeCount: number
  damageBonus?: number
  firstMistakeBonus?: number
  /** Kept as an alias for old saved/dev callers. */
  bonusMistakeCount?: number
  curseCharges?: number
  shieldBlocks?: number
  lastChanceAvailable?: boolean
  lastChanceAlreadyUsed?: boolean
}): DamageResolution {
  const damageBonus = params.damageBonus ?? 0
  const firstMistakeBonus = params.firstMistakeBonus ?? 0
  const curseCharges = Math.max(0, params.curseCharges ?? params.bonusMistakeCount ?? 0)
  const shieldBlocks = Math.max(0, params.shieldBlocks ?? 0)
  let health = roundToOneDecimal(clamp(params.health, 0, HOUSE_OF_DARKNESS_STARTING_HEALTH))
  let damage = 0
  let blockedDamage = 0
  let curseChargesConsumed = 0
  let shieldBlocksConsumed = 0
  let lastChanceUsed = false
  let lethalMistakeIndex: number | null = null

  for (let offset = 0; offset < Math.max(0, params.mistakeCount); offset += 1) {
    const absoluteMistakeIndex = params.mistakeStartIndex + offset
    const curseApplies = curseChargesConsumed < curseCharges
    let hit = getHouseOfDarknessMistakeDamage(
      params.sessionSeed,
      params.playerId,
      params.round,
      absoluteMistakeIndex,
      damageBonus + (offset === 0 ? firstMistakeBonus : 0) + (curseApplies ? 4 : 0)
    )
    if (curseApplies) curseChargesConsumed += 1
    if (shieldBlocksConsumed < shieldBlocks) {
      const prevented = Math.min(5, Math.max(0, hit - 1))
      hit -= prevented
      blockedDamage += prevented
      shieldBlocksConsumed += 1
    }

    if (
      hit >= health &&
      params.lastChanceAvailable &&
      !params.lastChanceAlreadyUsed &&
      !lastChanceUsed
    ) {
      const actualLoss = Math.max(0, roundToOneDecimal(health - 1))
      damage += actualLoss
      health = 1
      lastChanceUsed = true
      continue
    }

    damage += Math.min(health, hit)
    health = roundToOneDecimal(Math.max(0, health - hit))
    if (health <= 0) {
      lethalMistakeIndex = absoluteMistakeIndex
      break
    }
  }
  return {
    health,
    damage: roundToOneDecimal(damage),
    lethalMistakeIndex,
    bonusMistakesConsumed: curseChargesConsumed,
    curseChargesConsumed,
    shieldBlocksConsumed,
    blockedDamage: roundToOneDecimal(blockedDamage),
    lastChanceUsed,
  }
}

export function recoverHouseOfDarknessHealth(
  healthAfterDamage: number,
  damageTakenThisRound: number,
  completedBoard: boolean,
  flatRecovery = 0,
  recoveryAllowed = true
): number {
  if (!completedBoard || healthAfterDamage <= 0 || !recoveryAllowed) {
    return roundToOneDecimal(clamp(healthAfterDamage, 0, HOUSE_OF_DARKNESS_STARTING_HEALTH))
  }
  const recovered =
    (damageTakenThisRound > 0 ? damageTakenThisRound * HOUSE_OF_DARKNESS_HEAL_RATE : 0) +
    flatRecovery
  return roundToOneDecimal(
    clamp(healthAfterDamage + recovered, 0, HOUSE_OF_DARKNESS_STARTING_HEALTH)
  )
}

export function formatHouseOfDarknessHealth(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

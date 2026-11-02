import type { GameState, Player } from '../../types'
export const exitTracker: { update(game: GameState): void }
export function requestAmbush(effect: () => void): boolean

interface CeremonyPlayer {
  id: string
  name?: string
  avatar?: string
  isUser?: boolean
}
interface CeremonyGame {
  players: CeremonyPlayer[]
  mode?: string
  lohId?: string | null
  posWinnerId?: string | null
  nomineeIds?: string[]
  cupidArrow?: { status?: string; pendingPartnerEvictionId?: string | null }
  voxPopuli?: { status?: string }
}
interface CeremonyCharacter {
  id: string
  name: string
  [key: string]: unknown
}
export function ceremonyCast(
  scene: string,
  props: Record<string, unknown>,
  game: CeremonyGame,
  catalog: CeremonyCharacter[]
): Record<string, (CeremonyCharacter & { playerId: string }) | null> | null
export function modeDetails(
  scene: string,
  props: Record<string, unknown>,
  game: CeremonyGame
): Record<string, unknown>

interface IntroState {
  game: {
    gameId?: string
    seed?: number
    season?: number
    week: number
    battleBack?: {
      weekDecided?: number | null
      candidates?: string[]
      winnerId?: string | null
      attemptIndex?: number
    }
  }
  profiles?: { activeProfileId?: string | null; isGuest?: boolean }
}
export function createBattleBackIntroGuard(): {
  shouldSkip(state: IntroState, key: string): boolean
  mark(state: IntroState, key: string): void
}
export function shouldPlayCinematic(
  state: {
    game?: { mode?: string }
    settings: {
      gameUX: { animations: boolean; animationMode?: string }
      display: { reduceMotion?: boolean }
    }
  },
  vip: boolean
): boolean
export function createCeremonyQueue(): {
  acquire(start: () => void, priority?: number, onError?: (error: unknown) => void): () => void
  subscribe(listener: () => void): () => void
  counts: { active: number; queued: number }
}
export const ceremonyQueue: ReturnType<typeof createCeremonyQueue>

export interface CeremonyCrownAnchor {
  x: number
  baseY: number
  width: number
  angle: number
}

export interface CeremonyCharacterArt {
  id: string
  name: string
  poses: Record<
    string,
    {
      src: string
      width: number
      height: number
      feetY: number
      crown?: CeremonyCrownAnchor
    }
  >
}

export function findArt(
  player: Player,
  catalog: CeremonyCharacterArt[]
): CeremonyCharacterArt | null

export function isCinematicSceneAllowed(
  game: {
    mode?: string
    voxPopuli?: { status?: string }
    cupidArrow?: { status?: string; pendingPartnerEvictionId?: string | null }
  },
  scene: string | null,
  shockKey?: string
): boolean

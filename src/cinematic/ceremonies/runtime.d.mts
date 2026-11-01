import type { GameState, Player } from '../../types'
export const exitTracker: { update(game: GameState): void }
export function requestAmbush(effect: () => void): boolean

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

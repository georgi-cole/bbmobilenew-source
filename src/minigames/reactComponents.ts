// MODULE: src/minigames/reactComponents.ts
// Registry map of reactComponentKey → React component for React-implemented minigames.
//
// MinigameHost uses this map to generically mount any game whose registry entry
// has  implementation: 'react'  and a  reactComponentKey  that is NOT already
// handled by a dedicated special-case branch (e.g. ClosestWithoutGoingOver,
// HoldTheWall, BiographyBlitz).
//
// Component contract for generic mounting
// ─────────────────────────────────────────
// Each component in this map must accept (at minimum):
//   onFinish?: (
//                value: number,
//                tiebreakerMs?: number,
//                completion?: {
//                  authoritativeWinnerId?: string | null,
//                  authoritativeLastPlaceId?: string | null,
//                  rawValue?: number,
//                  rawResults?: Record<string, number>,
//                  tiebreakerMs?: number,
//                },
//              ) => void
//                        — called with the final score; tiebreakerMs is an
//                          optional secondary sort key (lower = faster = better),
//                          completion.authoritativeWinnerId preserves a
//                          minigame-declared winner and last place preserve the
//                          shared competition-retry gate through MinigameHost, and
//                          rawValue/rawResults carry authoritative result data
//   seed?: number        — competition seed forwarded from gameOptions.seed
//   autoStart?: boolean  — when true the game begins immediately on mount

import type { ComponentType, LazyExoticComponent } from 'react'
import { lazyWithChunkRecovery } from '../utils/lazyWithChunkRecovery'
import type { RelationshipsMap } from '../social/types'
import type { StrategicAllianceSnapshot } from '../types'

/**
 * Minimal prop contract shared by all generic React minigame components.
 * Components mounted through this map must accept onFinish so that the
 * final score value can be forwarded to MinigameHost's results screen.
 * seed and autoStart are forwarded from the host's gameOptions so that
 * seeded-RNG games start deterministically without an extra user click.
 */
export interface GenericMinigameProps {
  onFinish?: (
    value: number,
    tiebreakerMs?: number,
    completion?: {
      authoritativeWinnerId?: string | null
      authoritativeWinnerIds?: string[]
      authoritativeLastPlaceId?: string | null
      authoritativeRankedIds?: string[]
      rawValue?: number
      rawResults?: Record<string, number>
      tiebreakerMs?: number
      batteryLowVoteEffects?: Record<string, 'doubleVote' | 'skipVote'>
    }
  ) => void
  /** Deterministic competition seed forwarded from gameOptions.seed. */
  seed?: number
  /** When true the game starts immediately on mount (no Start button needed). */
  autoStart?: boolean
  /** Host-selected VIP visual treatment; it must not change game state or RNG. */
  premiumPresentation?: boolean
  /** Development-only phase preview for the portrait finale stages. */
  previewStage?: 'final' | 'round6' | 'final2'
  /** Capitalization only: selects standard LOH or Back 2 the Game rules. */
  context?: 'loh' | 'battleBack'
  /** Battery Low only: enable one-shot vote effects in compatible weekly formats. */
  voteEffectsEnabled?: boolean
  /** Authoritative participant ids forwarded from MinigameHost for hosted competitions. */
  participantIds?: string[]
  /** Full participant records forwarded when a game needs names/AI scoreboard data. */
  participants?: Array<{
    id: string
    name: string
    isHuman: boolean
    avatar?: string
    precomputedScore: number
    previousPR: number | null
  }>
  /** Relationship state used by games with social target selection. */
  relationships?: RelationshipsMap
  /** Current alliances and pacts for strategic targeting. */
  alliances?: StrategicAllianceSnapshot[]
}

type LazyGenericMinigame = LazyExoticComponent<ComponentType<GenericMinigameProps>> & {
  preload: () => Promise<void>
}

function lazyMinigame(loader: () => Promise<unknown>): LazyGenericMinigame {
  return lazyWithChunkRecovery<GenericMinigameProps>(
    async () => (await loader()) as { default: ComponentType<GenericMinigameProps> }
  ) as LazyGenericMinigame
}

const reactComponents: Record<string, LazyGenericMinigame> = {
  TiltedLedge: lazyMinigame(() => import('../components/TiltedLedge/TiltedLedge')),
  ClosestWithoutGoingOver: lazyMinigame(() => import('../components/ClosestWithoutGoingOverComp')),
  HoldTheWall: lazyMinigame(() => import('../components/HoldTheWallComp/HoldTheWallComp')),
  CastleRescue: lazyMinigame(() =>
    import('./castleRescue/CastleRescueGame').then(({ default: CastleRescueGame }) => ({
      default: CastleRescueGame as ComponentType<GenericMinigameProps>,
    }))
  ),
  CastleRescue2: lazyMinigame(() =>
    import('./castleRescue/CastleRescueGame').then(({ BennyLennyCastleRescueGame }) => ({
      default: BennyLennyCastleRescueGame as ComponentType<GenericMinigameProps>,
    }))
  ),
  CastleRescueRemastered: lazyMinigame(() =>
    import('./castleRescue/RemasteredCastleRescueGames').then(({ RemasteredCastleRescueGame }) => ({
      default: RemasteredCastleRescueGame as ComponentType<GenericMinigameProps>,
    }))
  ),
  CastleRescue2Remastered: lazyMinigame(() =>
    import('./castleRescue/RemasteredCastleRescueGames').then(
      ({ RemasteredBennyLennyCastleRescueGame }) => ({
        default: RemasteredBennyLennyCastleRescueGame as ComponentType<GenericMinigameProps>,
      })
    )
  ),
  QuickTapRace: lazyMinigame(() => import('./quickTapRace/QuickTapRaceCanvasGame')),
  QuickTapSeasons: lazyMinigame(() => import('../screens/QuickTapSeasons/QuickTapSeasons')),
  LaneRacers: lazyMinigame(() => import('./laneRacers/LaneRacersCanvasGame')),
  TravelingDots: lazyMinigame(() => import('../components/TravelingDots/TravelingDots')),
  EstimationGame: lazyMinigame(() => import('../components/EstimationGame/EstimationGame')),
  BullseyeBlitz: lazyMinigame(() => import('../components/BullseyeBlitz/BullseyeBlitz')),
  PressurePlank: lazyMinigame(() => import('../components/PressurePlank/PressurePlank')),
  ColorMatch: lazyMinigame(() => import('../components/ColorMatchComp/ColorMatchComp')),
  BoxedOut: lazyMinigame(() => import('../components/BoxedOut/BoxedOut')),
  SnakeGame: lazyMinigame(() => import('../components/SnakeGame/SnakeGame')),
  RescueTheKing: lazyMinigame(() => import('./rescueTheKing/RescueTheKingGame')),
  TrapAuction: lazyMinigame(() => import('../components/TrapAuction/TrapAuction')),
  TimingBar: lazyMinigame(() => import('../components/TimingBar/TimingBar')),
  Minesweeps: lazyMinigame(() => import('../components/Minesweeps/Minesweeps')),
  HangmanChallenge: lazyMinigame(
    () => import('../components/HangmanChallengeComp/HangmanChallengeComp')
  ),
  NumberTrivia: lazyMinigame(() => import('../components/NumberTrivia/NumberTrivia')),
  Capitalization: lazyMinigame(() => import('../components/Capitalization/Capitalization')),
  CodeBreaker: lazyMinigame(() => import('../components/CodeBreakerComp/CodeBreakerComp')),
  GridOfLuck: lazyMinigame(() => import('../components/GridOfLuck/GridOfLuck')),
  MysticChamber: lazyMinigame(() => import('../components/GridOfLuck/MysticChamber')),
  ChainOfGreed: lazyMinigame(() => import('../components/ChainOfGreed/ChainOfGreed')),
  BatteryLow: lazyMinigame(() => import('../components/VaultVerdict/VaultVerdict')),
  BigSpender: lazyMinigame(() => import('../components/BigSpender/BigSpender')),
  HouseOfDarkness: lazyMinigame(
    () => import('../components/HouseOfDarknessComp/HouseOfDarknessComp')
  ),
  FinalThreeCircuit: lazyMinigame(
    () => import('../components/FinalThreeCircuit/FinalThreeCircuit')
  ),
  DownMemoryLane: lazyMinigame(() => import('../components/DownMemoryLane/DownMemoryLane')),
}

export default reactComponents

export function preloadReactMinigame(key: string): Promise<void> {
  return reactComponents[key]?.preload() ?? Promise.resolve()
}

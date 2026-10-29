import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createHouseOfCardsAiProfiles } from '../../features/houseOfCards/houseOfCardsAi'
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin'
import { useHouseOfCardsAudio } from '../../hooks/useHouseOfCardsAudio'
import { SoundManager } from '../../services/sound/SoundManager'
import type { RelationshipsMap } from '../../social/types'
import type { StrategicAllianceSnapshot } from '../../types'
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper'
import {
  HOUSE_OF_DARKNESS_COLUMNS,
  HOUSE_OF_DARKNESS_CHARMS,
  HOUSE_OF_DARKNESS_MAX_CURSE_CHARGES,
  HOUSE_OF_DARKNESS_MAX_ROUNDS,
  HOUSE_OF_DARKNESS_STARTING_HEALTH,
  applyHouseOfDarknessMistakes,
  buildHouseOfDarknessBoard,
  formatHouseOfDarknessHealth,
  getHouseOfDarknessCharmOffers,
  getHouseOfDarknessOmen,
  getHouseOfDarknessPairCount,
  recoverHouseOfDarknessHealth,
  type HouseOfDarknessCharmId,
  type HouseOfDarknessCard,
} from './houseOfDarknessUtils'
import {
  chooseHouseOfDarknessAiCharm,
  getHouseOfDarknessAiAbility,
  simulateHouseOfDarknessAiMemory,
} from './houseOfDarknessAiBalance'
import {
  buildPortraitPairBoard,
  type HouseOfCardsPortraitPlayer,
} from '../HouseOfCardsComp/houseOfCardsUtils'
import ResolvedAvatarImage from '../ResolvedAvatarImage/ResolvedAvatarImage'
import './HouseOfDarknessComp.css'

interface ParticipantProp {
  id: string
  name: string
  isHuman: boolean
  avatar?: string
  precomputedScore?: number
  previousPR?: number | null
}

interface CompletionPayload {
  authoritativeWinnerId?: string | null
  authoritativeRankedIds?: string[]
  rawValue?: number
  rawResults?: Record<string, number>
  tiebreakerMs?: number
}

interface Props {
  participantIds?: string[]
  participants?: ParticipantProp[]
  seed?: number
  autoStart?: boolean
  premiumPresentation?: boolean
  previewStage?: 'round6' | 'final2'
  relationships?: RelationshipsMap
  alliances?: StrategicAllianceSnapshot[]
  onFinish?: (value: number, tiebreakerMs?: number, completion?: CompletionPayload) => void
}

type Phase =
  | 'mode_select'
  | 'charm_select'
  | 'playing'
  | 'round_transition'
  | 'round_results'
  | 'death'
  | 'results'
type GameMode = 'depth' | 'endless'
type RoundTransition = 'bats' | 'web'
type BoardStyle = CSSProperties & { '--hod-columns': number }
type HealthStyle = CSSProperties & { '--hod-health': string }
type CharmTransition = 'expand' | 'deal' | 'landed' | null
type CharmCloneFrame = { left: number; top: number; width: number; height: number }
type CharmFlyOffset = { fromX: number; fromY: number; scaleX: number; scaleY: number }
type CharmCloneStyle = CSSProperties & {
  '--hod-card-index': number
  '--hod-start-x': string
  '--hod-start-y': string
  '--hod-scale-x': number
  '--hod-scale-y': number
}

const CHARM_CLONE_DURATION_MS = 900
const CHARM_CLONE_STAGGER_MS = 22

const DARKNESS_CHARM_GLYPHS: Record<HouseOfDarknessCharmId, string> = {
  heal: '✚',
  shield: '⬡',
  bargain: '⇄',
  peek: '◉',
  curse: '⌘',
  cleanse: '✧',
  'last-chance': '⟡',
}

interface ContestantState {
  id: string
  health: number
  alive: boolean
  eliminatedRound: number | null
  completedRounds: number
  totalMistakes: number
  totalDamage: number
  totalTimeMs: number
  curseCharges: number
}

interface RoundResult {
  id: string
  startingHealth: number
  healthAfterDamage: number
  endingHealth: number
  damage: number
  recovered: number
  mistakes: number
  timeMs: number
  died: boolean
  charm: HouseOfDarknessCharmId
  curseTargetId?: string
  curseChargesAdded?: number
  blockedDamage: number
  lastChanceUsed: boolean
}

interface RoundSummary {
  round: number
  results: RoundResult[]
  omenId: string
  humanCharm: HouseOfDarknessCharmId
  curseTargetId?: string
}

function clampHealth(value: number): number {
  return Math.max(0, Math.min(HOUSE_OF_DARKNESS_STARTING_HEALTH, Math.round(value * 10) / 10))
}

function buildInitialContestants(ids: string[]): Record<string, ContestantState> {
  return Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        health: HOUSE_OF_DARKNESS_STARTING_HEALTH,
        alive: true,
        eliminatedRound: null,
        completedRounds: 0,
        totalMistakes: 0,
        totalDamage: 0,
        totalTimeMs: 0,
        curseCharges: 0,
      },
    ])
  )
}

function rankContestants(
  states: Record<string, ContestantState>,
  participantOrder: string[]
): ContestantState[] {
  return Object.values(states).sort((first, second) => {
    if (first.alive !== second.alive) return first.alive ? -1 : 1
    if (!first.alive && !second.alive) {
      if (first.completedRounds !== second.completedRounds)
        return second.completedRounds - first.completedRounds
      if (first.eliminatedRound !== second.eliminatedRound)
        return (second.eliminatedRound ?? 0) - (first.eliminatedRound ?? 0)
      if (first.totalTimeMs !== second.totalTimeMs) return second.totalTimeMs - first.totalTimeMs
      if (first.totalMistakes !== second.totalMistakes)
        return first.totalMistakes - second.totalMistakes
      return participantOrder.indexOf(first.id) - participantOrder.indexOf(second.id)
    }
    if (first.completedRounds !== second.completedRounds)
      return second.completedRounds - first.completedRounds
    if (first.health !== second.health) return second.health - first.health
    if (first.totalDamage !== second.totalDamage) return first.totalDamage - second.totalDamage
    if (first.totalMistakes !== second.totalMistakes)
      return first.totalMistakes - second.totalMistakes
    if (first.totalTimeMs !== second.totalTimeMs) return first.totalTimeMs - second.totalTimeMs
    return participantOrder.indexOf(first.id) - participantOrder.indexOf(second.id)
  })
}

function buildDarknessBoard(
  seed: number,
  pairCount: number,
  portraitPlayers: HouseOfCardsPortraitPlayer[],
  priorityIds: string[],
  usePortraits: boolean
): HouseOfDarknessCard[] {
  if (!usePortraits) return buildHouseOfDarknessBoard(seed, pairCount)
  return buildPortraitPairBoard(seed, pairCount, portraitPlayers, priorityIds).map((card) => ({
    index: card.index,
    symbol: card.symbol,
    isFlipped: card.isFlipped,
    isMatched: card.isMatched,
    isMismatch: card.isMismatch,
    isPlaceholder: false,
    portraitPlayerId: card.portraitPlayerId,
    portraitName: card.portraitName,
    portraitAvatar: card.portraitAvatar,
    portraitBadge: card.portraitBadge,
  }))
}

function drawDarknessCharms(
  seed: number,
  round: number,
  mode: GameMode,
  states: Record<string, ContestantState>
) {
  const living = Object.values(states).filter((state) => state.alive)
  return getHouseOfDarknessCharmOffers(seed, round, {
    aliveCount: living.length,
    lowHealthPresent: living.some((state) => state.health <= 25),
    queuedCursePresent: living.some((state) => state.curseCharges > 0),
    mode,
    round,
  })
}

export default function HouseOfDarknessComp({
  participantIds = [],
  participants,
  seed,
  premiumPresentation = false,
  previewStage,
  relationships,
  alliances,
  onFinish,
}: Props) {
  const resolvedIds = useMemo(() => {
    if (participantIds.length > 0) return participantIds
    const participantList = participants?.map((participant) => participant.id) ?? []
    return participantList.length > 0 ? participantList : ['human']
  }, [participantIds, participants])
  const humanId = useMemo(
    () => participants?.find((participant) => participant.isHuman)?.id ?? resolvedIds[0],
    [participants, resolvedIds]
  )
  const nameFor = useCallback(
    (id: string) => participants?.find((participant) => participant.id === id)?.name ?? id,
    [participants]
  )
  const portraitPlayers = useMemo<HouseOfCardsPortraitPlayer[]>(() => {
    const supplied = participants?.map(({ id, name, avatar }) => ({ id, name, avatar })) ?? []
    const roster =
      supplied.length > 0 ? supplied : resolvedIds.map((id) => ({ id, name: nameFor(id) }))
    return [...new Map(roster.map((player) => [player.id, player])).values()]
  }, [nameFor, participants, resolvedIds])
  const [sessionSeed] = useState(() => seed ?? cryptoSeed())
  const aiProfiles = useMemo(
    () => createHouseOfCardsAiProfiles(resolvedIds, humanId, sessionSeed),
    [humanId, resolvedIds, sessionSeed]
  )

  const [phase, setPhase] = useState<Phase>('mode_select')
  const [gameMode, setGameMode] = useState<GameMode>('depth')
  const [selectedCharm, setSelectedCharm] = useState<HouseOfDarknessCharmId | null>(null)
  const [charmTransition, setCharmTransition] = useState<CharmTransition>(null)
  const [charmCloneFrame, setCharmCloneFrame] = useState<CharmCloneFrame | null>(null)
  const [charmFlyOffsets, setCharmFlyOffsets] = useState<CharmFlyOffset[]>([])
  const [selectedCurseTarget, setSelectedCurseTarget] = useState<string | null>(null)
  const [peekArmed, setPeekArmed] = useState(false)
  const [peekUsed, setPeekUsed] = useState(false)
  const [round, setRound] = useState(1)
  const [contestants, setContestants] = useState<Record<string, ContestantState>>(() =>
    buildInitialContestants(resolvedIds)
  )
  const [charmOffers, setCharmOffers] = useState(() =>
    drawDarknessCharms(sessionSeed, 1, 'depth', buildInitialContestants(resolvedIds))
  )
  const [board, setBoard] = useState<HouseOfDarknessCard[]>(() =>
    buildHouseOfDarknessBoard(sessionSeed, getHouseOfDarknessPairCount(1))
  )
  const [flippedIndices, setFlippedIndices] = useState<number[]>([])
  const [locked, setLocked] = useState(false)
  const [matchedPairs, setMatchedPairs] = useState(0)
  const [roundMistakes, setRoundMistakes] = useState(0)
  const [roundDamage, setRoundDamage] = useState(0)
  const [roundBlockedDamage, setRoundBlockedDamage] = useState(0)
  const [peekedIndex, setPeekedIndex] = useState<number | null>(null)
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null)
  const [standings, setStandings] = useState<ContestantState[]>([])
  const [damageFlash, setDamageFlash] = useState<number | null>(null)
  const [roundTransition, setRoundTransition] = useState<RoundTransition>('bats')

  const roundStartedAtRef = useRef(0)
  const roundStartingHealthRef = useRef(HOUSE_OF_DARKNESS_STARTING_HEALTH)
  const roundSnapshotRef = useRef<Record<string, ContestantState>>(
    buildInitialContestants(resolvedIds)
  )
  const roundShieldBlocksUsedRef = useRef(0)
  const roundLastChanceUsedRef = useRef(false)
  const portraitStageRef = useRef(false)
  const simulationCancelledRef = useRef(false)
  const peekTimerRef = useRef<number | null>(null)
  const roundCompletedRef = useRef(false)
  const deathResolvedRef = useRef(false)
  const contestantsRef = useRef(contestants)
  const transitionTimerRef = useRef<number | null>(null)
  const charmTransitionTimerRef = useRef<number | null>(null)
  const charmOriginRef = useRef<{ x: number; y: number; width: number; height: number } | null>(
    null
  )
  const selectedCharmRef = useRef<HTMLButtonElement>(null)
  const boardWrapRef = useRef<HTMLDivElement>(null)
  const previewAppliedRef = useRef(false)

  const pairCount = getHouseOfDarknessPairCount(round)
  const aliveAtChoice = Object.values(contestants).filter((state) => state.alive)
  const omen = getHouseOfDarknessOmen(round, sessionSeed)
  const playableCards = pairCount * 2
  const boardStyle: BoardStyle = { '--hod-columns': HOUSE_OF_DARKNESS_COLUMNS }
  const humanState = contestants[humanId]
  const humanHealth = humanState?.health ?? 0
  const { playFlip, playMatch, playMismatch, playComplete } = useHouseOfCardsAudio(
    phase === 'playing'
  )

  useEffect(() => {
    roundStartedAtRef.current = Date.now()
  }, [])

  useEffect(() => {
    contestantsRef.current = contestants
  }, [contestants])

  useEffect(
    () => () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current)
      }
      if (charmTransitionTimerRef.current !== null) {
        window.clearTimeout(charmTransitionTimerRef.current)
      }
      if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current)
      simulationCancelledRef.current = true
    },
    []
  )

  useLayoutEffect(() => {
    if (charmTransition !== 'deal') return
    const wrap = boardWrapRef.current
    const boardElement = wrap?.querySelector<HTMLElement>('.hod-board')
    if (!wrap || !boardElement) return

    const boardBounds = boardElement.getBoundingClientRect()
    const wrapBounds = wrap.getBoundingClientRect()
    setCharmCloneFrame({
      left: boardBounds.left - wrapBounds.left + wrap.scrollLeft,
      top: boardBounds.top - wrapBounds.top + wrap.scrollTop,
      width: boardBounds.width,
      height: boardBounds.height,
    })
    const origin = charmOriginRef.current ?? {
      x: boardBounds.left + boardBounds.width / 2,
      y: boardBounds.top + boardBounds.height / 2,
      width: Math.max(1, boardBounds.width / 3),
      height: Math.max(1, boardBounds.height / 2),
    }
    const offsets = Array.from(
      boardElement.querySelectorAll<HTMLButtonElement>(
        ':scope > .hod-card:not(.hod-card--placeholder)'
      )
    ).map((card) => {
      const bounds = card.getBoundingClientRect()
      return {
        fromX: origin.x - (bounds.left + bounds.width / 2),
        fromY: origin.y - (bounds.top + bounds.height / 2),
        scaleX: origin.width > 0 ? bounds.width / origin.width : 0.25,
        scaleY: origin.height > 0 ? bounds.height / origin.height : 0.45,
      }
    })
    setCharmFlyOffsets(offsets)
  }, [board.length, charmTransition])

  const revealAfterTransition = useCallback(
    (target: 'round_results' | 'results') => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current)
      }
      setRoundTransition(round % 2 === 1 ? 'bats' : 'web')
      setLocked(true)
      setPhase('round_transition')
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null
        setPhase(target)
        if (target === 'results') playComplete()
      }, 2600)
    },
    [playComplete, round]
  )

  const finalizeTournament = useCallback(
    (nextStates: Record<string, ContestantState>, animate = true) => {
      const ranked = rankContestants(nextStates, resolvedIds)
      setContestants(nextStates)
      setStandings(ranked)
      if (animate) {
        revealAfterTransition('results')
        return
      }
      setPhase('results')
      playComplete()
    },
    [playComplete, resolvedIds, revealAfterTransition]
  )

  const simulateAiRound = useCallback(
    (
      player: ContestantState,
      simulatedRound: number,
      leaderId: string | undefined,
      offerIds: HouseOfDarknessCharmId[],
      roundStartStates: Record<string, ContestantState>
    ): { next: ContestantState; result: RoundResult } => {
      const simulatedPairCount = getHouseOfDarknessPairCount(simulatedRound)
      const targetCandidates = Object.values(roundStartStates).filter(
        (state) =>
          state.alive &&
          state.id !== player.id &&
          state.curseCharges < HOUSE_OF_DARKNESS_MAX_CURSE_CHARGES
      )
      const selectedOmen = getHouseOfDarknessOmen(simulatedRound, sessionSeed)
      const aiAbility = getHouseOfDarknessAiAbility({
        baseAbility: aiProfiles[player.id]?.sessionAbility ?? 55,
        round: simulatedRound,
        health: player.health,
      })
      const choice = chooseHouseOfDarknessAiCharm({
        playerId: player.id,
        seed: sessionSeed,
        offers: offerIds,
        ability: aiAbility,
        round: simulatedRound,
        health: player.health,
        averageRecentMistakes:
          player.completedRounds > 0 ? player.totalMistakes / player.completedRounds : 1.4,
        queuedCurseCharges: player.curseCharges,
        omenDamageBonus: selectedOmen.damageBonus,
        omenFirstMistakeBonus: selectedOmen.firstMistakeBonus,
        aliveCount: Object.values(roundStartStates).filter((state) => state.alive).length,
        leaderId,
        strategicContext: { relationships, alliances },
        potentialTargets: targetCandidates.map(({ id, health, curseCharges }) => ({
          id,
          health,
          queuedCurseCharges: curseCharges,
        })),
      })
      const charm = choice.charm
      const targetId = charm === 'curse' ? choice.targetId : undefined
      const performance = simulateHouseOfDarknessAiMemory({
        playerId: player.id,
        round: simulatedRound,
        pairCount: simulatedPairCount,
        tournamentSeed: sessionSeed,
        sessionAbility: aiAbility,
        charm,
        recentMistakes:
          player.completedRounds > 0 ? player.totalMistakes / player.completedRounds : undefined,
      })
      const damageResolution = applyHouseOfDarknessMistakes({
        health: player.health,
        sessionSeed,
        playerId: player.id,
        round: simulatedRound,
        mistakeStartIndex: 0,
        mistakeCount: performance.mistakes,
        damageBonus: selectedOmen.damageBonus + (charm === 'bargain' ? 3 : 0),
        firstMistakeBonus: selectedOmen.firstMistakeBonus,
        curseCharges: charm === 'cleanse' ? 0 : player.curseCharges,
        shieldBlocks: charm === 'shield' ? 2 : 0,
        lastChanceAvailable: charm === 'last-chance',
      })
      const completedBoard = damageResolution.lethalMistakeIndex === null
      const mistakesTaken =
        damageResolution.lethalMistakeIndex === null
          ? performance.mistakes
          : damageResolution.lethalMistakeIndex + 1
      const elapsedMs =
        damageResolution.lethalMistakeIndex === null
          ? performance.timeMs
          : Math.max(
              1,
              Math.round((performance.timeMs * mistakesTaken) / Math.max(1, performance.mistakes))
            )
      const endingHealth = recoverHouseOfDarknessHealth(
        damageResolution.health,
        damageResolution.damage,
        completedBoard,
        (charm === 'heal' ? 8 : charm === 'bargain' ? 14 : 0) + selectedOmen.recoveryBonus,
        !damageResolution.lastChanceUsed
      )
      const alive = completedBoard && endingHealth > 0
      const next: ContestantState = {
        ...player,
        health: endingHealth,
        alive,
        eliminatedRound: alive ? null : simulatedRound,
        completedRounds: player.completedRounds + (completedBoard ? 1 : 0),
        totalMistakes: player.totalMistakes + mistakesTaken,
        totalDamage: player.totalDamage + damageResolution.damage,
        totalTimeMs: player.totalTimeMs + elapsedMs,
        curseCharges:
          charm === 'cleanse'
            ? 0
            : Math.max(0, player.curseCharges - damageResolution.curseChargesConsumed),
      }
      return {
        next,
        result: {
          id: player.id,
          startingHealth: player.health,
          healthAfterDamage: damageResolution.health,
          endingHealth,
          damage: damageResolution.damage,
          recovered: Math.max(0, Math.round((endingHealth - damageResolution.health) * 10) / 10),
          mistakes: mistakesTaken,
          timeMs: elapsedMs,
          died: !alive,
          charm,
          curseTargetId: targetId,
          blockedDamage: damageResolution.blockedDamage,
          lastChanceUsed: damageResolution.lastChanceUsed,
        },
      }
    },
    [aiProfiles, alliances, relationships, sessionSeed]
  )

  const simulateAfterHumanDeath = useCallback(
    async (startingStates: Record<string, ContestantState>) => {
      let nextStates = { ...startingStates }
      const maximumRound = gameMode === 'depth' ? HOUSE_OF_DARKNESS_MAX_ROUNDS : 10_000
      for (let simulatedRound = round; simulatedRound <= maximumRound; simulatedRound += 1) {
        if (simulationCancelledRef.current) return
        const livingAiIds = resolvedIds.filter((id) => id !== humanId && nextStates[id]?.alive)
        if (livingAiIds.length <= 1) break
        const roundStartStates = { ...nextStates }
        const livingAtStart = Object.values(roundStartStates).filter((state) => state.alive)
        const leaderId = livingAtStart
          .filter((state) => state.alive)
          .sort((first, second) => second.health - first.health)[0]?.id
        const offers = getHouseOfDarknessCharmOffers(sessionSeed, simulatedRound, {
          aliveCount: livingAtStart.length,
          lowHealthPresent: livingAtStart.some((state) => state.health <= 25),
          queuedCursePresent: livingAtStart.some((state) => state.curseCharges > 0),
          mode: gameMode,
          round: simulatedRound,
        }).map((offer) => offer.id)
        const pendingCurseTargets: string[] = []

        livingAiIds.forEach((id) => {
          const resolution = simulateAiRound(
            roundStartStates[id]!,
            simulatedRound,
            leaderId,
            offers,
            roundStartStates
          )
          nextStates = { ...nextStates, [id]: resolution.next }
          if (resolution.result.curseTargetId)
            pendingCurseTargets.push(resolution.result.curseTargetId)
        })

        pendingCurseTargets.forEach((targetId) => {
          const target = nextStates[targetId]
          if (target?.alive)
            nextStates = {
              ...nextStates,
              [targetId]: {
                ...target,
                curseCharges: Math.min(
                  HOUSE_OF_DARKNESS_MAX_CURSE_CHARGES,
                  target.curseCharges + 2
                ),
              },
            }
        })

        const survivors = resolvedIds.filter((id) => nextStates[id]?.alive)
        if (survivors.length <= 1) break
        if (simulatedRound % 8 === 0)
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }

      if (!simulationCancelledRef.current) finalizeTournament(nextStates, false)
    },
    [finalizeTournament, gameMode, humanId, resolvedIds, round, sessionSeed, simulateAiRound]
  )

  useEffect(() => {
    if (phase !== 'death' || deathResolvedRef.current) return
    deathResolvedRef.current = true
    void SoundManager.play('minigame:risk_wheel_666')
    const screamTimer = window.setTimeout(() => {
      void SoundManager.play('player:evicted')
    }, 120)
    const resolveTimer = window.setTimeout(() => {
      simulationCancelledRef.current = false
      void simulateAfterHumanDeath(contestantsRef.current)
    }, 2600)
    return () => {
      window.clearTimeout(screamTimer)
      window.clearTimeout(resolveTimer)
    }
  }, [phase, simulateAfterHumanDeath])

  const showDamageFlash = useCallback((damage: number) => {
    setDamageFlash(damage)
    window.setTimeout(() => setDamageFlash(null), 540)
  }, [])

  const finishRound = useCallback(() => {
    if (roundCompletedRef.current || phase !== 'playing') return
    roundCompletedRef.current = true

    const currentStates = contestantsRef.current
    const roundStartStates = roundSnapshotRef.current
    const currentHuman = currentStates[humanId]
    if (!currentHuman?.alive) return
    const humanCharm = selectedCharm ?? 'heal'
    const roundOmen = getHouseOfDarknessOmen(round, sessionSeed)
    const curseTargetId = humanCharm === 'curse' ? (selectedCurseTarget ?? undefined) : undefined
    const leaderId = Object.values(roundStartStates)
      .filter((state) => state.alive)
      .sort((first, second) => second.health - first.health)[0]?.id

    const elapsedMs = Math.max(1, Date.now() - roundStartedAtRef.current)
    const healedHumanHealth = recoverHouseOfDarknessHealth(
      currentHuman.health,
      roundDamage,
      true,
      (humanCharm === 'heal' ? 8 : humanCharm === 'bargain' ? 14 : 0) + roundOmen.recoveryBonus,
      !roundLastChanceUsedRef.current
    )
    const humanNext: ContestantState = {
      ...currentHuman,
      health: healedHumanHealth,
      completedRounds: currentHuman.completedRounds + 1,
      totalTimeMs: currentHuman.totalTimeMs + elapsedMs,
    }
    let nextStates: Record<string, ContestantState> = { ...currentStates, [humanId]: humanNext }
    const results: RoundResult[] = [
      {
        id: humanId,
        startingHealth: roundStartingHealthRef.current,
        healthAfterDamage: currentHuman.health,
        endingHealth: healedHumanHealth,
        damage: roundDamage,
        recovered: Math.max(0, Math.round((healedHumanHealth - currentHuman.health) * 10) / 10),
        mistakes: roundMistakes,
        timeMs: elapsedMs,
        died: false,
        charm: humanCharm,
        curseTargetId,
        blockedDamage: roundBlockedDamage,
        lastChanceUsed: roundLastChanceUsedRef.current,
      },
    ]

    resolvedIds.forEach((id) => {
      if (id === humanId) return
      const player = roundStartStates[id]
      if (!player?.alive) return
      const resolution = simulateAiRound(
        player,
        round,
        leaderId,
        charmOffers.map((offer) => offer.id),
        roundStartStates
      )
      nextStates = { ...nextStates, [id]: resolution.next }
      results.push(resolution.result)
    })

    const resultsWithEffects = results.map((result) => {
      const targetId = result.curseTargetId
      const target = targetId ? nextStates[targetId] : undefined
      if (!targetId || !target?.alive) return { ...result, curseChargesAdded: 0 }
      const added = Math.min(
        2,
        Math.max(0, HOUSE_OF_DARKNESS_MAX_CURSE_CHARGES - target.curseCharges)
      )
      nextStates = {
        ...nextStates,
        [targetId]: { ...target, curseCharges: target.curseCharges + added },
      }
      return { ...result, curseChargesAdded: added }
    })

    const livingIds = resolvedIds.filter((id) => nextStates[id]?.alive)
    if (gameMode === 'endless' && livingIds.length <= 2 && livingIds.length > 1)
      portraitStageRef.current = true
    if (livingIds.length <= 1 || (gameMode === 'depth' && round >= HOUSE_OF_DARKNESS_MAX_ROUNDS)) {
      finalizeTournament(nextStates)
      return
    }

    contestantsRef.current = nextStates
    setContestants(nextStates)
    setRoundSummary({
      round,
      results: resultsWithEffects,
      omenId: roundOmen.id,
      humanCharm,
      curseTargetId,
    })
    revealAfterTransition('round_results')
  }, [
    finalizeTournament,
    gameMode,
    humanId,
    phase,
    charmOffers,
    resolvedIds,
    round,
    roundDamage,
    roundBlockedDamage,
    roundMistakes,
    revealAfterTransition,
    simulateAiRound,
    selectedCharm,
    selectedCurseTarget,
    sessionSeed,
  ])

  useEffect(() => {
    if (phase === 'playing' && matchedPairs >= pairCount) finishRound()
  }, [finishRound, matchedPairs, pairCount, phase])

  const resolvePair = useCallback(
    (firstIndex: number, secondIndex: number) => {
      const first = board[firstIndex]
      const second = board[secondIndex]
      if (!first || !second || first.isPlaceholder || second.isPlaceholder) return
      setLocked(true)

      if (first.symbol === second.symbol) {
        playMatch()
        setBoard((current) =>
          current.map((card, index) =>
            index === firstIndex || index === secondIndex
              ? { ...card, isFlipped: true, isMatched: true, isMismatch: false }
              : card
          )
        )
        setMatchedPairs((value) => value + 1)
        setFlippedIndices([])
        window.setTimeout(() => setLocked(false), 260)
        return
      }

      playMismatch()
      const currentPlayer = contestantsRef.current[humanId]
      const currentOmen = getHouseOfDarknessOmen(round, sessionSeed)
      const resolution = applyHouseOfDarknessMistakes({
        health: currentPlayer?.health ?? 0,
        sessionSeed,
        playerId: humanId,
        round,
        mistakeStartIndex: roundMistakes,
        mistakeCount: 1,
        damageBonus: currentOmen.damageBonus + (selectedCharm === 'bargain' ? 3 : 0),
        firstMistakeBonus: roundMistakes === 0 ? currentOmen.firstMistakeBonus : 0,
        curseCharges: currentPlayer?.curseCharges ?? 0,
        shieldBlocks:
          selectedCharm === 'shield' ? Math.max(0, 2 - roundShieldBlocksUsedRef.current) : 0,
        lastChanceAvailable: selectedCharm === 'last-chance',
        lastChanceAlreadyUsed: roundLastChanceUsedRef.current,
      })
      const hit = resolution.damage
      showDamageFlash(hit)
      setRoundMistakes((value) => value + 1)
      setRoundDamage((value) => value + hit)
      setRoundBlockedDamage((value) => value + resolution.blockedDamage)
      roundShieldBlocksUsedRef.current += resolution.shieldBlocksConsumed
      roundLastChanceUsedRef.current ||= resolution.lastChanceUsed

      const nextHealth = clampHealth(resolution.health)
      const lethal = resolution.lethalMistakeIndex !== null
      if (currentPlayer) {
        const nextContestants = {
          ...contestantsRef.current,
          [humanId]: {
            ...currentPlayer,
            health: nextHealth,
            alive: !lethal,
            eliminatedRound: lethal ? round : null,
            totalMistakes: currentPlayer.totalMistakes + 1,
            totalDamage: currentPlayer.totalDamage + hit,
            totalTimeMs:
              currentPlayer.totalTimeMs +
              (lethal ? Math.max(1, Date.now() - roundStartedAtRef.current) : 0),
            curseCharges: Math.max(0, currentPlayer.curseCharges - resolution.curseChargesConsumed),
          },
        }
        contestantsRef.current = nextContestants
        setContestants(nextContestants)
      }

      setBoard((current) =>
        current.map((card, index) =>
          index === firstIndex || index === secondIndex
            ? { ...card, isFlipped: true, isMismatch: true }
            : card
        )
      )

      if (lethal) {
        setLocked(true)
        setFlippedIndices([])
        setPhase('death')
        return
      }

      window.setTimeout(() => {
        setBoard((current) =>
          current.map((card, index) =>
            index === firstIndex || index === secondIndex
              ? { ...card, isFlipped: false, isMismatch: false }
              : card
          )
        )
        setFlippedIndices([])
        setLocked(false)
      }, 800)
    },
    [
      board,
      humanId,
      playMatch,
      playMismatch,
      round,
      roundMistakes,
      selectedCharm,
      sessionSeed,
      showDamageFlash,
    ]
  )

  const handleCardClick = useCallback(
    (cardIndex: number) => {
      if (locked || phase !== 'playing') return
      const card = board[cardIndex]
      if (!card || card.isPlaceholder || card.isMatched || card.isFlipped) return
      if (selectedCharm === 'peek' && peekArmed && !peekUsed) {
        playFlip()
        setPeekedIndex(cardIndex)
        setPeekUsed(true)
        setPeekArmed(false)
        setLocked(true)
        if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current)
        peekTimerRef.current = window.setTimeout(() => {
          peekTimerRef.current = null
          setPeekedIndex(null)
          setLocked(false)
        }, 1_000)
        return
      }
      playFlip()
      setBoard((current) =>
        current.map((item, index) => (index === cardIndex ? { ...item, isFlipped: true } : item))
      )
      if (flippedIndices.length === 0) {
        setFlippedIndices([cardIndex])
        return
      }
      resolvePair(flippedIndices[0], cardIndex)
    },
    [
      board,
      flippedIndices,
      locked,
      peekArmed,
      peekUsed,
      phase,
      playFlip,
      resolvePair,
      selectedCharm,
    ]
  )

  const continueRound = useCallback(() => {
    const nextRound = round + 1
    const currentHumanHealth = contestantsRef.current[humanId]?.health ?? 0
    const currentLiving = rankContestants(contestantsRef.current, resolvedIds).filter(
      (state) => state.alive
    )
    const usePortraits =
      gameMode === 'depth'
        ? nextRound >= HOUSE_OF_DARKNESS_MAX_ROUNDS
        : portraitStageRef.current || currentLiving.length <= 2
    if (gameMode === 'endless' && currentLiving.length <= 2) portraitStageRef.current = true
    setRound(nextRound)
    setCharmOffers(drawDarknessCharms(sessionSeed, nextRound, gameMode, contestantsRef.current))
    setBoard(
      buildDarknessBoard(
        sessionSeed ^ Math.imul(nextRound, 0x85ebca6b),
        getHouseOfDarknessPairCount(nextRound),
        portraitPlayers,
        currentLiving.map((state) => state.id),
        usePortraits
      )
    )
    setFlippedIndices([])
    setLocked(false)
    setMatchedPairs(0)
    setRoundMistakes(0)
    setRoundDamage(0)
    setRoundBlockedDamage(0)
    setRoundSummary(null)
    setDamageFlash(null)
    setPeekedIndex(null)
    setPeekArmed(false)
    setPeekUsed(false)
    roundShieldBlocksUsedRef.current = 0
    roundLastChanceUsedRef.current = false
    roundStartingHealthRef.current = currentHumanHealth
    setSelectedCharm(null)
    setCharmTransition(null)
    setCharmCloneFrame(null)
    setCharmFlyOffsets([])
    setSelectedCurseTarget(null)
    setPeekArmed(false)
    setPeekUsed(false)
    roundSnapshotRef.current = { ...contestantsRef.current }
    roundCompletedRef.current = false
    setPhase('charm_select')
  }, [gameMode, humanId, portraitPlayers, resolvedIds, round, sessionSeed])

  const chooseMode = useCallback(
    (mode: GameMode) => {
      setGameMode(mode)
      const current = { ...contestantsRef.current }
      setCharmOffers(drawDarknessCharms(sessionSeed, round, mode, current))
      roundSnapshotRef.current = current
      roundStartingHealthRef.current = current[humanId]?.health ?? HOUSE_OF_DARKNESS_STARTING_HEALTH
      portraitStageRef.current =
        mode === 'endless' && Object.values(current).filter((state) => state.alive).length <= 2
      if (portraitStageRef.current) {
        setBoard(
          buildDarknessBoard(
            sessionSeed ^ Math.imul(round, 0x85ebca6b),
            getHouseOfDarknessPairCount(round),
            portraitPlayers,
            Object.values(current)
              .filter((state) => state.alive)
              .map((state) => state.id),
            true
          )
        )
      }
      setPhase('charm_select')
      setCharmTransition(null)
      setCharmCloneFrame(null)
      setCharmFlyOffsets([])
    },
    [humanId, portraitPlayers, round, sessionSeed]
  )

  const chooseCharm = useCallback(
    (charm: HouseOfDarknessCharmId) => {
      if (charmTransition !== null || phase !== 'charm_select') return
      if (!charmOffers.some((offer) => offer.id === charm)) return
      if (charm === 'curse' && !selectedCurseTarget) return
      if (charm === 'cleanse') {
        const current = contestantsRef.current[humanId]
        if (current) {
          const cleansed = { ...contestantsRef.current, [humanId]: { ...current, curseCharges: 0 } }
          contestantsRef.current = cleansed
          setContestants(cleansed)
        }
      }
      setSelectedCharm(charm)
      roundSnapshotRef.current = { ...roundSnapshotRef.current }
      roundShieldBlocksUsedRef.current = 0
      roundLastChanceUsedRef.current = false
      if (!premiumPresentation) {
        roundStartedAtRef.current = Date.now()
        setPhase('playing')
        return
      }

      setCharmTransition('expand')
      charmTransitionTimerRef.current = window.setTimeout(() => {
        const bounds = selectedCharmRef.current?.getBoundingClientRect()
        if (bounds) {
          charmOriginRef.current = {
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
            width: Math.max(1, bounds.width),
            height: Math.max(1, bounds.height),
          }
        }
        setCharmTransition('deal')
        roundStartedAtRef.current = Date.now()
        setPhase('playing')
        charmTransitionTimerRef.current = window.setTimeout(
          () => {
            setCharmTransition('landed')
            charmTransitionTimerRef.current = null
          },
          CHARM_CLONE_DURATION_MS + Math.max(0, board.length - 1) * CHARM_CLONE_STAGGER_MS + 80
        )
      }, 620)
    },
    [
      board.length,
      charmOffers,
      charmTransition,
      humanId,
      phase,
      premiumPresentation,
      selectedCurseTarget,
    ]
  )

  useEffect(() => {
    if (!import.meta.env.DEV || previewAppliedRef.current || !previewStage) return
    previewAppliedRef.current = true
    const fixture = buildInitialContestants(resolvedIds)
    const fixtureRound = previewStage === 'round6' ? HOUSE_OF_DARKNESS_MAX_ROUNDS : 3
    const fixtureMode: GameMode = previewStage === 'round6' ? 'depth' : 'endless'
    if (previewStage === 'round6') {
      resolvedIds.forEach((id, index) => {
        fixture[id] = { ...fixture[id]!, health: Math.max(42, 88 - index * 5) }
      })
      portraitStageRef.current = false
    } else {
      resolvedIds.forEach((id, index) => {
        fixture[id] = {
          ...fixture[id]!,
          health: index < 2 ? 25 + index * 12 : 0,
          alive: index < 2,
          eliminatedRound: index < 2 ? null : 2,
          completedRounds: 2,
        }
      })
      portraitStageRef.current = true
    }
    contestantsRef.current = fixture
    roundSnapshotRef.current = { ...fixture }
    roundStartingHealthRef.current = fixture[humanId]?.health ?? 60
    setContestants(fixture)
    setCharmOffers(drawDarknessCharms(sessionSeed, fixtureRound, fixtureMode, fixture))
    setGameMode(fixtureMode)
    setRound(fixtureRound)
    setBoard(
      buildDarknessBoard(
        sessionSeed ^ Math.imul(fixtureRound, 0x85ebca6b),
        getHouseOfDarknessPairCount(fixtureRound),
        portraitPlayers,
        Object.values(fixture)
          .filter((state) => state.alive)
          .map((state) => state.id),
        true
      )
    )
    setPhase('charm_select')
    setCharmTransition(null)
    setCharmCloneFrame(null)
    setCharmFlyOffsets([])
  }, [humanId, participants, portraitPlayers, previewStage, resolvedIds, sessionSeed])

  const finish = useCallback(() => {
    if (standings.length === 0) return
    const rawResults = Object.fromEntries(
      standings.map((state, index) => [state.id, (standings.length - index) * 1_000_000])
    )
    onFinish?.(rawResults[humanId] ?? 0, undefined, {
      authoritativeWinnerId: standings[0]?.id ?? null,
      authoritativeRankedIds: standings.map((state) => state.id),
      rawValue: rawResults[humanId] ?? 0,
      rawResults,
    })
  }, [humanId, onFinish, standings])

  if (phase === 'mode_select') {
    return (
      <div
        className="hod-root"
        data-phase="mode_select"
        data-presentation={premiumPresentation ? 'premium' : 'standard'}
      >
        <div className="hod-atmosphere" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <header className="hod-heading">
          <span>Memory survival</span>
          <strong>Deck of Darkness</strong>
          <small>A darker, dangerous spin on Deck of Cards.</small>
        </header>
        <section className="hod-setup" aria-labelledby="hod-mode-title">
          <p className="hod-setup-kicker">Choose your run</p>
          <h2 id="hod-mode-title">How deep will you go?</h2>
          <button type="button" className="hod-setup-choice" onClick={() => chooseMode('depth')}>
            <span className="hod-mode-symbol" aria-hidden="true">
              ◎
            </span>
            <strong>
              Depth Run <span>6 rounds</span>
            </strong>
            <small>
              Everyone gets the same six escalating boards. The player with the most lifespan wins.
            </small>
          </button>
          <button type="button" className="hod-setup-choice" onClick={() => chooseMode('endless')}>
            <span className="hod-mode-symbol" aria-hidden="true">
              ∞
            </span>
            <strong>
              Endless <span>One survivor</span>
            </strong>
            <small>
              Keep descending until one contestant remains. Damage rises each round while boards cap
              at 8 pairs.
            </small>
          </button>
        </section>
      </div>
    )
  }

  if (phase === 'charm_select') {
    const curseTargets = aliveAtChoice.filter((state) => state.id !== humanId)
    return (
      <div
        className="hod-root"
        data-phase="charm_select"
        data-presentation={premiumPresentation ? 'premium' : 'standard'}
        data-charm-transition={charmTransition ?? undefined}
        data-health-band={humanHealth <= 20 ? 'critical' : humanHealth <= 45 ? 'danger' : 'stable'}
      >
        <div className="hod-atmosphere" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <header className="hod-heading">
          <span>{gameMode === 'endless' ? 'Endless descent' : 'Survival memory'}</span>
          <strong>Deck of Darkness</strong>
          <small>
            Round {round} · {pairCount} pairs · lifespan {formatHouseOfDarknessHealth(humanHealth)}%
          </small>
        </header>
        <section
          className={`hod-setup hod-charm-setup${premiumPresentation ? ' hod-charm-setup--premium' : ''}`}
          aria-labelledby="hod-charm-title"
        >
          <p className="hod-setup-kicker">
            {omen.name} · Round {round}
          </p>
          <h2 id="hod-charm-title">Choose a charm</h2>
          <p className="hod-setup-omen">
            {omen.description} Mistakes now deal {3 + round - 1}–{5 + round - 1} base damage.
          </p>
          {charmOffers.some((charm) => charm.id === 'curse') && (
            <label className="hod-target-select">
              <span>Curse target</span>
              <select
                value={selectedCurseTarget ?? ''}
                onChange={(event) => setSelectedCurseTarget(event.currentTarget.value || null)}
              >
                <option value="">Choose a rival</option>
                {curseTargets.map((state) => (
                  <option key={state.id} value={state.id}>
                    {nameFor(state.id)} · {formatHouseOfDarknessHealth(state.health)}% ·{' '}
                    {state.curseCharges}/4 Curse charges
                  </option>
                ))}
              </select>
            </label>
          )}
          <div
            className={`hod-charm-list${premiumPresentation ? ' hod-charm-list--premium' : ''}`}
            data-count={charmOffers.length}
          >
            {charmOffers.map((charm) => (
              <button
                key={charm.id}
                type="button"
                className={`hod-charm-choice hod-charm-choice--${charm.id}`}
                data-selected={selectedCharm === charm.id ? 'true' : 'false'}
                ref={selectedCharm === charm.id ? selectedCharmRef : undefined}
                disabled={
                  charmTransition !== null ||
                  (selectedCharm !== null && selectedCharm !== charm.id) ||
                  (charm.id === 'curse' &&
                    (!selectedCurseTarget ||
                      !curseTargets.some((state) => state.id === selectedCurseTarget)))
                }
                onClick={() => chooseCharm(charm.id)}
              >
                <span className="hod-charm-choice__icon" aria-hidden="true">
                  {DARKNESS_CHARM_GLYPHS[charm.id]}
                </span>
                {premiumPresentation ? (
                  <>
                    <span className="hod-charm-choice__copy">
                      <span className="hod-charm-choice__eyebrow">
                        CHARM · {charm.id.replace('-', ' ')}
                      </span>
                      <strong>{charm.name}</strong>
                      <small>{charm.description}</small>
                    </span>
                    <span className="hod-charm-choice__arrow" aria-hidden="true">
                      ↗
                    </span>
                  </>
                ) : (
                  <>
                    <span className="hod-charm-choice__copy">
                      <strong>{charm.name}</strong>
                      <small>{charm.description}</small>
                    </span>
                    <span className="hod-charm-choice__arrow" aria-hidden="true">
                      ↗
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
          <p className="hod-setup-note">
            Everyone gets these same offers. Curse charges cap at four; Last Chance can save one
            lethal mistake on this board, with no recovery afterward.
          </p>
        </section>
      </div>
    )
  }

  if (phase === 'round_results' && roundSummary) {
    const rankedRoundResults = roundSummary.results
      .slice()
      .sort(
        (a, b) =>
          Number(a.died) - Number(b.died) ||
          b.endingHealth - a.endingHealth ||
          a.mistakes - b.mistakes
      )
    return (
      <MinigameCompleteWrapper
        className={`hod-complete hod-round-results hod-complete--${premiumPresentation ? 'premium' : 'standard'}`}
        onContinue={continueRound}
        continueLabel="Descend deeper"
        continueButtonClassName="hod-continue"
        placementsNode={
          <ol
            className="hod-results-list"
            aria-label={`Deck of Darkness round ${roundSummary.round} survival results`}
          >
            {rankedRoundResults.map((result) => (
              <li
                key={result.id}
                className={`hod-result-row${result.died ? ' hod-result-row--dead' : ''}${result.id === humanId ? ' hod-result-row--human' : ''}`}
              >
                <div className="hod-result-main">
                  <strong>
                    {nameFor(result.id)}
                    {result.id === humanId ? ' (You)' : ''}
                  </strong>
                  <span>
                    {result.mistakes} mistakes · {result.damage} damage · {result.blockedDamage}{' '}
                    blocked · {result.recovered}% restored ·{' '}
                    {HOUSE_OF_DARKNESS_CHARMS.find((charm) => charm.id === result.charm)?.name ??
                      'Charm'}
                    {result.curseTargetId
                      ? ` → ${nameFor(result.curseTargetId)} (Curse +${result.curseChargesAdded ?? 0})`
                      : ''}
                    {result.lastChanceUsed ? ' · Last Chance used' : ''}
                  </span>
                </div>
                <strong>
                  {result.died
                    ? 'CONSUMED'
                    : `${formatHouseOfDarknessHealth(result.endingHealth)}%`}
                </strong>
              </li>
            ))}
          </ol>
        }
      >
        <p className="hod-complete-kicker">{roundSummary.omenId.replace('-', ' ')}</p>
        <h2 className="hod-complete-title">Round {roundSummary.round} survived</h2>
        <p className="hod-complete-copy">
          You chose{' '}
          {HOUSE_OF_DARKNESS_CHARMS.find((charm) => charm.id === roundSummary.humanCharm)?.name}.{' '}
          {roundSummary.curseTargetId
            ? `${nameFor(roundSummary.curseTargetId)} receives ${roundSummary.results.find((result) => result.id === humanId)?.curseChargesAdded ?? 0} Curse charges for future mistakes.`
            : 'Choose your next charm before descending.'}
        </p>
      </MinigameCompleteWrapper>
    )
  }

  if (phase === 'results' && standings.length > 0) {
    const winner = standings[0]
    const winnerParticipant = participants?.find((participant) => participant.id === winner.id)
    return (
      <MinigameCompleteWrapper
        className={`hod-complete hod-final-results hod-complete--${premiumPresentation ? 'premium' : 'standard'}`}
        onContinue={finish}
        continueLabel="Leave the deck"
        continueButtonClassName="hod-continue"
        placementsNode={
          <ol className="hod-results-list" aria-label="Deck of Darkness final standings">
            {standings.map((state, index) => (
              <li
                key={state.id}
                className={`hod-result-row${state.alive ? '' : ' hod-result-row--dead'}${state.id === humanId ? ' hod-result-row--human' : ''}${index === 0 ? ' hod-result-row--winner' : ''}`}
              >
                <span className="hod-result-rank">{index + 1}</span>
                <div className="hod-result-main">
                  <strong>
                    {nameFor(state.id)}
                    {state.id === humanId ? ' (You)' : ''}
                  </strong>
                  <span>
                    {state.completedRounds} boards · {state.totalMistakes} mistakes ·{' '}
                    {state.totalDamage} damage taken
                  </span>
                </div>
                <strong>
                  {state.alive
                    ? `${formatHouseOfDarknessHealth(state.health)}%`
                    : `Fell R${state.eliminatedRound ?? '?'}`}
                </strong>
              </li>
            ))}
          </ol>
        }
      >
        {winnerParticipant && (
          <ResolvedAvatarImage
            className="hod-winner-portrait"
            id={winner.id}
            name={winnerParticipant.name}
            avatar={winnerParticipant.avatar}
            isUser={winner.id === humanId}
            alt=""
          />
        )}
        <p className="hod-complete-kicker">
          {!winner.alive
            ? 'Last to fall'
            : gameMode === 'endless'
              ? 'One soul remains'
              : 'Depth run complete'}
        </p>
        <h2 className="hod-complete-title">
          {!winner.alive
            ? `${nameFor(winner.id)} lasts longest`
            : gameMode === 'endless'
              ? `${nameFor(winner.id)} escapes the darkness`
              : `${nameFor(winner.id)} survives the descent`}
        </h2>
        <p className="hod-complete-copy">
          {!winner.alive
            ? 'Every contestant fell. Survival progress and time alive decided the final order.'
            : gameMode === 'endless'
              ? 'The deck remembers everyone else.'
              : 'Six rounds decide who guarded their lifespan best.'}
        </p>
      </MinigameCompleteWrapper>
    )
  }

  const healthStyle: HealthStyle = { '--hod-health': `${humanHealth}%` }
  return (
    <div
      className="hod-root"
      data-phase={phase}
      data-presentation={premiumPresentation ? 'premium' : 'standard'}
      data-charm-transition={charmTransition ?? undefined}
      data-health-band={humanHealth <= 20 ? 'critical' : humanHealth <= 45 ? 'danger' : 'stable'}
    >
      <div className="hod-atmosphere" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <header className="hod-heading">
        <span>{gameMode === 'endless' ? 'Endless survival' : 'Six-round survival'}</span>
        <strong>Deck of Darkness</strong>
        <small>Every mistake feeds the darkness.</small>
      </header>

      <section
        className="hod-life-panel"
        aria-label={`Your lifespan is ${formatHouseOfDarknessHealth(humanHealth)} percent`}
      >
        <div className="hod-life-copy">
          <span>LIFESPAN</span>
          <strong>{formatHouseOfDarknessHealth(humanHealth)}%</strong>
        </div>
        <div className="hod-life-track">
          <span style={healthStyle} />
        </div>
        <small>
          {roundDamage > 0
            ? `${roundDamage} damage · ${roundBlockedDamage} blocked · ${selectedCharm ? HOUSE_OF_DARKNESS_CHARMS.find((charm) => charm.id === selectedCharm)?.name : 'No charm'}`
            : `${selectedCharm ? `${HOUSE_OF_DARKNESS_CHARMS.find((charm) => charm.id === selectedCharm)?.name} · ` : ''}${omen.name}: ${omen.description}`}
        </small>
      </section>

      {selectedCharm === 'peek' && !peekUsed && (
        <div className="hod-peek-control">
          <span>
            {peekArmed
              ? 'Choose one hidden card to reveal privately.'
              : 'Peek is ready to use once this board.'}
          </span>
          <button
            type="button"
            aria-pressed={peekArmed}
            onClick={() => setPeekArmed((armed) => !armed)}
          >
            {peekArmed ? 'Cancel Peek' : 'Use Peek'}
          </button>
        </div>
      )}

      <div className="hod-hud">
        <div>
          <strong>{gameMode === 'endless' ? `Depth ${round}` : `Round ${round}/6`}</strong>
          <span>{pairCount} pairs · danger rises</span>
        </div>
        <div>
          <strong>
            {matchedPairs}/{pairCount}
          </strong>
          <span>bound</span>
        </div>
        <div>
          <strong>{roundMistakes}</strong>
          <span>mistakes</span>
        </div>
        <div>
          <strong>{playableCards}</strong>
          <span>live cards</span>
        </div>
      </div>

      <div className="hod-survivors" aria-label="Contestant lifespan">
        {resolvedIds.map((id) => {
          const state = contestants[id]
          if (!state) return null
          return (
            <div
              key={id}
              className={`hod-survivor${id === humanId ? ' hod-survivor--human' : ''}${state.alive ? '' : ' hod-survivor--dead'}`}
            >
              <span>
                {nameFor(id)}
                {state.curseCharges > 0 ? ` · ${state.curseCharges} Curse` : ''}
              </span>
              <strong>
                {state.alive ? `${formatHouseOfDarknessHealth(state.health)}%` : 'VOID'}
              </strong>
            </div>
          )
        })}
      </div>

      <div className="hod-board-wrap" ref={boardWrapRef}>
        <div
          className="hod-board"
          style={boardStyle}
          role="grid"
          aria-label={`Deck of Darkness round ${round} memory board`}
        >
          {board.map((card) => (
            <button
              key={card.index}
              type="button"
              role="gridcell"
              className={`hod-card${card.isPlaceholder ? ' hod-card--placeholder' : ''}`}
              data-flipped={card.isFlipped || peekedIndex === card.index ? 'true' : 'false'}
              data-matched={card.isMatched ? 'true' : 'false'}
              data-mismatch={card.isMismatch ? 'true' : 'false'}
              disabled={locked || card.isMatched || card.isPlaceholder || phase !== 'playing'}
              onClick={() => handleCardClick(card.index)}
              aria-label={
                card.isPlaceholder
                  ? 'Sealed void slot'
                  : card.isFlipped || card.isMatched || peekedIndex === card.index
                    ? (card.portraitName ?? card.symbol)
                    : 'Hidden haunted card'
              }
            >
              {card.isPlaceholder ? (
                <span className="hod-placeholder-mark" aria-hidden="true">
                  VOID
                </span>
              ) : (
                <span className="hod-card-inner">
                  <span className="hod-card-face hod-card-back">
                    {premiumPresentation && (
                      <img
                        className="hod-premium-card-art"
                        src={`${import.meta.env.BASE_URL}assets/minigames/deck-of-darkness-card-back.webp`}
                        alt=""
                        aria-hidden="true"
                      />
                    )}
                    <span className="hod-card-sigil" aria-hidden="true">
                      ✦
                    </span>
                  </span>
                  <span
                    className={`hod-card-face hod-card-front${card.portraitPlayerId ? ' hod-portrait-face' : ''}`}
                  >
                    {card.portraitPlayerId && card.portraitName ? (
                      <>
                        <ResolvedAvatarImage
                          className="hod-portrait-face__image"
                          id={card.portraitPlayerId}
                          name={card.portraitName}
                          avatar={card.portraitAvatar}
                          isUser={card.portraitPlayerId === humanId}
                          alt=""
                          loading="eager"
                        />
                        <span className="hod-portrait-face__name">{card.portraitName}</span>
                        {card.portraitBadge && (
                          <span className="hod-portrait-face__badge">{card.portraitBadge}</span>
                        )}
                      </>
                    ) : (
                      card.symbol
                    )}
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
        {premiumPresentation && charmTransition === 'deal' && charmCloneFrame && selectedCharm && (
          <div
            className="hod-charm-clone-layer"
            aria-hidden="true"
            style={{
              ...boardStyle,
              left: charmCloneFrame.left,
              top: charmCloneFrame.top,
              width: charmCloneFrame.width,
              height: charmCloneFrame.height,
            }}
          >
            {board
              .filter((card) => !card.isPlaceholder)
              .map((card, index) => {
                const offset = charmFlyOffsets[index]
                const style: CharmCloneStyle = {
                  '--hod-card-index': index,
                  '--hod-start-x': `${offset?.fromX ?? 0}px`,
                  '--hod-start-y': `${offset?.fromY ?? 0}px`,
                  '--hod-scale-x': offset?.scaleX ?? 0.25,
                  '--hod-scale-y': offset?.scaleY ?? 0.45,
                  gridColumn: (card.index % HOUSE_OF_DARKNESS_COLUMNS) + 1,
                  gridRow: Math.floor(card.index / HOUSE_OF_DARKNESS_COLUMNS) + 1,
                }
                return (
                  <div key={card.index} className="hod-charm-clone" style={style}>
                    <span className="hod-charm-clone__stamp">
                      {DARKNESS_CHARM_GLYPHS[selectedCharm]}
                    </span>
                    <span className="hod-charm-clone__back">
                      <img
                        src={`${import.meta.env.BASE_URL}assets/minigames/deck-of-darkness-card-back.webp`}
                        alt=""
                      />
                      <span aria-hidden="true">✦</span>
                    </span>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {phase === 'round_transition' && (
        <div
          className={`hod-round-transition hod-round-transition--${roundTransition}`}
          role="status"
          aria-live="polite"
        >
          <div className="hod-transition-curtain" aria-hidden="true">
            {roundTransition === 'bats' ? (
              <div className="hod-bat-swarm">
                <span className="hod-bat" />
                <span className="hod-bat" />
                <span className="hod-bat" />
                <span className="hod-bat" />
                <span className="hod-bat" />
                <span className="hod-bat" />
                <span className="hod-bat" />
              </div>
            ) : (
              <div className="hod-web-transition">
                <span className="hod-transition-web" />
                <span className="hod-transition-spider">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>
          <strong>
            {roundTransition === 'bats' ? 'The deck changes shape' : 'The web tightens'}
          </strong>
        </div>
      )}

      {damageFlash !== null && phase === 'playing' && (
        <div className="hod-damage-flash" aria-live="assertive">
          <strong>−{damageFlash}%</strong>
          <span>The darkness took its share</span>
        </div>
      )}

      {phase === 'death' && (
        <div className="hod-death" role="alert" aria-live="assertive">
          <div className="hod-death-cracks" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="hod-void" aria-hidden="true" />
          <div className="hod-death-message">
            <span>YOUR LIGHT IS GONE</span>
            <strong>DARKNESS HAS YOU</strong>
          </div>
        </div>
      )}
    </div>
  )
}

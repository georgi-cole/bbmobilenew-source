import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type { RootState } from '../../store/store'
import {
  completeHouseOfCardsTournament,
  HOUSE_OF_CARDS_TILE_COUNTS,
  resetHouseOfCards,
  startHouseOfCards,
  type HouseOfCardsPrizeType,
  type HouseOfCardsState,
  type PlayerOutcome,
} from '../../features/houseOfCards/houseOfCardsSlice'
import { resolveHouseOfCardsOutcome } from '../../features/houseOfCards/thunks'
import {
  chooseHouseOfCardsAiTool,
  createHouseOfCardsAiProfiles,
  simulateHouseOfCardsAiRound,
} from '../../features/houseOfCards/houseOfCardsAi'
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin'
import { mulberry32 } from '../../store/rng'
import { useHouseOfCardsAudio } from '../../hooks/useHouseOfCardsAudio'
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper'
import ResolvedAvatarImage from '../ResolvedAvatarImage/ResolvedAvatarImage'
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost'
import {
  buildHouseOfCardsBoard,
  buildPortraitPairBoard,
  chooseHouseOfCardsBrightPairSymbol,
  chooseHouseOfCardsAiPair,
  chooseHouseOfCardsFinalWinner,
  resolveHouseOfCardsRoundScore,
  type HouseOfCardsBoardCard,
  type HouseOfCardsPortraitPlayer,
  type HouseOfCardsRoundToolId,
} from './houseOfCardsUtils'
import './HouseOfCardsComp.css'

// A mismatch needs to remain readable after the flip animation has settled,
// especially on slower phones. 760ms could be mostly consumed by rendering.
const MISMATCH_REVEAL_MS = 1_400

interface ParticipantProp {
  id: string
  name: string
  isHuman: boolean
  avatar?: string
  precomputedScore?: number
}

interface Props {
  participantIds: string[]
  participants?: ParticipantProp[]
  prizeType: HouseOfCardsPrizeType
  seed?: number
  premiumPresentation?: boolean
  previewStage?: 'final'
  onComplete?: (completion?: ReactMinigameCompletion) => void
}

interface RoundPerformance {
  score: number
  mistakes: number
  timeMs: number
  tool?: HouseOfCardsRoundToolId
  toolDelta?: number
  toolOutcome?: string
  brightPairBonus?: number
}

interface RoundSummary {
  round: number
  rankedIds: string[]
  eliminatedIds: string[]
  nextActiveIds: string[]
  roundScores: Record<string, RoundPerformance>
  cumulativeScores: Record<string, number>
}

interface CardFlyOffset {
  fromX: number
  fromY: number
  scaleX: number
  scaleY: number
}

interface CardCloneFrame {
  left: number
  top: number
  width: number
  height: number
}

const ROUND_TOOL_CHOICES: Array<{
  id: HouseOfCardsRoundToolId
  title: string
  copy: string
  detail: string
}> = [
  {
    id: 'peek',
    title: 'Peek',
    copy: 'Privately reveal one card you choose for a moment.',
    detail: 'Use the glimpse to plan your next match before the card turns back.',
  },
  {
    id: 'shield',
    title: 'Shield',
    copy: 'Your next mismatch still counts, but keeps its streak and avoids one scoring penalty.',
    detail: 'It protects your score on one mismatch while the round keeps moving.',
  },
  {
    id: 'bonus-bet',
    title: 'Bonus Bet',
    copy: 'Choose when to risk a known pair: +150 on a match, −120 on a miss.',
    detail: 'Arm it when you are ready to risk a pair you think you remember.',
  },
]

const CHARM_CLONE_DURATION_MS = 900
const CHARM_CLONE_STAGGER_MS = 22

type TournamentPhase =
  | 'tool_select'
  | 'playing'
  | 'round_results'
  | 'opening_choice'
  | 'final_playing'
  | 'results'

type BoardStyle = CSSProperties & { '--hoc-columns': number }

function hashId(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function boardColumns(tileCount: number): number {
  if (tileCount <= 8) return 4
  if (tileCount <= 16) return 4
  if (tileCount <= 20) return 5
  return 6
}

function simulateAiPreliminaryScore(params: {
  playerId: string
  round: number
  pairCount: number
  tournamentSeed: number
  ability: number
  cumulativeScores: Record<string, number>
  recentMistakes?: number
  brightTargetSymbol: string
}): RoundPerformance {
  const {
    playerId,
    round,
    pairCount,
    tournamentSeed,
    ability,
    cumulativeScores,
    recentMistakes,
    brightTargetSymbol,
  } = params
  const isBehind =
    (cumulativeScores[playerId] ?? 0) < Math.max(0, ...Object.values(cumulativeScores))
  const tool = chooseHouseOfCardsAiTool({
    playerId,
    round,
    tournamentSeed,
    sessionAbility: ability,
    isBehind,
    pairCount,
    recentMistakes: recentMistakes ?? 1,
  })
  const performance = simulateHouseOfCardsAiRound({
    playerId,
    round,
    pairCount,
    tournamentSeed,
    sessionAbility: ability,
    tool,
    isBehind,
    recentMistakes,
    brightTargetSymbol,
  })
  return performance
}

export default function HouseOfCardsComp({
  participantIds,
  participants,
  prizeType,
  seed,
  premiumPresentation = false,
  previewStage,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch()
  const [sessionSeed] = useState(() => seed ?? cryptoSeed())
  const humanId = useMemo(
    () => participants?.find((participant) => participant.isHuman)?.id ?? participantIds[0] ?? null,
    [participantIds, participants]
  )
  const nameFor = useCallback(
    (id: string) => participants?.find((participant) => participant.id === id)?.name ?? id,
    [participants]
  )
  const portraitPlayers = useMemo<HouseOfCardsPortraitPlayer[]>(() => {
    const supplied = participants?.map(({ id, name, avatar }) => ({ id, name, avatar })) ?? []
    const merged = supplied.length > 0 ? supplied : participantIds.map((id) => ({ id, name: id }))
    return [...new Map(merged.map((player) => [player.id, player])).values()]
  }, [participantIds, participants])
  const aiProfiles = useMemo(
    () => createHouseOfCardsAiProfiles(participantIds, humanId, sessionSeed),
    [participantIds, humanId, sessionSeed]
  )
  const hoc = useAppSelector(
    (state: RootState) => (state as RootState & { houseOfCards?: HouseOfCardsState }).houseOfCards
  )

  const [phase, setPhase] = useState<TournamentPhase>('tool_select')
  const [round, setRound] = useState(1)
  const [activeIds, setActiveIds] = useState<string[]>(participantIds)
  const [cumulativeScores, setCumulativeScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(participantIds.map((id) => [id, 0]))
  )
  const [board, setBoard] = useState<HouseOfCardsBoardCard[]>(() =>
    buildHouseOfCardsBoard(sessionSeed, HOUSE_OF_CARDS_TILE_COUNTS[0] / 2)
  )
  const [flippedIndices, setFlippedIndices] = useState<number[]>([])
  const [locked, setLocked] = useState(false)
  const [matchedPairs, setMatchedPairs] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null)
  const [finalists, setFinalists] = useState<string[]>([])
  const [finalTurnId, setFinalTurnId] = useState<string | null>(null)
  const [finalPoints, setFinalPoints] = useState<Record<string, number>>({})
  const [finalStandings, setFinalStandings] = useState<PlayerOutcome[]>([])
  const [finalAbilitiesUsed, setFinalAbilitiesUsed] = useState<Record<string, boolean>>({})
  const [peekedIndex, setPeekedIndex] = useState<number | null>(null)
  const [roundTool, setRoundTool] = useState<HouseOfCardsRoundToolId | null>(null)
  const [selectedRoundTool, setSelectedRoundTool] = useState<HouseOfCardsRoundToolId | null>(null)
  const [toolTransition, setToolTransition] = useState<'expand' | 'deal' | 'landed' | null>(null)
  const [cardFlyOffsets, setCardFlyOffsets] = useState<CardFlyOffset[]>([])
  const [cardCloneFrame, setCardCloneFrame] = useState<CardCloneFrame | null>(null)
  const [toolUsed, setToolUsed] = useState(false)
  const [peekSelecting, setPeekSelecting] = useState(false)
  const [toolDelta, setToolDelta] = useState(0)
  const [brightPairSymbol, setBrightPairSymbol] = useState(() => {
    const initialBoard = buildHouseOfCardsBoard(sessionSeed, HOUSE_OF_CARDS_TILE_COUNTS[0] / 2)
    return chooseHouseOfCardsBrightPairSymbol(sessionSeed, 1, initialBoard)
  })
  const [brightPairBonus, setBrightPairBonus] = useState(0)

  const roundStartedAtRef = useRef(Date.now())
  const roundCompletedRef = useRef(false)
  const finalCompletedRef = useRef(false)
  const aiTurnRef = useRef(0)
  const aiMemoryRef = useRef<Record<string, Set<number>>>({})
  const aiRecentMistakesRef = useRef<Record<string, number[]>>({})
  const peekTimerRef = useRef<number | null>(null)
  const toolTransitionTimerRef = useRef<number | null>(null)
  const boardWrapRef = useRef<HTMLDivElement>(null)
  const selectedCharmRef = useRef<HTMLButtonElement>(null)
  const charmOriginRef = useRef<{ x: number; y: number; width: number; height: number } | null>(
    null
  )
  const previewAppliedRef = useRef(false)
  const { playFlip, playMatch, playMismatch, playComplete } = useHouseOfCardsAudio(
    phase === 'playing' || phase === 'final_playing'
  )

  const isFinal = phase === 'final_playing'
  const finalPairCount = Math.max(6, Math.min(12, portraitPlayers.length))
  const tileCount = isFinal
    ? finalPairCount * 2
    : (HOUSE_OF_CARDS_TILE_COUNTS[round - 1] ?? HOUSE_OF_CARDS_TILE_COUNTS[4])
  const targetPairs = isFinal ? finalPairCount : tileCount / 2
  const boardStyle: BoardStyle = { '--hoc-columns': boardColumns(tileCount) }

  const resetBoardForRound = useCallback(
    (nextRound: number, priorityIds: string[] = finalists) => {
      const nextTiles = HOUSE_OF_CARDS_TILE_COUNTS[nextRound - 1]
      const nextSeed = sessionSeed ^ Math.imul(nextRound, 0x85ebca6b)
      const nextBoard =
        nextRound === 5
          ? buildPortraitPairBoard(nextSeed, finalPairCount, portraitPlayers, priorityIds)
          : buildHouseOfCardsBoard(nextSeed, nextTiles / 2)
      setRound(nextRound)
      setBoard(nextBoard)
      setBrightPairSymbol(
        nextRound === 5 ? '' : chooseHouseOfCardsBrightPairSymbol(sessionSeed, nextRound, nextBoard)
      )
      setFlippedIndices([])
      setLocked(false)
      setMatchedPairs(0)
      setMistakes(0)
      setStreak(0)
      setBestStreak(0)
      setElapsedSeconds(0)
      setRoundSummary(null)
      setRoundTool(null)
      setSelectedRoundTool(null)
      setToolTransition(null)
      setCardFlyOffsets([])
      setCardCloneFrame(null)
      charmOriginRef.current = null
      if (toolTransitionTimerRef.current !== null) {
        window.clearTimeout(toolTransitionTimerRef.current)
        toolTransitionTimerRef.current = null
      }
      setToolUsed(false)
      setPeekSelecting(false)
      setToolDelta(0)
      setBrightPairBonus(0)
      setPeekedIndex(null)
      aiMemoryRef.current = Object.fromEntries(priorityIds.map((id) => [id, new Set<number>()]))
      roundStartedAtRef.current = Date.now()
      roundCompletedRef.current = false
      setPhase(nextRound === 5 ? 'final_playing' : 'tool_select')
    },
    [finalPairCount, finalists, portraitPlayers, sessionSeed]
  )

  useEffect(
    () => () => {
      if (toolTransitionTimerRef.current !== null) {
        window.clearTimeout(toolTransitionTimerRef.current)
      }
    },
    []
  )

  useLayoutEffect(() => {
    if (toolTransition !== 'deal') return

    const wrap = boardWrapRef.current
    if (!wrap) return
    const boardElement = wrap.querySelector<HTMLElement>('.hoc-board')
    if (!boardElement) return
    const boardBounds = boardElement.getBoundingClientRect()
    const wrapBounds = wrap.getBoundingClientRect()
    setCardCloneFrame({
      left: boardBounds.left - wrapBounds.left + wrap.scrollLeft,
      top: boardBounds.top - wrapBounds.top + wrap.scrollTop,
      width: boardBounds.width,
      height: boardBounds.height,
    })
    const origin = charmOriginRef.current ?? {
      x: boardBounds.left + boardBounds.width / 2,
      y: boardBounds.top + boardBounds.height / 2,
      width: boardBounds.width / 3,
      height: boardBounds.height / 2,
    }
    const offsets = Array.from(
      wrap.querySelectorAll<HTMLButtonElement>('.hoc-board > .hoc-card')
    ).map((card) => {
      const cardBounds = card.getBoundingClientRect()
      return {
        fromX: origin.x - (cardBounds.left + cardBounds.width / 2),
        fromY: origin.y - (cardBounds.top + cardBounds.height / 2),
        scaleX: origin.width > 0 ? cardBounds.width / origin.width : 0.25,
        scaleY: origin.height > 0 ? cardBounds.height / origin.height : 0.5,
      }
    })
    setCardFlyOffsets(offsets)
  }, [board.length, toolTransition])

  const startFinal = useCallback(
    (candidateIds: string[], scores: Record<string, number>) => {
      const ranked = candidateIds
        .slice()
        .sort(
          (a, b) =>
            (scores[b] ?? 0) - (scores[a] ?? 0) ||
            participantIds.indexOf(a) - participantIds.indexOf(b)
        )
      const selected = ranked.slice(0, 2)
      if (selected.length < 2) {
        const fallback = participantIds
          .filter((id) => !selected.includes(id))
          .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0]
        if (fallback) selected.push(fallback)
      }
      setFinalists(selected)
      setActiveIds(selected)
      setFinalPoints(Object.fromEntries(selected.map((id) => [id, 0])))
      setFinalTurnId(selected[0] ?? null)
      setFinalAbilitiesUsed(Object.fromEntries(selected.map((id) => [id, false])))
      setCumulativeScores(scores)
      finalCompletedRef.current = false
      aiTurnRef.current = 0
      aiMemoryRef.current = Object.fromEntries(selected.map((id) => [id, new Set<number>()]))
      resetBoardForRound(5, selected)
      const strongerId = selected[0]
      const otherId = selected[1]
      if (strongerId && otherId && strongerId === humanId) {
        setFinalTurnId(null)
        setPhase('opening_choice')
      } else if (strongerId && otherId) {
        const openingRng = mulberry32((sessionSeed ^ hashId(strongerId) ^ 0x5eeda11) >>> 0)
        const strongerOpens =
          openingRng() < 0.54 + (aiProfiles[strongerId]?.sessionAbility ?? 55) / 360
        setFinalTurnId(strongerOpens ? strongerId : otherId)
        setPhase('final_playing')
      }
    },
    [aiProfiles, humanId, participantIds, resetBoardForRound, sessionSeed]
  )

  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      previewStage !== 'final' ||
      previewAppliedRef.current ||
      participantIds.length < 2
    )
      return
    previewAppliedRef.current = true
    startFinal(participantIds, cumulativeScores)
  }, [cumulativeScores, participantIds, previewStage, startFinal])

  useEffect(
    () => () => {
      if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current)
    },
    []
  )

  useEffect(() => {
    dispatch(startHouseOfCards({ participantIds, humanId, prizeType, seed: sessionSeed }))
    return () => {
      dispatch(resetHouseOfCards())
    }
    // A remount defines a new tournament session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'playing' && phase !== 'final_playing') return
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - roundStartedAtRef.current) / 1_000))
    }, 250)
    return () => window.clearInterval(timer)
  }, [phase, round])

  const finishPreliminaryRound = useCallback(() => {
    if (roundCompletedRef.current || round > 4) return
    roundCompletedRef.current = true
    const pairs = HOUSE_OF_CARDS_TILE_COUNTS[round - 1] / 2
    const roundScores: Record<string, RoundPerformance> = {}
    activeIds.forEach((id) => {
      if (id === humanId) {
        const timeMs = Math.max(1, Date.now() - roundStartedAtRef.current)
        const scoringMistakes =
          roundTool === 'shield' && toolUsed ? Math.max(0, mistakes - 1) : mistakes
        roundScores[id] = {
          mistakes,
          timeMs,
          score: resolveHouseOfCardsRoundScore({
            pairCount: pairs,
            mistakes,
            scoringMistakes,
            timeMs,
            bestStreak,
            toolBonus: toolDelta,
            brightPairBonus,
          }),
          tool: roundTool ?? undefined,
          toolDelta: toolDelta || undefined,
          toolOutcome:
            roundTool === 'shield' && toolUsed
              ? 'Shield absorbed a scoring penalty'
              : roundTool === 'bonus-bet' && toolUsed
                ? `Bonus Bet ${toolDelta > 0 ? 'hit' : 'missed'}`
                : roundTool === 'peek' && toolUsed
                  ? 'Peeked privately'
                  : undefined,
          brightPairBonus: brightPairBonus || undefined,
        }
      } else {
        const recent = aiRecentMistakesRef.current[id] ?? []
        const performance = simulateAiPreliminaryScore({
          playerId: id,
          round,
          pairCount: pairs,
          tournamentSeed: sessionSeed,
          ability: aiProfiles[id]?.sessionAbility ?? 55,
          cumulativeScores,
          recentMistakes: recent.length
            ? recent.reduce((sum, value) => sum + value, 0) / recent.length
            : undefined,
          brightTargetSymbol: brightPairSymbol,
        })
        roundScores[id] = performance
        aiRecentMistakesRef.current[id] = [...recent, performance.mistakes].slice(-3)
      }
    })
    const nextScores = { ...cumulativeScores }
    activeIds.forEach((id) => {
      nextScores[id] = (nextScores[id] ?? 0) + roundScores[id].score
    })
    const rankedIds = activeIds.slice().sort((a, b) => {
      return (
        nextScores[b] - nextScores[a] ||
        roundScores[b].score - roundScores[a].score ||
        roundScores[a].mistakes - roundScores[b].mistakes ||
        roundScores[a].timeMs - roundScores[b].timeMs
      )
    })
    const nextActiveIds =
      round === 4
        ? rankedIds.slice(0, 2)
        : round <= 2
          ? rankedIds
          : rankedIds.length > 2
            ? rankedIds.slice(0, -1)
            : rankedIds
    const eliminatedIds = rankedIds.filter((id) => !nextActiveIds.includes(id))
    setCumulativeScores(nextScores)
    setRoundSummary({
      round,
      rankedIds,
      eliminatedIds,
      nextActiveIds,
      roundScores,
      cumulativeScores: nextScores,
    })
    setPhase('round_results')
  }, [
    activeIds,
    aiProfiles,
    bestStreak,
    brightPairBonus,
    brightPairSymbol,
    cumulativeScores,
    humanId,
    mistakes,
    round,
    roundTool,
    sessionSeed,
    toolDelta,
    toolUsed,
  ])

  useEffect(() => {
    if (phase === 'playing' && matchedPairs >= targetPairs) finishPreliminaryRound()
  }, [finishPreliminaryRound, matchedPairs, phase, targetPairs])

  const simulateRemainingPreliminaryRounds = useCallback(
    (startRound: number, startingIds: string[], startingScores: Record<string, number>) => {
      let ids = [...startingIds]
      const scores = { ...startingScores }
      for (let simulatedRound = startRound; simulatedRound <= 4; simulatedRound += 1) {
        const pairs = HOUSE_OF_CARDS_TILE_COUNTS[simulatedRound - 1] / 2
        const performances = Object.fromEntries(
          ids.map((id) => [
            id,
            simulateAiPreliminaryScore({
              playerId: id,
              round: simulatedRound,
              pairCount: pairs,
              tournamentSeed: sessionSeed,
              ability: aiProfiles[id]?.sessionAbility ?? 55,
              cumulativeScores: scores,
              recentMistakes: aiRecentMistakesRef.current[id]
                ?.slice(-3)
                .reduce((sum, value, _index, values) => sum + value / values.length, 0),
              brightTargetSymbol: '',
            }),
          ])
        )
        ids.forEach((id) => {
          aiRecentMistakesRef.current[id] = [
            ...(aiRecentMistakesRef.current[id] ?? []),
            performances[id].mistakes,
          ].slice(-3)
        })
        ids.forEach((id) => {
          scores[id] = (scores[id] ?? 0) + performances[id].score
        })
        ids.sort((a, b) => scores[b] - scores[a] || performances[b].score - performances[a].score)
        ids =
          simulatedRound === 4
            ? ids.slice(0, 2)
            : simulatedRound <= 2
              ? ids
              : ids.length > 2
                ? ids.slice(0, -1)
                : ids
      }
      startFinal(ids, scores)
    },
    [aiProfiles, sessionSeed, startFinal]
  )

  const continueRound = useCallback(() => {
    if (!roundSummary) return
    if (roundSummary.round === 4) {
      startFinal(roundSummary.nextActiveIds, roundSummary.cumulativeScores)
      return
    }
    if (humanId && roundSummary.nextActiveIds.includes(humanId)) {
      setActiveIds(roundSummary.nextActiveIds)
      resetBoardForRound(roundSummary.round + 1)
      return
    }
    simulateRemainingPreliminaryRounds(
      roundSummary.round + 1,
      roundSummary.nextActiveIds,
      roundSummary.cumulativeScores
    )
  }, [humanId, resetBoardForRound, roundSummary, simulateRemainingPreliminaryRounds, startFinal])

  const skipToResults = useCallback(() => {
    if (!roundSummary) return
    let ids = [...roundSummary.nextActiveIds]
    const scores = { ...roundSummary.cumulativeScores }
    for (let simulatedRound = roundSummary.round + 1; simulatedRound <= 4; simulatedRound += 1) {
      const pairCount = HOUSE_OF_CARDS_TILE_COUNTS[simulatedRound - 1] / 2
      const performances = Object.fromEntries(
        ids.map((id) => [
          id,
          simulateAiPreliminaryScore({
            playerId: id,
            round: simulatedRound,
            pairCount,
            tournamentSeed: sessionSeed,
            ability: aiProfiles[id]?.sessionAbility ?? 55,
            cumulativeScores: scores,
            recentMistakes: aiRecentMistakesRef.current[id]
              ?.slice(-3)
              .reduce((sum, value, _index, values) => sum + value / values.length, 0),
            brightTargetSymbol: '',
          }),
        ])
      )
      ids.forEach((id) => {
        aiRecentMistakesRef.current[id] = [
          ...(aiRecentMistakesRef.current[id] ?? []),
          performances[id].mistakes,
        ].slice(-3)
      })
      ids.forEach((id) => {
        scores[id] = (scores[id] ?? 0) + performances[id].score
      })
      ids.sort((a, b) => scores[b] - scores[a] || performances[b].score - performances[a].score)
      ids =
        simulatedRound === 4
          ? ids.slice(0, 2)
          : simulatedRound <= 2
            ? ids
            : ids.length > 2
              ? ids.slice(0, -1)
              : ids
    }
    const selected = ids.slice(0, 2)
    if (selected.length < 2) {
      const fallback = participantIds
        .filter((id) => !selected.includes(id))
        .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0]
      if (fallback) selected.push(fallback)
    }
    if (selected.length < 2) return
    const firstFinalPoints = Math.max(
      1,
      Math.min(finalPairCount - 1, 7 + (((hashId(selected[0]) ^ sessionSeed) >>> 0) % 7))
    )
    const simulatedFinalPoints = {
      [selected[0]]: firstFinalPoints,
      [selected[1]]: finalPairCount - firstFinalPoints,
    }
    const winnerId = chooseHouseOfCardsFinalWinner(
      selected as [string, string],
      simulatedFinalPoints,
      scores
    )
    const loserId = selected.find((id) => id !== winnerId) ?? selected[1]
    const orderedIds = [
      winnerId,
      loserId,
      ...participantIds
        .filter((id) => !selected.includes(id))
        .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0)),
    ]
    const standings = orderedIds.map((id, index) => ({
      playerId: id,
      matchedPairs: simulatedFinalPoints[id] ?? 0,
      mistakes: 0,
      turnsTaken: 0,
      didFinish: true,
      completionTimeMs: null,
      streakBest: 0,
      clashScore: (scores[id] ?? 0) + (simulatedFinalPoints[id] ?? 0) * 10_000,
      finalRank: index + 1,
    }))
    setFinalists(selected)
    setActiveIds(selected)
    setCumulativeScores(scores)
    setFinalPoints(simulatedFinalPoints)
    setFinalStandings(standings)
    setRoundSummary(null)
    setFinalTurnId(null)
    finalCompletedRef.current = true
    roundCompletedRef.current = true
    setRound(5)
    setBoard(buildHouseOfCardsBoard(sessionSeed ^ Math.imul(5, 0x85ebca6b), finalPairCount))
    dispatch(
      completeHouseOfCardsTournament({
        standings: standings.map(({ finalRank: _rank, ...outcome }) => outcome),
      })
    )
    setPhase('results')
  }, [aiProfiles, dispatch, finalPairCount, participantIds, roundSummary, sessionSeed])

  const resolvePair = useCallback(
    (firstIndex: number, secondIndex: number) => {
      const first = board[firstIndex]
      const second = board[secondIndex]
      if (!first || !second) return
      activeIds.forEach((id) => {
        const memory = aiMemoryRef.current[id] ?? new Set<number>()
        memory.add(firstIndex)
        memory.add(secondIndex)
        aiMemoryRef.current[id] = memory
      })
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
        if (phase === 'final_playing' && finalTurnId) {
          setFinalPoints((points) => ({
            ...points,
            [finalTurnId]: (points[finalTurnId] ?? 0) + 1,
          }))
        } else {
          if (roundTool === 'bonus-bet' && peekSelecting && !toolUsed) {
            setToolDelta(150)
            setToolUsed(true)
            setPeekSelecting(false)
          }
          if (
            first.symbol === brightPairSymbol &&
            brightPairBonus === 0 &&
            matchedPairs < Math.ceil(targetPairs / 2)
          ) {
            setBrightPairBonus(120)
          }
          setStreak((value) => {
            const next = value + 1
            setBestStreak((best) => Math.max(best, next))
            return next
          })
        }
        window.setTimeout(() => setLocked(false), 260)
        return
      }

      playMismatch()
      if (phase === 'playing' && roundTool === 'bonus-bet' && peekSelecting && !toolUsed) {
        setToolDelta(-120)
        setToolUsed(true)
        setPeekSelecting(false)
      }
      setBoard((current) =>
        current.map((card, index) =>
          index === firstIndex || index === secondIndex
            ? { ...card, isFlipped: true, isMismatch: true }
            : card
        )
      )
      if (phase === 'playing') {
        setMistakes((value) => value + 1)
        if (roundTool === 'shield' && !toolUsed) setToolUsed(true)
        else setStreak(0)
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
        if (phase === 'final_playing') {
          setFinalTurnId((turn) => finalists.find((id) => id !== turn) ?? turn)
        }
        setLocked(false)
      }, MISMATCH_REVEAL_MS)
    },
    [
      activeIds,
      board,
      brightPairBonus,
      brightPairSymbol,
      finalTurnId,
      finalists,
      matchedPairs,
      peekSelecting,
      phase,
      playMatch,
      playMismatch,
      roundTool,
      targetPairs,
      toolUsed,
    ]
  )

  const handleCardClick = useCallback(
    (cardIndex: number) => {
      if (locked || (phase !== 'playing' && phase !== 'final_playing')) return
      if (phase === 'final_playing' && finalTurnId !== humanId) return
      const card = board[cardIndex]
      if (!card || card.isMatched || card.isFlipped) return
      if (phase === 'playing' && peekSelecting && roundTool === 'peek' && !toolUsed) {
        aiMemoryRef.current[humanId ?? '']?.add(cardIndex)
        setPeekedIndex(cardIndex)
        setToolUsed(true)
        setPeekSelecting(false)
        setLocked(true)
        if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current)
        peekTimerRef.current = window.setTimeout(() => {
          peekTimerRef.current = null
          setPeekedIndex(null)
          setLocked(false)
        }, 1_150)
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
      finalTurnId,
      flippedIndices,
      humanId,
      locked,
      peekSelecting,
      phase,
      playFlip,
      resolvePair,
      roundTool,
      toolUsed,
    ]
  )

  const chooseRoundTool = useCallback(
    (tool: HouseOfCardsRoundToolId) => {
      if (phase !== 'tool_select' || round > 4 || toolTransition !== null) return
      setRoundTool(tool)
      setToolUsed(false)
      setToolDelta(0)
      setBrightPairBonus(0)
      setPeekSelecting(false)
      if (!premiumPresentation) {
        roundStartedAtRef.current = Date.now()
        setPhase('playing')
        return
      }

      setSelectedRoundTool(tool)
      setToolTransition('expand')
      toolTransitionTimerRef.current = window.setTimeout(() => {
        const charmBounds = selectedCharmRef.current?.getBoundingClientRect()
        if (charmBounds) {
          charmOriginRef.current = {
            x: charmBounds.left + charmBounds.width / 2,
            y: charmBounds.top + charmBounds.height / 2,
            width: charmBounds.width,
            height: charmBounds.height,
          }
        }
        setToolTransition('deal')
        roundStartedAtRef.current = Date.now()
        setPhase('playing')
        toolTransitionTimerRef.current = window.setTimeout(
          () => {
            setToolTransition('landed')
            toolTransitionTimerRef.current = null
          },
          CHARM_CLONE_DURATION_MS + Math.max(0, board.length - 1) * CHARM_CLONE_STAGGER_MS + 80
        )
      }, 620)
    },
    [board.length, phase, premiumPresentation, round, toolTransition]
  )

  const chooseFinalOpening = useCallback(
    (choice: 'open' | 'defer') => {
      if (phase !== 'opening_choice' || finalists.length < 2 || finalists[0] !== humanId) return
      setFinalTurnId(choice === 'open' ? finalists[0] : finalists[1])
      setPhase('final_playing')
    },
    [finalists, humanId, phase]
  )

  const activateFinalToken = useCallback(
    (playerId: string, action: 'peek' | 'pass') => {
      if (
        phase !== 'final_playing' ||
        locked ||
        playerId !== humanId ||
        finalTurnId !== humanId ||
        finalAbilitiesUsed[playerId]
      )
        return
      const unmatchedPairs = targetPairs - matchedPairs
      if (action === 'pass') {
        if (unmatchedPairs <= 2) return
        setFinalAbilitiesUsed((current) => ({ ...current, [playerId]: true }))
        setFinalTurnId(finalists.find((id) => id !== playerId) ?? playerId)
        return
      }
      const hiddenCards = board.filter((card) => !card.isMatched && !card.isFlipped)
      if (hiddenCards.length === 0) return
      const rng = mulberry32(
        (sessionSeed ^ hashId(playerId) ^ aiTurnRef.current ^ 0x9e3779b9) >>> 0
      )
      const card = hiddenCards[Math.floor(rng() * hiddenCards.length)]
      if (!card) return
      const memory = aiMemoryRef.current[playerId] ?? new Set<number>()
      memory.add(card.index)
      aiMemoryRef.current[playerId] = memory
      setFinalAbilitiesUsed((current) => ({ ...current, [playerId]: true }))
      setPeekedIndex(card.index)
      setLocked(true)
      if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current)
      peekTimerRef.current = window.setTimeout(() => {
        peekTimerRef.current = null
        setPeekedIndex(null)
        setLocked(false)
      }, 1_150)
    },
    [
      board,
      finalists,
      finalAbilitiesUsed,
      finalTurnId,
      humanId,
      locked,
      matchedPairs,
      phase,
      sessionSeed,
      targetPairs,
    ]
  )

  useEffect(() => {
    if (
      phase !== 'final_playing' ||
      !finalTurnId ||
      finalTurnId === humanId ||
      locked ||
      matchedPairs >= targetPairs
    )
      return
    const timer = window.setTimeout(
      () => {
        if (!finalAbilitiesUsed[finalTurnId]) {
          const hiddenCards = board.filter((card) => !card.isMatched && !card.isFlipped)
          const rng = mulberry32(
            (sessionSeed ^ hashId(finalTurnId) ^ aiTurnRef.current ^ 0x9e3779b9) >>> 0
          )
          const unmatchedPairs = targetPairs - matchedPairs
          const memory = aiMemoryRef.current[finalTurnId] ?? new Set<number>()
          const shouldPass = unmatchedPairs > 2 && memory.size >= 4 && rng() < 0.2
          if (shouldPass) {
            setFinalAbilitiesUsed((current) => ({ ...current, [finalTurnId]: true }))
            setFinalTurnId(finalists.find((id) => id !== finalTurnId) ?? finalTurnId)
            return
          }
          const peekedCard = hiddenCards[Math.floor(rng() * hiddenCards.length)]
          if (peekedCard) memory.add(peekedCard.index)
          aiMemoryRef.current[finalTurnId] = memory
          setFinalAbilitiesUsed((current) => ({ ...current, [finalTurnId]: true }))
          return
        }
        const turn = aiTurnRef.current++
        const pair = chooseHouseOfCardsAiPair({
          board,
          rememberedIndexes: aiMemoryRef.current[finalTurnId] ?? new Set<number>(),
          seed: (sessionSeed ^ hashId(finalTurnId) ^ turn) >>> 0,
          skill: aiProfiles[finalTurnId]?.sessionAbility ?? 55,
        })
        if (!pair) return
        const [firstIndex, secondIndex] = pair
        setBoard((current) =>
          current.map((card) =>
            card.index === firstIndex || card.index === secondIndex
              ? { ...card, isFlipped: true }
              : card
          )
        )
        resolvePair(firstIndex, secondIndex)
      },
      850 + (aiTurnRef.current % 3) * 260
    )
    return () => window.clearTimeout(timer)
  }, [
    aiProfiles,
    board,
    finalAbilitiesUsed,
    finalTurnId,
    finalists,
    humanId,
    locked,
    matchedPairs,
    phase,
    resolvePair,
    sessionSeed,
    targetPairs,
  ])

  useEffect(() => {
    if (
      phase !== 'final_playing' ||
      matchedPairs < targetPairs ||
      finalCompletedRef.current ||
      finalists.length < 2
    )
      return
    finalCompletedRef.current = true
    const [first, second] = finalists
    const winnerId = chooseHouseOfCardsFinalWinner([first, second], finalPoints, cumulativeScores)
    const finalistLoser = finalists.find((id) => id !== winnerId)!
    const orderedIds = [
      winnerId,
      finalistLoser,
      ...participantIds
        .filter((id) => !finalists.includes(id))
        .sort((a, b) => (cumulativeScores[b] ?? 0) - (cumulativeScores[a] ?? 0)),
    ]
    const standingsWithoutRank: Array<Omit<PlayerOutcome, 'finalRank'>> = orderedIds.map((id) => ({
      playerId: id,
      matchedPairs: finalists.includes(id) ? (finalPoints[id] ?? 0) : 0,
      mistakes: 0,
      turnsTaken: 0,
      didFinish: true,
      completionTimeMs: finalists.includes(id) ? Date.now() - roundStartedAtRef.current : null,
      streakBest: 0,
      clashScore: (cumulativeScores[id] ?? 0) + (finalPoints[id] ?? 0) * 10_000,
    }))
    const ranked = standingsWithoutRank.map((outcome, index) => ({
      ...outcome,
      finalRank: index + 1,
    }))
    setFinalStandings(ranked)
    dispatch(completeHouseOfCardsTournament({ standings: standingsWithoutRank }))
    playComplete()
    setPhase('results')
  }, [
    cumulativeScores,
    dispatch,
    finalPoints,
    finalists,
    matchedPairs,
    participantIds,
    phase,
    playComplete,
    targetPairs,
  ])

  useEffect(() => {
    if (hoc?.status !== 'complete' || onComplete) return
    dispatch(resolveHouseOfCardsOutcome())
  }, [dispatch, hoc?.status, onComplete])

  const finish = useCallback(() => {
    if (finalStandings.length === 0) return
    const rawResults = Object.fromEntries(
      finalStandings.map((entry) => [entry.playerId, entry.clashScore])
    )
    onComplete?.({
      rawValue: humanId ? (rawResults[humanId] ?? 0) : 0,
      rawResults,
      authoritativeWinnerId: finalStandings[0].playerId,
      authoritativeLastPlaceId: finalStandings[finalStandings.length - 1].playerId,
    })
  }, [finalStandings, humanId, onComplete])

  if (phase === 'tool_select') {
    return (
      <div
        className="hoc-root"
        data-phase="tool_select"
        data-presentation={premiumPresentation ? 'premium' : 'standard'}
        data-tool-transition={toolTransition ?? undefined}
      >
        <div className="hoc-atmosphere" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <header className="hoc-game-heading">
          <span className="hoc-game-heading__kicker">Round {round} of 4 · choose one tool</span>
          <strong>Deck of Light</strong>
          <span>
            Bright Pair: match <b>{brightPairSymbol || 'a hidden symbol'}</b> in the first half for
            +120.
          </span>
        </header>
        <div className="hoc-tool-choices" role="group" aria-label="Choose one tool for this round">
          {ROUND_TOOL_CHOICES.map((choice) => (
            <button
              type="button"
              className={`hoc-tool-choice hoc-tool-choice--${choice.id}`}
              key={choice.id}
              ref={selectedRoundTool === choice.id ? selectedCharmRef : undefined}
              data-selected={selectedRoundTool === choice.id ? 'true' : 'false'}
              aria-hidden={selectedRoundTool !== null && selectedRoundTool !== choice.id}
              disabled={toolTransition !== null && selectedRoundTool !== choice.id}
              onClick={() => chooseRoundTool(choice.id)}
            >
              <span className="hoc-tool-choice__icon" aria-hidden="true">
                {choice.id === 'peek' ? (
                  <svg viewBox="0 0 48 48" focusable="false">
                    <path d="M4.5 24s6.7-11 19.5-11 19.5 11 19.5 11-6.7 11-19.5 11S4.5 24 4.5 24Z" />
                    <circle cx="24" cy="24" r="5.5" />
                  </svg>
                ) : choice.id === 'shield' ? (
                  <svg viewBox="0 0 48 48" focusable="false">
                    <path d="M24 4.5 39 10v11.3c0 10-6.2 17.4-15 22.2-8.8-4.8-15-12.2-15-22.2V10l15-5.5Z" />
                    <path d="m17.5 23.5 4.3 4.3 9-9" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 48 48" focusable="false">
                    <path d="m24 4.5 5.4 13 13.1 5.5-13.1 5.4L24 41.5l-5.4-13.1L5.5 23l13.1-5.5L24 4.5Z" />
                    <path d="m38 5 1.5 4.5L44 11l-4.5 1.5L38 17l-1.5-4.5L32 11l4.5-1.5L38 5Z" />
                  </svg>
                )}
              </span>
              <strong>{choice.title}</strong>
              <span className="hoc-tool-choice__copy">
                {selectedRoundTool === choice.id ? choice.detail : choice.copy}
              </span>
            </button>
          ))}
        </div>
        <p className="hoc-round-summary">
          One tool each board · same options and scoring for every player.
        </p>
      </div>
    )
  }

  if (phase === 'opening_choice') {
    return (
      <div
        className="hoc-root"
        data-phase="opening_choice"
        data-presentation={premiumPresentation ? 'premium' : 'standard'}
      >
        <div className="hoc-atmosphere" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <header className="hoc-game-heading">
          <span className="hoc-game-heading__kicker">Portrait duel · {finalPairCount} pairs</span>
          <strong>Deck of Light</strong>
          <span>
            Your preliminary score leads the finalists. Take the opening turn or let{' '}
            {nameFor(finalists[1] ?? '')} begin.
          </span>
        </header>
        {premiumPresentation && (
          <div className="hoc-opening-duel" aria-label="Finalists">
            {finalists.slice(0, 2).map((id, index) => {
              const finalist = participants?.find((participant) => participant.id === id)
              return (
                <div
                  className={`hoc-opening-duelist hoc-opening-duelist--${index === 0 ? 'light' : 'shadow'}`}
                  key={id}
                >
                  <ResolvedAvatarImage
                    className="hoc-opening-duelist__portrait"
                    id={id}
                    name={nameFor(id)}
                    avatar={finalist?.avatar}
                    isUser={id === humanId}
                    alt=""
                    loading="eager"
                  />
                  <span className="hoc-opening-duelist__role">
                    {id === humanId ? 'YOU' : 'FINALIST'}
                  </span>
                  <strong>{nameFor(id)}</strong>
                  <small>
                    {finalPoints[id] ?? 0} pairs · token{' '}
                    {finalAbilitiesUsed[id] ? 'spent' : 'ready'}
                  </small>
                </div>
              )
            })}
            <span className="hoc-opening-duel__versus" aria-hidden="true">
              VS
            </span>
          </div>
        )}
        <div
          className={`hoc-tool-choices hoc-opening-choices${premiumPresentation ? ' hoc-opening-choices--premium' : ''}`}
          role="group"
          aria-label="Choose who opens the finale"
        >
          <button
            type="button"
            className={`hoc-tool-choice hoc-opening-choice${premiumPresentation ? ' hoc-opening-choice--open' : ''}`}
            onClick={() => chooseFinalOpening('open')}
          >
            {premiumPresentation && (
              <span className="hoc-opening-choice__mark" aria-hidden="true">
                <svg viewBox="0 0 48 48" focusable="false">
                  <path d="M8 15h23a8 8 0 0 1 8 8v1" />
                  <path d="m33 18 6 6-6 6" />
                  <path d="M40 33H17a8 8 0 0 1-8-8v-1" />
                  <path d="m15 30-6-6 6-6" />
                </svg>
              </span>
            )}
            {premiumPresentation && (
              <span className="hoc-opening-choice__eyebrow">CLAIM THE MOMENT</span>
            )}
            <strong>Open the duel</strong>
            <span className="hoc-opening-choice__description">
              Use your finale token and play first.
            </span>
          </button>
          <button
            type="button"
            className={`hoc-tool-choice hoc-opening-choice${premiumPresentation ? ' hoc-opening-choice--defer' : ''}`}
            onClick={() => chooseFinalOpening('defer')}
          >
            {premiumPresentation && (
              <span className="hoc-opening-choice__mark" aria-hidden="true">
                <svg viewBox="0 0 48 48" focusable="false">
                  <path d="M5 24s6.6-11 19-11 19 11 19 11-6.6 11-19 11S5 24 5 24Z" />
                  <circle cx="24" cy="24" r="5" />
                  <path d="M24 4v4M24 40v4M4 24h4M40 24h4" />
                </svg>
              </span>
            )}
            {premiumPresentation && (
              <span className="hoc-opening-choice__eyebrow">READ THE TABLE</span>
            )}
            <strong>Defer the opening</strong>
            <span className="hoc-opening-choice__description">
              Let {nameFor(finalists[1] ?? '')} take the first turn.
            </span>
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'round_results' && roundSummary) {
    return (
      <MinigameCompleteWrapper
        className={`hoc-complete hoc-round-results hoc-complete--${premiumPresentation ? 'premium' : 'standard'}`}
        panelClassName="hoc-round-results-panel"
        onContinue={continueRound}
        continueLabel={
          humanId && roundSummary.nextActiveIds.includes(humanId)
            ? 'Next round'
            : 'Watch the finalists'
        }
        continueButtonClassName="hoc-complete-continue"
        footerNode={
          humanId && !roundSummary.nextActiveIds.includes(humanId) ? (
            <button
              type="button"
              className="hoc-complete-continue hoc-complete-continue--secondary"
              onClick={skipToResults}
            >
              Skip to results
            </button>
          ) : undefined
        }
        placementsNode={
          <ol className="hoc-standings-list" aria-label={`Round ${roundSummary.round} standings`}>
            {roundSummary.rankedIds.map((id, index) => (
              <li
                key={id}
                className={`hoc-standing-row${id === humanId ? ' hoc-standing--human' : ''}${roundSummary.eliminatedIds.includes(id) ? ' hoc-standing--last' : ''}`}
              >
                <span className="hoc-standing-rank">{index + 1}</span>
                <div className="hoc-standing-summary">
                  <strong>
                    {nameFor(id)}
                    {id === humanId ? ' (You)' : ''}
                  </strong>
                  <span>
                    {roundSummary.roundScores[id].mistakes} misses ·{' '}
                    {(roundSummary.roundScores[id].timeMs / 1_000).toFixed(1)}s
                    {roundSummary.roundScores[id].tool
                      ? ` · ${roundSummary.roundScores[id].toolOutcome ?? roundSummary.roundScores[id].tool}`
                      : ''}
                    {roundSummary.roundScores[id].brightPairBonus ? ' · Bright Pair +120' : ''}
                  </span>
                </div>
                <strong>{roundSummary.cumulativeScores[id].toLocaleString()}</strong>
              </li>
            ))}
          </ol>
        }
      >
        <h2 className="hoc-complete-title">Round {roundSummary.round} complete</h2>
        <p className="hoc-round-summary">
          {roundSummary.roundScores[humanId ?? '']?.toolOutcome
            ? `${roundSummary.roundScores[humanId ?? ''].toolOutcome}. `
            : ''}
          {roundSummary.roundScores[humanId ?? '']?.brightPairBonus ? 'Bright Pair +120. ' : ''}
          {roundSummary.eliminatedIds.length > 0
            ? `${roundSummary.eliminatedIds.map(nameFor).join(', ')} eliminated.`
            : 'The field advances.'}
        </p>
      </MinigameCompleteWrapper>
    )
  }

  if (phase === 'results' && finalStandings.length > 0) {
    const winner = finalStandings[0]
    return (
      <MinigameCompleteWrapper
        className={`hoc-complete hoc-complete--${premiumPresentation ? 'premium' : 'standard'}`}
        onContinue={finish}
        continueButtonClassName="hoc-complete-continue"
        placementsNode={
          <ol className="hoc-standings-list" aria-label="Final standings">
            {finalStandings.map((outcome) => (
              <li
                key={outcome.playerId}
                className={`hoc-standing-row${outcome.finalRank === 1 ? ' hoc-standing--winner' : ''}${outcome.playerId === humanId ? ' hoc-standing--human' : ''}`}
              >
                <span className="hoc-standing-rank">{outcome.finalRank}</span>
                <div className="hoc-standing-summary">
                  <strong>
                    {nameFor(outcome.playerId)}
                    {outcome.playerId === humanId ? ' (You)' : ''}
                  </strong>
                  <span>
                    {finalists.includes(outcome.playerId)
                      ? `${finalPoints[outcome.playerId] ?? 0} final pairs`
                      : 'Eliminated in preliminaries'}
                  </span>
                </div>
                <strong>{outcome.clashScore}</strong>
              </li>
            ))}
          </ol>
        }
      >
        <h2 className="hoc-complete-title">🏆 {nameFor(winner.playerId)} wins Deck of Light</h2>
        <p className="hoc-round-summary">Five rounds complete</p>
      </MinigameCompleteWrapper>
    )
  }

  const humanCanPlay = !isFinal || finalTurnId === humanId
  return (
    <div
      className="hoc-root"
      data-phase={phase}
      data-presentation={premiumPresentation ? 'premium' : 'standard'}
      data-tool-transition={toolTransition ?? undefined}
    >
      <div className="hoc-atmosphere" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <header className="hoc-game-heading">
        <span className="hoc-game-heading__kicker">Memory tournament</span>
        <strong>Deck of Light</strong>
        <span>
          {isFinal
            ? 'The finalists share one portrait board.'
            : `Bright Pair: ${brightPairSymbol} · one tool this round`}
        </span>
      </header>
      <div className="hoc-hud">
        <div className="hoc-hud-stat">
          <strong>Round {round}/5</strong>
          <span>{tileCount} tiles</span>
        </div>
        <div className="hoc-hud-stat">
          <strong>{elapsedSeconds}s</strong>
          <span>Elapsed · no limit</span>
        </div>
        <div className="hoc-hud-stat">
          <strong>
            {matchedPairs}/{targetPairs}
          </strong>
          <span>Pairs</span>
        </div>
        {!isFinal && (
          <div className="hoc-hud-stat">
            <strong>{mistakes}</strong>
            <span>Misses</span>
          </div>
        )}
        {!isFinal && (
          <div className="hoc-hud-stat">
            <strong>{streak}×</strong>
            <span>Streak</span>
          </div>
        )}
      </div>

      {!isFinal && humanCanPlay && roundTool && (
        <div className="hoc-round-tool" aria-live="polite">
          <span>
            {roundTool === 'bonus-bet'
              ? 'Bonus Bet · choose a pair attempt to risk'
              : `${roundTool === 'peek' ? 'Peek' : 'Shield'} · ${toolUsed ? 'used' : 'ready'}`}
          </span>
          {roundTool === 'peek' && !toolUsed && (
            <button type="button" onClick={() => setPeekSelecting((selecting) => !selecting)}>
              {peekSelecting ? 'Select a hidden card' : 'Use Peek'}
            </button>
          )}
          {roundTool === 'bonus-bet' && !toolUsed && (
            <button
              type="button"
              aria-pressed={peekSelecting}
              onClick={() => setPeekSelecting((armed) => !armed)}
            >
              {peekSelecting ? 'Bonus Bet armed · cancel' : 'Arm Bonus Bet'}
            </button>
          )}
          {roundTool === 'shield' && !toolUsed && <span>Protects your next mismatch.</span>}
          {toolUsed && (
            <strong>
              {roundTool === 'bonus-bet'
                ? `${toolDelta > 0 ? '+' : ''}${toolDelta}`
                : roundTool === 'shield'
                  ? 'Penalty protected'
                  : 'Card seen'}
            </strong>
          )}
        </div>
      )}
      {!isFinal && peekSelecting && roundTool === 'bonus-bet' && (
        <p className="hoc-tool-hint">The next pair attempt will consume your Bonus Bet.</p>
      )}

      {isFinal && (
        <div className="hoc-final-score" aria-live="polite">
          <strong>
            {nameFor(finalists[0] ?? '')}: {finalPoints[finalists[0] ?? ''] ?? 0}
            <small>Token · {finalAbilitiesUsed[finalists[0] ?? ''] ? 'spent' : 'ready'}</small>
          </strong>
          <span>
            {nameFor(finalTurnId ?? '')}'s turn
            {humanCanPlay ? ' — plays until a miss' : ' — choosing…'}
          </span>
          <strong>
            {nameFor(finalists[1] ?? '')}: {finalPoints[finalists[1] ?? ''] ?? 0}
            <small>Token · {finalAbilitiesUsed[finalists[1] ?? ''] ? 'spent' : 'ready'}</small>
          </strong>
        </div>
      )}
      {isFinal && humanCanPlay && humanId && !finalAbilitiesUsed[humanId] && (
        <div className="hoc-final-token-actions">
          <button
            className="hoc-glimpse-button"
            type="button"
            onClick={() => activateFinalToken(humanId, 'peek')}
          >
            ✨ Peek at one card
          </button>
          {targetPairs - matchedPairs > 2 && (
            <button
              className="hoc-glimpse-button hoc-glimpse-button--secondary"
              type="button"
              onClick={() => activateFinalToken(humanId, 'pass')}
            >
              Pass this turn
            </button>
          )}
        </div>
      )}

      <div
        className="hoc-board-wrap"
        ref={boardWrapRef}
        data-round={round}
        data-tool-transition={toolTransition ?? undefined}
      >
        <div
          className="hoc-board"
          style={boardStyle}
          role="grid"
          aria-label={isFinal ? 'Shared final card grid' : `Round ${round} card grid`}
        >
          {board.map((card) => (
            <button
              key={card.index}
              className="hoc-card"
              style={
                {
                  '--hoc-card-index': card.index,
                } as CSSProperties
              }
              type="button"
              role="gridcell"
              data-flipped={
                card.isFlipped || (isFinal && peekedIndex === card.index) ? 'true' : 'false'
              }
              data-matched={card.isMatched ? 'true' : 'false'}
              data-mismatch={card.isMismatch ? 'true' : 'false'}
              disabled={
                locked ||
                card.isMatched ||
                !humanCanPlay ||
                (isFinal && !finalTurnId) ||
                toolTransition === 'deal'
              }
              onClick={() => handleCardClick(card.index)}
              aria-label={
                card.isFlipped || card.isMatched || (isFinal && peekedIndex === card.index)
                  ? (card.portraitName ?? card.symbol)
                  : 'Hidden card'
              }
            >
              <span className="hoc-card-inner">
                <span className="hoc-card-face hoc-card-back">
                  <span className="hoc-card-back-pattern" />
                  {premiumPresentation && (
                    <img
                      className="hoc-premium-card-art"
                      src={`${import.meta.env.BASE_URL}assets/minigames/deck-of-light-card-back.webp`}
                      alt=""
                      aria-hidden="true"
                    />
                  )}
                  <svg className="hoc-card-eye" viewBox="0 0 24 24" aria-hidden="true">
                    <ellipse cx="12" cy="12" rx="10" ry="6" />
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="12" r="1.2" className="hoc-card-eye-pupil" />
                  </svg>
                </span>
                <span
                  className={`hoc-card-face hoc-card-front${card.portraitPlayerId ? ' hoc-portrait-face' : ''}`}
                >
                  {card.portraitPlayerId && card.portraitName ? (
                    <>
                      <ResolvedAvatarImage
                        className="hoc-portrait-face__image"
                        id={card.portraitPlayerId}
                        name={card.portraitName}
                        avatar={card.portraitAvatar}
                        isUser={card.portraitPlayerId === humanId}
                        alt=""
                        loading={isFinal ? 'eager' : 'lazy'}
                      />
                      <span className="hoc-portrait-face__name">{card.portraitName}</span>
                      {card.portraitBadge && (
                        <span className="hoc-portrait-face__badge">{card.portraitBadge}</span>
                      )}
                    </>
                  ) : (
                    card.symbol
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
        {premiumPresentation && toolTransition === 'deal' && cardCloneFrame && (
          <div
            className="hoc-charm-clone-layer"
            aria-hidden="true"
            style={
              {
                ...boardStyle,
                left: `${cardCloneFrame.left}px`,
                top: `${cardCloneFrame.top}px`,
                width: `${cardCloneFrame.width}px`,
                height: `${cardCloneFrame.height}px`,
              } as CSSProperties
            }
          >
            {board.map((card) => (
              <div
                key={card.index}
                className="hoc-card hoc-charm-clone"
                style={
                  {
                    '--hoc-card-index': card.index,
                    '--charm-source-width': `${charmOriginRef.current?.width ?? 390}px`,
                    '--charm-source-height': `${charmOriginRef.current?.height ?? 228}px`,
                    '--charm-mid-x': `${(cardFlyOffsets[card.index]?.fromX ?? 0) * 0.5}px`,
                    '--charm-mid-y': `${(cardFlyOffsets[card.index]?.fromY ?? 0) * 0.5}px`,
                    '--charm-scale-x': cardFlyOffsets[card.index]?.scaleX ?? 0.25,
                    '--charm-scale-y': cardFlyOffsets[card.index]?.scaleY ?? 0.5,
                    '--charm-start-x': `${cardFlyOffsets[card.index]?.fromX ?? 0}px`,
                    '--charm-start-y': `${cardFlyOffsets[card.index]?.fromY ?? 0}px`,
                  } as CSSProperties
                }
              >
                <span className="hoc-card-inner">
                  {selectedRoundTool && (
                    <div
                      className={`hoc-charm-copy hoc-charm-copy--${selectedRoundTool}`}
                      aria-hidden="true"
                    >
                      <strong>
                        {
                          ROUND_TOOL_CHOICES.find((choice) => choice.id === selectedRoundTool)
                            ?.title
                        }
                      </strong>
                      <span>
                        {ROUND_TOOL_CHOICES.find((choice) => choice.id === selectedRoundTool)?.copy}
                      </span>
                      <span>
                        {
                          ROUND_TOOL_CHOICES.find((choice) => choice.id === selectedRoundTool)
                            ?.detail
                        }
                      </span>
                    </div>
                  )}
                  <span className="hoc-card-face hoc-card-back hoc-charm-clone__back-face">
                    <span className="hoc-card-back-pattern" />
                    <img
                      className="hoc-premium-card-art hoc-charm-clone__back"
                      src={`${import.meta.env.BASE_URL}assets/minigames/deck-of-light-card-back.webp`}
                      alt=""
                    />
                    <svg className="hoc-card-eye" viewBox="0 0 24 24">
                      <ellipse cx="12" cy="12" rx="10" ry="6" />
                      <circle cx="12" cy="12" r="3" />
                      <circle cx="12" cy="12" r="1.2" className="hoc-card-eye-pupil" />
                    </svg>
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

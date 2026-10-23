import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslate } from '../../i18n'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import {
  applyRoundReset,
  buildAiVoteRecords,
  buildFinalRawResults,
  CHAIN_TURN_PIPELINE_DURATIONS,
  CHAIN_LADDER,
  type ChainActionResolution,
  createChainOfGreedPlayers,
  createChainOfGreedRng,
  createInitialChainState,
  decideAiAction,
  decideSoloRushMove,
  FINAL_ROUND_DURATION_MS,
  formatInfluence,
  getNextNumberOdds,
  getStandardRoundEliminationCount,
  getStandardRoundTurnCap,
  rankFinalPlayersByScore,
  rankPlayersByScore,
  rankPlayersByRoundPerformance,
  rankSoloRushPlayers,
  resolveChainAction,
  resolveChainOfGreedParticipants,
  resolvePawnedRoundBank,
  resolveVoteElimination,
  SEMIFINAL_TURNS_PER_PLAYER,
  SOLO_RUSH_DURATION_MS,
  shouldAiUseSafety,
  summarizeRound,
  type ChainAction,
  type ChainOfGreedChainState,
  type ChainOfGreedPlayerState,
  type ChainOfGreedTieBreakInfo,
  type ChainOfGreedTurnRecord,
  type ChainOfGreedVoteRecord,
} from './chainOfGreedLogic'
import './ChainOfGreed.css'

type Phase =
  | 'modeSelect'
  | 'roundIntro'
  | 'playerTurn'
  | 'roundSummary'
  | 'voting'
  | 'voteReveal'
  | 'eliminationReveal'
  | 'semifinalIntro'
  | 'semifinalTurn'
  | 'semifinalReveal'
  | 'finalIntro'
  | 'finalTurn'
  | 'finalResult'

type TurnPhaseKind = 'standard' | 'semifinal' | 'final'
type GameMode = 'shared' | 'solo'
const SOLO_RUSH_ROUND_COUNT = 4
const SHARED_CHAIN_TOTAL_DURATION_MS = 5 * 60 * 1000

function getSharedRoundDurationMs(startingPlayers: number, activePlayers: number) {
  let expectedPlayers = startingPlayers
  let plannedTurns = 0
  for (let round = 1; round <= STANDARD_ROUND_COUNT && expectedPlayers > 2; round += 1) {
    plannedTurns += getStandardRoundTurnCap(expectedPlayers)
    expectedPlayers -= getStandardRoundEliminationCount(startingPlayers, round, expectedPlayers)
  }
  if (plannedTurns === 0) return SHARED_CHAIN_TOTAL_DURATION_MS
  return Math.round(
    (SHARED_CHAIN_TOTAL_DURATION_MS * getStandardRoundTurnCap(activePlayers)) / plannedTurns
  )
}
type TurnPipelineStage =
  | 'decision'
  | 'reveal'
  | 'verdict'
  | 'consequence'
  | 'ladderUpdate'
  | 'settle'

interface ChainOfGreedState {
  phase: Phase
  gameMode: GameMode
  players: ChainOfGreedPlayerState[]
  startingCount: number
  roundNumber: number
  securedTotal: number
  roundSecured: number
  chain: ChainOfGreedChainState
  turnOrder: string[]
  turnIndex: number
  turnsRemaining: number
  statusText: string
  helperText: string
  turnHistory: ChainOfGreedTurnRecord[]
  showHelp: boolean
  revealedNumber: number | null
  humanVoteTargetId: string | null
  pendingVotes: ChainOfGreedVoteRecord[]
  revealedVotes: number
  tieBreaks: ChainOfGreedTieBreakInfo[]
  eliminatedThisStep: string[]
  semifinalOrder: string[]
  semifinalTurnIndex: number
  semifinalScores: Record<string, number>
  semifinalChains: Record<string, ChainOfGreedChainState>
  semifinalTieBreak: ChainOfGreedTieBreakInfo | null
  semifinalEliminatedId: string | null
  finalOrder: string[]
  finalTurnIndex: number
  finalScores: Record<string, number>
  finalChains: Record<string, ChainOfGreedChainState>
  soloImmunityIds: string[]
  winnerIds: string[]
  finalTieBreak: ChainOfGreedTieBreakInfo | null
  winnerId: string | null
  spectatorMode: 'watching' | 'skipping' | null
  finalTimerExpiry: number | null
  finalTimerPausedRemaining: number | null
}

interface PendingTurnPipeline {
  actorId: string
  actorName: string
  kind: TurnPhaseKind
  choice: ChainAction
  stage: TurnPipelineStage
  referenceNumber: number
  resolution: ChainActionResolution
  historyEntry: ChainOfGreedTurnRecord
  verdictText: string
  consequenceText: string
  tone: 'neutral' | 'success' | 'bank' | 'danger'
  turnEnds: boolean
  turnsRemainingBefore?: number
  turnIndexBefore?: number
  orderLength?: number
  chainBefore: ChainOfGreedChainState
  pawnStake?: number
}

const TURN_HELPERS = [
  'Build the chain or bank it.',
  'A wrong guess destroys the active pot.',
  'Call Equal when the odds favor a match.',
  'Banking saves the pot, but resets momentum.',
  'The higher the chain, the more painful the risk.',
]

const FINAL_HELPERS = [
  'No more sympathy. Only performance.',
  'The chain is personal now.',
  'One winner takes the entire influence pool.',
]

const momentGlyphs: Record<Exclude<ChainOfGreedPlayerState['latestMoment'], null>, string> = {
  safe: '•',
  higher: '↑',
  equal: '=',
  lower: '↓',
  wrong: '✕',
  bank: '💰',
  bust: '✖',
}
const TURN_PIPELINE_STAGE_ORDER: Record<Exclude<TurnPipelineStage, 'settle'>, TurnPipelineStage> = {
  decision: 'reveal',
  reveal: 'verdict',
  verdict: 'consequence',
  consequence: 'ladderUpdate',
  ladderUpdate: 'settle',
}

const STORY_AI_PIPELINE_DURATIONS: Record<TurnPipelineStage, number> = {
  decision: 160,
  reveal: 480,
  verdict: 130,
  consequence: 260,
  ladderUpdate: 160,
  settle: 100,
}

const STORY_DRAMATIC_PIPELINE_DURATIONS: Record<TurnPipelineStage, number> = {
  decision: 200,
  reveal: 650,
  verdict: 180,
  consequence: 370,
  ladderUpdate: 220,
  settle: 130,
}

const QUICK_AI_PIPELINE_DURATIONS: Record<TurnPipelineStage, number> = {
  decision: 100,
  reveal: 330,
  verdict: 80,
  consequence: 170,
  ladderUpdate: 110,
  settle: 70,
}

const HUMAN_PIPELINE_DURATIONS: Record<TurnPipelineStage, number> = {
  decision: 150,
  reveal: 500,
  verdict: 130,
  consequence: 260,
  ladderUpdate: 170,
  settle: 100,
}

const FAST_FINAL_BANK_PIPELINE_DURATIONS: Record<TurnPipelineStage, number> = {
  decision: 120,
  reveal: 130,
  verdict: 130,
  consequence: 160,
  ladderUpdate: 120,
  settle: 120,
}

const STANDARD_ROUND_COUNT = 5
const ROUND_INTRO_DURATION_MS = 1_500
const SKIP_TO_RESULTS_STEP_MS = 8

function emitSoundCue(cue: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('bb:minigame-sound', {
      detail: { source: 'ChainOfGreed', cue },
    })
  )
}

function rotateOrder(ids: string[], offset: number) {
  if (ids.length === 0) return ids
  const safeOffset = ((offset % ids.length) + ids.length) % ids.length
  return [...ids.slice(safeOffset), ...ids.slice(0, safeOffset)]
}

function getActivePlayers(players: ChainOfGreedPlayerState[]) {
  return players.filter((player) => !player.isEliminated)
}

function getPlayer(players: ChainOfGreedPlayerState[], id: string | null) {
  return players.find((player) => player.id === id) ?? null
}

function getPlayerInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? 'P'
  const second = words.length > 1 ? words[1]?.[0] : words[0]?.[1]
  return `${first}${second ?? ''}`.toUpperCase()
}

function getSafeAvatarDisplay(player: ChainOfGreedPlayerState | null) {
  if (!player) return 'BB'
  const avatar = player.avatar.trim()
  const looksLikeRawImageText = /profile|photo|image|avatar|https?:|[/]|[a-f0-9]{8}/i.test(avatar)
  if (!avatar || avatar.length > 4 || looksLikeRawImageText) return getPlayerInitials(player.name)
  return avatar
}

function buildIndividualOrder(ids: string[], turnsPerPlayer: number) {
  return Array.from({ length: turnsPerPlayer }, () => ids).flat()
}

function pickHumanVoteTarget(players: ChainOfGreedPlayerState[], humanId: string | null) {
  return players.find((player) => !player.isEliminated && player.id !== humanId)?.id ?? null
}

function getStepBadge(step: number) {
  if (step === CHAIN_LADDER.length) return 'Max'
  return null
}

function getPlayerTurnMessage(players: ChainOfGreedPlayerState[], turnOrder: string[]) {
  const firstPlayer = getPlayer(players, turnOrder[0] ?? null)
  return `${firstPlayer?.name ?? 'Player'} to play.`
}

function getTurnOrderPlayerId(turnOrder: string[], turnIndex: number) {
  if (turnOrder.length === 0) return null
  return turnOrder[turnIndex % turnOrder.length] ?? null
}

interface SimulatedFinalAiRound {
  chain: ChainOfGreedChainState
  score: number
  mistakes: number
  correct: number
  banks: number
  recovered: number
  lost: number
  safetyAvailable: boolean
  immunityEarned: boolean
}

function simulateFinalAiWindow(
  aiPlayer: ChainOfGreedPlayerState,
  startChain: ChainOfGreedChainState,
  startScore: number,
  durationMs: number,
  activePlayers: ChainOfGreedPlayerState[],
  rng: () => number,
  allowPawn: boolean
): SimulatedFinalAiRound {
  let chain = startChain
  let score = startScore
  let mistakes = 0
  let correct = 0
  let banks = 0
  let recovered = 0
  let lost = 0
  let safetyAvailable = aiPlayer.safetyAvailable
  let immunityEarned = false
  let virtualTimeRemaining = durationMs
  let bankAvailableForSim = true
  let actionCount = 0

  while (virtualTimeRemaining > 0 && actionCount < 20) {
    const remainingDecisions = Math.max(1, Math.floor(virtualTimeRemaining / 3_600))
    const soloMove: ReturnType<typeof decideSoloRushMove> | null = allowPawn
      ? decideSoloRushMove(
          aiPlayer,
          chain,
          score,
          bankAvailableForSim,
          virtualTimeRemaining / 1_000
        )
      : null
    const choice: ChainAction =
      soloMove?.choice ??
      decideAiAction({
        player: aiPlayer,
        chain,
        remainingTurns: remainingDecisions,
        phase: 'final',
        activePlayers,
        playerScore: score,
        bankAvailable: bankAvailableForSim,
      })
    const pawnStake = soloMove?.pawnStake ?? 0
    const useSafety =
      pawnStake === 0 && safetyAvailable && shouldAiUseSafety(aiPlayer, chain, choice)
    const resolution = resolveChainAction(choice, chain, rng, useSafety)
    score =
      pawnStake > 0
        ? resolvePawnedRoundBank(
            score,
            pawnStake,
            Boolean(resolution.wasCorrect),
            resolution.individualDelta
          )
        : score + resolution.individualDelta
    mistakes += resolution.wasCorrect === false ? 1 : 0
    correct += resolution.wasCorrect === true ? 1 : 0
    banks += choice === 'bank' ? 1 : 0
    recovered += resolution.recoveredDelta
    lost += resolution.lostAmount
    safetyAvailable = resolution.safetyUsed ? false : safetyAvailable
    chain = resolution.updatedChain
    if (resolution.wasCorrect && resolution.updatedChain.step >= CHAIN_LADDER.length) {
      immunityEarned = true
    }
    bankAvailableForSim = choice !== 'bank'
    const thinkingTime = choice === 'bank' ? 650 + rng() * 650 : 1_800 + rng() * 2_400
    virtualTimeRemaining -= thinkingTime
    actionCount += 1
  }

  return {
    chain,
    score,
    mistakes,
    correct,
    banks,
    recovered,
    lost,
    safetyAvailable,
    immunityEarned,
  }
}

function getActionVerb(choice: ChainAction) {
  return choice === 'bank'
    ? 'BANK'
    : choice === 'higher'
      ? 'HIGHER'
      : choice === 'equal'
        ? 'EQUAL'
        : 'LOWER'
}

function getDecisionText(actorName: string, isHuman: boolean, choice: ChainAction) {
  return `${isHuman ? 'You' : actorName} chose ${getActionVerb(choice)}.`
}

function getTurnVerdict(resolution: ChainActionResolution) {
  if (resolution.revealedNumber === null) return 'Bank secured'
  if (resolution.safetyUsed && resolution.wasCorrect) return 'Safety spent · correct'
  return resolution.wasCorrect ? 'Correct' : 'Wrong'
}

function getTurnConsequenceText(
  choice: ChainAction,
  resolution: ChainActionResolution,
  chainBefore: ChainOfGreedChainState
) {
  const bankedAmount = Math.max(resolution.securedDelta, resolution.individualDelta)
  if (choice === 'bank') {
    return `Banked +${bankedAmount.toLocaleString()}. Chain reset. A guess is still required.`
  }
  if (resolution.wasCorrect) {
    const safety = resolution.safetyUsed ? 'Safety spent. ' : ''
    return `${safety}Chain up. Step ${chainBefore.step} -> ${resolution.updatedChain.step}. Pot ${chainBefore.pot.toLocaleString()} -> ${resolution.updatedChain.pot.toLocaleString()}.`
  }
  if (resolution.safetyUsed) {
    return `Safety recovered ${resolution.recoveredDelta.toLocaleString()}. Lost ${resolution.lostAmount.toLocaleString()}.`
  }
  const lost = resolution.lostAmount.toLocaleString()
  return resolution.equalMiss
    ? `Chain Broken. Equal reveal. Lost ${lost}.`
    : `Chain Broken. Lost ${lost}.`
}

function isBankAvailable(
  bankedTurn: { actorId: string; kind: TurnPhaseKind } | null,
  actorId: string | null,
  kind: TurnPhaseKind
) {
  return !actorId || bankedTurn?.actorId !== actorId || bankedTurn.kind !== kind
}

function getTurnHistoryMessage(
  actorName: string,
  choice: ChainAction,
  resolution: ChainActionResolution
) {
  if (choice === 'bank') {
    return `${actorName} banked ${Math.max(resolution.securedDelta, resolution.individualDelta).toLocaleString()}.`
  }
  if (resolution.safetyUsed && !resolution.wasCorrect) {
    return `${actorName} guessed ${getActionVerb(choice)} — missed; Safety recovered ${resolution.recoveredDelta.toLocaleString()}.`
  }
  const verdict = resolution.wasCorrect ? 'Correct' : 'Wrong'
  return `${actorName} guessed ${getActionVerb(choice)} — ${verdict}${resolution.safetyUsed ? ' (Safety spent)' : ''}.`
}

function getTurnTone(
  choice: ChainAction,
  resolution: ChainActionResolution
): PendingTurnPipeline['tone'] {
  if (choice === 'bank') return 'bank'
  if (resolution.wasCorrect) return 'success'
  if (resolution.wasCorrect === false) return 'danger'
  return 'neutral'
}

function getLatestMoment(
  choice: ChainAction,
  resolution: ChainActionResolution
): ChainOfGreedPlayerState['latestMoment'] {
  if (choice === 'bank') return 'bank'
  if (resolution.wasCorrect) return choice
  if (resolution.safetyUsed) return 'safe'
  return resolution.busted ? 'bust' : 'wrong'
}

function getNextTurnStatus(
  actorName: string,
  isHuman: boolean,
  choice: ChainAction,
  resolution: ChainActionResolution
) {
  if (choice === 'bank') {
    return `${isHuman ? 'You' : actorName} banked ${Math.max(resolution.securedDelta, resolution.individualDelta).toLocaleString()}. ${isHuman ? 'Choose' : 'Still needs'} lower, equal, or higher next.`
  }
  if (resolution.wasCorrect) {
    return `${isHuman ? 'You were' : `${actorName} was`} correct.`
  }
  return `${isHuman ? 'You were' : `${actorName} was`} wrong.`
}

function isDramaticAiTurn(turn: PendingTurnPipeline) {
  const bankedAmount = Math.max(turn.resolution.securedDelta, turn.resolution.individualDelta)
  return (
    (turn.choice === 'bank' && bankedAmount >= 400) ||
    turn.resolution.lostAmount >= 400 ||
    turn.resolution.updatedChain.step >= 6 ||
    turn.chainBefore.step >= 6 ||
    turn.chainBefore.step >= CHAIN_LADDER.length - 1 ||
    turn.resolution.updatedChain.step >= CHAIN_LADDER.length
  )
}

function getPipelineDuration(
  turn: PendingTurnPipeline,
  players: ChainOfGreedPlayerState[],
  watchPace: 'story' | 'quick'
) {
  if (turn.kind === 'final' && turn.choice === 'bank')
    return FAST_FINAL_BANK_PIPELINE_DURATIONS[turn.stage]
  const actor = getPlayer(players, turn.actorId)
  if (actor && !actor.isHuman && turn.kind !== 'final') {
    if (watchPace === 'quick') return QUICK_AI_PIPELINE_DURATIONS[turn.stage]
    return (
      isDramaticAiTurn(turn) ? STORY_DRAMATIC_PIPELINE_DURATIONS : STORY_AI_PIPELINE_DURATIONS
    )[turn.stage]
  }
  return HUMAN_PIPELINE_DURATIONS[turn.stage]
}

function getAiWaitingText(pendingTurn: PendingTurnPipeline | null, isBankUsedThisTurn: boolean) {
  if (pendingTurn?.stage === 'decision') return 'has made the call…'
  if (pendingTurn) return 'is watching the reveal…'
  if (isBankUsedThisTurn) return 'must still guess…'
  return 'is reading the board…'
}

function getBankedHelperText(isHuman: boolean) {
  return isHuman
    ? 'Bank is spent for this turn. You still need a higher, equal, or lower guess.'
    : 'Bank is spent for this turn. A higher, equal, or lower guess is still required.'
}

function buildInitialState(props: GenericMinigameProps): ChainOfGreedState {
  const { rng } = createChainOfGreedRng(props.seed)
  const resolvedParticipants = resolveChainOfGreedParticipants(props)
  const players = createChainOfGreedPlayers(resolvedParticipants, rng)
  const activePlayers = getActivePlayers(players)
  const turnOrder = rotateOrder(
    activePlayers.map((player) => player.id),
    0
  )
  return {
    phase: 'modeSelect',
    gameMode: 'shared',
    players,
    startingCount: activePlayers.length,
    roundNumber: 1,
    securedTotal: 0,
    roundSecured: 0,
    chain: createInitialChainState(rng),
    turnOrder,
    turnIndex: 0,
    turnsRemaining: getStandardRoundTurnCap(activePlayers.length),
    statusText: `Round 1. Build the chain. Bank before it breaks.`,
    helperText: TURN_HELPERS[0],
    turnHistory: [],
    showHelp: false,
    revealedNumber: null,
    humanVoteTargetId: pickHumanVoteTarget(
      players,
      players.find((player) => player.isHuman)?.id ?? null
    ),
    pendingVotes: [],
    revealedVotes: 0,
    tieBreaks: [],
    eliminatedThisStep: [],
    semifinalOrder: [],
    semifinalTurnIndex: 0,
    semifinalScores: {},
    semifinalChains: {},
    semifinalTieBreak: null,
    semifinalEliminatedId: null,
    finalOrder: [],
    finalTurnIndex: 0,
    finalScores: {},
    finalChains: {},
    soloImmunityIds: [],
    winnerIds: [],
    finalTieBreak: null,
    winnerId: null,
    spectatorMode: null,
    finalTimerExpiry: null,
    finalTimerPausedRemaining: null,
  }
}

export default function ChainOfGreed(props: GenericMinigameProps) {
  const t = useTranslate()
  const [state, setState] = useState<ChainOfGreedState>(() => buildInitialState(props))
  const [selectedModePreview, setSelectedModePreview] = useState<GameMode | null>(null)
  const [isLadderSheetOpen, setIsLadderSheetOpen] = useState(false)
  const [isInsightsSheetOpen, setIsInsightsSheetOpen] = useState(false)
  const [pendingTurn, setPendingTurn] = useState<PendingTurnPipeline | null>(null)
  const [bankedTurn, setBankedTurn] = useState<{ actorId: string; kind: TurnPhaseKind } | null>(
    null
  )
  const [isResultCommitted, setIsResultCommitted] = useState(false)
  const [finalSecondsRemaining, setFinalSecondsRemaining] = useState<number | null>(null)
  const [sharedTimerExpiry, setSharedTimerExpiry] = useState<number | null>(null)
  const [sharedSecondsRemaining, setSharedSecondsRemaining] = useState<number | null>(null)
  const [finalDetailExpanded, setFinalDetailExpanded] = useState(false)
  const [watchPace, setWatchPace] = useState<'story' | 'quick'>('story')
  const [isPlaybackPaused, setIsPlaybackPaused] = useState(false)
  const [isSafetyArmed, setIsSafetyArmed] = useState(false)
  const [isPawnArmed, setIsPawnArmed] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [isVoteHistoryOpen, setIsVoteHistoryOpen] = useState(false)
  const [isVoteBallotsOpen, setIsVoteBallotsOpen] = useState(false)
  const rngRef = useRef(createChainOfGreedRng(props.seed))
  const helperIndexRef = useRef(0)
  const aiTurnLockRef = useRef<string | null>(null)
  const soloResolutionLockRef = useRef<{
    roundNumber: number
    finalTurnIndex: number
    finalTimerExpiry: number | null
    finalScores: Record<string, number>
  } | null>(null)
  const voteRevealLockRef = useRef<string | null>(null)
  const resultCommitLockRef = useRef(false)
  const playerRailRef = useRef<HTMLDivElement | null>(null)
  const playerCardRefs = useRef<Record<string, HTMLElement | null>>({})

  const activePlayers = useMemo(() => getActivePlayers(state.players), [state.players])
  const humanPlayer = useMemo(
    () => state.players.find((player) => player.isHuman) ?? null,
    [state.players]
  )
  const currentTurnPlayer = useMemo(
    () =>
      state.phase === 'playerTurn'
        ? getPlayer(state.players, getTurnOrderPlayerId(state.turnOrder, state.turnIndex))
        : null,
    [state.phase, state.players, state.turnIndex, state.turnOrder]
  )
  const semifinalPlayer = useMemo(
    () =>
      state.phase === 'semifinalTurn'
        ? getPlayer(state.players, state.semifinalOrder[state.semifinalTurnIndex] ?? null)
        : null,
    [state.phase, state.players, state.semifinalOrder, state.semifinalTurnIndex]
  )
  const finalPlayer = useMemo(
    () =>
      state.phase === 'finalTurn'
        ? getPlayer(state.players, state.finalOrder[state.finalTurnIndex] ?? null)
        : null,
    [state.phase, state.players, state.finalOrder, state.finalTurnIndex]
  )
  const summary = useMemo(() => summarizeRound(activePlayers), [activePlayers])
  const strongestRoundPlayer = useMemo(
    () => rankPlayersByRoundPerformance(activePlayers)[0] ?? null,
    [activePlayers]
  )
  const humanRoundBank = humanPlayer ? (state.finalScores[humanPlayer.id] ?? 0) : 0

  const nextHelper = useCallback((pool: string[]) => {
    helperIndexRef.current += 1
    return pool[helperIndexRef.current % pool.length] ?? pool[0] ?? ''
  }, [])

  function setPhase(phase: Phase, partial: Partial<ChainOfGreedState> = {}) {
    setState((previous) => ({ ...previous, phase, ...partial }))
  }

  function startRound(roundNumber: number, players = state.players, startImmediately = false) {
    if (state.gameMode === 'shared') {
      const duration = getSharedRoundDurationMs(
        state.startingCount,
        getActivePlayers(players).length
      )
      setSharedTimerExpiry(Date.now() + duration)
      setSharedSecondsRemaining(Math.ceil(duration / 1000))
    }
    const nextPlayers = players.map((player) =>
      player.isEliminated ? player : applyRoundReset(player)
    )
    const livePlayers = getActivePlayers(nextPlayers)
    const nextChain = createInitialChainState(rngRef.current.rng)
    const turnOrder = rotateOrder(
      livePlayers.map((player) => player.id),
      roundNumber - 1
    )
    setPendingTurn(null)
    setBankedTurn(null)
    setIsVoteHistoryOpen(false)
    emitSoundCue('round-intro-sting')
    setState((previous) => ({
      ...previous,
      phase: startImmediately ? 'playerTurn' : 'roundIntro',
      players: nextPlayers,
      roundNumber,
      roundSecured: 0,
      turnHistory: [],
      chain: nextChain,
      turnOrder,
      turnIndex: 0,
      turnsRemaining: getStandardRoundTurnCap(livePlayers.length),
      revealedNumber: nextChain.referenceNumber,
      statusText: startImmediately
        ? getPlayerTurnMessage(nextPlayers, turnOrder)
        : `Round ${roundNumber}. Build the chain. Bank before it breaks.`,
      helperText: TURN_HELPERS[0],
      humanVoteTargetId: pickHumanVoteTarget(nextPlayers, humanPlayer?.id ?? null),
      pendingVotes: [],
      revealedVotes: 0,
      tieBreaks: [],
      eliminatedThisStep: [],
    }))
  }

  function startSoloRound(roundNumber: number, players = state.players) {
    const nextPlayers = players.map((player) =>
      player.isEliminated
        ? player
        : {
            ...applyRoundReset(player),
            finalScore: 0,
            finalWrongGuesses: 0,
            finalCorrectGuesses: 0,
            finalBanks: 0,
            latestMoment: null,
          }
    )
    const livePlayers = getActivePlayers(nextPlayers)
    const rotatedIds = rotateOrder(
      livePlayers.map((player) => player.id),
      roundNumber - 1
    )
    const humanId = livePlayers.find((player) => player.isHuman)?.id
    const ids = humanId ? [humanId, ...rotatedIds.filter((id) => id !== humanId)] : rotatedIds
    const chains = Object.fromEntries(
      ids.map((id) => [id, createInitialChainState(rngRef.current.rng)])
    )
    const scores = Object.fromEntries(ids.map((id) => [id, 0]))
    const firstPlayer = getPlayer(nextPlayers, ids[0] ?? null)
    setPendingTurn(null)
    setBankedTurn(null)
    setIsPawnArmed(false)
    setIsSafetyArmed(false)
    setState((previous) => ({
      ...previous,
      phase: 'finalTurn',
      gameMode: 'solo',
      players: nextPlayers,
      roundNumber,
      roundSecured: 0,
      turnHistory: [],
      finalOrder: ids,
      finalTurnIndex: 0,
      finalScores: scores,
      finalChains: chains,
      finalTieBreak: null,
      winnerId: null,
      finalTimerExpiry: firstPlayer?.isHuman ? Date.now() + SOLO_RUSH_DURATION_MS : null,
      finalTimerPausedRemaining: null,
      revealedNumber: chains[ids[0] ?? '']?.referenceNumber ?? null,
      eliminatedThisStep: [],
      statusText: `Solo Rush Round ${roundNumber} of ${SOLO_RUSH_ROUND_COUNT}. Build your bank in one minute.`,
      helperText: 'Bank your chain, then decide whether to pawn your Round Bank.',
    }))
  }

  function selectGameMode(gameMode: GameMode) {
    if (gameMode === 'solo') {
      setSharedTimerExpiry(null)
      setSharedSecondsRemaining(null)
      startSoloRound(1)
      return
    }
    const duration = getSharedRoundDurationMs(
      state.startingCount,
      getActivePlayers(state.players).length
    )
    setSharedTimerExpiry(Date.now() + duration)
    setSharedSecondsRemaining(Math.ceil(duration / 1000))
    setState((previous) => ({
      ...previous,
      phase: 'roundIntro',
      gameMode: 'shared',
      statusText: 'Round 1. Build the chain. Bank before it breaks.',
      helperText: TURN_HELPERS[0],
    }))
  }

  const commitStandardTurn = useCallback(
    (turn: PendingTurnPipeline) => {
      if (
        turn.choice === 'bank' &&
        Math.max(turn.resolution.securedDelta, turn.resolution.individualDelta) > 0
      )
        emitSoundCue('bank-secure-chime')
      if (turn.resolution.wasCorrect) emitSoundCue('correct-guess-tick')
      if (turn.resolution.wasCorrect === false) emitSoundCue('bust-impact')

      setBankedTurn(turn.choice === 'bank' ? { actorId: turn.actorId, kind: 'standard' } : null)

      setState((previous) => {
        const nextPlayers: ChainOfGreedPlayerState[] = previous.players.map((player) => {
          if (player.id !== turn.actorId) return player
          return {
            ...player,
            safetyAvailable: turn.resolution.safetyUsed ? false : player.safetyAvailable,
            turnsTakenThisRound: player.turnsTakenThisRound + (turn.turnEnds ? 1 : 0),
            roundContribution:
              player.roundContribution +
              turn.resolution.securedDelta +
              turn.resolution.recoveredDelta,
            totalContribution:
              player.totalContribution +
              turn.resolution.securedDelta +
              turn.resolution.recoveredDelta,
            roundBanked: player.roundBanked + turn.resolution.securedDelta,
            totalBanked: player.totalBanked + turn.resolution.securedDelta,
            roundRecovered: player.roundRecovered + turn.resolution.recoveredDelta,
            totalRecovered: player.totalRecovered + turn.resolution.recoveredDelta,
            roundLost: player.roundLost + turn.resolution.lostAmount,
            roundCorrectGuesses: player.roundCorrectGuesses + (turn.resolution.wasCorrect ? 1 : 0),
            totalCorrectGuesses: player.totalCorrectGuesses + (turn.resolution.wasCorrect ? 1 : 0),
            roundWrongGuesses:
              player.roundWrongGuesses + (turn.resolution.wasCorrect === false ? 1 : 0),
            totalWrongGuesses:
              player.totalWrongGuesses + (turn.resolution.wasCorrect === false ? 1 : 0),
            roundBanks: player.roundBanks + (turn.choice === 'bank' ? 1 : 0),
            totalBanks: player.totalBanks + (turn.choice === 'bank' ? 1 : 0),
            roundBusts: player.roundBusts + (turn.resolution.busted ? 1 : 0),
            totalBusts: player.totalBusts + (turn.resolution.busted ? 1 : 0),
            latestMoment: getLatestMoment(turn.choice, turn.resolution),
          }
        })
        const nextHistory: ChainOfGreedTurnRecord[] = [
          turn.historyEntry,
          ...previous.turnHistory,
        ].slice(0, 80)
        const nextRoundSecured = previous.roundSecured + turn.resolution.securedDelta
        const nextSecuredTotal =
          previous.securedTotal + turn.resolution.securedDelta + turn.resolution.recoveredDelta

        if (!turn.turnEnds) {
          return {
            ...previous,
            players: nextPlayers,
            chain: turn.resolution.updatedChain,
            turnHistory: nextHistory,
            roundSecured: nextRoundSecured,
            securedTotal: nextSecuredTotal,
            revealedNumber: turn.resolution.revealedNumber,
            statusText: getNextTurnStatus(
              turn.actorName,
              getPlayer(nextPlayers, turn.actorId)?.isHuman ?? false,
              turn.choice,
              turn.resolution
            ),
            helperText: getBankedHelperText(getPlayer(nextPlayers, turn.actorId)?.isHuman ?? false),
          }
        }

        const nextTurnsRemaining =
          previous.gameMode === 'shared'
            ? previous.turnsRemaining
            : (turn.turnsRemainingBefore ?? previous.turnsRemaining) - 1
        if (previous.gameMode !== 'shared' && nextTurnsRemaining <= 0) {
          return {
            ...previous,
            players: nextPlayers,
            chain: turn.resolution.updatedChain,
            phase: 'roundSummary',
            turnsRemaining: 0,
            roundSecured: nextRoundSecured,
            securedTotal: nextSecuredTotal,
            turnHistory: nextHistory,
            revealedNumber: turn.resolution.revealedNumber,
            statusText: 'Take a moment and review the board.',
            helperText: 'Performance matters, but house feelings matter too.',
          }
        }

        const nextTurnIndex = (turn.turnIndexBefore ?? previous.turnIndex) + 1
        const nextPlayer = getPlayer(
          nextPlayers,
          getTurnOrderPlayerId(previous.turnOrder, nextTurnIndex)
        )
        return {
          ...previous,
          players: nextPlayers,
          chain: turn.resolution.updatedChain,
          phase: 'playerTurn',
          turnIndex: nextTurnIndex,
          turnsRemaining: nextTurnsRemaining,
          roundSecured: nextRoundSecured,
          securedTotal: nextSecuredTotal,
          turnHistory: nextHistory,
          revealedNumber: turn.resolution.revealedNumber,
          statusText: `${nextPlayer?.name ?? 'Player'} to play.`,
          helperText: nextHelper(TURN_HELPERS),
        }
      })
    },
    [nextHelper]
  )

  const finishVoting = useCallback(() => {
    setIsVoteHistoryOpen(false)
    setIsVoteBallotsOpen(false)
    const votes = buildAiVoteRecords({
      activePlayers,
      roundNumber: state.roundNumber,
      seed: rngRef.current.seed,
      humanVoteTargetId: state.humanVoteTargetId,
      strategicContext: { relationships: props.relationships, alliances: props.alliances },
    })
    const elimination = resolveVoteElimination({
      activePlayers,
      votes,
      eliminateCount: getStandardRoundEliminationCount(
        state.startingCount,
        state.roundNumber,
        activePlayers.length
      ),
      rng: rngRef.current.rng,
      seed: rngRef.current.seed,
    })
    emitSoundCue('vote-reveal-pulse')
    setState((previous) => ({
      ...previous,
      players: elimination.updatedPlayers,
      phase: 'voteReveal',
      pendingVotes: votes,
      revealedVotes: 0,
      tieBreaks: elimination.tieBreaks,
      eliminatedThisStep: elimination.eliminatedIds,
      statusText: 'The weakest link will now be decided.',
      helperText: 'One bad round can end the game.',
    }))
  }, [
    activePlayers,
    props.alliances,
    props.relationships,
    state.humanVoteTargetId,
    state.roundNumber,
    state.startingCount,
  ])

  const decideHumanVoteTieBreak = useCallback((tieBreakIndex: number, candidateId: string) => {
    setState((previous) => {
      const tieBreak = previous.tieBreaks[tieBreakIndex]
      if (
        !tieBreak?.decisionPending ||
        !tieBreak.candidateIds?.includes(candidateId) ||
        !tieBreak.deciderId
      )
        return previous

      const eliminationCount = tieBreak.eliminationCount ?? 1
      const priorDecisionIds = tieBreak.decisionIds ?? []
      const decisionIds =
        eliminationCount > 1 && priorDecisionIds.includes(candidateId)
          ? priorDecisionIds.filter((id) => id !== candidateId)
          : [...new Set([...priorDecisionIds, candidateId])]
      const selectedNames = decisionIds.map(
        (id) => previous.players.find((player) => player.id === id)?.name ?? id
      )
      if (decisionIds.length < eliminationCount) {
        return {
          ...previous,
          tieBreaks: previous.tieBreaks.map((entry, index) =>
            index === tieBreakIndex ? { ...entry, decisionIds } : entry
          ),
        }
      }

      const eliminatedThisStep = [...new Set([...previous.eliminatedThisStep, ...decisionIds])]
      return {
        ...previous,
        players: previous.players.map((player) =>
          eliminatedThisStep.includes(player.id) ? { ...player, isEliminated: true } : player
        ),
        eliminatedThisStep,
        tieBreaks: previous.tieBreaks.map((entry, index) =>
          index === tieBreakIndex
            ? {
                ...entry,
                decisionPending: false,
                decisionIds,
                transcript: [
                  entry.transcript[0] ?? '',
                  `${entry.deciderName} chose ${selectedNames.join(' and ')} for elimination.`,
                ].filter(Boolean),
              }
            : entry
        ),
      }
    })
  }, [])

  const commitIndividualTurn = useCallback(
    (turn: PendingTurnPipeline) => {
      if (
        turn.choice === 'bank' &&
        Math.max(turn.resolution.securedDelta, turn.resolution.individualDelta) > 0
      )
        emitSoundCue('bank-secure-chime')
      if (turn.resolution.wasCorrect) emitSoundCue('correct-guess-tick')
      if (turn.resolution.wasCorrect === false) emitSoundCue('bust-impact')

      setBankedTurn(turn.choice === 'bank' ? { actorId: turn.actorId, kind: turn.kind } : null)

      setState((previous) => {
        const chainMap = turn.kind === 'semifinal' ? previous.semifinalChains : previous.finalChains
        const scoreMap = turn.kind === 'semifinal' ? previous.semifinalScores : previous.finalScores
        const nextChains = { ...chainMap, [turn.actorId]: turn.resolution.updatedChain }
        const previousScore = scoreMap[turn.actorId] ?? 0
        const pawnedScore =
          turn.kind === 'final' && previous.gameMode === 'solo' && turn.pawnStake
            ? resolvePawnedRoundBank(
                previousScore,
                turn.pawnStake,
                Boolean(turn.resolution.wasCorrect),
                turn.resolution.individualDelta
              )
            : previousScore + turn.resolution.individualDelta
        const nextScores = { ...scoreMap, [turn.actorId]: pawnedScore }
        const reachedFinalStep =
          turn.kind === 'final' &&
          previous.gameMode === 'solo' &&
          turn.resolution.wasCorrect === true &&
          turn.resolution.updatedChain.step >= CHAIN_LADDER.length
        const nextSoloImmunityIds = reachedFinalStep
          ? [...new Set([...previous.soloImmunityIds, turn.actorId])]
          : previous.soloImmunityIds
        const nextPlayers = previous.players.map((player) => {
          if (player.id !== turn.actorId) return player
          const nextScore = nextScores[turn.actorId] ?? 0
          return {
            ...player,
            safetyAvailable: turn.resolution.safetyUsed ? false : player.safetyAvailable,
            totalRecovered: player.totalRecovered + turn.resolution.recoveredDelta,
            roundRecovered: player.roundRecovered + turn.resolution.recoveredDelta,
            roundLost: player.roundLost + turn.resolution.lostAmount,
            latestMoment: getLatestMoment(turn.choice, turn.resolution),
            ...(turn.kind === 'semifinal'
              ? { semifinalScore: nextScore }
              : {
                  finalScore: nextScore,
                  finalWrongGuesses:
                    player.finalWrongGuesses + (turn.resolution.wasCorrect === false ? 1 : 0),
                  finalCorrectGuesses:
                    player.finalCorrectGuesses + (turn.resolution.wasCorrect === true ? 1 : 0),
                  finalBanks: player.finalBanks + (turn.choice === 'bank' ? 1 : 0),
                }),
          }
        })
        const nextHistory: ChainOfGreedTurnRecord[] = [
          turn.historyEntry,
          ...previous.turnHistory,
        ].slice(0, 80)

        if (!turn.turnEnds) {
          return {
            ...previous,
            players: nextPlayers,
            turnHistory: nextHistory,
            revealedNumber: turn.resolution.revealedNumber,
            statusText: getNextTurnStatus(
              turn.actorName,
              getPlayer(nextPlayers, turn.actorId)?.isHuman ?? false,
              turn.choice,
              turn.resolution
            ),
            helperText: getBankedHelperText(getPlayer(nextPlayers, turn.actorId)?.isHuman ?? false),
            ...(turn.kind === 'semifinal'
              ? { semifinalScores: nextScores, semifinalChains: nextChains }
              : {
                  finalScores: nextScores,
                  finalChains: nextChains,
                  soloImmunityIds: nextSoloImmunityIds,
                  finalTimerExpiry: getPlayer(nextPlayers, turn.actorId)?.isHuman
                    ? Date.now() +
                      (previous.finalTimerPausedRemaining ??
                        (previous.gameMode === 'solo'
                          ? SOLO_RUSH_DURATION_MS
                          : FINAL_ROUND_DURATION_MS))
                    : previous.finalTimerExpiry,
                  finalTimerPausedRemaining: getPlayer(nextPlayers, turn.actorId)?.isHuman
                    ? null
                    : previous.finalTimerPausedRemaining,
                }),
          }
        }

        // Timed final: timer (not turn count) drives player advancement
        if (turn.kind === 'final') {
          return {
            ...previous,
            players: nextPlayers,
            turnHistory: nextHistory,
            revealedNumber: turn.resolution.revealedNumber,
            finalScores: nextScores,
            finalChains: nextChains,
            soloImmunityIds: nextSoloImmunityIds,
            finalTimerExpiry: getPlayer(nextPlayers, turn.actorId)?.isHuman
              ? Date.now() +
                (previous.finalTimerPausedRemaining ??
                  (previous.gameMode === 'solo' ? SOLO_RUSH_DURATION_MS : FINAL_ROUND_DURATION_MS))
              : previous.finalTimerExpiry,
            finalTimerPausedRemaining: getPlayer(nextPlayers, turn.actorId)?.isHuman
              ? null
              : previous.finalTimerPausedRemaining,
            statusText: getNextTurnStatus(
              turn.actorName,
              getPlayer(nextPlayers, turn.actorId)?.isHuman ?? false,
              turn.choice,
              turn.resolution
            ),
            helperText: nextHelper(FINAL_HELPERS),
          }
        }

        const nextTurnIndex = (turn.turnIndexBefore ?? 0) + 1
        if (nextTurnIndex >= (turn.orderLength ?? 0)) {
          if (turn.kind === 'semifinal') {
            const invertedScores = Object.fromEntries(
              Object.entries(nextScores).map(([id, score]) => [id, -score])
            )
            const ranking = rankPlayersByScore(invertedScores, nextPlayers, rngRef.current.rng)
            const eliminated = ranking.ordered[0] ?? null
            emitSoundCue('elimination-sting')
            return {
              ...previous,
              players: nextPlayers.map((player) =>
                player.id === eliminated?.id ? { ...player, isEliminated: true } : player
              ),
              phase: 'semifinalReveal',
              semifinalScores: nextScores,
              semifinalChains: nextChains,
              semifinalTieBreak: ranking.tieBreak,
              semifinalEliminatedId: eliminated?.id ?? null,
              turnHistory: nextHistory,
              revealedNumber: turn.resolution.revealedNumber,
              statusText: eliminated
                ? `${eliminated.name} leaves in third place.`
                : 'Semifinal complete.',
              helperText: 'Only two remain.',
            }
          }

          return { ...previous }
        }

        return {
          ...previous,
          players: nextPlayers,
          turnHistory: nextHistory,
          revealedNumber: turn.resolution.revealedNumber,
          statusText: `${getPlayer(nextPlayers, previous.semifinalOrder[nextTurnIndex] ?? null)?.name ?? 'Next player'} to play.`,
          helperText: nextHelper(FINAL_HELPERS),
          semifinalScores: nextScores,
          semifinalChains: nextChains,
          semifinalTurnIndex: nextTurnIndex,
        }
      })
    },
    [nextHelper]
  )

  const resolveStandardAction = useCallback(
    (actorId: string, choice: ChainAction, useSafety = false) => {
      if (pendingTurn) return
      const actor = getPlayer(state.players, actorId)
      if (!actor || (choice === 'bank' && state.chain.pot <= 0)) return
      const resolution = resolveChainAction(
        choice,
        state.chain,
        rngRef.current.rng,
        useSafety && actor.safetyAvailable
      )
      setPendingTurn({
        actorId,
        actorName: actor.name,
        kind: 'standard',
        choice,
        stage: 'decision',
        referenceNumber: state.chain.referenceNumber,
        resolution,
        verdictText: getTurnVerdict(resolution),
        consequenceText: getTurnConsequenceText(choice, resolution, state.chain),
        tone: getTurnTone(choice, resolution),
        chainBefore: state.chain,
        turnEnds: choice !== 'bank',
        turnsRemainingBefore: state.turnsRemaining,
        turnIndexBefore: state.turnIndex,
        historyEntry: {
          actorId,
          actorName: actor.name,
          choice,
          referenceNumber: state.chain.referenceNumber,
          revealedNumber: resolution.revealedNumber,
          wasCorrect: resolution.wasCorrect,
          bankedAmount: choice === 'bank' ? resolution.securedDelta : 0,
          recoveredAmount: resolution.recoveredDelta,
          safetyUsed: resolution.safetyUsed,
          lostAmount: resolution.lostAmount,
          message: getTurnHistoryMessage(actor.name, choice, resolution),
          phase: 'standard',
        },
      })
    },
    [pendingTurn, state]
  )

  const resolveIndividualAction = useCallback(
    (
      kind: 'semifinal' | 'final',
      actorId: string,
      choice: ChainAction,
      useSafety = false,
      pawnStake = 0
    ) => {
      if (pendingTurn) return
      const actor = getPlayer(state.players, actorId)
      const chainMap = kind === 'semifinal' ? state.semifinalChains : state.finalChains
      const turnIndex = kind === 'semifinal' ? state.semifinalTurnIndex : state.finalTurnIndex
      const order = kind === 'semifinal' ? state.semifinalOrder : state.finalOrder
      const actorChain = chainMap[actorId]
      if (!actor || !actorChain) return

      if (choice === 'bank' && actorChain.pot <= 0) return
      if (kind === 'final' && actor.isHuman && state.finalTimerExpiry !== null) {
        const pausedRemaining = Math.max(0, state.finalTimerExpiry - Date.now())
        setState((previous) => ({
          ...previous,
          finalTimerExpiry: null,
          finalTimerPausedRemaining: pausedRemaining,
        }))
      }

      const resolution = resolveChainAction(
        choice,
        actorChain,
        rngRef.current.rng,
        useSafety && actor.safetyAvailable
      )
      const consequenceText =
        pawnStake > 0
          ? resolution.wasCorrect
            ? `Correct — your Round Bank doubles from ${pawnStake.toLocaleString()} to ${(pawnStake * 2).toLocaleString()}.`
            : `Miss — your Round Bank falls to 0. The chain resets; build it again.`
          : getTurnConsequenceText(choice, resolution, actorChain)
      setPendingTurn({
        actorId,
        actorName: actor.name,
        kind,
        choice,
        stage: 'decision',
        referenceNumber: actorChain.referenceNumber,
        resolution,
        verdictText: getTurnVerdict(resolution),
        consequenceText,
        tone: getTurnTone(choice, resolution),
        chainBefore: actorChain,
        turnEnds: choice !== 'bank',
        pawnStake: choice === 'bank' ? 0 : pawnStake,
        turnIndexBefore: turnIndex,
        orderLength: order.length,
        historyEntry: {
          actorId,
          actorName: actor.name,
          choice,
          referenceNumber: actorChain.referenceNumber,
          revealedNumber: resolution.revealedNumber,
          wasCorrect: resolution.wasCorrect,
          bankedAmount: choice === 'bank' ? resolution.individualDelta : 0,
          recoveredAmount: resolution.recoveredDelta,
          safetyUsed: resolution.safetyUsed,
          lostAmount: resolution.lostAmount,
          message:
            pawnStake > 0
              ? resolution.wasCorrect
                ? `${actor.name} pawned ${pawnStake.toLocaleString()} influence. Correct call — Round Bank doubled.`
                : `${actor.name} pawned ${pawnStake.toLocaleString()} influence. Miss — Round Bank lost.`
              : getTurnHistoryMessage(actor.name, choice, resolution),
          phase: kind,
        },
      })
    },
    [pendingTurn, state]
  )

  function startSemifinal() {
    const finalists = getActivePlayers(state.players)
    const ids = finalists.map((player) => player.id)
    const order = buildIndividualOrder(ids, SEMIFINAL_TURNS_PER_PLAYER)
    const chains = Object.fromEntries(
      ids.map((id) => [id, createInitialChainState(rngRef.current.rng)])
    )
    const scores = Object.fromEntries(ids.map((id) => [id, 0]))
    setPendingTurn(null)
    setBankedTurn(null)
    emitSoundCue('final-showdown-sting')
    setState((previous) => ({
      ...previous,
      phase: 'semifinalTurn',
      semifinalOrder: order,
      semifinalTurnIndex: 0,
      semifinalScores: scores,
      semifinalChains: chains,
      semifinalTieBreak: null,
      semifinalEliminatedId: null,
      statusText: 'Final 3: Sudden Chain. Lowest score leaves.',
      helperText: nextHelper(FINAL_HELPERS),
      revealedNumber: Object.values(chains)[0]?.referenceNumber ?? null,
    }))
  }

  function startFinal() {
    const finalists = getActivePlayers(state.players)
    const ids = finalists.map((player) => player.id)
    const chains = Object.fromEntries(
      ids.map((id) => [id, createInitialChainState(rngRef.current.rng)])
    )
    const scores = Object.fromEntries(ids.map((id) => [id, 0]))
    const nextPlayers = state.players.map((player) =>
      ids.includes(player.id)
        ? {
            ...player,
            finalScore: 0,
            finalWrongGuesses: 0,
            finalCorrectGuesses: 0,
            finalBanks: 0,
            latestMoment: null,
          }
        : player
    )
    const firstPlayerId = ids[0] ?? null
    const firstPlayer = getPlayer(nextPlayers, firstPlayerId)
    const firstIsHuman = Boolean(firstPlayer?.isHuman)
    setPendingTurn(null)
    setBankedTurn(null)
    emitSoundCue('final-showdown-sting')
    setState((previous) => ({
      ...previous,
      phase: 'finalTurn',
      players: nextPlayers,
      roundNumber: STANDARD_ROUND_COUNT + 1,
      finalOrder: ids,
      finalTurnIndex: 0,
      turnHistory: [],
      finalScores: scores,
      finalChains: chains,
      finalTieBreak: null,
      finalTimerExpiry: firstIsHuman ? Date.now() + FINAL_ROUND_DURATION_MS : null,
      finalTimerPausedRemaining: null,
      statusText: 'Round 6 Final. Bank the highest individual score.',
      helperText: 'Ties use fewer mistakes, then fewer banks.',
      revealedNumber:
        chains[firstPlayerId ?? '']?.referenceNumber ??
        Object.values(chains)[0]?.referenceNumber ??
        null,
    }))
  }

  const resolveSoloRushRound = useCallback(() => {
    if (state.phase !== 'finalTurn' || state.gameMode !== 'solo') return
    const previousResolution = soloResolutionLockRef.current
    if (
      previousResolution?.roundNumber === state.roundNumber &&
      previousResolution.finalTurnIndex === state.finalTurnIndex &&
      previousResolution.finalTimerExpiry === state.finalTimerExpiry &&
      previousResolution.finalScores === state.finalScores
    )
      return
    soloResolutionLockRef.current = {
      roundNumber: state.roundNumber,
      finalTurnIndex: state.finalTurnIndex,
      finalTimerExpiry: state.finalTimerExpiry,
      finalScores: state.finalScores,
    }

    let nextScores = { ...state.finalScores }
    let nextChains = { ...state.finalChains }
    let nextPlayers = [...state.players]
    const nextImmuneIds = new Set(state.soloImmunityIds)

    for (const aiPlayer of nextPlayers.filter(
      (player) => !player.isEliminated && !player.isHuman
    )) {
      const simulated = simulateFinalAiWindow(
        aiPlayer,
        nextChains[aiPlayer.id] ?? createInitialChainState(rngRef.current.rng),
        nextScores[aiPlayer.id] ?? 0,
        SOLO_RUSH_DURATION_MS,
        nextPlayers.filter((player) => !player.isEliminated),
        rngRef.current.rng,
        true
      )
      nextScores = { ...nextScores, [aiPlayer.id]: simulated.score }
      nextChains = { ...nextChains, [aiPlayer.id]: simulated.chain }
      if (simulated.immunityEarned) nextImmuneIds.add(aiPlayer.id)
      nextPlayers = nextPlayers.map((player) =>
        player.id === aiPlayer.id
          ? {
              ...player,
              finalScore: simulated.score,
              safetyAvailable: simulated.safetyAvailable,
              totalRecovered: player.totalRecovered + simulated.recovered,
              roundRecovered: player.roundRecovered + simulated.recovered,
              roundLost: player.roundLost + simulated.lost,
              finalWrongGuesses: player.finalWrongGuesses + simulated.mistakes,
              finalCorrectGuesses: player.finalCorrectGuesses + simulated.correct,
              finalBanks: player.finalBanks + simulated.banks,
            }
          : player
      )
    }

    const ranking = rankSoloRushPlayers(nextScores, nextPlayers, state.roundNumber, [
      ...nextImmuneIds,
    ])
    const eliminatedIds = ranking.eliminatedIds
    if (state.roundNumber === SOLO_RUSH_ROUND_COUNT) {
      if (eliminatedIds.length > 0) emitSoundCue('winner-stinger')
    } else if (eliminatedIds.length > 0) {
      emitSoundCue('elimination-sting')
    }
    const eliminatedIdSet = new Set(eliminatedIds)
    nextPlayers = nextPlayers.map((player) =>
      eliminatedIdSet.has(player.id) ? { ...player, isEliminated: true } : player
    )
    const eliminatedNames = ranking.ordered
      .filter((player) => eliminatedIdSet.has(player.id))
      .map((player) => player.name)
    const eliminationMessage =
      eliminatedNames.length > 0
        ? `${eliminatedNames.join(' and ')} ${eliminatedNames.length === 1 ? 'has' : 'have'} the lowest final rank and ${eliminatedNames.length === 1 ? 'is' : 'are'} out.`
        : state.roundNumber === 3
          ? 'The top two advance to the final round.'
          : nextImmuneIds.size > 0
            ? 'Everyone earned immunity. No one is out.'
            : 'The Solo Rush round could not be ranked.'
    const remainingFinalists = nextPlayers.filter((player) => !player.isEliminated)
    const soloWinnerIds =
      state.roundNumber === SOLO_RUSH_ROUND_COUNT
        ? [...nextImmuneIds].filter((id) => remainingFinalists.some((player) => player.id === id))
        : []
    const finalWinnerIds =
      state.roundNumber === SOLO_RUSH_ROUND_COUNT
        ? soloWinnerIds.length > 0
          ? soloWinnerIds
          : remainingFinalists.map((player) => player.id)
        : []
    const soloWinner = nextPlayers.find((player) => player.id === finalWinnerIds[0]) ?? null
    const roundResult: Partial<ChainOfGreedState> = {
      players: nextPlayers,
      phase: state.roundNumber === SOLO_RUSH_ROUND_COUNT ? 'finalResult' : 'eliminationReveal',
      finalScores: nextScores,
      finalChains: nextChains,
      soloImmunityIds: [...nextImmuneIds],
      winnerIds: finalWinnerIds,
      eliminatedThisStep: eliminatedIds,
      winnerId: soloWinner?.id ?? null,
      tieBreaks: [],
      finalTimerExpiry: null,
      finalTimerPausedRemaining: null,
      statusText:
        state.roundNumber === SOLO_RUSH_ROUND_COUNT
          ? soloWinner
            ? `${soloWinner.name} wins Solo Rush.`
            : 'Every player shared the lowest final rank. Solo Rush ends in a tie.'
          : eliminationMessage,
      helperText:
        state.roundNumber === SOLO_RUSH_ROUND_COUNT
          ? soloWinner
            ? 'The highest Round Bank in the final round wins.'
            : 'All tied finalists are eliminated by the Round Bank tie-break rules.'
          : state.roundNumber === 3
            ? 'The top two advance to Round 4. Equal banks rank by fewer correct calls, then more misses.'
            : 'Lowest bank ranks last; ties use fewer correct calls, then more misses.',
    }

    setPendingTurn(null)
    setBankedTurn(null)
    setIsPawnArmed(false)
    setIsSafetyArmed(false)
    setState((previous) => {
      if (
        previous.phase !== 'finalTurn' ||
        previous.gameMode !== 'solo' ||
        previous.roundNumber !== state.roundNumber ||
        previous.finalTurnIndex !== state.finalTurnIndex ||
        previous.finalTimerExpiry !== state.finalTimerExpiry ||
        previous.finalScores !== state.finalScores
      )
        return previous
      return { ...previous, ...roundResult }
    })
  }, [state])

  const advanceFinalPlayer = useCallback(() => {
    if (state.gameMode === 'solo') {
      resolveSoloRushRound()
      return
    }
    setPendingTurn(null)
    setBankedTurn(null)
    setState((previous) => {
      const nextTurnIndex = previous.finalTurnIndex + 1
      if (nextTurnIndex >= previous.finalOrder.length) {
        const ranking = rankFinalPlayersByScore(
          previous.finalScores,
          previous.players,
          rngRef.current.rng
        )
        emitSoundCue('winner-stinger')
        return {
          ...previous,
          phase: 'finalResult',
          finalTieBreak: ranking.tieBreak,
          finalTimerExpiry: null,
          finalTimerPausedRemaining: null,
          winnerId: ranking.ordered[0]?.id ?? null,
          statusText: `${ranking.ordered[0]?.name ?? 'A finalist'} wins everything.`,
          helperText: 'Only one player can claim the influence.',
        }
      }
      const nextPlayerId = previous.finalOrder[nextTurnIndex] ?? null
      const nextPlayer = getPlayer(previous.players, nextPlayerId)
      const nextIsHuman = Boolean(nextPlayer?.isHuman)
      return {
        ...previous,
        finalTurnIndex: nextTurnIndex,
        finalTimerExpiry: nextIsHuman ? Date.now() + FINAL_ROUND_DURATION_MS : null,
        finalTimerPausedRemaining: null,
        revealedNumber: previous.finalChains[nextPlayerId ?? '']?.referenceNumber ?? null,
        statusText: `${nextPlayer?.name ?? 'Next finalist'} — 30 seconds.`,
        helperText: nextHelper(FINAL_HELPERS),
      }
    })
  }, [nextHelper, resolveSoloRushRound, state.gameMode])

  const simulateFinalAiRound = useCallback(
    (aiPlayer: ChainOfGreedPlayerState, startChain: ChainOfGreedChainState, startScore: number) => {
      const rng = rngRef.current.rng
      const simulated = simulateFinalAiWindow(
        aiPlayer,
        startChain,
        startScore,
        FINAL_ROUND_DURATION_MS,
        activePlayers,
        rng,
        false
      )
      setState((previous) => {
        const nextScores = { ...previous.finalScores, [aiPlayer.id]: simulated.score }
        const nextChains = { ...previous.finalChains, [aiPlayer.id]: simulated.chain }
        const nextPlayers = previous.players.map((player) =>
          player.id === aiPlayer.id
            ? {
                ...player,
                finalScore: simulated.score,
                safetyAvailable: simulated.safetyAvailable,
                totalRecovered: player.totalRecovered + simulated.recovered,
                roundRecovered: player.roundRecovered + simulated.recovered,
                roundLost: player.roundLost + simulated.lost,
                finalWrongGuesses: player.finalWrongGuesses + simulated.mistakes,
                finalCorrectGuesses: player.finalCorrectGuesses + simulated.correct,
                finalBanks: player.finalBanks + simulated.banks,
              }
            : player
        )
        return {
          ...previous,
          players: nextPlayers,
          finalScores: nextScores,
          finalChains: nextChains,
        }
      })
      advanceFinalPlayer()
    },
    [activePlayers, advanceFinalPlayer]
  )

  function continueAfterElimination() {
    const remaining = getActivePlayers(state.players)
    if (state.gameMode === 'solo') {
      if (remaining.length <= 1) {
        const soloWinner = remaining[0] ?? null
        setPhase('finalResult', {
          winnerId: soloWinner?.id ?? null,
          statusText: soloWinner
            ? `${soloWinner.name} wins Solo Rush.`
            : 'Every player shared the lowest rank. Solo Rush ends in a tie.',
          helperText: soloWinner
            ? 'One last player kept the biggest Round Bank.'
            : 'All tied players were eliminated by the Round Bank tie-break rules.',
        })
      } else {
        startSoloRound(state.roundNumber + 1, state.players)
      }
      return
    }
    if (state.roundNumber >= STANDARD_ROUND_COUNT || remaining.length <= 2) {
      setPhase('finalIntro', {
        statusText: `Round ${STANDARD_ROUND_COUNT + 1}: LOH final.`,
        helperText: 'Every active player gets one 30-second chain.',
      })
      return
    }
    startRound(state.roundNumber + 1, state.players, true)
  }

  function finishGame() {
    const winnerIds = state.gameMode === 'solo' ? state.winnerIds : []
    const winnerId =
      winnerIds[0] ??
      state.winnerId ??
      activePlayers[0]?.id ??
      (state.gameMode === 'solo' ? null : (humanPlayer?.id ?? null))
    if ((!winnerId && state.gameMode !== 'solo') || resultCommitLockRef.current) return
    resultCommitLockRef.current = true
    setIsResultCommitted(true)
    const rawResults = winnerId
      ? buildFinalRawResults(state.players, winnerId, state.securedTotal)
      : Object.fromEntries(state.players.map((player) => [player.id, 0]))
    const rawValue = winnerId ? (rawResults[humanPlayer?.id ?? winnerId] ?? state.securedTotal) : 0
    props.onFinish?.(rawValue, undefined, {
      authoritativeWinnerId: winnerId,
      ...(winnerIds.length > 1 ? { authoritativeWinnerIds: winnerIds } : {}),
      rawValue,
      rawResults,
    })
  }

  const dismissRoundIntro = useCallback(() => {
    setState((previous) => {
      if (previous.phase !== 'roundIntro') return previous
      return {
        ...previous,
        phase: 'playerTurn',
        statusText: getPlayerTurnMessage(previous.players, previous.turnOrder),
        helperText: nextHelper(TURN_HELPERS),
      }
    })
  }, [nextHelper])

  useEffect(() => {
    if (!pendingTurn || (isPlaybackPaused && pendingTurn.kind !== 'final')) return
    const timer = window.setTimeout(
      () => {
        if (pendingTurn.stage === 'settle') {
          if (pendingTurn.kind === 'standard') {
            commitStandardTurn(pendingTurn)
          } else {
            commitIndividualTurn(pendingTurn)
          }
          setPendingTurn(null)
          return
        }

        setPendingTurn((previous) =>
          previous
            ? {
                ...previous,
                stage:
                  TURN_PIPELINE_STAGE_ORDER[previous.stage as Exclude<TurnPipelineStage, 'settle'>],
              }
            : previous
        )
      },
      state.spectatorMode === 'skipping'
        ? SKIP_TO_RESULTS_STEP_MS
        : getPipelineDuration(pendingTurn, state.players, watchPace)
    )
    return () => window.clearTimeout(timer)
  }, [
    commitIndividualTurn,
    commitStandardTurn,
    isPlaybackPaused,
    pendingTurn,
    state.players,
    state.spectatorMode,
    watchPace,
  ])

  useEffect(() => {
    if (
      state.phase !== 'playerTurn' ||
      !currentTurnPlayer ||
      currentTurnPlayer.isHuman ||
      pendingTurn ||
      isPlaybackPaused
    )
      return
    const bankAvailable = isBankAvailable(bankedTurn, currentTurnPlayer.id, 'standard')
    const lockKey = `${state.roundNumber}:${state.turnIndex}:${currentTurnPlayer.id}:${bankAvailable ? 'fresh' : 'banked'}`
    if (aiTurnLockRef.current === lockKey) return
    aiTurnLockRef.current = lockKey
    const timer = window.setTimeout(
      () => {
        const choice = decideAiAction({
          player: currentTurnPlayer,
          chain: state.chain,
          remainingTurns: state.turnsRemaining,
          phase: 'standard',
          activePlayers,
          bankAvailable,
        })
        resolveStandardAction(
          currentTurnPlayer.id,
          choice,
          shouldAiUseSafety(currentTurnPlayer, state.chain, choice)
        )
      },
      state.spectatorMode === 'skipping'
        ? SKIP_TO_RESULTS_STEP_MS
        : watchPace === 'quick'
          ? 95
          : bankAvailable
            ? 190
            : 120
    )
    return () => window.clearTimeout(timer)
  }, [
    activePlayers,
    bankedTurn,
    currentTurnPlayer,
    isPlaybackPaused,
    pendingTurn,
    resolveStandardAction,
    state.chain,
    state.phase,
    state.roundNumber,
    state.spectatorMode,
    state.turnIndex,
    state.turnsRemaining,
    watchPace,
  ])

  useEffect(() => {
    if (state.phase !== 'voting') return
    if (humanPlayer && !humanPlayer.isEliminated) return
    finishVoting()
  }, [finishVoting, humanPlayer, state.phase])

  useEffect(() => {
    if (state.phase !== 'voteReveal') return
    const lockKey = `${state.revealedVotes}:${state.pendingVotes.length}`
    if (voteRevealLockRef.current === lockKey) return
    voteRevealLockRef.current = lockKey
    if (state.revealedVotes >= state.pendingVotes.length) {
      if (state.spectatorMode === 'skipping') {
        emitSoundCue('elimination-sting')
        setPhase('eliminationReveal', {
          statusText: 'Vote reveal complete.',
          helperText: 'The weakest link has been decided.',
        })
      }
      return
    }
    const timer = window.setTimeout(
      () => {
        emitSoundCue('vote-reveal-pulse')
        setState((previous) => ({
          ...previous,
          revealedVotes: previous.revealedVotes + 1,
          statusText: `${previous.pendingVotes[previous.revealedVotes]?.voterName ?? 'House'} votes ${previous.pendingVotes[previous.revealedVotes]?.targetName ?? ''}.`,
          helperText:
            previous.pendingVotes[previous.revealedVotes]?.reason ??
            'The weakest link is not always the weakest player.',
        }))
      },
      state.spectatorMode === 'skipping' ? SKIP_TO_RESULTS_STEP_MS : 350
    )
    return () => window.clearTimeout(timer)
  }, [state.pendingVotes, state.phase, state.revealedVotes, state.spectatorMode])

  useEffect(() => {
    if (state.phase !== 'roundIntro') return
    const timer = window.setTimeout(
      dismissRoundIntro,
      state.spectatorMode === 'skipping' ? SKIP_TO_RESULTS_STEP_MS : ROUND_INTRO_DURATION_MS
    )
    return () => window.clearTimeout(timer)
  }, [dismissRoundIntro, state.phase, state.spectatorMode])

  const skipFlowRef = useRef({ continueAfterElimination, setPhase, startFinal, startSemifinal })
  skipFlowRef.current = { continueAfterElimination, setPhase, startFinal, startSemifinal }

  useEffect(() => {
    if (state.spectatorMode !== 'skipping') return undefined

    let advance: (() => void) | null = null
    if (state.phase === 'roundSummary') {
      advance = () =>
        skipFlowRef.current.setPhase('voting', {
          statusText: 'Vote for the weakest link.',
          helperText: 'Who cost the team its momentum?',
        })
    } else if (state.phase === 'eliminationReveal') {
      advance = () => skipFlowRef.current.continueAfterElimination()
    } else if (state.phase === 'semifinalIntro') {
      advance = () => skipFlowRef.current.startSemifinal()
    } else if (state.phase === 'semifinalReveal') {
      advance = () =>
        skipFlowRef.current.setPhase('finalIntro', {
          statusText: 'Two players remain.',
          helperText: 'One player wins everything.',
        })
    } else if (state.phase === 'finalIntro') {
      advance = () => skipFlowRef.current.startFinal()
    }

    if (!advance) return undefined
    const timer = window.setTimeout(advance, SKIP_TO_RESULTS_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [state.phase, state.spectatorMode])

  useEffect(() => {
    if (
      state.phase !== 'semifinalTurn' ||
      !semifinalPlayer ||
      semifinalPlayer.isHuman ||
      pendingTurn ||
      isPlaybackPaused
    )
      return
    const bankAvailable = isBankAvailable(bankedTurn, semifinalPlayer.id, 'semifinal')
    const lockKey = `semi:${state.semifinalTurnIndex}:${semifinalPlayer.id}:${bankAvailable ? 'fresh' : 'banked'}`
    if (aiTurnLockRef.current === lockKey) return
    aiTurnLockRef.current = lockKey
    const timer = window.setTimeout(
      () => {
        const turnsUsed = state.semifinalOrder
          .slice(0, state.semifinalTurnIndex + 1)
          .filter((id) => id === semifinalPlayer.id).length
        const choice = decideAiAction({
          player: semifinalPlayer,
          chain: state.semifinalChains[semifinalPlayer.id],
          remainingTurns: SEMIFINAL_TURNS_PER_PLAYER - turnsUsed + 1,
          phase: 'semifinal',
          activePlayers,
          playerScore: state.semifinalScores[semifinalPlayer.id] ?? 0,
          bankAvailable,
        })
        resolveIndividualAction(
          'semifinal',
          semifinalPlayer.id,
          choice,
          shouldAiUseSafety(semifinalPlayer, state.semifinalChains[semifinalPlayer.id], choice)
        )
      },
      state.spectatorMode === 'skipping'
        ? SKIP_TO_RESULTS_STEP_MS
        : watchPace === 'quick'
          ? 95
          : bankAvailable
            ? 190
            : 120
    )
    return () => window.clearTimeout(timer)
  }, [
    activePlayers,
    bankedTurn,
    isPlaybackPaused,
    pendingTurn,
    resolveIndividualAction,
    semifinalPlayer,
    state.phase,
    state.semifinalChains,
    state.semifinalOrder,
    state.semifinalScores,
    state.semifinalTurnIndex,
    state.spectatorMode,
    watchPace,
  ])

  useEffect(() => {
    if (state.phase !== 'finalTurn' || !finalPlayer || pendingTurn) return
    if (state.gameMode === 'solo') {
      if (finalPlayer.isHuman || state.finalTimerExpiry) return
      const timer = window.setTimeout(
        advanceFinalPlayer,
        state.spectatorMode === 'skipping'
          ? SKIP_TO_RESULTS_STEP_MS
          : CHAIN_TURN_PIPELINE_DURATIONS.settle
      )
      return () => window.clearTimeout(timer)
    }
    if (finalPlayer.isHuman) return
    if (state.finalTimerExpiry) return // already running a human timer
    // Shared final AI player: simulate their 30-second window instantly
    const lockKey = `final:sim:${state.roundNumber}:${state.finalTurnIndex}:${finalPlayer.id}`
    if (aiTurnLockRef.current === lockKey) return
    aiTurnLockRef.current = lockKey
    const currentChain =
      state.finalChains[finalPlayer.id] ?? createInitialChainState(rngRef.current.rng)
    const currentScore = state.finalScores[finalPlayer.id] ?? 0
    const timer = window.setTimeout(
      () => {
        simulateFinalAiRound(finalPlayer, currentChain, currentScore)
      },
      state.spectatorMode === 'skipping'
        ? SKIP_TO_RESULTS_STEP_MS
        : CHAIN_TURN_PIPELINE_DURATIONS.settle
    )
    return () => window.clearTimeout(timer)
  }, [
    advanceFinalPlayer,
    finalPlayer,
    state.gameMode,
    pendingTurn,
    simulateFinalAiRound,
    state.finalChains,
    state.finalScores,
    state.finalTimerExpiry,
    state.finalTurnIndex,
    state.phase,
    state.roundNumber,
    state.spectatorMode,
  ])

  // Human final timer: auto-advance when 30 seconds expire
  useEffect(() => {
    if (state.phase !== 'finalTurn' || !state.finalTimerExpiry || pendingTurn) return
    const remaining = state.finalTimerExpiry - Date.now()
    if (remaining <= 0) {
      advanceFinalPlayer()
      return
    }
    const timer = window.setTimeout(() => advanceFinalPlayer(), remaining)
    return () => window.clearTimeout(timer)
  }, [advanceFinalPlayer, pendingTurn, state.finalTimerExpiry, state.phase])

  // Countdown display for the human final timer
  useEffect(() => {
    if (
      state.phase !== 'finalTurn' ||
      (!state.finalTimerExpiry && state.finalTimerPausedRemaining === null)
    ) {
      setFinalSecondsRemaining(null)
      return
    }
    const update = () => {
      if (state.finalTimerPausedRemaining !== null) {
        setFinalSecondsRemaining(Math.max(0, Math.ceil(state.finalTimerPausedRemaining / 1000)))
        return
      }
      const expiry = state.finalTimerExpiry
      if (!expiry) return
      setFinalSecondsRemaining(Math.max(0, Math.ceil((expiry - Date.now()) / 1000)))
    }
    update()
    const interval = window.setInterval(update, 500)
    return () => window.clearInterval(interval)
  }, [state.finalTimerExpiry, state.finalTimerPausedRemaining, state.phase])

  useEffect(() => {
    if (
      state.gameMode !== 'shared' ||
      sharedTimerExpiry === null ||
      (state.phase !== 'roundIntro' && state.phase !== 'playerTurn')
    )
      return
    const update = () => {
      const remaining = Math.max(0, Math.ceil((sharedTimerExpiry - Date.now()) / 1000))
      setSharedSecondsRemaining(remaining)
      if (remaining === 0) {
        setPendingTurn(null)
        setBankedTurn(null)
        setIsSafetyArmed(false)
        setState((previous) => {
          if (previous.phase !== 'roundIntro' && previous.phase !== 'playerTurn') return previous
          return {
            ...previous,
            phase: 'roundSummary',
            turnsRemaining: 0,
            statusText: 'The round timer has expired.',
            helperText: 'Review the board before the elimination vote.',
          }
        })
      }
    }
    update()
    const interval = window.setInterval(update, 250)
    return () => window.clearInterval(interval)
  }, [sharedTimerExpiry, state.gameMode, state.phase])

  const currentActor = currentTurnPlayer ?? semifinalPlayer ?? finalPlayer
  const actionTargetId = currentActor?.id ?? null
  const actionTargetKind =
    state.phase === 'playerTurn'
      ? 'standard'
      : state.phase === 'semifinalTurn'
        ? 'semifinal'
        : state.phase === 'finalTurn'
          ? 'final'
          : null
  const baseChain =
    state.phase === 'semifinalTurn'
      ? semifinalPlayer
        ? state.semifinalChains[semifinalPlayer.id]
        : null
      : state.phase === 'finalTurn'
        ? finalPlayer
          ? state.finalChains[finalPlayer.id]
          : null
        : state.chain
  const showPendingResolvedState =
    pendingTurn?.stage === 'ladderUpdate' || pendingTurn?.stage === 'settle'
  const displayedChain =
    pendingTurn && showPendingResolvedState ? pendingTurn.resolution.updatedChain : baseChain
  const referenceNumber = pendingTurn
    ? showPendingResolvedState
      ? pendingTurn.resolution.updatedChain.referenceNumber
      : pendingTurn.referenceNumber
    : (displayedChain?.referenceNumber ?? 0)
  const activeStep = displayedChain?.step ?? 0
  const activePot = displayedChain?.pot ?? 0
  const revealedVotes = state.pendingVotes.slice(0, state.revealedVotes)
  const revealedVoteTally = revealedVotes.reduce((tally, vote) => {
    tally.set(vote.targetName, (tally.get(vote.targetName) ?? 0) + 1)
    return tally
  }, new Map<string, number>())
  const sortedVoteTally = [...revealedVoteTally.entries()].sort((left, right) => right[1] - left[1])
  const hasPendingHumanTieBreak = state.tieBreaks.some((tieBreak) => tieBreak.decisionPending)
  const winner = getPlayer(state.players, state.winnerId)
  const soloWinners = (
    state.winnerIds.length ? state.winnerIds : state.winnerId ? [state.winnerId] : []
  )
    .map((id) => getPlayer(state.players, id))
    .filter((player): player is ChainOfGreedPlayerState => Boolean(player))
  const soloFinalStandings = state.finalOrder
    .map((id) => getPlayer(state.players, id))
    .filter((player): player is ChainOfGreedPlayerState => Boolean(player))
    .sort((left, right) => {
      const bankDelta = (state.finalScores[right.id] ?? 0) - (state.finalScores[left.id] ?? 0)
      if (bankDelta !== 0) return bankDelta
      const correctDelta = right.finalCorrectGuesses - left.finalCorrectGuesses
      if (correctDelta !== 0) return correctDelta
      return left.finalWrongGuesses - right.finalWrongGuesses
    })
  const soloRoundRanking =
    state.gameMode === 'solo'
      ? rankSoloRushPlayers(
          state.finalScores,
          state.players,
          state.roundNumber,
          state.soloImmunityIds
        ).ordered
      : []
  const standardTurnLabels = state.phase === 'playerTurn' && currentTurnPlayer?.isHuman
  const semifinalTurnLabels = state.phase === 'semifinalTurn' && semifinalPlayer?.isHuman
  const finalTurnLabels = state.phase === 'finalTurn' && finalPlayer?.isHuman
  const isHumanTurn = Boolean(standardTurnLabels || semifinalTurnLabels || finalTurnLabels)
  const showStickyActionBar =
    (state.phase === 'playerTurn' && (isHumanTurn || state.gameMode === 'solo')) ||
    state.phase === 'semifinalTurn' ||
    state.phase === 'finalTurn'
  const currentChainStep = activeStep || 0
  const nextReward =
    CHAIN_LADDER[Math.min(currentChainStep, CHAIN_LADDER.length - 1)] ??
    CHAIN_LADDER[CHAIN_LADDER.length - 1]
  const currentPotLabel = activePot > 0 ? activePot.toLocaleString() : '0'
  const isSharedRoundClock =
    state.gameMode === 'shared' && state.phase !== 'finalTurn' && sharedSecondsRemaining !== null
  const roundTimerSeconds = isSharedRoundClock ? sharedSecondsRemaining : finalSecondsRemaining
  const roundTimerLabel =
    roundTimerSeconds === null
      ? null
      : isSharedRoundClock
        ? `${roundTimerSeconds} seconds remaining in the round`
        : `${roundTimerSeconds} seconds remaining`
  const roundTimerValue =
    roundTimerSeconds === null
      ? null
      : `${Math.floor(roundTimerSeconds / 60)}:${String(roundTimerSeconds % 60).padStart(2, '0')}`
  const isAtStartingPosition = currentChainStep === 0
  const referenceRungIndex = currentChainStep === 0 ? 1 : currentChainStep
  const nextRewardValueLabel = nextReward.toLocaleString()
  const chainStatusText = {
    step: `Step ${currentChainStep}/${CHAIN_LADDER.length}`,
    pot: `Pot ${currentPotLabel}`,
    next: `Next ${nextRewardValueLabel}`,
  }
  const ladderSteps = [...CHAIN_LADDER].reverse().map((value, index) => {
    const step = CHAIN_LADDER.length - index
    return {
      value,
      step,
      badge: getStepBadge(step),
      isActive: currentChainStep === step,
      isCleared: currentChainStep > step,
      isNext: currentChainStep + 1 === step,
      carriesReference: !isAtStartingPosition && step === referenceRungIndex,
      labelSide:
        step === 1 || step === CHAIN_LADDER.length ? 'center' : step % 2 === 0 ? 'left' : 'right',
      tension: step >= 7 ? 'danger' : step >= 4 ? 'surge' : 'base',
    }
  })
  const lastTurn = state.turnHistory[0] ?? null
  const turnComparisonSymbol = pendingTurn?.choice
    ? (momentGlyphs[pendingTurn.choice] ?? null)
    : null
  const heroPhaseChip =
    state.phase === 'playerTurn'
      ? 'Shared chain'
      : state.phase === 'semifinalTurn'
        ? 'Individual semifinal'
        : state.phase === 'finalTurn'
          ? state.gameMode === 'solo'
            ? 'Solo Rush'
            : 'Winner-take-all'
          : state.phase === 'voting'
            ? 'Vote phase'
            : state.phase === 'roundSummary'
              ? 'Round summary'
              : state.phase === 'voteReveal'
                ? 'Vote reveal'
                : state.phase === 'eliminationReveal'
                  ? 'Elimination'
                  : state.phase.startsWith('final')
                    ? 'Final stage'
                    : state.phase.startsWith('semifinal')
                      ? 'Semifinal stage'
                      : 'Broadcast pause'
  const heroCommentary = pendingTurn
    ? pendingTurn.stage === 'decision'
      ? getDecisionText(
          pendingTurn.actorName,
          getPlayer(state.players, pendingTurn.actorId)?.isHuman ?? false,
          pendingTurn.choice
        )
      : pendingTurn.stage === 'reveal' || pendingTurn.stage === 'verdict'
        ? pendingTurn.verdictText
        : pendingTurn.consequenceText
    : (lastTurn?.message ?? state.statusText)
  const heroTone = pendingTurn
    ? pendingTurn.stage === 'decision'
      ? pendingTurn.choice === 'bank'
        ? 'bank'
        : 'neutral'
      : pendingTurn.tone
    : lastTurn?.message?.toLowerCase().includes('wrong') ||
        lastTurn?.message?.toLowerCase().includes('lost') ||
        lastTurn?.message?.toLowerCase().includes('miss')
      ? 'danger'
      : lastTurn?.choice === 'bank'
        ? 'bank'
        : lastTurn?.wasCorrect
          ? 'success'
          : 'neutral'
  const playerMetricText = (player: ChainOfGreedPlayerState) => {
    if (state.phase === 'finalTurn' || state.phase === 'finalResult')
      return `${player.finalScore} ${state.gameMode === 'solo' ? 'bank' : 'pts'}`
    if (state.phase === 'semifinalTurn' || state.phase === 'semifinalReveal')
      return `${player.semifinalScore} pts`
    return `+${player.roundContribution}`
  }
  const isBankUsedThisTurn = Boolean(
    actionTargetKind && !isBankAvailable(bankedTurn, actionTargetId, actionTargetKind)
  )
  const isBankEmpty = activePot <= 0
  const isActionLocked = Boolean(pendingTurn)
  const panelActor = pendingTurn ? getPlayer(state.players, pendingTurn.actorId) : currentActor
  const panelActorName = panelActor?.name ?? pendingTurn?.actorName ?? heroPhaseChip
  const panelAvatar = getSafeAvatarDisplay(panelActor)
  const panelNumberLabel =
    pendingTurn &&
    pendingTurn.choice !== 'bank' &&
    pendingTurn.stage !== 'decision' &&
    pendingTurn.resolution.revealedNumber !== null
      ? `${pendingTurn.referenceNumber} ${turnComparisonSymbol ?? ''} ${pendingTurn.resolution.revealedNumber}`
      : pendingTurn?.choice === 'bank'
        ? 'POT SECURED'
        : `${referenceNumber}`
  const panelStatusText = pendingTurn
    ? pendingTurn.stage === 'decision'
      ? 'LOCKED IN'
      : pendingTurn.verdictText.toUpperCase()
    : isHumanTurn
      ? 'Choose move'
      : currentActor
        ? 'Reading the board'
        : heroCommentary
  const panelDetailText = pendingTurn
    ? pendingTurn.stage === 'decision'
      ? pendingTurn.pawnStake
        ? `All-in ${pendingTurn.pawnStake.toLocaleString()} · hit doubles your bank; miss wipes it`
        : `At risk ${currentPotLabel} · Correct: chain rises to ${nextRewardValueLabel}`
      : pendingTurn.choice === 'bank'
        ? `+${Math.max(pendingTurn.resolution.securedDelta, pendingTurn.resolution.individualDelta).toLocaleString()} secured - Current ${pendingTurn.resolution.updatedChain.referenceNumber}`
        : pendingTurn.pawnStake
          ? `All-in ${pendingTurn.pawnStake.toLocaleString()} · ${pendingTurn.consequenceText}`
          : pendingTurn.consequenceText
    : isHumanTurn
      ? state.gameMode === 'solo' && actionTargetKind === 'final'
        ? `Round Bank ${humanRoundBank.toLocaleString()} · At risk ${currentPotLabel} · Chain rises to ${nextRewardValueLabel} on a hit`
        : `At risk ${currentPotLabel} · Correct: chain rises to ${nextRewardValueLabel}`
      : `Pot ${currentPotLabel} · Next ${nextRewardValueLabel}`
  const panelTone = pendingTurn ? pendingTurn.tone : heroTone
  const participantLogText = lastTurn?.message ?? 'Live feed - no turns yet'
  const nextPlayers =
    state.phase === 'playerTurn'
      ? Array.from({ length: Math.min(3, Math.max(0, state.turnsRemaining - 1)) }, (_, index) =>
          getPlayer(
            state.players,
            getTurnOrderPlayerId(state.turnOrder, state.turnIndex + index + 1)
          )
        ).filter((player): player is ChainOfGreedPlayerState => Boolean(player))
      : []
  const humanTurnDistance =
    state.phase === 'playerTurn' &&
    currentTurnPlayer &&
    !currentTurnPlayer.isHuman &&
    humanPlayer &&
    !humanPlayer.isEliminated
      ? Math.max(
          1,
          (state.turnOrder.indexOf(humanPlayer.id) - state.turnIndex + state.turnOrder.length) %
            state.turnOrder.length || state.turnOrder.length
        )
      : null
  const riskOdds = baseChain ? getNextNumberOdds(baseChain) : null
  const profilePlayer = getPlayer(state.players, selectedProfileId)
  const profileTurns = selectedProfileId
    ? state.turnHistory.filter((turn) => turn.actorId === selectedProfileId).slice(0, 6)
    : []
  useEffect(() => {
    if (!bankedTurn) return
    if (
      !actionTargetId ||
      !actionTargetKind ||
      bankedTurn.actorId !== actionTargetId ||
      bankedTurn.kind !== actionTargetKind
    ) {
      setBankedTurn(null)
    }
  }, [actionTargetId, actionTargetKind, bankedTurn])

  useEffect(() => {
    setIsSafetyArmed(false)
    setIsPawnArmed(false)
  }, [actionTargetId, actionTargetKind, state.phase])

  useEffect(() => {
    if (!currentActor) return
    const card = playerCardRefs.current[currentActor.id]
    if (!card) return
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    card.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }, [currentActor])
  const handleAction = (choice: ChainAction) => {
    if (
      !actionTargetId ||
      !actionTargetKind ||
      isActionLocked ||
      (choice === 'bank' && (isBankUsedThisTurn || isBankEmpty))
    )
      return
    const pawnStake =
      state.gameMode === 'solo' && actionTargetKind === 'final' && choice !== 'bank' && isPawnArmed
        ? (state.finalScores[actionTargetId] ?? 0)
        : 0
    const useSafety = isSafetyArmed && choice !== 'bank' && pawnStake === 0
    setIsSafetyArmed(false)
    setIsPawnArmed(false)
    if (actionTargetKind === 'standard') {
      resolveStandardAction(actionTargetId, choice, useSafety)
      return
    }
    resolveIndividualAction(actionTargetKind, actionTargetId, choice, useSafety, pawnStake)
  }
  const playerRail = (
    <div
      className="chain-of-greed__player-rail"
      data-testid="chain-player-rail"
      ref={playerRailRef}
    >
      {state.players.map((player) => {
        const isCurrent =
          currentTurnPlayer?.id === player.id ||
          semifinalPlayer?.id === player.id ||
          finalPlayer?.id === player.id
        const latestMoment = !player.safetyAvailable
          ? 'SAFE SPENT'
          : player.latestMoment
            ? momentGlyphs[player.latestMoment]
            : momentGlyphs.safe
        return (
          <button
            key={player.id}
            type="button"
            className={[
              'chain-of-greed__rail-card',
              player.isHuman ? 'chain-of-greed__rail-card--human' : '',
              isCurrent ? 'chain-of-greed__rail-card--current' : '',
              player.isEliminated ? 'chain-of-greed__rail-card--eliminated' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid={`chain-player-${player.id}`}
            aria-label={`Review ${player.name}'s round performance`}
            onClick={() => setSelectedProfileId(player.id)}
            ref={(element) => {
              playerCardRefs.current[player.id] = element
            }}
          >
            <div className="chain-of-greed__rail-avatar">{getSafeAvatarDisplay(player)}</div>
            <div className="chain-of-greed__rail-copy">
              <strong>{player.name}</strong>
              <span>{playerMetricText(player)}</span>
            </div>
            <span className="chain-of-greed__rail-badge">
              {player.isEliminated ? 'OUT' : latestMoment}
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div
      className="chain-of-greed"
      data-testid="chain-of-greed"
      data-presentation={props.premiumPresentation ? 'vip' : 'standard'}
    >
      <div className="chain-of-greed__backdrop" />
      {state.phase === 'modeSelect' && (
        <div className="chain-of-greed__overlay chain-of-greed__mode-overlay">
          <section
            className="chain-of-greed__modal chain-of-greed__mode-select"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chain-mode-title"
          >
            <div className="chain-of-greed__eyebrow">Choose your game</div>
            <h2 id="chain-mode-title">How will you play the chain?</h2>
            <p>Read the table together or make every call your own.</p>
            <div className="chain-of-greed__mode-options">
              <div className="chain-of-greed__mode-option-group">
                <button
                  type="button"
                  className="chain-of-greed__mode-option"
                  aria-expanded={selectedModePreview === 'shared'}
                  aria-controls="chain-mode-details-shared"
                  onClick={() =>
                    setSelectedModePreview((mode) => (mode === 'shared' ? null : 'shared'))
                  }
                >
                  <span className="chain-of-greed__mode-option-index">01</span>
                  <strong>Shared Chain</strong>
                  <small>Take turns, watch every call, then vote out the weakest link.</small>
                  <span className="chain-of-greed__mode-option-cta">
                    {selectedModePreview === 'shared'
                      ? 'Mode selected · How to play'
                      : 'Explore mode'}
                    <span aria-hidden="true">{selectedModePreview === 'shared' ? '⌄' : '→'}</span>
                  </span>
                </button>
                {selectedModePreview === 'shared' && (
                  <div className="chain-of-greed__mode-details" id="chain-mode-details-shared">
                    <strong>Play as a table</strong>
                    <ul>
                      <li>Take turns calling Higher, Equal, or Lower against the shared shoe.</li>
                      <li>
                        Correct calls climb the shared pot; banking secures it, then you still
                        guess.
                      </li>
                      <li>
                        Use your one Safety to recover half a broken pot, and watch calls for clues.
                      </li>
                      <li>
                        After each round, vote out the weakest link. The last players face a final.
                      </li>
                    </ul>
                    <button
                      type="button"
                      className="chain-of-greed__continue"
                      onClick={() => selectGameMode('shared')}
                    >
                      Start Shared Chain
                    </button>
                  </div>
                )}
              </div>
              <div className="chain-of-greed__mode-option-group">
                <button
                  type="button"
                  className="chain-of-greed__mode-option chain-of-greed__mode-option--solo"
                  aria-expanded={selectedModePreview === 'solo'}
                  aria-controls="chain-mode-details-solo"
                  onClick={() =>
                    setSelectedModePreview((mode) => (mode === 'solo' ? null : 'solo'))
                  }
                >
                  <span className="chain-of-greed__mode-option-index">02</span>
                  <strong>Solo Rush</strong>
                  <small>Build your bank, risk it to double it, and survive four rounds.</small>
                  <span className="chain-of-greed__mode-option-cta">
                    {selectedModePreview === 'solo'
                      ? 'Mode selected · How to play'
                      : 'Explore mode'}
                    <span aria-hidden="true">{selectedModePreview === 'solo' ? '⌄' : '→'}</span>
                  </span>
                </button>
                {selectedModePreview === 'solo' && (
                  <div className="chain-of-greed__mode-details" id="chain-mode-details-solo">
                    <strong>Build. Risk. Survive.</strong>
                    <ul>
                      <li>Build your bank in one minute. Guess higher, equal, or lower.</li>
                      <li>
                        Risk your whole bank before a guess: a hit doubles it; a miss loses it.
                      </li>
                      <li>
                        Rounds 1–2: lowest bank is out. Round 3: top two advance. Round 4: highest
                        bank wins.
                      </li>
                      <li>
                        Reach the last step with a correct guess to earn immunity. In the final,
                        immune players share the win.
                      </li>
                      <li>
                        Tied banks: fewer correct guesses ranks lower, then more misses. A full tie
                        sends everyone tied out.
                      </li>
                    </ul>
                    <button
                      type="button"
                      className="chain-of-greed__continue"
                      onClick={() => selectGameMode('solo')}
                    >
                      Start Solo Rush
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
      <div
        className="chain-of-greed__intro-layer"
        data-testid="chain-round-intro"
        aria-hidden={state.phase !== 'roundIntro'}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          dismissRoundIntro()
        }}
      >
        <AnimatePresence>
          {state.phase === 'roundIntro' && (
            <motion.div
              className="chain-of-greed__round-intro-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="chain-of-greed__round-intro-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="chain-round-intro-title"
                data-testid="chain-round-intro-card"
                onPointerDown={(event) => event.stopPropagation()}
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
              >
                <span>{t('chainOfGreed.round', { round: state.roundNumber })}</span>
                <h2 id="chain-round-intro-title">{t('chainOfGreed.roundIntro.title')}</h2>
                <p>{t('chainOfGreed.roundIntro.warning')}</p>
                <p className="chain-of-greed__intro-elimination-copy">
                  {getStandardRoundEliminationCount(
                    state.startingCount,
                    state.roundNumber,
                    activePlayers.length
                  )}{' '}
                  {getStandardRoundEliminationCount(
                    state.startingCount,
                    state.roundNumber,
                    activePlayers.length
                  ) === 1
                    ? 'contestant faces'
                    : 'contestants face'}{' '}
                  the vote after this round.
                </p>
                <button
                  type="button"
                  className="chain-of-greed__continue"
                  onClick={dismissRoundIntro}
                >
                  {t('chainOfGreed.roundIntro.dismiss')}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="chain-of-greed__shell">
        <header className="chain-of-greed__header">
          <div
            className={`chain-of-greed__header-row${state.gameMode === 'shared' ? ' chain-of-greed__header-row--shared' : ''}`}
          >
            <div className="chain-of-greed__brand-lockup">
              <strong>
                CHAIN <span>OF</span> GREED
              </strong>
              <small>
                {state.gameMode === 'solo'
                  ? `SOLO RUSH · ROUND ${state.roundNumber}/${SOLO_RUSH_ROUND_COUNT}`
                  : state.phase === 'finalTurn' || state.phase === 'finalIntro'
                    ? 'THE FINAL'
                    : `ROUND ${state.roundNumber}`}
              </small>
              {state.gameMode === 'shared' && (
                <div
                  className="chain-of-greed__status-pill chain-of-greed__status-pill--gold chain-of-greed__prize-pool-pill"
                  data-testid="chain-prize-pool"
                >
                  <strong>{`${state.securedTotal.toLocaleString()} prize pool`}</strong>
                </div>
              )}
            </div>
            {state.gameMode === 'solo' && (
              <div className="chain-of-greed__hud">
                {state.phase === 'finalTurn' ? null : (
                  <div className="chain-of-greed__status-pill chain-of-greed__status-pill--gold chain-of-greed__prize-pool-pill">
                    <strong>{`Your Bank ${humanRoundBank.toLocaleString()}`}</strong>
                  </div>
                )}
              </div>
            )}
            <div className="chain-of-greed__header-actions">
              {state.gameMode !== 'solo' && (
                <details
                  className="chain-of-greed__participant-log chain-of-greed__header-log"
                  data-testid="chain-participant-log"
                >
                  <summary>
                    <span>Log</span>
                  </summary>
                  <strong>{participantLogText}</strong>
                </details>
              )}
              <button
                type="button"
                className="chain-of-greed__icon-button"
                aria-label="Open help"
                onClick={() =>
                  setState((previous) => ({ ...previous, showHelp: !previous.showHelp }))
                }
              >
                <span className="chain-of-greed__help-icon" aria-hidden="true">
                  ?
                </span>
              </button>
              {state.gameMode !== 'solo' && state.phase === 'playerTurn' && (
                <button
                  type="button"
                  className="chain-of-greed__icon-button chain-of-greed__pace-button"
                  aria-label={
                    watchPace === 'story' ? 'Speed up AI playback' : 'Slow down AI playback'
                  }
                  aria-pressed={watchPace === 'quick'}
                  onClick={() => setWatchPace((pace) => (pace === 'story' ? 'quick' : 'story'))}
                >
                  <span aria-hidden="true">⚡</span>
                </button>
              )}
              <button
                type="button"
                className="chain-of-greed__icon-button"
                aria-label="Open round insights"
                onClick={() => setIsInsightsSheetOpen(true)}
              >
                <span aria-hidden="true">⋯</span>
              </button>
            </div>
          </div>
        </header>

        <main className="chain-of-greed__main">
          <motion.section
            className={`chain-of-greed__hero-stage chain-of-greed__hero-stage--${heroTone}${state.gameMode === 'solo' && state.phase === 'finalTurn' ? ' chain-of-greed__hero-stage--solo-timed' : ''}`}
            animate={{
              scale:
                heroTone === 'danger' ? [1, 1.018, 1] : heroTone === 'success' ? [1, 1.01, 1] : 1,
              boxShadow:
                heroTone === 'danger'
                  ? '0 22px 52px rgba(120, 16, 16, 0.34)'
                  : heroTone === 'bank'
                    ? '0 22px 52px rgba(129, 90, 12, 0.32)'
                    : heroTone === 'success'
                      ? '0 22px 52px rgba(19, 84, 154, 0.32)'
                      : '0 18px 42px rgba(0, 0, 0, 0.28)',
            }}
            transition={{ duration: 0.34, ease: 'easeOut' }}
          >
            <div className="chain-of-greed__stage-core" data-testid="chain-broadcast-board">
              <AnimatePresence initial={false}>
                {lastTurn && heroTone !== 'neutral' && (
                  <motion.div
                    key={`${lastTurn.actorId ?? 'house'}-${lastTurn.choice}-${lastTurn.revealedNumber ?? 'hidden'}-${heroTone}`}
                    className={`chain-of-greed__hero-impact chain-of-greed__hero-impact--${heroTone}`}
                    aria-hidden="true"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: [0, 0.72, 0], scale: [0.92, 1.02, 1.08] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>
              <div
                role="button"
                tabIndex={0}
                aria-label="Open chain ladder board"
                className="chain-of-greed__ladder-stage"
                data-testid="chain-ladder-stage"
                onClick={() => setIsLadderSheetOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setIsLadderSheetOpen(true)
                  }
                }}
              >
                <div
                  className={`chain-of-greed__number-aura chain-of-greed__number-aura--${heroTone}`}
                  aria-hidden="true"
                />
                <ol className="chain-of-greed__ladder-track" aria-label="Current chain ladder">
                  {ladderSteps.map(
                    ({
                      value,
                      step,
                      badge,
                      isActive,
                      isCleared,
                      isNext,
                      carriesReference,
                      labelSide,
                      tension,
                    }) => (
                      <li
                        key={value}
                        className={[
                          'chain-of-greed__ladder-node',
                          isActive ? 'chain-of-greed__ladder-node--active' : '',
                          isCleared ? 'chain-of-greed__ladder-node--cleared' : '',
                          isNext ? 'chain-of-greed__ladder-node--next' : '',
                          carriesReference ? 'chain-of-greed__ladder-node--reference' : '',
                          `chain-of-greed__ladder-node--${tension}`,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span
                          className={[
                            'chain-of-greed__ladder-step-copy',
                            `chain-of-greed__ladder-step-copy--${labelSide}`,
                          ].join(' ')}
                        >
                          <strong>{value.toLocaleString()}</strong>
                          <small>{badge ?? `Step ${step}`}</small>
                        </span>
                        <span className="chain-of-greed__ladder-node-main">
                          <span className="chain-of-greed__ladder-rail" aria-hidden="true" />
                          <span className="chain-of-greed__ladder-dot" aria-hidden="true" />
                          {carriesReference && (
                            <span className="chain-of-greed__current-cluster">
                              <span className="chain-of-greed__current-badge">Current</span>
                              <motion.span
                                className="chain-of-greed__number-tag"
                                key={`reference-${referenceNumber}-${state.revealedNumber}`}
                                initial={{ opacity: 0, y: 10, scale: 0.92 }}
                                animate={{
                                  opacity: currentActor && !isHumanTurn ? 0.82 : 1,
                                  y: 0,
                                  scale: 1,
                                }}
                                transition={{ duration: 0.26, ease: 'easeOut' }}
                              >
                                {referenceNumber}
                              </motion.span>
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  )}
                </ol>
                {isAtStartingPosition && (
                  <div
                    className="chain-of-greed__current-anchor"
                    data-testid="chain-current-anchor"
                  >
                    <span className="chain-of-greed__current-anchor-main">
                      <span
                        className="chain-of-greed__ladder-dot chain-of-greed__ladder-dot--anchor"
                        aria-hidden="true"
                      />
                      <span className="chain-of-greed__current-cluster">
                        <span className="chain-of-greed__current-badge">Current</span>
                        <motion.span
                          className="chain-of-greed__number-tag"
                          key={`reference-${referenceNumber}-${state.revealedNumber}-anchor`}
                          initial={{ opacity: 0, y: 10, scale: 0.92 }}
                          animate={{
                            opacity: currentActor && !isHumanTurn ? 0.82 : 1,
                            y: 0,
                            scale: 1,
                          }}
                          transition={{ duration: 0.26, ease: 'easeOut' }}
                        >
                          {referenceNumber}
                        </motion.span>
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <aside
                className={[
                  'chain-of-greed__participant-panel',
                  `chain-of-greed__participant-panel--${panelTone}`,
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-testid="chain-participant-panel"
                aria-live="polite"
              >
                <div className="chain-of-greed__participant-topline">
                  <span className="chain-of-greed__participant-avatar" aria-hidden="true">
                    {panelAvatar}
                  </span>
                  <div className="chain-of-greed__participant-name">
                    <strong>{panelActorName}</strong>
                    <span className="chain-of-greed__participant-badges">
                      {isHumanTurn && !pendingTurn && <em>Your turn</em>}
                    </span>
                  </div>
                </div>
                <div className="chain-of-greed__participant-number">{panelNumberLabel}</div>
                <div className="chain-of-greed__participant-status">{panelStatusText}</div>
                {state.gameMode !== 'solo' && (
                  <p className="chain-of-greed__participant-detail">
                    {isHumanTurn && !pendingTurn ? (
                      <>
                        <span>
                          Round Bank <strong>{humanRoundBank.toLocaleString()}</strong>
                        </span>
                        <span>
                          At risk <strong>{currentPotLabel}</strong>
                        </span>
                        <span>
                          Hit <strong>→ {nextRewardValueLabel}</strong>
                        </span>
                      </>
                    ) : (
                      panelDetailText
                    )}
                  </p>
                )}
                {isHumanTurn && baseChain && riskOdds && !pendingTurn && (
                  <div
                    className="chain-of-greed__risk-readout"
                    data-testid="chain-risk-readout"
                    aria-label="Estimated next-number odds from the remaining number cards"
                  >
                    <div className="chain-of-greed__risk-readout-odds">
                      <span>
                        Higher <strong>{Math.round(riskOdds.higher * 100)}%</strong>
                      </span>
                      <span>
                        Equal <strong>{Math.round(riskOdds.equal * 100)}%</strong>
                      </span>
                      <span>
                        Lower <strong>{Math.round(riskOdds.lower * 100)}%</strong>
                      </span>
                    </div>
                  </div>
                )}
                {isHumanTurn && (
                  <button
                    type="button"
                    className="chain-of-greed__participant-bank"
                    data-testid="chain-bank-action"
                    aria-label={isBankUsedThisTurn ? 'Banked this turn' : 'Bank'}
                    disabled={isActionLocked || isBankUsedThisTurn || isBankEmpty}
                    title={
                      isSafetyArmed
                        ? 'Safety remains armed for your required guess.'
                        : isBankEmpty
                          ? 'Build the chain before banking.'
                          : undefined
                    }
                    onClick={() => handleAction('bank')}
                  >
                    {isBankUsedThisTurn ? 'Banked this turn' : 'Bank'}
                  </button>
                )}
                <div className="chain-of-greed__inline-status" data-testid="chain-inline-status">
                  <span aria-label={`Step ${currentChainStep} of ${CHAIN_LADDER.length}`}>
                    {chainStatusText.step}
                  </span>
                  {state.gameMode === 'solo' && (
                    <span
                      aria-label={`At risk ${currentPotLabel}`}
                    >{`At risk ${currentPotLabel}`}</span>
                  )}
                  <span aria-label={`Next reward ${nextReward.toLocaleString()}`}>
                    {chainStatusText.next}
                  </span>
                </div>
                {isSharedRoundClock && (
                  <div
                    className={`chain-of-greed__final-timer chain-of-greed__round-timer${roundTimerSeconds !== null && roundTimerSeconds <= 10 ? ' chain-of-greed__final-timer--urgent' : ''}`}
                    aria-label={roundTimerLabel ?? undefined}
                    data-testid="chain-shared-round-timer"
                  >
                    <span className="chain-of-greed__header-timer-icon" aria-hidden="true">
                      ◷
                    </span>
                    <span className="chain-of-greed__final-timer-value">{roundTimerValue}</span>
                    <span className="chain-of-greed__final-timer-label">left</span>
                  </div>
                )}
                {state.gameMode === 'solo' && finalSecondsRemaining !== null && (
                  <div
                    className={`chain-of-greed__final-timer chain-of-greed__round-timer${roundTimerSeconds !== null && roundTimerSeconds <= 10 ? ' chain-of-greed__final-timer--urgent' : ''}`}
                    aria-label={roundTimerLabel ?? undefined}
                    data-testid="chain-solo-round-timer"
                  >
                    <span className="chain-of-greed__header-timer-icon" aria-hidden="true">
                      ◷
                    </span>
                    <span className="chain-of-greed__final-timer-value">{roundTimerValue}</span>
                    <span className="chain-of-greed__final-timer-label">left</span>
                  </div>
                )}
                {((state.gameMode === 'shared' && state.phase === 'playerTurn') ||
                  (state.gameMode === 'solo' && state.phase === 'finalTurn')) && (
                  <div
                    className="chain-of-greed__status-pill chain-of-greed__status-pill--gold chain-of-greed__current-pot-pill"
                    aria-label={`Pot ${currentPotLabel}`}
                    data-testid={
                      state.gameMode === 'solo'
                        ? 'chain-solo-current-pot'
                        : 'chain-shared-current-pot'
                    }
                  >
                    <strong>
                      {`Pot ${state.gameMode === 'solo' ? humanRoundBank.toLocaleString() : currentPotLabel}`}
                    </strong>
                  </div>
                )}
                {state.gameMode === 'shared' && state.phase === 'playerTurn' && !isHumanTurn && (
                  <div
                    className="chain-of-greed__participant-watch"
                    data-testid="chain-inline-watch-controls"
                  >
                    {!isHumanTurn && (
                      <div className="chain-of-greed__participant-watch-copy">
                        <strong>
                          {currentActor?.name ?? 'The house'}{' '}
                          {getAiWaitingText(pendingTurn, isBankUsedThisTurn)}
                        </strong>
                        {nextPlayers.length > 0 && (
                          <small>
                            Next up: {nextPlayers.map((player) => player.name).join(' · ')}
                          </small>
                        )}
                        {humanTurnDistance !== null && (
                          <small>
                            {humanTurnDistance === 1
                              ? 'You are up next'
                              : `You are up in ${humanTurnDistance} turns`}
                          </small>
                        )}
                      </div>
                    )}
                    {state.spectatorMode !== 'skipping' && (
                      <div className="chain-of-greed__watch-controls chain-of-greed__watch-controls--compact">
                        <button
                          type="button"
                          className="chain-of-greed__pause-button"
                          onClick={() => setIsPlaybackPaused((paused) => !paused)}
                        >
                          {isPlaybackPaused ? 'Resume' : 'Pause'} watch
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {isHumanTurn && isSafetyArmed && (
                  <div className="chain-of-greed__safety-readout" role="status">
                    Safety armed · miss recovers {Math.floor(activePot / 2).toLocaleString()}, loses{' '}
                    {Math.ceil(activePot / 2).toLocaleString()}.
                  </div>
                )}
                {isHumanTurn && isPawnArmed && humanRoundBank > 0 && (
                  <div className="chain-of-greed__pawn-readout" role="status">
                    All-in {humanRoundBank.toLocaleString()} · correct doubles your bank; a miss
                    wipes it.
                  </div>
                )}
                {state.gameMode === 'solo' && (lastTurn || isHumanTurn) && (
                  <details
                    className="chain-of-greed__participant-log"
                    data-testid="chain-participant-log"
                  >
                    <summary>
                      <span>Log</span>
                    </summary>
                    <strong>{participantLogText}</strong>
                  </details>
                )}
              </aside>
            </div>
          </motion.section>

          {showStickyActionBar && (
            <motion.footer
              className="chain-of-greed__action-bar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
            >
              {isHumanTurn ? (
                <>
                  <div className="chain-of-greed__buttons">
                    <button
                      type="button"
                      className={[
                        'chain-of-greed__action',
                        'chain-of-greed__action--lower',
                        pendingTurn?.choice === 'lower' ? 'chain-of-greed__action--selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={isActionLocked}
                      onClick={() => handleAction('lower')}
                    >
                      Lower
                    </button>
                    <button
                      type="button"
                      className={[
                        'chain-of-greed__action',
                        'chain-of-greed__action--equal',
                        pendingTurn?.choice === 'equal' ? 'chain-of-greed__action--selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={isActionLocked}
                      onClick={() => handleAction('equal')}
                    >
                      Equal
                    </button>
                    <button
                      type="button"
                      className={[
                        'chain-of-greed__action',
                        'chain-of-greed__action--higher',
                        pendingTurn?.choice === 'higher' ? 'chain-of-greed__action--selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={isActionLocked}
                      onClick={() => handleAction('higher')}
                    >
                      Higher
                    </button>
                  </div>
                  {isHumanTurn && currentActor?.safetyAvailable && activePot > 0 && (
                    <button
                      type="button"
                      className={[
                        'chain-of-greed__safety-button',
                        isSafetyArmed ? 'chain-of-greed__safety-button--armed' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-pressed={isSafetyArmed}
                      disabled={isActionLocked}
                      onClick={() => {
                        setIsPawnArmed(false)
                        setIsSafetyArmed((armed) => !armed)
                      }}
                    >
                      <span aria-hidden="true">◈</span>{' '}
                      {isSafetyArmed ? 'Safety armed · tap to cancel' : 'Arm one-use Safety'}
                    </button>
                  )}
                  {isHumanTurn &&
                    state.gameMode === 'solo' &&
                    actionTargetKind === 'final' &&
                    humanRoundBank > 0 && (
                      <button
                        type="button"
                        className={[
                          'chain-of-greed__pawn-button',
                          isPawnArmed ? 'chain-of-greed__pawn-button--armed' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-pressed={isPawnArmed}
                        disabled={isActionLocked}
                        onClick={() => {
                          setIsSafetyArmed(false)
                          setIsPawnArmed((armed) => !armed)
                        }}
                      >
                        <span aria-hidden="true">↗</span>{' '}
                        {isPawnArmed
                          ? 'All-in armed · tap to cancel'
                          : `Pawn Round Bank · ${humanRoundBank.toLocaleString()}`}
                      </button>
                    )}
                  {isHumanTurn && !currentActor?.safetyAvailable && (
                    <div className="chain-of-greed__safety-spent" aria-label="Safety has been used">
                      Safety spent
                    </div>
                  )}
                </>
              ) : (
                <div className="chain-of-greed__ai-waiting">
                  <strong>{currentActor?.name ?? 'The house'}</strong>
                  <span>{getAiWaitingText(pendingTurn, isBankUsedThisTurn)}</span>
                  {state.phase === 'playerTurn' && nextPlayers.length > 0 && (
                    <small>Next up: {nextPlayers.map((player) => player.name).join(' · ')}</small>
                  )}
                  {humanTurnDistance !== null && (
                    <small>
                      {humanTurnDistance === 1
                        ? 'You are up next'
                        : `You are up in ${humanTurnDistance} turns`}
                    </small>
                  )}
                  {state.spectatorMode !== 'skipping' &&
                    state.phase !== 'finalTurn' &&
                    state.gameMode === 'solo' && (
                      <div
                        className="chain-of-greed__watch-controls"
                        aria-label="AI turn viewing controls"
                      >
                        <div
                          className="chain-of-greed__watch-pace"
                          role="group"
                          aria-label="Watch pace"
                        >
                          <button
                            type="button"
                            aria-pressed={watchPace === 'story'}
                            onClick={() => setWatchPace('story')}
                          >
                            Story
                          </button>
                          <button
                            type="button"
                            aria-pressed={watchPace === 'quick'}
                            onClick={() => setWatchPace('quick')}
                          >
                            Quick
                          </button>
                        </div>
                        <button
                          type="button"
                          className="chain-of-greed__pause-button"
                          onClick={() => setIsPlaybackPaused((paused) => !paused)}
                        >
                          {isPlaybackPaused ? 'Resume' : 'Pause'} watch
                        </button>
                      </div>
                    )}
                </div>
              )}
            </motion.footer>
          )}

          {state.gameMode !== 'solo' && playerRail}
        </main>
      </div>

      <AnimatePresence>
        {isLadderSheetOpen && (
          <motion.div
            className="chain-of-greed__overlay chain-of-greed__overlay--sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="chain-of-greed__modal chain-of-greed__modal--sheet"
              initial={{ y: 44, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 44, opacity: 0 }}
            >
              <div className="chain-of-greed__sheet-header">
                <div>
                  <div className="chain-of-greed__eyebrow">Full ladder</div>
                  <h2>Chain rewards</h2>
                </div>
                <button
                  type="button"
                  className="chain-of-greed__help-button"
                  onClick={() => setIsLadderSheetOpen(false)}
                >
                  Close
                </button>
              </div>
              <ol className="chain-of-greed__ladder">
                {ladderSteps.map(({ value, step, badge, isActive, isCleared }) => (
                  <li
                    key={value}
                    className={[
                      'chain-of-greed__ladder-step',
                      isActive ? 'chain-of-greed__ladder-step--active' : '',
                      isCleared ? 'chain-of-greed__ladder-step--cleared' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div>
                      <span>Step {step}</span>
                      {badge && <small className="chain-of-greed__step-tag">{badge}</small>}
                    </div>
                    <strong>{value.toLocaleString()}</strong>
                  </li>
                ))}
              </ol>
            </motion.div>
          </motion.div>
        )}

        {isInsightsSheetOpen && (
          <motion.div
            className="chain-of-greed__overlay chain-of-greed__overlay--sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="chain-of-greed__modal chain-of-greed__modal--sheet"
              initial={{ y: 44, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 44, opacity: 0 }}
            >
              <div className="chain-of-greed__sheet-header">
                <div>
                  <div className="chain-of-greed__eyebrow">Round insight</div>
                  <h2>Review the board</h2>
                </div>
                <button
                  type="button"
                  className="chain-of-greed__help-button"
                  onClick={() => setIsInsightsSheetOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="chain-of-greed__summary-grid">
                <div>
                  <span>Round banked</span>
                  <strong>{state.roundSecured.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Most correct</span>
                  <strong>
                    {summary.mostCorrect
                      ? `${summary.mostCorrect.name} (${summary.mostCorrect.roundCorrectGuesses})`
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span>Biggest buster</span>
                  <strong>
                    {summary.biggestBuster
                      ? `${summary.biggestBuster.name} (${summary.biggestBuster.roundBusts})`
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span>Prize pool</span>
                  <strong>{formatInfluence(state.securedTotal)}</strong>
                </div>
              </div>
              <div className="chain-of-greed__history-card chain-of-greed__history-card--sheet">
                <div className="chain-of-greed__panel-title">Recent chain history</div>
                <ul>
                  {state.turnHistory.map((entry, index) => (
                    <li
                      key={`${entry.actorId}-${index}-${entry.referenceNumber}-${entry.choice}-${entry.revealedNumber}`}
                    >
                      <strong>{entry.actorName}</strong> — {entry.message}
                    </li>
                  ))}
                  {state.turnHistory.length === 0 && <li>No turns yet. The chain is waiting.</li>}
                </ul>
              </div>
            </motion.div>
          </motion.div>
        )}

        {profilePlayer && (
          <motion.div
            className="chain-of-greed__overlay chain-of-greed__overlay--sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedProfileId(null)}
          >
            <motion.div
              className="chain-of-greed__modal chain-of-greed__modal--sheet chain-of-greed__modal--profile"
              role="dialog"
              aria-modal="true"
              aria-label={`${profilePlayer.name} round profile`}
              initial={{ y: 36, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 36, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="chain-of-greed__sheet-header">
                <div className="chain-of-greed__profile-heading">
                  <span className="chain-of-greed__profile-avatar">
                    {getSafeAvatarDisplay(profilePlayer)}
                  </span>
                  <div>
                    <div className="chain-of-greed__eyebrow">Observed this round</div>
                    <h2>{profilePlayer.name}</h2>
                  </div>
                </div>
                <button
                  type="button"
                  className="chain-of-greed__icon-button chain-of-greed__profile-close"
                  aria-label="Close player profile"
                  onClick={() => setSelectedProfileId(null)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <div className="chain-of-greed__summary-grid chain-of-greed__summary-grid--profile">
                <div>
                  <span>Influence earned</span>
                  <strong>{profilePlayer.roundContribution.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Correct / misses</span>
                  <strong>
                    {profilePlayer.roundCorrectGuesses} / {profilePlayer.roundWrongGuesses}
                  </strong>
                </div>
                <div>
                  <span>Banked / decisions</span>
                  <strong>
                    {profilePlayer.roundBanked.toLocaleString()} / {profilePlayer.roundBanks}
                  </strong>
                </div>
                <div>
                  <span>Safety recovered</span>
                  <strong>{profilePlayer.roundRecovered.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Influence lost</span>
                  <strong>{profilePlayer.roundLost.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Broken chains</span>
                  <strong>{profilePlayer.roundBusts}</strong>
                </div>
                <div>
                  <span>Match earned</span>
                  <strong>{profilePlayer.totalContribution.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Match Safety recovered</span>
                  <strong>{profilePlayer.totalRecovered.toLocaleString()}</strong>
                </div>
              </div>
              <div className="chain-of-greed__history-card chain-of-greed__history-card--sheet">
                <div className="chain-of-greed__panel-title">Their recent calls</div>
                <ul>
                  {profileTurns.map((turn, index) => (
                    <li
                      key={`${turn.actorId}-${turn.phase}-${index}-${turn.referenceNumber}-${turn.choice}`}
                    >
                      <strong>
                        {turn.choice === 'bank'
                          ? 'BANK'
                          : `${turn.choice.toUpperCase()} on ${turn.referenceNumber}`}
                      </strong>
                      <span>
                        {turn.revealedNumber === null
                          ? turn.message
                          : ` ${turn.referenceNumber} → ${turn.revealedNumber}. ${turn.message}`}
                      </span>
                    </li>
                  ))}
                  {profileTurns.length === 0 && <li>No public calls recorded this round yet.</li>}
                </ul>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {state.showHelp && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">How it works</div>
            <h2>Keep the chain alive</h2>
            <ul className="chain-of-greed__rules-list">
              {state.gameMode === 'solo' ? (
                <li>
                  Build your bank in one minute. Risk it before a guess to double it on a hit; a
                  miss loses it.
                </li>
              ) : (
                <li>
                  There are up to five shared-chain rounds, each ending with weakest-link votes.
                </li>
              )}
              <li>
                {state.gameMode === 'solo'
                  ? 'Reach the last step with a correct guess to earn immunity. Rounds 1–2 eliminate the lowest bank; Round 3 keeps the top two; Round 4 decides the winner. Tied banks: fewer correct guesses ranks lower, then more misses.'
                  : 'The shared chain draws from a public shoe containing two copies of numbers 1–100. Every reveal changes the exact Higher / Equal / Lower odds shown on your turn; review earlier calls to read what remains.'}
              </li>
              {state.gameMode === 'shared' && (
                <li>
                  The highest final score wins and receives the entire shared prize pool as
                  Influence.
                </li>
              )}
              <li>
                Bank secures the active pot and keeps the reference number, but you still need a
                higher, equal, or lower guess this turn.
              </li>
              <li>
                Every contestant has one Safety token for the match. Arm or cancel it before a call;
                the next call spends it. A miss recovers half the active pot and loses the rest.
              </li>
              <li>A matching Equal call is correct; any other call on a tie is a miss.</li>
              <li>
                Story is the default viewing pace. Quick shortens the reveals but still shows every
                call and result; Pause stops between turns.
              </li>
              {state.gameMode === 'shared' && (
                <>
                  <li>Every remaining player gets 30 seconds for an individual final chain.</li>
                  <li>
                    Highest final score becomes LOH. Ties use fewer final mistakes, then fewer final
                    banks.
                  </li>
                </>
              )}
            </ul>
            <button
              type="button"
              className="chain-of-greed__continue"
              onClick={() => setState((previous) => ({ ...previous, showHelp: false }))}
            >
              Close Help
            </button>
          </div>
        </div>
      )}

      {state.phase === 'roundSummary' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">Round {state.roundNumber} Summary</div>
            <h2>Take a moment and review the board.</h2>
            <div className="chain-of-greed__summary-grid">
              <div>
                <span>Prize pool</span>
                <strong>{state.securedTotal.toLocaleString()}</strong>
              </div>
              <div>
                <span>Round banked</span>
                <strong>{state.roundSecured.toLocaleString()}</strong>
              </div>
              <div>
                <span>Best contributors</span>
                <strong>
                  {summary.bestContributors.map((player) => player.name).join(', ') || 'None yet'}
                </strong>
              </div>
              <div>
                <span>Worst contributors</span>
                <strong>
                  {summary.worstContributors.map((player) => player.name).join(', ') || 'None yet'}
                </strong>
              </div>
              <div>
                <span>Most correct</span>
                <strong>
                  {summary.mostCorrect
                    ? `${summary.mostCorrect.name} (${summary.mostCorrect.roundCorrectGuesses})`
                    : '—'}
                </strong>
              </div>
              <div>
                <span>Biggest buster</span>
                <strong>
                  {summary.biggestBuster
                    ? `${summary.biggestBuster.name} (${summary.biggestBuster.roundBusts})`
                    : '—'}
                </strong>
              </div>
            </div>
            <button
              type="button"
              className="chain-of-greed__continue"
              onClick={() =>
                setPhase('voting', {
                  statusText: 'Vote for the weakest link.',
                  helperText: 'Who cost the team its momentum?',
                })
              }
            >
              Proceed to Vote
            </button>
          </div>
        </div>
      )}

      {(state.phase === 'voting' || state.phase === 'voteReveal') && (
        <div className="chain-of-greed__overlay">
          <div
            className="chain-of-greed__modal chain-of-greed__modal--vote-flow"
            data-testid="chain-vote-flow-modal"
          >
            <div className="chain-of-greed__eyebrow">
              {state.phase === 'voting'
                ? 'Vote Phase'
                : state.revealedVotes < state.pendingVotes.length
                  ? 'Vote Reveal'
                  : 'Vote Result'}
            </div>
            {strongestRoundPlayer && (
              <div className="chain-of-greed__round-standout" data-testid="chain-round-standout">
                <span>Strongest this round</span>
                <strong>{strongestRoundPlayer.name}</strong>
              </div>
            )}
            {state.phase === 'voting' ? (
              <>
                <h2>Choose who should leave</h2>
                <button
                  type="button"
                  className="chain-of-greed__link-button chain-of-greed__vote-history-toggle"
                  onClick={() => setIsVoteHistoryOpen((open) => !open)}
                >
                  {isVoteHistoryOpen ? 'Hide round history' : 'Review round turns'}
                </button>
                {isVoteHistoryOpen && (
                  <div
                    className="chain-of-greed__history-card chain-of-greed__history-card--sheet chain-of-greed__history-card--vote"
                    data-testid="chain-vote-history"
                  >
                    <div className="chain-of-greed__panel-title">Round history</div>
                    <ul>
                      {state.turnHistory.map((entry, index) => (
                        <li
                          key={`${entry.actorId}-${index}-${entry.referenceNumber}-${entry.choice}-${entry.revealedNumber}`}
                        >
                          <strong>{entry.actorName}</strong> — {entry.message}
                        </li>
                      ))}
                      {state.turnHistory.length === 0 && (
                        <li>No turns were recorded this round.</li>
                      )}
                    </ul>
                  </div>
                )}
                <div className="chain-of-greed__vote-grid">
                  {activePlayers
                    .filter((player) => player.id !== humanPlayer?.id)
                    .map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className={[
                          'chain-of-greed__vote-card',
                          state.humanVoteTargetId === player.id
                            ? 'chain-of-greed__vote-card--selected'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() =>
                          setState((previous) => ({ ...previous, humanVoteTargetId: player.id }))
                        }
                      >
                        <strong>{player.name}</strong>
                        <span>
                          {state.humanVoteTargetId === player.id
                            ? 'Your current choice'
                            : 'Select this player'}
                        </span>
                      </button>
                    ))}
                </div>
                <button type="button" className="chain-of-greed__continue" onClick={finishVoting}>
                  Reveal votes
                </button>
              </>
            ) : (
              <>
                <h2>
                  {state.revealedVotes < state.pendingVotes.length
                    ? 'The weakest link is not always the weakest player.'
                    : hasPendingHumanTieBreak
                      ? 'The vote is tied. Your call decides who leaves.'
                      : `${state.eliminatedThisStep.map((id) => getPlayer(state.players, id)?.name ?? id).join(' and ')} ${state.eliminatedThisStep.length === 1 ? 'is' : 'are'} out.`}
                </h2>
                {state.revealedVotes < state.pendingVotes.length ? (
                  <div className="chain-of-greed__vote-reveal-current" aria-live="polite">
                    {revealedVotes.length > 0 && (
                      <strong>
                        {revealedVotes[revealedVotes.length - 1]?.voterName} →{' '}
                        {revealedVotes[revealedVotes.length - 1]?.targetName}
                      </strong>
                    )}
                    <span>
                      {state.revealedVotes} of {state.pendingVotes.length} votes revealed
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="chain-of-greed__vote-tally" aria-label="Final vote tally">
                      {sortedVoteTally.map(([name, count]) => (
                        <span key={name}>
                          <strong>{name}</strong>
                          <b>{count}</b>
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="chain-of-greed__link-button chain-of-greed__ballot-toggle"
                      aria-expanded={isVoteBallotsOpen}
                      onClick={() => setIsVoteBallotsOpen((open) => !open)}
                    >
                      {isVoteBallotsOpen ? 'Hide ballots' : 'View ballots'}
                    </button>
                    {isVoteBallotsOpen && (
                      <ul className="chain-of-greed__vote-results">
                        {revealedVotes.map((vote) => (
                          <li key={`${vote.voterId}-${vote.targetId}`}>
                            <strong>{vote.voterName}</strong> → {vote.targetName}
                            <small>{vote.reason}</small>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {state.revealedVotes >= state.pendingVotes.length &&
                  state.tieBreaks.map((tieBreak, index) => (
                    <div key={`${tieBreak.type}-${index}`} className="chain-of-greed__tie-break">
                      <strong>{tieBreak.message}</strong>
                      {tieBreak.decisionPending ? (
                        <>
                          <p>{tieBreak.transcript[0]}</p>
                          <p>
                            Choose {tieBreak.eliminationCount ?? 1} tied player
                            {(tieBreak.eliminationCount ?? 1) === 1 ? '' : 's'} to eliminate:
                          </p>
                          <div className="chain-of-greed__tie-break-choices">
                            {tieBreak.candidateIds?.map((id) => {
                              const player = getPlayer(state.players, id)
                              if (!player) return null
                              const isSelected = tieBreak.decisionIds?.includes(id) ?? false
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  className={`chain-of-greed__tie-break-choice${isSelected ? ' chain-of-greed__tie-break-choice--selected' : ''}`}
                                  aria-pressed={isSelected}
                                  aria-label={`Eliminate ${player.name}`}
                                  onClick={() => decideHumanVoteTieBreak(index, id)}
                                >
                                  Eliminate {player.name}
                                </button>
                              )
                            })}
                          </div>
                        </>
                      ) : (
                        <p>{tieBreak.transcript.at(-1) ?? tieBreak.transcript[0]}</p>
                      )}
                    </div>
                  ))}
                {state.revealedVotes >= state.pendingVotes.length &&
                  humanPlayer &&
                  state.eliminatedThisStep.includes(humanPlayer.id) &&
                  getActivePlayers(state.players).length >= 2 && (
                    <div className="chain-of-greed__spectator-choice">
                      <p>You've been eliminated. What would you like to do?</p>
                      <div className="chain-of-greed__spectator-buttons">
                        <button
                          type="button"
                          className="chain-of-greed__continue"
                          onClick={() => {
                            setState((previous) => ({ ...previous, spectatorMode: 'watching' }))
                            continueAfterElimination()
                          }}
                        >
                          Keep watching
                        </button>
                        <button
                          type="button"
                          className="chain-of-greed__continue chain-of-greed__continue--secondary"
                          onClick={() => {
                            setIsPlaybackPaused(false)
                            setState((previous) => ({ ...previous, spectatorMode: 'skipping' }))
                            continueAfterElimination()
                          }}
                        >
                          Skip to Results
                        </button>
                      </div>
                    </div>
                  )}
                {state.revealedVotes >= state.pendingVotes.length &&
                  !hasPendingHumanTieBreak &&
                  !(humanPlayer && state.eliminatedThisStep.includes(humanPlayer.id)) && (
                    <button
                      type="button"
                      className="chain-of-greed__continue"
                      onClick={continueAfterElimination}
                    >
                      {state.gameMode === 'solo'
                        ? getActivePlayers(state.players).length <= 1
                          ? 'See Winner'
                          : `Continue to Round ${state.roundNumber + 1}`
                        : state.roundNumber >= STANDARD_ROUND_COUNT ||
                            getActivePlayers(state.players).length <= 2
                          ? 'Continue to Final'
                          : `Continue to Round ${state.roundNumber + 1}`}
                    </button>
                  )}
              </>
            )}
          </div>
        </div>
      )}

      {state.phase === 'eliminationReveal' && (
        <div className="chain-of-greed__overlay">
          <div
            className={`chain-of-greed__modal${state.gameMode === 'solo' ? ' chain-of-greed__modal--solo-ranking' : ''}`}
          >
            <div className="chain-of-greed__eyebrow">
              {state.gameMode === 'solo'
                ? `Solo Rush · Round ${state.roundNumber} of ${SOLO_RUSH_ROUND_COUNT}`
                : 'Elimination'}
            </div>
            <h2>
              {state.gameMode === 'solo' && state.eliminatedThisStep.length === 0
                ? state.soloImmunityIds.length > 0
                  ? 'Everyone is safe.'
                  : state.roundNumber === 3
                    ? 'Top two advance.'
                    : 'No one is out.'
                : `${state.eliminatedThisStep
                    .map((id) => getPlayer(state.players, id)?.name ?? id)
                    .join(' and ')} ${state.eliminatedThisStep.length === 1 ? 'is' : 'are'} out.`}
            </h2>
            {state.gameMode === 'solo' && (
              <div
                className="chain-of-greed__solo-ranking"
                aria-label="Solo Rush ranking"
                data-testid="chain-solo-ranking"
              >
                <div className="chain-of-greed__panel-title">Round Bank ranking</div>
                <div className="chain-of-greed__solo-ranking-head" aria-hidden="true">
                  <span>#</span>
                  <span>Player</span>
                  <span>Bank</span>
                  <span>Misses</span>
                  <span>Correct</span>
                </div>
                {soloRoundRanking.map((player, index) => {
                  const eliminated = state.eliminatedThisStep.includes(player.id)
                  return (
                    <div
                      key={player.id}
                      className={`chain-of-greed__solo-ranking-row${eliminated ? ' chain-of-greed__solo-ranking-row--out' : ''}`}
                    >
                      <span>{index + 1}</span>
                      <strong>
                        {player.name}
                        {state.soloImmunityIds.includes(player.id) && (
                          <small className="chain-of-greed__immune-tag">SAFE</small>
                        )}
                        {eliminated && <small>OUT</small>}
                      </strong>
                      <span>{(state.finalScores[player.id] ?? 0).toLocaleString()}</span>
                      <span>{player.finalWrongGuesses}</span>
                      <span>{player.finalCorrectGuesses}</span>
                    </div>
                  )
                })}
                <p className="chain-of-greed__solo-ranking-rules">
                  {state.soloImmunityIds.length > 0
                    ? 'SAFE players cannot be eliminated. Tied banks: fewer correct guesses ranks lower, then more misses.'
                    : state.roundNumber === 3
                      ? 'Top two advance. Tied banks: fewer correct guesses ranks lower, then more misses.'
                      : 'Lowest bank is out. Tied banks: fewer correct guesses ranks lower, then more misses.'}
                </p>
              </div>
            )}
            {state.gameMode !== 'solo' &&
              state.tieBreaks.map((tieBreak, index) => (
                <div key={`${tieBreak.type}-${index}`} className="chain-of-greed__tie-break">
                  <strong>{tieBreak.message}</strong>
                  <ul>
                    {tieBreak.transcript.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            {/* Spectator option when the human player has been eliminated */}
            {humanPlayer &&
              state.eliminatedThisStep.includes(humanPlayer.id) &&
              getActivePlayers(state.players).length >= 2 && (
                <div className="chain-of-greed__spectator-choice">
                  <p>You've been eliminated. What would you like to do?</p>
                  <div className="chain-of-greed__spectator-buttons">
                    <button
                      type="button"
                      className="chain-of-greed__continue"
                      onClick={() => {
                        setState((previous) => ({ ...previous, spectatorMode: 'watching' }))
                        continueAfterElimination()
                      }}
                    >
                      Keep watching
                    </button>
                    <button
                      type="button"
                      className="chain-of-greed__continue chain-of-greed__continue--secondary"
                      onClick={() => {
                        setIsPlaybackPaused(false)
                        setState((previous) => ({ ...previous, spectatorMode: 'skipping' }))
                        continueAfterElimination()
                      }}
                    >
                      Skip to Results
                    </button>
                  </div>
                </div>
              )}
            {(!(humanPlayer && state.eliminatedThisStep.includes(humanPlayer.id)) ||
              (state.gameMode === 'solo' && getActivePlayers(state.players).length <= 1)) && (
              <button
                type="button"
                className="chain-of-greed__continue"
                onClick={continueAfterElimination}
              >
                {state.gameMode === 'solo'
                  ? getActivePlayers(state.players).length <= 1
                    ? getActivePlayers(state.players).length === 0
                      ? 'See Match Result'
                      : 'See Winner'
                    : `Continue to Round ${state.roundNumber + 1}`
                  : state.roundNumber >= STANDARD_ROUND_COUNT ||
                      getActivePlayers(state.players).length <= 2
                    ? 'Continue to Final'
                    : `Continue to Round ${state.roundNumber + 1}`}
              </button>
            )}
          </div>
        </div>
      )}

      {state.phase === 'semifinalIntro' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">Final 3: Sudden Chain</div>
            <h2>The chain is no longer shared.</h2>
            <p>
              No vote. No sympathy. Lowest semifinal score leaves. The prize pool stays at{' '}
              {formatInfluence(state.securedTotal)}.
            </p>
            <button type="button" className="chain-of-greed__continue" onClick={startSemifinal}>
              Start Semifinal
            </button>
          </div>
        </div>
      )}

      {state.phase === 'semifinalReveal' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">Semifinal Result</div>
            <h2>
              {getPlayer(state.players, state.semifinalEliminatedId)?.name ?? 'A finalist'} leaves
              in third place.
            </h2>
            <div className="chain-of-greed__summary-grid">
              {Object.entries(state.semifinalScores).map(([id, score]) => (
                <div key={id}>
                  <span>{getPlayer(state.players, id)?.name ?? id}</span>
                  <strong>{score}</strong>
                </div>
              ))}
            </div>
            {state.semifinalTieBreak && (
              <div className="chain-of-greed__tie-break">
                <strong>{state.semifinalTieBreak.message}</strong>
                <ul>
                  {state.semifinalTieBreak.transcript.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              className="chain-of-greed__continue"
              onClick={() =>
                setPhase('finalIntro', {
                  statusText: 'Two players remain.',
                  helperText: 'One player wins everything.',
                })
              }
            >
              Start Final
            </button>
          </div>
        </div>
      )}

      {state.phase === 'finalIntro' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal chain-of-greed__modal--hero">
            <div className="chain-of-greed__eyebrow">Round 6: LOH Final</div>
            <h2>30 seconds each. Highest chain score wins.</h2>
            <p>
              Every active player gets one timed chain. Ties use fewer mistakes, then fewer banks.
            </p>
            <button type="button" className="chain-of-greed__continue" onClick={startFinal}>
              Start Final
            </button>
          </div>
        </div>
      )}

      {state.phase === 'finalResult' && (
        <div className="chain-of-greed__overlay">
          <div
            className={`chain-of-greed__modal chain-of-greed__modal--hero${state.gameMode === 'solo' ? ' chain-of-greed__modal--winner' : ''}`}
          >
            {state.gameMode === 'solo' && (
              <div className="chain-of-greed__winner-mark" aria-hidden="true">
                ♛
              </div>
            )}
            <div className="chain-of-greed__eyebrow">
              {state.gameMode === 'solo'
                ? soloWinners.length > 1
                  ? 'Co-winners'
                  : soloWinners.length === 1
                    ? 'Solo Rush Winner'
                    : 'Solo Rush Tie'
                : 'Winner'}
            </div>
            <h2>
              {state.gameMode === 'solo'
                ? soloWinners.length > 1
                  ? `${soloWinners.map((player) => player.name).join(' & ')} share the win`
                  : soloWinners.length === 1
                    ? `${soloWinners[0].name} wins Solo Rush`
                    : 'Every player is eliminated'
                : `${winner?.name ?? 'A finalist'} becomes LOH`}
            </h2>
            <p>
              {state.gameMode === 'solo'
                ? soloWinners.length > 1
                  ? 'You all reached the final step and earned immunity. The LOH is shared.'
                  : soloWinners.length === 1
                    ? state.soloImmunityIds.includes(soloWinners[0].id)
                      ? 'Final-step immunity secured the win.'
                      : 'The highest Round Bank in Round 4 wins.'
                    : 'Everyone tied at the lowest Round Bank, mistakes, and correct calls, so the match ends in a tie.'
                : 'The highest final score wins the entire shared prize pool as Influence. Ties use fewer mistakes, then fewer banks.'}
            </p>
            {state.gameMode !== 'solo' && (
              <p className="chain-of-greed__prize-pool-result">
                Prize pool: <strong>{formatInfluence(state.securedTotal)}</strong>
              </p>
            )}
            <div
              className="chain-of-greed__summary-grid chain-of-greed__winner-scores"
              aria-label={state.gameMode === 'solo' ? 'Round 4 finalist scores' : undefined}
            >
              {(state.gameMode === 'solo'
                ? soloFinalStandings.map(
                    (player) => [player.id, state.finalScores[player.id] ?? 0] as [string, number]
                  )
                : Object.entries(state.finalScores).sort((left, right) => right[1] - left[1])
              ).map(([id, score]) => (
                <div key={id}>
                  <span>
                    {state.gameMode === 'solo'
                      ? state.winnerIds.includes(id) || state.winnerId === id
                        ? 'Winner'
                        : 'Finalist'
                      : 'Final score'}
                  </span>
                  <span>{getPlayer(state.players, id)?.name ?? id}</span>
                  <strong>{score.toLocaleString()}</strong>
                </div>
              ))}
            </div>
            {state.finalTieBreak && (
              <>
                <p className="chain-of-greed__tie-brief">
                  Scores were tied. Mistakes and bank efficiency broke the tie.
                </p>
                {finalDetailExpanded && (
                  <div className="chain-of-greed__tie-break">
                    <strong>{state.finalTieBreak.message}</strong>
                    <ul>
                      {state.finalTieBreak.transcript.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  type="button"
                  className="chain-of-greed__link-button"
                  onClick={() => setFinalDetailExpanded((prev) => !prev)}
                >
                  {finalDetailExpanded ? 'Hide details' : 'See details'}
                </button>
              </>
            )}
            <div className="chain-of-greed__winner-footer">
              <button
                type="button"
                className="chain-of-greed__continue"
                disabled={isResultCommitted}
                onClick={finishGame}
              >
                {state.gameMode === 'solo' && soloWinners.length === 0
                  ? 'Complete Match'
                  : 'Claim Result'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

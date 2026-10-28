import type { CwgoState } from '../features/cwgo/cwgoCompetitionSlice'
import type { HoldTheWallState } from '../features/holdTheWall/holdTheWallSlice'
import type { BiographyBlitzState } from '../features/biographyBlitz/biography_blitz_logic'
import type { FamousFiguresState } from '../features/famousFigures/famousFiguresSlice'
import type { SilentSaboteurState } from '../features/silentSaboteur/silentSaboteurSlice'
import type { MajorityRulesState } from '../features/majorityRules/majorityRulesSlice'
import type { GlassBridgeState } from '../features/glassBridge/glassBridgeSlice'
import type { BlackjackTournamentState } from '../features/blackjackTournament/blackjackTournamentSlice'
import type { RiskWheelState } from '../features/riskWheel/riskWheelSlice'
import type { WildcardWesternState } from '../features/wildcardWestern/wildcardWesternSlice'
import type { TetrisState } from '../features/tetris/tetrisSlice'
import type { TiltLabyrinthState } from '../features/tiltLabyrinth/tiltLabyrinthSlice'
import type { HouseOfCardsState } from '../features/houseOfCards/houseOfCardsSlice'
import type { MemoryColorsState } from '../features/memoryColors/memoryColorsSlice'

// Keep idle state in one shared module so deferring games does not add a request per slice.

export const cwgoInitialState: CwgoState = {
  status: 'idle',
  stage: 'qualifier',
  prizeType: 'LOH',
  seed: 0,
  playerScores: {},
  aliveIds: [],
  questionIdx: 0,
  questionOrder: [],
  guesses: {},
  responseTimesMs: {},
  revealResults: [],
  lastEliminated: [],
  eliminationOrder: [],
  round: 0,
  duelPair: null,
  duelWinnerId: null,
  leaderId: null,
  outcomeResolved: false,
}

export const holdTheWallInitialState: HoldTheWallState = {
  status: 'idle',
  prizeType: 'LOH',
  seed: 0,
  humanId: null,
  participantIds: [],
  aiDropSchedule: {},
  droppedIds: [],
  winnerId: null,
  finalTwoDeal: null,
  dealOpportunityResolved: false,
  outcomeResolved: false,
}

export const biographyBlitzInitialState: BiographyBlitzState = {
  competitionType: 'LOH',
  phase: 'idle',
  round: 0,

  contestantIds: [],
  activeContestantIds: [],
  eliminatedContestantIds: [],

  humanContestantId: null,

  currentQuestion: null,
  currentQuestionId: null,
  correctAnswerId: null,

  questionPool: [],
  usedQuestionIds: [],

  submissions: {},

  roundWinnerId: null,
  eliminationTargetId: null,
  competitionWinnerId: null,

  questionStartedAt: null,
  hiddenDeadlineAt: null,

  consecutiveRoundWins: {},
  hotStreakContestantId: null,

  isSpectating: false,

  outcomeResolved: false,
  seed: 0,
  testMode: false,
}

export const famousFiguresInitialState: FamousFiguresState = {
  competitionType: 'LOH',
  status: 'idle',
  currentRound: 0,
  totalRounds: 6,
  currentFigureIndex: 0,
  hintsRevealed: 0,
  playerScores: {},
  playerRoundScores: {},
  playerCorrect: {},
  playerGuesses: {},
  playerCorrectTimestamp: {},
  correctPlayers: [],
  figureOrder: [],
  round: 0,
  seed: 0,
  outcomeResolved: false,
  winnerId: null,
  tieBreakOrder: [],
  aiSubmissions: {},
  timerPhase: 'clue',
  roundComplete: false,
  matchFigureOrder: [],
  playerFigureQueues: {},
  playerRoundCursor: {},
  playerPersonalRoundScores: {},
}

export const silentSaboteurInitialState: SilentSaboteurState = {
  phase: 'idle',
  prizeType: 'LOH',
  seed: 0,
  round: 0,

  participantIds: [],
  activeIds: [],
  eliminatedIds: [],

  humanPlayerId: null,

  saboteurId: null,
  victimId: null,
  votes: {},
  roundEvidence: {},

  final2SaboteurId: null,
  final2VictimId: null,
  final2Kind: 'sabotage',
  juryVotes: {},
  juryIds: [],
  final2TieBreakVote: null,

  revealInfo: null,
  roundHistory: [],

  noJuryFallback: false,

  winnerId: null,
  outcomeResolved: false,
}

export const majorityRulesInitialState: MajorityRulesState = {
  phase: 'idle',
  competitionType: 'LOH',
  seed: 0,
  participantIds: [],
  activeIds: [],
  eliminatedIds: [],
  humanPlayerId: null,
  roundNumber: 1,
  revoteNumber: 0,
  currentQuestion: null,
  usedQuestionIds: [],
  draftAnswers: {},
  previousDistribution: null,
  blockedAnswers: {},
  doubleEliminationArmed: false,
  hintInventories: {},
  roundHintUsedBy: null,
  roundHintType: null,
  roundHintTargetId: null,
  roundHintPollEstimate: null,
  roundHintPeekedAnswers: null,
  revealState: null,
  threeWayDuel: null,
  finalDuel: null,
  winnerId: null,
  outcomeResolved: false,
  aiIdentities: {},
  vipExperience: false,
  roomReaderStreak: 0,
  bestRoomReaderStreak: 0,
  lastRoomReadCorrect: null,
}

export const DEFAULT_ROWS_COUNT = 16

export const glassBridgeInitialState: GlassBridgeState = {
  phase: 'idle',
  seed: 0,
  competitionType: 'LOH',
  participants: [],
  rowsCount: DEFAULT_ROWS_COUNT,
  rows: [],
  challengeStartTimeMs: null,
  chosenNumbers: {},
  turnOrder: [],
  currentTurnIndex: 0,
  currentPlayerRow: 1,
  progress: {},
  eliminationOrder: [],
  winnerId: null,
  placements: [],
  outcomeResolved: false,
  humanPlayerId: null,
  humanSpectating: false,
}

export const blackjackTournamentInitialState: BlackjackTournamentState = {
  competitionType: 'LOH',
  phase: 'idle',
  stage: 'league',

  allPlayerIds: [],
  remainingPlayerIds: [],
  eliminatedPlayerIds: [],
  playerScores: {},
  leagueScores: {},
  leagueRankings: [],
  leagueOpponentIds: [],
  leagueOpponentIndex: 0,
  finalistIds: null,

  humanPlayerId: null,
  isSpectating: false,

  controllingPlayerId: null,
  fighterAId: null,
  fighterBId: null,

  currentDuel: null,
  duelWinnerId: null,
  duelLoserId: null,
  duelEliminatedId: null,
  isDuelTie: false,
  rematchCount: 0,
  duelIndex: 0,

  winnerId: null,

  seed: 0,
  outcomeResolved: false,
}

export const riskWheelInitialState: RiskWheelState = {
  competitionType: 'LOH',
  phase: 'idle',
  allPlayerIds: [],
  activePlayerIds: [],
  eliminatedPlayerIds: [],
  humanPlayerId: null,
  initialPlayerCount: 0,
  round: 1,
  roundScores: {},
  playersCompletedThisRound: [],
  currentPlayerIndex: 0,
  currentSpinCount: 0,
  lastSectorIndex: null,
  last666Effect: null,
  eliminatedThisRound: [],
  tieBreaker: null,
  tieBreakerSummary: null,
  winnerId: null,
  seed: undefined,
  rngCallCount: 0,
  aiDecisionCallCount: 0,
  aiPersonalities: {},
  aiDecisionCounts: {},
  outcomeResolved: false,
  finalScores: undefined,
}

export const wildcardWesternInitialState: WildcardWesternState = {
  phase: 'idle',
  stage: 'league',
  prizeType: 'LOH',
  seed: 0,
  duelNumber: 0,

  participantIds: [],
  aliveIds: [],
  eliminatedIds: [],
  humanPlayerId: null,
  playerScores: {},
  leagueScores: {},
  leagueRankings: [],
  leagueOpponentIds: [],
  leagueOpponentIndex: 0,
  finalistIds: null,

  cardsByPlayerId: {},

  currentPair: null,
  duelResolved: false,

  currentQuestionId: null,
  questionOrder: [],
  questionCursor: 0,

  buzzedBy: null,
  buzzWindowUntil: 0,
  answerWindowUntil: 0,

  selectedAnswerIndex: null,

  controllerId: null,
  eliminationChooserId: null,

  lastDuelOutcome: null,
  lastEliminatedId: null,
  lastDuelWinnerId: null,
  lastDuelLoserId: null,

  winnerId: null,
  outcomeResolved: false,
}

export const tetrisInitialState: TetrisState = {
  phase: 'idle',
  competitionType: 'LOH',
  seed: 0,
  participants: [],
  humanPlayerId: null,
  aiScores: {},
  humanScore: null,
  finalScores: {},
  winnerId: null,
  lastPlaceId: null,
  outcomeResolved: false,
}

export const tiltLabyrinthInitialState: TiltLabyrinthState = {
  phase: 'idle',
  competitionType: 'LOH',
  seed: 0,
  participants: [],
  humanPlayerId: null,
  aiScores: {},
  humanScore: null,
  finalScores: {},
  runDetails: {},
  winnerId: null,
  lastPlaceId: null,
  outcomeResolved: false,
}

export const houseOfCardsInitialState: HouseOfCardsState = {
  status: 'idle',
  prizeType: 'LOH',
  seed: 0,
  participantIds: [],
  aiOutcomes: {},
  humanOutcome: null,
  standings: [],
  winnerId: null,
  lastPlaceId: null,
  outcomeResolved: false,
}

export const memoryColorsInitialState: MemoryColorsState = {
  phase: 'idle',
  participantIds: [],
  competitionType: null,
  seed: 0,
  humanPlayerId: null,
  round: 1,
  sequence: [],
  inputIndex: 0,
  stepStartMs: -1,
  totalResponseMs: 0,
  mistakesUsed: 0,
  aiResults: {},
  humanResult: null,
  finalRanking: [],
  winnerId: null,
  lastPlaceId: null,
  outcomeResolved: false,
}

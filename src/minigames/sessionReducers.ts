import {
  cwgoInitialState,
  holdTheWallInitialState,
  biographyBlitzInitialState,
  famousFiguresInitialState,
  silentSaboteurInitialState,
  majorityRulesInitialState,
  glassBridgeInitialState,
  blackjackTournamentInitialState,
  riskWheelInitialState,
  wildcardWesternInitialState,
  tetrisInitialState,
  tiltLabyrinthInitialState,
  houseOfCardsInitialState,
  memoryColorsInitialState,
} from './sessionInitialStates'
import { createDeferredReducer } from './deferredReducer'

/** Only idle state is needed at startup; each screen registers its real reducer on import. */
export const hostedMinigameReducers = {
  cwgo: createDeferredReducer('cwgo', cwgoInitialState, 'cwgo/resetCwgo'),
  holdTheWall: createDeferredReducer(
    'holdTheWall',
    holdTheWallInitialState,
    'holdTheWall/resetHoldTheWall'
  ),
  biographyBlitz: createDeferredReducer(
    'biographyBlitz',
    biographyBlitzInitialState,
    'biographyBlitz/resetBiographyBlitz'
  ),
  famousFigures: createDeferredReducer(
    'famousFigures',
    famousFiguresInitialState,
    'famousFigures/resetFamousFigures'
  ),
  silentSaboteur: createDeferredReducer(
    'silentSaboteur',
    silentSaboteurInitialState,
    'silentSaboteur/resetSilentSaboteur'
  ),
  majorityRules: createDeferredReducer(
    'majorityRules',
    majorityRulesInitialState,
    'majorityRules/resetMajorityRules'
  ),
  glassBridge: createDeferredReducer(
    'glassBridge',
    glassBridgeInitialState,
    'glassBridge/resetGlassBridge'
  ),
  blackjackTournament: createDeferredReducer(
    'blackjackTournament',
    blackjackTournamentInitialState,
    'blackjackTournament/resetBlackjackTournament'
  ),
  riskWheel: createDeferredReducer('riskWheel', riskWheelInitialState, 'riskWheel/resetRiskWheel'),
  wildcardWestern: createDeferredReducer(
    'wildcardWestern',
    wildcardWesternInitialState,
    'wildcardWestern/resetWildcardWestern'
  ),
  tetris: createDeferredReducer('tetris', tetrisInitialState, 'tetris/resetTetris'),
  tiltLabyrinth: createDeferredReducer(
    'tiltLabyrinth',
    tiltLabyrinthInitialState,
    'tiltLabyrinth/resetTiltLabyrinth'
  ),
  houseOfCards: createDeferredReducer(
    'houseOfCards',
    houseOfCardsInitialState,
    'houseOfCards/resetHouseOfCards'
  ),
  memoryColors: createDeferredReducer(
    'memoryColors',
    memoryColorsInitialState,
    'memoryColors/resetMemoryColors'
  ),
}

/** Stable action types avoid importing every game just to reset an idle session. */
export const HOSTED_MINIGAME_RESET_ACTIONS = {
  ClosestWithoutGoingOver: 'cwgo/resetCwgo',
  HoldTheWall: 'holdTheWall/resetHoldTheWall',
  BiographyBlitz: 'biographyBlitz/resetBiographyBlitz',
  FamousFigures: 'famousFigures/resetFamousFigures',
  SilentSaboteur: 'silentSaboteur/resetSilentSaboteur',
  MajorityRules: 'majorityRules/resetMajorityRules',
  GlassBridge: 'glassBridge/resetGlassBridge',
  BlackjackTournament: 'blackjackTournament/resetBlackjackTournament',
  RiskWheel: 'riskWheel/resetRiskWheel',
  WildcardWestern: 'wildcardWestern/resetWildcardWestern',
  Tetris: 'tetris/resetTetris',
  TiltLabyrinth: 'tiltLabyrinth/resetTiltLabyrinth',
  HouseOfCards: 'houseOfCards/resetHouseOfCards',
  MemoryColors: 'memoryColors/resetMemoryColors',
} as const

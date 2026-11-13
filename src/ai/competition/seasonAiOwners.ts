export type SeasonAiStrategy = 'profile' | 'ability' | 'decision-error' | 'retired'
export interface SeasonAiOwner {
  strategy: SeasonAiStrategy
  owner: string
  input: string
}

/** Exhaustive registry inventory. Chance draws and social preferences are never capability inputs. */
export const SEASON_AI_OWNERS: Record<string, SeasonAiOwner> = {
  quickTap: {
    strategy: 'profile',
    owner: 'quickTapSimulation / quickTapVipLogic',
    input: 'physical, consistency; VIP decision traits',
  },
  quickTapSeasons: {
    strategy: 'profile',
    owner: 'quickTapSeasons / quickTapVipLogic',
    input: 'physical, consistency; VIP decision traits',
  },
  memoryMatch: {
    strategy: 'ability',
    owner: 'memoryColorsSlice.simulateAiResult',
    input: 'memory skill before rounds/mistakes are simulated',
  },
  timingBar: {
    strategy: 'profile',
    owner: 'TimingBar.aiProfileMap',
    input: 'precision, nerve, clutch, consistency, choke',
  },
  boxedOut: {
    strategy: 'ability',
    owner: 'boxedOut.rules.aiTiebreakAnswer',
    input: 'estimation error; simultaneous boxes/rewards remain fair',
  },
  estimationGame: {
    strategy: 'profile',
    owner: 'hybridScoreResolver / EstimationGame',
    input: 'direction-aware weighted skill',
  },
  holdWall: {
    strategy: 'ability',
    owner: 'holdTheWallSlice / deal',
    input: 'endurance window and final-duel drop propensity',
  },
  famousFigures: {
    strategy: 'ability',
    owner: 'famousFiguresSlice',
    input: 'knowledge, shared by live plans and fast-forward results',
  },
  silentSaboteur: {
    strategy: 'decision-error',
    owner: 'silentSaboteur.helpers',
    input: 'suspect judgment noise; evidence and alliance preferences unchanged',
  },
  percentagePanic: {
    strategy: 'ability',
    owner: 'percentagePanic.logic',
    input: 'estimate error before rounding and standings',
  },
  majorityRules: {
    strategy: 'decision-error',
    owner: 'majorityRules.helpers',
    input: 'answer judgment noise; dice and semantic identity unchanged',
  },
  pressurePlank: {
    strategy: 'profile',
    owner: 'simulateMinigameAiScore',
    input: 'endurance model skill; human input unchanged',
  },
  colorMatch: {
    strategy: 'ability',
    owner: 'colorMatchUtils',
    input: 'modeled color error before accuracy score',
  },
  logicLocks: {
    strategy: 'ability',
    owner: 'codeBreakerLogic',
    input: 'solve latency; attempts and score formula unchanged',
  },
  snake: {
    strategy: 'profile',
    owner: 'snakeAiSimulator',
    input: 'headless gameplay profile, shared by UI and campaign',
  },
  cardClash: {
    strategy: 'ability',
    owner: 'houseOfCardsAi',
    input: 'session ability; offered tools shared with human',
  },
  hangman: {
    strategy: 'ability',
    owner: 'hangmanChallengeEngine',
    input: 'word skill before purchases/solve decisions',
  },
  tiltLabyrinth: {
    strategy: 'profile',
    owner: 'TiltLabyrinthComp.simulateTiltLabyrinthAiRun',
    input: 'physical, precision, nerve, consistency',
  },
  threeDigitsQuiz: {
    strategy: 'ability',
    owner: 'numberTriviaUtils',
    input: 'answer error propensity; no precomputed profile boost',
  },
  capitalization: {
    strategy: 'ability',
    owner: 'capitalizationUtils',
    input: 'recall error propensity; no precomputed profile boost',
  },
  minesweeps: {
    strategy: 'profile',
    owner: 'simulateMinigameAiScore / Minesweeps',
    input: 'precomputed skill score, displayed unchanged',
  },
  dontGoOver: {
    strategy: 'ability',
    owner: 'cwgoCompetitionSlice',
    input: 'knowledge used by guess and response-time models',
  },
  blackjackTournament: {
    strategy: 'decision-error',
    owner: 'blackjackTournamentSlice',
    input: 'soft-17 heuristic mistakes; card deals/AI-only symmetric league unchanged',
  },
  riskWheel: {
    strategy: 'decision-error',
    owner: 'riskWheelSlice',
    input: 'bank/spin decision noise; wheel sectors unchanged',
  },
  wildcardWestern: {
    strategy: 'decision-error',
    owner: 'wildcardWesternAi',
    input: 'duel error propensity and physical-floor reaction latency',
  },
  castleRescue: {
    strategy: 'profile',
    owner: 'simulateFindYourTwinCompetitionScore',
    input: 'effective ability selects specialist difficulty',
  },
  castleRescueRemastered: {
    strategy: 'profile',
    owner: 'simulateFindYourTwinCompetitionScore',
    input: 'same specialist as classic presentation',
  },
  castleRescue2: {
    strategy: 'profile',
    owner: 'simulateFindYourTwinCompetitionScore',
    input: 'effective ability selects specialist difficulty',
  },
  castleRescue2Remastered: {
    strategy: 'profile',
    owner: 'simulateFindYourTwinCompetitionScore',
    input: 'same specialist as classic presentation',
  },
  glass_bridge_brutal: {
    strategy: 'profile',
    owner: 'glassBridgeSlice / GlassBridgeComp',
    input: 'obvious-safe accuracy and decision delay; hidden tiles fair',
  },
  crystal_path_shattered: {
    strategy: 'profile',
    owner: 'shatteredLogic.simulateAiRun',
    input: 'normalized nerve/personality and mental/precision decision skill',
  },
  trapAuction: {
    strategy: 'decision-error',
    owner: 'trapAuctionHelpers',
    input: 'bid noise around sustainable budget, preserves risk style',
  },
  mysticChamber: {
    strategy: 'decision-error',
    owner: 'chamberGame',
    input: 'expected action value noise; random offers unchanged',
  },
  chainOfGreed: {
    strategy: 'decision-error',
    owner: 'chainOfGreedLogic',
    input: 'odds judgment bias; Solo Rush already chooses best public odds',
  },
  batteryLow: {
    strategy: 'decision-error',
    owner: 'vaultVerdictLogic',
    input: 'chaotic offer judgment noise; sealed vaults/deals unchanged',
  },
  houseOfDarkness: {
    strategy: 'ability',
    owner: 'houseOfCardsAi / HouseOfDarknessComp',
    input: 'session ability; charms and human rules unchanged',
  },
  gatesOfTheEye: {
    strategy: 'decision-error',
    owner: 'gatesOfTheEyeLogic',
    input: 'expected-value decision noise/exploration; shared collapse draw unchanged',
  },
  finalThreeCircuit: {
    strategy: 'profile',
    owner: 'simulateMinigameAiScore / finalThreeCircuitAi',
    input: 'native precomputed skill baseline',
  },
  downMemoryLane: {
    strategy: 'profile',
    owner: 'DownMemoryLane.opponentAbility',
    input: 'captured opponent profile; question bank unchanged',
  },
  ...Object.fromEntries(
    [
      'countHouse',
      'triviaPulse',
      'wordAnagram',
      'targetPractice',
      'biographyBlitz',
      'tiltedLedge',
      'rainBarrelBalance',
      'memoryZipline',
      'swipeMaze',
      'socialStrings',
      'flashFlood',
      'gridLock',
      'keyMaster',
      'tetris',
      'travelingDots',
      'laserPantryDash',
      'confettiCannon',
      'buzzerSprintRelay',
      'rescueTheKing',
      'gridOfLuck',
      'bigSpender',
    ].map((key) => [
      key,
      {
        strategy: 'retired' as const,
        owner: 'registry retired entry',
        input: 'not selected by season scheduler',
      },
    ])
  ),
}

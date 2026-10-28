export type AnalyticsGameMode = {
  game_mode: 'classic' | 'vox_populi' | 'cupid' | 'surveyeval'
  game_mode_label: 'Classic' | 'Vox Populi' | 'Cupid' | 'SurveyEval'
}

export function getAnalyticsGameMode(
  mode: string | null | undefined,
  expansionMode: string | null | undefined
): AnalyticsGameMode {
  if (mode === 'survival') return { game_mode: 'surveyeval', game_mode_label: 'SurveyEval' }
  if (expansionMode === 'voxPopuli')
    return { game_mode: 'vox_populi', game_mode_label: 'Vox Populi' }
  if (expansionMode === 'cupidArrow') return { game_mode: 'cupid', game_mode_label: 'Cupid' }
  return { game_mode: 'classic', game_mode_label: 'Classic' }
}

export function getAnalyticsGameModeForRuleset(ruleset: string): AnalyticsGameMode {
  if (ruleset === 'voxPopuli') return getAnalyticsGameMode('classic', 'voxPopuli')
  if (ruleset === 'cupidArrow') return getAnalyticsGameMode('classic', 'cupidArrow')
  if (ruleset === 'survival' || ruleset === 'surveyeval')
    return getAnalyticsGameMode('survival', null)
  return getAnalyticsGameMode('classic', null)
}

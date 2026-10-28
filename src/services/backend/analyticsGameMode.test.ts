import { describe, expect, it } from 'vitest'
import { getAnalyticsGameMode, getAnalyticsGameModeForRuleset } from './analyticsGameMode'

describe('analytics game mode labels', () => {
  it.each([
    ['classic', null, 'classic', 'Classic'],
    ['classic', 'voxPopuli', 'vox_populi', 'Vox Populi'],
    ['classic', 'cupidArrow', 'cupid', 'Cupid'],
    ['survival', null, 'surveyeval', 'SurveyEval'],
  ])('maps %s / %s to %s (%s)', (mode, expansionMode, expectedMode, expectedLabel) => {
    expect(getAnalyticsGameMode(mode, expansionMode)).toEqual({
      game_mode: expectedMode,
      game_mode_label: expectedLabel,
    })
  })

  it.each([
    ['classic', 'classic', 'Classic'],
    ['voxPopuli', 'vox_populi', 'Vox Populi'],
    ['cupidArrow', 'cupid', 'Cupid'],
    ['survival', 'surveyeval', 'SurveyEval'],
  ])('maps the selected %s ruleset to %s (%s)', (ruleset, expectedMode, expectedLabel) => {
    expect(getAnalyticsGameModeForRuleset(ruleset)).toEqual({
      game_mode: expectedMode,
      game_mode_label: expectedLabel,
    })
  })
})

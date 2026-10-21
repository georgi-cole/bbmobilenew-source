import { describe, expect, it } from 'vitest'
import { SCENARIO_VARIANT_POOLS } from '../interactionVariantBank'
import {
  getContextualIncomingChoices,
  resolveIncomingResponse,
} from '../incomingInteractionResolution'
import {
  INCOMING_ACTION_CONTENT_BANK,
  getIncomingActionPairingCount,
  pickIncomingActionOpening,
  pickIncomingActionReply,
} from '../incomingActionContentBank'
import { SCENE_DEFINITIONS } from '../incomingSceneDefinitionBank'
import { getIncomingDialogueBeat } from '../incomingDialogueOutcomeBank'
import { getRealityActionContract } from '../reality/actionContract'
import { SOCIAL_ACTIONS, resolveActionTargetMode } from '../socialActions'
import { getHumanFacingActionScenario } from '../socialAIDriver'
import { isAISocialActionVisible } from '../socialActionCatalog'
import type { IncomingInteraction } from '../types'

const targetableActions = SOCIAL_ACTIONS.filter(
  (action) =>
    action.id !== 'idle' &&
    action.id !== 'pregnancy_test' &&
    resolveActionTargetMode(action, false) !== 'none'
)

describe('AI background incoming content', () => {
  it('routes background AI actions into contextual scenario banks', () => {
    for (const actionId of [
      'proposeAlliance',
      'whisper',
      'confront',
      'ask_use_safety',
      'nominate',
      'group_chat',
    ]) {
      const scenarioKey = getHumanFacingActionScenario(actionId)
      expect(scenarioKey).not.toMatch(/^background_/)
      expect(SCENARIO_VARIANT_POOLS[scenarioKey]?.length).toBeGreaterThan(0)
    }
  })

  it('gives unknown background actions a rich check-in scene instead of generic fallback text', () => {
    expect(getHumanFacingActionScenario('unknown_action')).toBe('generic_check_in')
  })

  it('covers every inbox-routed action with 200+ static action-response pairings', () => {
    expect(Object.keys(INCOMING_ACTION_CONTENT_BANK).sort()).toEqual(
      targetableActions.map((action) => action.id).sort()
    )
    expect(targetableActions).toHaveLength(52)
    expect(getIncomingActionPairingCount()).toBe(208)

    for (const action of targetableActions) {
      const content = INCOMING_ACTION_CONTENT_BANK[action.id]
      expect(content.family, action.id).toBeTruthy()
      expect(content.openings.length, action.id).toBeGreaterThanOrEqual(2)
      expect(SCENE_DEFINITIONS[content.scenarioKey], action.id).toBeDefined()
      expect(getRealityActionContract(action.id), action.id).toBeDefined()
      for (const stance of ['positive', 'neutral', 'negative', 'dismiss'] as const) {
        expect(content.replies[stance], `${action.id}:${stance}`).toHaveLength(2)
      }

      const interaction: IncomingInteraction = {
        id: `incoming-${action.id}`,
        fromId: 'ai-player',
        type: content.interactionType,
        text: 'An action-specific conversation.',
        payload: {
          originActionId: action.id,
          scenarioKey: content.scenarioKey,
          subjectName: 'Nova',
        },
        createdAt: 1,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      }
      expect(getContextualIncomingChoices(interaction), action.id).toHaveLength(4)

      const beat = getIncomingDialogueBeat({
        actionId: action.id,
        scenarioKey: content.scenarioKey,
        responseType: content.interactionType === 'deal_offer' ? 'accept' : 'positive',
        fromName: 'Kai',
        subjectName: 'Nova',
        seed: 0,
      })
      expect(beat, action.id).toBeTruthy()

      const response = resolveIncomingResponse({
        interaction,
        responseType: content.interactionType === 'deal_offer' ? 'accept' : 'positive',
        responseLabel: getContextualIncomingChoices(interaction)?.[0]?.label,
        fromName: 'Kai',
        phase: 'social_1',
        actorAffinity: 0,
        playerAffinity: 0,
      })
      expect(response.outcomeText, action.id).toBeTruthy()
      expect(Number.isFinite(response.actorDelta), action.id).toBe(true)
    }
  })

  it('keeps AI moves inside the active social mode and season format', () => {
    expect(isAISocialActionVisible('flirt', 'normal')).toBe(false)
    expect(isAISocialActionVisible('flirt', 'drama')).toBe(true)
    expect(isAISocialActionVisible('proposeAlliance', 'normal')).toBe(false)
    expect(isAISocialActionVisible('proposeAlliance', 'drama')).toBe(true)
    expect(isAISocialActionVisible('build_quiet_bond', 'normal')).toBe(false)
    expect(isAISocialActionVisible('build_quiet_bond', 'normal', true)).toBe(true)
    expect(isAISocialActionVisible('pitch_target', 'normal', true)).toBe(false)
  })

  it('rotates openings by action sequence and avoids quoted recent reaction repeats', () => {
    const firstOpening = pickIncomingActionOpening('compliment', 1, 'Nova')
    const nextOpening = pickIncomingActionOpening('compliment', 2, 'Nova')
    expect(firstOpening?.text).not.toBe(nextOpening?.text)

    const firstReply = pickIncomingActionReply({
      actionId: 'compliment',
      stance: 'positive',
      seed: 1,
      playerName: 'Kai',
    })
    const secondReply = pickIncomingActionReply({
      actionId: 'compliment',
      stance: 'positive',
      seed: 1,
      playerName: 'Kai',
      recentLines: [`"${firstReply}"`],
    })
    expect(secondReply).not.toBe(firstReply)
  })
})

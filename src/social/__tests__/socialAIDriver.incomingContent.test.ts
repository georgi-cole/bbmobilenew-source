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
import { getCommitmentKindForInteraction } from '../socialCommitments'
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
      'group_chat',
    ]) {
      const scenarioKey = getHumanFacingActionScenario(actionId)
      expect(scenarioKey).not.toMatch(/^background_/)
      expect(SCENARIO_VARIANT_POOLS[scenarioKey]?.length).toBeGreaterThan(0)
    }
  })

  it('routes the LOH’s warning into a dedicated pre-nomination scene', () => {
    expect(getHumanFacingActionScenario('nominate')).toBe('background_nominate_human')
    expect(INCOMING_ACTION_CONTENT_BANK.nominate.interactionType).toBe('warning')
    expect(pickIncomingActionOpening('nominate', 0, 'You')?.text).toMatch(
      /on the block|nomination plan/
    )
  })

  it('gives unknown background actions a rich check-in scene instead of generic fallback text', () => {
    expect(getHumanFacingActionScenario('unknown_action')).toBe('generic_check_in')
  })

  it('covers every inbox-routed action with 200+ static action-response pairings', () => {
    expect(Object.keys(INCOMING_ACTION_CONTENT_BANK).sort()).toEqual(
      targetableActions.map((action) => action.id).sort()
    )
    expect(targetableActions).toHaveLength(53)
    expect(getIncomingActionPairingCount()).toBe(212)

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

  it('matches high-stakes background replies to the actual action', () => {
    const cases = [
      ['share_intel', 'Hear the lead in private', 'positive'],
      ['rumor', 'Compare what we’ve heard', 'positive'],
      ['plant_lie', 'Hear the plan without joining', 'neutral'],
      ['expose_secret', 'Ask what they actually know', 'neutral'],
      ['apologize', 'Accept their apology', 'positive'],
      ['repair_bond', 'Agree to try a truce', 'positive'],
      ['ask_safety_plan', 'Talk through the options', 'neutral'],
      ['ask_hold_safety', 'Promise to leave Safety unused', 'accept'],
      ['ask_loh_target', 'Discuss what I’m weighing', 'neutral'],
      ['ask_nomination_advice', 'Talk through possible nominees', 'neutral'],
      ['vote_rally', 'Ask how much support they have', 'neutral'],
    ] as const

    for (const [actionId, label, responseType] of cases) {
      const content = INCOMING_ACTION_CONTENT_BANK[actionId]
      const interaction: IncomingInteraction = {
        id: actionId,
        fromId: 'lia',
        type: content.interactionType,
        text: content.openings[0],
        payload: { originActionId: actionId, scenarioKey: content.scenarioKey },
        createdAt: 1,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      }
      expect(getContextualIncomingChoices(interaction)?.[0], actionId).toMatchObject({
        label,
        responseType,
      })
      expect(getCommitmentKindForInteraction(interaction), actionId).toBeNull()
    }
  })

  it('uses distinct choices and explicit consent for each romance action', () => {
    const menus = new Set<string>()
    for (const [actionId, content] of Object.entries(INCOMING_ACTION_CONTENT_BANK)) {
      if (content.scenarioKey !== 'relationship_romance_check_in') continue
      const choices = getContextualIncomingChoices({
        id: actionId,
        fromId: 'lia',
        type: content.interactionType,
        text: content.openings[0],
        payload: { originActionId: actionId, scenarioKey: content.scenarioKey },
        createdAt: 1,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      })
      expect(choices, actionId).toHaveLength(4)
      menus.add(choices!.map((choice) => choice.label).join('|'))
      if (['cuddle', 'kiss_under_covers', 'pool_makeout', 'spend_night'].includes(actionId)) {
        expect(choices![0]).toMatchObject({
          label: expect.stringMatching(/^Yes,/),
          responseType: 'accept',
        })
      }
      if (actionId === 'try_for_baby') {
        expect(choices![0]).toMatchObject({
          label: expect.stringMatching(/^Talk about/),
          responseType: 'neutral',
        })
      }
    }
    expect(menus.size).toBe(10)
  })

  it.each([
    ['alliance_nomination_pitch', 'decline', /mine to set|before I lock the nominations/i],
    ['alliance_safety_pitch', 'accept', /sav(?:e|ing) Kai|the choice is still mine/i],
    ['automatic_nominee_reaction', 'positive', /the power is yours/i],
  ] as const)(
    'keeps the speaker’s actual authority in %s replies',
    (scenarioKey, responseType, incorrect) => {
      for (let seed = 0; seed < 12; seed += 1) {
        const beat = getIncomingDialogueBeat({
          scenarioKey,
          responseType,
          fromName: 'Lia',
          subjectName: 'Kai',
          seed,
        })
        expect(beat).toBeTruthy()
        expect(beat).not.toMatch(incorrect)
      }
    }
  )

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

import {
  getIncomingInteractionResponsePolicy,
  getSocialRuntimeConfig,
  type IncomingInteractionResponsePolicy,
  type SocialMode,
} from './socialRuntimeConfig'
import type { IncomingInteraction, IncomingInteractionType } from './types'
import { deriveIncomingDeadline, getIncomingDeadline } from './incomingInteractionDeadline'
import { getIncomingActionContent } from './incomingActionContentBank'

export interface IncomingInteractionFactoryInput {
  id: string
  fromId: string
  type: IncomingInteractionType
  text: string
  week: number
  phase: string
  mode: SocialMode
  expiresAtWeek?: number
  createdAt?: number
  deadlinePhase?: string
  payload?: Record<string, unknown>
  responsePolicy?: IncomingInteractionResponsePolicy
}

/**
 * Upgrade an interaction authored by an older pipeline or loaded from an old
 * save. The old fields remain readable; the structured policy and ruleset
 * metadata become authoritative for new UI and resolution code.
 */
export function normalizeIncomingInteractionContract(
  saved: IncomingInteraction,
  fallbackMode: SocialMode = 'normal'
): IncomingInteraction {
  const isPendingBackground = !saved.resolved && saved.payload?.source === 'background_social'
  const action = saved.payload?.originActionId
  const scenario = saved.payload?.scenarioKey
  const content =
    isPendingBackground && typeof action === 'string' ? getIncomingActionContent(action) : undefined
  // Only the old direct background routes omitted a faction. Keep any real
  // alliance card on its original rules, even if it has an origin action.
  const directScenario =
    content?.legacyScenarioKey &&
    content.legacyScenarioKey === scenario &&
    typeof saved.payload?.allianceId !== 'string' &&
    saved.payload?.allianceGroupHuddle !== true
      ? content.scenarioKey
      : undefined
  const isLegacyNominationWarning =
    isPendingBackground && action === 'nominate' && scenario === 'nomination_aftershock'
  const safetyScenario =
    isPendingBackground && scenario === 'hoh_safety_request'
      ? action === 'ask_safety_plan'
        ? 'safety_plan_inquiry'
        : action === 'ask_hold_safety'
          ? 'safety_hold_request'
          : undefined
      : undefined
  const interaction: IncomingInteraction = isLegacyNominationWarning
    ? {
        ...saved,
        type: 'warning',
        payload: {
          ...saved.payload,
          scenarioKey: 'background_nominate_human',
          responsePolicy: 'optional',
        },
      }
    : safetyScenario
      ? {
          ...saved,
          deadline: undefined,
          payload: { ...saved.payload, scenarioKey: safetyScenario },
        }
      : directScenario
        ? { ...saved, payload: { ...saved.payload, scenarioKey: directScenario } }
        : saved
  const runtime = getSocialRuntimeConfig()
  const authoredMode = interaction.payload?.modeAtCreation
  const mode: SocialMode =
    authoredMode === 'normal' || authoredMode === 'drama'
      ? authoredMode
      : interaction.payload?.dramaMode === true
        ? 'drama'
        : fallbackMode
  const responsePolicy = getIncomingInteractionResponsePolicy(interaction)
  const isLegacyClock = interaction.createdDay === undefined && interaction.deadline === undefined
  const fallbackDeadline = getIncomingDeadline({
    ...interaction,
    // Repair saves where the factory shortened the legacy field after setting the deadline.
    deadline:
      responsePolicy === 'readOnly' && (interaction.deadline?.day ?? 0) > interaction.expiresAtWeek
        ? undefined
        : interaction.deadline,
  })
  const deadline =
    isLegacyClock || responsePolicy === 'readOnly'
      ? fallbackDeadline
      : (interaction.deadline ??
        deriveIncomingDeadline({
          day: interaction.createdDay ?? interaction.createdWeek,
          phase:
            interaction.createdPhase ??
            (typeof interaction.payload?.phase === 'string'
              ? interaction.payload.phase
              : 'social_1'),
          type: interaction.type,
          payload: interaction.payload,
          required: responsePolicy === 'required',
        }) ??
        fallbackDeadline)

  return {
    ...interaction,
    createdDay: interaction.createdDay ?? interaction.createdWeek,
    createdPhase:
      interaction.createdPhase ??
      (typeof interaction.payload?.phase === 'string' ? interaction.payload.phase : 'social_1'),
    deadline: getIncomingDeadline({ ...interaction, deadline }),
    payload: {
      ...interaction.payload,
      modeAtCreation: mode,
      dramaMode: mode === 'drama',
      responsePolicy,
      rulesetVersion:
        typeof interaction.payload?.rulesetVersion === 'number'
          ? interaction.payload.rulesetVersion
          : runtime.schemaVersion,
      scenarioVersion:
        typeof interaction.payload?.scenarioVersion === 'string'
          ? interaction.payload.scenarioVersion
          : runtime.revision,
    },
    requiresResponse: responsePolicy === 'required',
  }
}

/**
 * Canonical constructor for both autonomy and background-social messages. It
 * keeps backward-compatible fields while recording the authored ruleset and
 * policy needed for deterministic response and expiry handling.
 */
export function createIncomingInteraction(
  input: IncomingInteractionFactoryInput
): IncomingInteraction {
  const stableTimestamp =
    input.week * 1_000_000 +
    (Math.abs(
      [...input.id].reduce(
        (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0,
        0
      )
    ) %
      1_000_000)
  const draft: IncomingInteraction = {
    id: input.id,
    fromId: input.fromId,
    type: input.type,
    text: input.text,
    payload: {
      ...input.payload,
      phase: input.phase,
      ...(input.deadlinePhase ? { deadlinePhase: input.deadlinePhase } : {}),
      ...(input.responsePolicy ? { responsePolicy: input.responsePolicy } : {}),
    },
    createdAt: input.createdAt ?? stableTimestamp,
    createdWeek: input.week,
    expiresAtWeek:
      input.expiresAtWeek ??
      (getIncomingInteractionResponsePolicy({
        type: input.type,
        requiresResponse: false,
        payload: {
          ...input.payload,
          responsePolicy: input.responsePolicy ?? input.payload?.responsePolicy,
        },
      }) === 'readOnly'
        ? input.week
        : input.week + 1),
    createdDay: input.week,
    createdPhase: input.phase,
    read: false,
    requiresResponse: false,
    resolved: false,
  }

  return normalizeIncomingInteractionContract(draft, input.mode)
}

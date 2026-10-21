import type { SocialActionDefinition } from './socialActions'
import { SOCIAL_ACTIONS } from './socialActions'
import type { SocialMode } from './socialRuntimeConfig'

const SOCIAL_ACTIONS_BY_ID = new Map(SOCIAL_ACTIONS.map((action) => [action.id, action]))

export function isHumanSocialActionVisible(
  action: SocialActionDefinition,
  mode: SocialMode
): boolean {
  if (action.aiOnly) return false
  return !action.dramaOnly || mode === 'drama'
}

export function isAISocialActionVisible(
  actionId: string,
  mode: SocialMode,
  voxPopuliActive = false
): boolean {
  const action = SOCIAL_ACTIONS_BY_ID.get(actionId)
  if (!action) return true
  if (action.dramaOnly && mode !== 'drama') return false
  if (action.realityExclusive && mode !== 'drama') return false
  if (action.voxOnly && !voxPopuliActive) return false
  if (action.unavailableInVox && voxPopuliActive) return false
  return true
}

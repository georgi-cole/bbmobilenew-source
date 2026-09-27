import { audienceMetricLabels, getAudienceBreakdown } from '../../publicOpinion/audienceBreakdown'
import type {
  AudienceMetric,
  PlayerPublicProfile,
  PublicFeedEntry,
} from '../../publicOpinion/types'

export const DISLIKED_MAX_APPROVAL = 39
export const AUDIENCE_INSIGHT_PROMPT_DESCRIPTION =
  'Watch a short ad to hear one real signal from the audience model about what is helping or hurting your public image. Your approval will not be changed.'

export function shouldShowAudienceInsightPrompt(
  userApproval: number,
  lastPromptDate: string | null,
  todayIsoDate: string
): boolean {
  return userApproval <= DISLIKED_MAX_APPROVAL && lastPromptDate !== todayIsoDate
}

interface AudienceInsightInput {
  profile: PlayerPublicProfile
  feed: readonly PublicFeedEntry[]
  playerId: string
  playerNames?: Readonly<Record<string, string>>
  random?: () => number
}

interface InsightCandidate {
  text: string
  sourceKey: string
}

function targetName(
  attributedToId: string | undefined,
  playerNames: Readonly<Record<string, string>>
): string | null {
  if (!attributedToId) return null
  return playerNames[attributedToId]?.trim() || null
}

function explainReason(
  reason: string,
  eventType: string | undefined,
  delta: number,
  metric: AudienceMetric | undefined,
  attributedTo: string | null
): string {
  const signal = `${reason} ${eventType ?? ''}`.toLowerCase()
  const target = attributedTo ? ` ${attributedTo}` : ''

  if (/fan_favorite_backlash/.test(signal)) {
    return attributedTo
      ? `Going after ${attributedTo} is costing you support because viewers already like them.`
      : 'Going after a well-liked housemate is costing you support.'
  }
  if (/fan_favorite_sympathy/.test(signal)) {
    return attributedTo
      ? `Being targeted by ${attributedTo} is creating sympathy for you.`
      : 'Being targeted by a popular housemate is creating sympathy for you.'
  }
  if (/(underdog|repeated_targeting|repeat_block|block_survival)/.test(signal)) {
    return 'Repeated pressure and survival are starting to frame you as an underdog.'
  }
  if (/pile_on_backlash/.test(signal)) {
    return attributedTo
      ? `Viewers think the pressure on ${attributedTo} is starting to look like a pile-on.`
      : 'Viewers think the repeated pressure is starting to look like a pile-on.'
  }
  if (/romance/.test(signal)) {
    return attributedTo
      ? `Your visible chemistry with ${attributedTo} is helping your story with the audience.`
      : 'Your visible romantic storyline is helping your audience connection.'
  }
  if (/(bromance|ride_or_die)/.test(signal)) {
    return attributedTo
      ? `Your bond with ${attributedTo} is reading as a genuine ride-or-die relationship.`
      : 'A visible loyal friendship is strengthening your audience connection.'
  }
  if (/(drama_value|villain_callout)/.test(signal)) {
    return 'The audience is enjoying your conflict because it still feels entertaining rather than excessive.'
  }
  if (/(betray|break_alliance|promise)/.test(signal)) {
    return 'Broken trust is the clearest drag on your integrity with the audience right now.'
  }
  if (/(social_warmth|positive_social|formed_alliance|repair|apolog)/.test(signal)) {
    return 'Warm, constructive social moments are helping you look more relatable.'
  }
  if (/(social_misfire|negative_social|poor_social|rumor|confront|conflict)/.test(signal)) {
    return 'Recent social conflict is making you look harsher than the audience currently wants.'
  }
  if (
    /(strong_competition|hoh_win|loh_win|pov_win|pos_win|immunity_win|won_competition)/.test(signal)
  ) {
    return 'Strong competition results are improving the audience view of your game.'
  }
  if (/(weak_competition|last_place|quit_early)/.test(signal)) {
    return 'Competition performance is one of the reasons the audience is questioning your game.'
  }
  if (/(nomination_backlash|nominated_target|voted_to_evict|bold_move)/.test(signal)) {
    return attributedTo
      ? `Your strategic move against${target} is drawing more scrutiny than support.`
      : 'Your recent strategic aggression is drawing more scrutiny than support.'
  }
  if (/(public_save|pov_save|saved_from_block|safety_survival)/.test(signal)) {
    return 'Surviving danger and receiving protection are making viewers reconsider your position.'
  }
  if (/direction_completed/.test(signal)) {
    return 'Following through on an audience request helped the public feel heard.'
  }
  if (/(direction_failed|direction_counter)/.test(signal)) {
    return 'Missing or pushing against an audience request is still weighing on your public image.'
  }

  const label = metric ? audienceMetricLabels[metric] : 'Audience perception'
  return delta < 0
    ? `${label} is the clearest area hurting you in the latest audience reactions.`
    : `${label} is one of the few areas currently helping your audience story.`
}

function fallbackInsight(profile: PlayerPublicProfile): string {
  const breakdown = getAudienceBreakdown(profile)
  const metrics: AudienceMetric[] = ['charisma', 'gameplay', 'integrity']
  const weakest = metrics.reduce((current, metric) =>
    breakdown[metric] < breakdown[current] ? metric : current
  )
  if (weakest === 'charisma') {
    return 'Focus groups are questioning your warmth and relatability more than your strategic game.'
  }
  if (weakest === 'gameplay') {
    return 'Focus groups understand your personality better than your game; they want a clearer competitive or strategic story.'
  }
  return 'Focus groups are most uncertain about trust and loyalty; your word needs to feel more dependable.'
}

/**
 * Builds one qualitative audience insight from real Public Mode receipts.
 * Selection is intentionally varied when several valid signals exist, but every
 * candidate is grounded in the player's actual audience history.
 */
export function buildAudienceInsight(input: AudienceInsightInput): string {
  const playerNames = input.playerNames ?? {}
  const random = input.random ?? Math.random
  const candidates: InsightCandidate[] = []
  const seen = new Set<string>()

  const recentFeed = input.feed.filter((entry) => entry.playerId === input.playerId).slice(0, 8)
  for (const entry of recentFeed) {
    const key = `feed:${entry.reason ?? entry.eventType ?? entry.id}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      sourceKey: key,
      text: explainReason(
        entry.reason ?? entry.eventType ?? 'audience_reaction',
        entry.eventType,
        entry.delta,
        undefined,
        targetName(entry.attributedToId, playerNames)
      ),
    })
  }

  for (const change of input.profile.audienceBreakdown?.recentChanges.slice(0, 8) ?? []) {
    const key = `change:${change.reason}:${change.metric}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      sourceKey: key,
      text: explainReason(change.reason, undefined, change.delta, change.metric, null),
    })
  }

  if (candidates.length === 0) return fallbackInsight(input.profile)

  const index = Math.min(
    candidates.length - 1,
    Math.max(0, Math.floor(random() * candidates.length))
  )
  return candidates[index].text
}

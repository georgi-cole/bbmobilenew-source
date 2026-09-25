import type { AdPlacement } from './adsService'

export interface AutomaticAdContext {
  gameId?: string | null
  week: number
  previousPhase: string
  currentPhase: string
  mode: string
  voxPopuliActive: boolean
  posHolderName?: string | null
}

export interface AutomaticAdBreak {
  placement: AdPlacement
  breakKey: string
  subtitle: string
}

function breakKey(context: AutomaticAdContext, placement: AdPlacement): string {
  const seasonKey = context.gameId?.trim() || 'season'
  return `${seasonKey}:${context.week}:${context.currentPhase}:${placement}`
}

/**
 * Central automatic-interstitial cadence for Advertising V2.
 *
 * - One pre-vote break on each normal house-vote day.
 * - One pre-Safety break on every second applicable day.
 * - Three deliberate Final 3 breaks, one between each decisive beat.
 * - No post-eviction or finale-recap interstitials.
 */
export function getAutomaticAdBreak(context: AutomaticAdContext): AutomaticAdBreak | null {
  if (context.currentPhase === context.previousPhase) return null

  if (
    context.currentPhase === 'live_vote' &&
    context.mode !== 'survival' &&
    !context.voxPopuliActive
  ) {
    const placement: AdPlacement = 'live_vote_auto'
    return {
      placement,
      breakKey: breakKey(context, placement),
      subtitle: 'The house is about to vote. The result unfolds right after this short break.',
    }
  }

  if (
    context.currentPhase === 'pos_ceremony_results' &&
    context.mode !== 'survival' &&
    context.week % 2 === 0
  ) {
    const placement: AdPlacement = 'safety_decision_auto'
    const holder = context.posHolderName?.trim() || 'the Power of Safety holder'
    return {
      placement,
      breakKey: breakKey(context, placement),
      subtitle: `Will ${holder} use the Power of Safety? Find out right after this short break.`,
    }
  }

  if (context.currentPhase === 'final3_comp2' && context.mode !== 'survival') {
    const placement: AdPlacement = 'final3_part1_break'
    return {
      placement,
      breakKey: breakKey(context, placement),
      subtitle:
        'Part 1 is complete. Part 2 of the Final Power Battle begins right after this short break.',
    }
  }

  if (context.currentPhase === 'final3_comp3' && context.mode !== 'survival') {
    const placement: AdPlacement = 'final3_part2_break'
    return {
      placement,
      breakKey: breakKey(context, placement),
      subtitle:
        'Part 2 is complete. The final battle begins right after this short break.',
    }
  }

  if (context.currentPhase === 'final3_decision' && context.mode !== 'survival') {
    const placement: AdPlacement = 'final3_part3_break'
    return {
      placement,
      breakKey: breakKey(context, placement),
      subtitle:
        'The Final Power Battle is over. The last decision follows right after this short break.',
    }
  }

  return null
}

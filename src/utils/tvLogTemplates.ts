/**
 * tvLogTemplates — utilities for TV log message display and event creation.
 *
 * Provides:
 *   - normalizeGameCopy(text) — updates legacy BB terminology for display
 *   - tease(text, maxLen?)    — truncates normalized text with an ellipsis
 *   - getTemplate(type)       — returns teaser/full template strings
 */

import type { TvEvent } from '../types'
import TEMPLATES from '../data/tv-log-templates.json'
import { normalizePlayerFacingCopy } from './playerFacingCopy'

export interface TvLogTemplate {
  teaser: string
  full: string
}

/**
 * Normalize legacy competition terminology at display time. This intentionally
 * does not mutate saved events, so old runs also pick up the corrected copy.
 */
export function normalizeGameCopy(text: string): string {
  return normalizePlayerFacingCopy(text)
}

/** Truncate `text` to at most `maxLen` characters, appending '…' if cut. */
export function tease(text: string, maxLen = 60): string {
  const normalized = normalizeGameCopy(text)
  if (normalized.length <= maxLen) return normalized
  return normalized.slice(0, maxLen).trimEnd() + '…'
}

/**
 * Return the teaser/full template strings for the given event type.
 * Use these templates when constructing the `text` field of a new TvEvent.
 */
export function getTemplate(type: TvEvent['type']): TvLogTemplate {
  return (TEMPLATES as Record<string, TvLogTemplate>)[type] ?? TEMPLATES['game']
}

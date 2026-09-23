import type { Middleware, MiddlewareAPI } from '@reduxjs/toolkit'
import { resolveLanguagePreference, translate } from '../i18n'
import { applyDramaAction, recordRealityAllianceBetrayal, updateRelationship } from './socialSlice'
import { getEffectiveSocialMode } from './socialMode'
import type { RelationshipsMap } from './types'

interface IntegrityPlayer {
  id: string
  name?: string
  status: string
}

export interface NominationBetrayalState {
  game: {
    week: number
    phase: string
    lohId: string | null
    nomineeIds: string[]
    players: IntegrityPlayer[]
    dramaSocialMode?: boolean
    voxPopuli?: { status?: string } | null
  }
  social: {
    relationships?: RelationshipsMap
  }
  settings?: {
    localization?: {
      language?: unknown
    }
    gameUX?: {
      dramaMode?: boolean
      dramaModeAdminOverride?: boolean
    }
  }
  vip?: {
    isActive?: boolean
    entitlements?: { dramaMode?: boolean }
  }
}

const POSITIVE_BOND_TAGS = new Set([
  'alliance',
  'primary_alliance',
  'ride_or_die',
  'romance',
  'bromance',
])
const PUBLIC_HOUSE_EVENT = /^HOUSE\s+(?:SHOCK|EXPOSED)\s*:/i

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function eventReferencesInactivePlayer(
  players: readonly IntegrityPlayer[],
  text: string
): boolean {
  return players.some((player) => {
    if (player.status !== 'evicted' && player.status !== 'jury') return false
    const name = player.name?.trim()
    if (!name) return false
    return new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text)
  })
}

export function getBrokenBondTags(tags: readonly string[]): string[] {
  const tagSet = new Set(tags)
  const romance = tagSet.has('romance')
  const alliance = tagSet.has('alliance') || tagSet.has('bromance')
  return [
    'betrayal',
    ...(romance ? ['ex', 'broken_romance'] : []),
    ...(alliance ? ['broken_alliance'] : []),
  ]
}

function combinedTags(
  relationships: RelationshipsMap | undefined,
  leftId: string,
  rightId: string
): string[] {
  return [
    ...(relationships?.[leftId]?.[rightId]?.tags ?? []),
    ...(relationships?.[rightId]?.[leftId]?.tags ?? []),
  ]
}

/**
 * Apply the same durable betrayal across initial and replacement nominations.
 * The Reality record supplies the large trust, loyalty, reliability, and
 * commitment rupture; legacy affinity/tags keep older screens in agreement.
 */
export function applyNominationBetrayalConsequences(
  api: Pick<MiddlewareAPI, 'dispatch'>,
  before: NominationBetrayalState,
  after: NominationBetrayalState,
  nomineeIds: readonly string[],
  source: 'initial' | 'replacement'
): void {
  if (
    getEffectiveSocialMode(after) !== 'drama' ||
    after.game.voxPopuli?.status === 'active' ||
    !after.game.lohId
  ) {
    return
  }

  const lohId = after.game.lohId
  for (const nomineeId of nomineeIds) {
    const tags = combinedTags(before.social.relationships, lohId, nomineeId)
    if (!tags.some((tag) => POSITIVE_BOND_TAGS.has(tag)) || tags.includes('betrayal')) continue

    const lohName = after.game.players.find((player) => player.id === lohId)?.name ?? lohId
    const nomineeName =
      after.game.players.find((player) => player.id === nomineeId)?.name ?? nomineeId
    const ruptureTags = getBrokenBondTags(tags)
    const coreBond = tags.some((tag) =>
      ['primary_alliance', 'ride_or_die', 'romance'].includes(tag)
    )
    const outwardAffinity = before.social.relationships?.[lohId]?.[nomineeId]?.affinity ?? 0
    const inwardAffinity = before.social.relationships?.[nomineeId]?.[lohId]?.affinity ?? 0
    const baseOutward = coreBond ? 82 : 62
    const baseInward = coreBond ? 94 : 72

    api.dispatch(
      updateRelationship({
        source: lohId,
        target: nomineeId,
        delta: Math.min(-baseOutward, -baseOutward - Math.max(0, outwardAffinity) * 0.35),
        tags: ruptureTags,
        actionSource: 'system',
        skipRealityProjection: true,
      })
    )
    api.dispatch(
      updateRelationship({
        source: nomineeId,
        target: lohId,
        delta: Math.min(-baseInward, -baseInward - Math.max(0, inwardAffinity) * 0.4),
        tags: ruptureTags,
        actionSource: 'system',
        skipRealityProjection: true,
      })
    )
    api.dispatch(
      applyDramaAction({
        actionId: 'betray',
        actorId: lohId,
        targetId: nomineeId,
        actorName: lohName,
        targetName: nomineeName,
        week: after.game.week,
        phase: after.game.phase,
        success: true,
      })
    )
    api.dispatch(
      recordRealityAllianceBetrayal({
        actorId: lohId,
        targetId: nomineeId,
        kind: 'NOMINATION',
        day: after.game.week,
        phase: after.game.phase,
        sourceEventId: `${source}-nomination:${after.game.week}:${lohId}:${nomineeId}`,
      })
    )
    api.dispatch({
      type: 'game/addTvEvent',
      payload: {
        text: translate(
          resolveLanguagePreference(after.settings?.localization?.language),
          'social.event.bondBetrayal',
          { lohName, nomineeName }
        ),
        type: 'social',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: { dramaEvent: true, week: after.game.week, bondBetrayal: true, source },
      },
    })
  }
}

/**
 * Guards two cross-cutting Reality invariants:
 *
 * 1. A fresh public house shock may not be generated about somebody who has
 *    already left the active game.
 * 2. When an LOH puts a current romance/ally on the block as a replacement,
 *    the game records a severe, explicit betrayal instead of silently keeping
 *    the old positive bond alive.
 */
export const realityIntegrityMiddleware: Middleware = (api) => (next) => (action) => {
  const before = api.getState() as NominationBetrayalState
  const typedAction = action as {
    type?: string
    payload?: {
      text?: string
      type?: string
      meta?: Record<string, unknown>
    }
  }

  if (typedAction.type === 'game/addTvEvent') {
    const text = typedAction.payload?.text
    const isHouseEvent =
      typeof text === 'string' &&
      (PUBLIC_HOUSE_EVENT.test(text) || typedAction.payload?.meta?.dramaEvent === true)
    if (
      isHouseEvent &&
      typeof text === 'string' &&
      eventReferencesInactivePlayer(before.game.players, text)
    ) {
      return action
    }
  }

  const nomineesBefore = [...(before.game.nomineeIds ?? [])]
  const result = next(action)

  if (!typedAction.type?.startsWith('game/')) return result

  const after = api.getState() as NominationBetrayalState
  if (
    getEffectiveSocialMode(after) !== 'drama' ||
    after.game.voxPopuli?.status === 'active' ||
    after.game.phase !== 'pos_ceremony_results' ||
    !after.game.lohId
  ) {
    return result
  }

  const newlyAddedNominees = after.game.nomineeIds.filter(
    (playerId) => !nomineesBefore.includes(playerId)
  )
  if (newlyAddedNominees.length === 0) return result

  applyNominationBetrayalConsequences(api, before, after, newlyAddedNominees, 'replacement')

  return result
}

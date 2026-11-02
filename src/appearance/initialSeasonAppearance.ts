import type { GameState } from '../types'
import type { StoredProfile } from '../store/profilesSlice'
import type { SavedSeasonSnapshot } from '../store/saveStatePersistence'
import { isEmoji, joinPublicAssetPath } from '../utils/avatar'
import {
  coerceAppearanceSelection,
  getAppearanceAsset,
  getAppearanceLook,
  type AppearanceSelection,
} from './catalog'
import { contestantFromPlayer } from './seasonContestant'

function isPlaceholderAvatar(avatar: string): boolean {
  return (
    !avatar ||
    isEmoji(avatar) ||
    /(?:^|\/)assets\/(?:skins\/You\.png|silhouette_(?:male|female)(?: |%20)-(?: |%20)Copy\.webp)(?:[?#].*)?$/i.test(
      avatar
    )
  )
}

/** A chosen contestant is immutable; only the unselected guest silhouette is eligible. */
export function canFillInitialSeasonAppearance(game: GameState): boolean {
  const human = game.players.find((player) => player.isUser)
  const contestant = game.seasonContestant
  return Boolean(
    human &&
    human.appearance?.kind !== 'catalog' &&
    isPlaceholderAvatar(human.avatar) &&
    !contestant?.presetId &&
    !contestant?.presetRevision &&
    !contestant?.photoId &&
    contestant?.appearanceSelection?.kind !== 'catalog' &&
    (!contestant || isPlaceholderAvatar(contestant.avatar))
  )
}

/** Fill visual identity once without rebuilding the player or any gameplay state. */
export function withInitialSeasonAppearance(
  game: GameState,
  appearance: AppearanceSelection | undefined
): GameState {
  const selection = coerceAppearanceSelection(appearance)
  if (
    selection.kind !== 'catalog' ||
    !getAppearanceLook(selection.lookId, selection.revision)?.selectable ||
    !canFillInitialSeasonAppearance(game)
  )
    return game

  const human = game.players.find((player) => player.isUser)!
  const avatar = joinPublicAssetPath(getAppearanceAsset(selection, 'main')!)
  return {
    ...game,
    players: game.players.map((player) =>
      player === human ? { ...player, avatar, appearance: { ...selection } } : player
    ),
    seasonContestant: {
      ...(game.seasonContestant ?? contestantFromPlayer(human)),
      avatar,
      appearanceSelection: { ...selection },
    },
  }
}

/** Older adopted saves may still contain a silhouette; never borrow another owner's look. */
export function gameWithInitialProfileAppearance(
  snapshot: Pick<SavedSeasonSnapshot, 'game' | 'profileId'>,
  profile: StoredProfile | null | undefined
): GameState {
  if (!profile || profile.id !== snapshot.profileId) return snapshot.game
  return withInitialSeasonAppearance(
    snapshot.game,
    profile.initialAppearanceSelection ?? profile.appearanceSelection
  )
}

import type { Player } from '../types'

export const TWIN_SHOCK_COMBINED_ART_ID: 'lia-ali'

export function isCombinedTwinAvatar(source: string | null | undefined): boolean

export function isCombinedTwinIdentity(
  player:
    | (Pick<Player, 'id' | 'name'> & Partial<Pick<Player, 'avatar' | 'twinMode' | 'isUser'>>)
    | null
    | undefined
): boolean

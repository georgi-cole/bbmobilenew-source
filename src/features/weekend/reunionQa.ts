import type { RootState } from '../../store/store'

export interface ReunionQaCheck {
  name: string
  passed: boolean
  detail: string
}

function samePlayerStatuses(
  current: RootState['game']['players'],
  original: RootState['game']['players']
): boolean {
  if (current.length !== original.length) return false
  const originalById = new Map(original.map((player) => [player.id, player.status]))
  return current.every(
    (player) => originalById.has(player.id) && originalById.get(player.id) === player.status
  )
}

/** Check the temporary reunion preview without changing the current campaign. */
export function runFinaleReunionQa(state: RootState): ReunionQaCheck[] {
  const game = state.game
  const weekend = game.weekendInterlude
  const snapshot = state.weekendDebugPreview.snapshot
  const preview = weekend?.reunionPreview
  const playerIds = new Set(game.players.map((player) => player.id))
  const guestIds = preview?.guestIds ?? []
  const finalistIds = preview?.finalistIds ?? []
  const roleIds = [...guestIds, ...finalistIds]
  const expectedRoleIds = game.players
    .map((player) => player.id)
    .sort()
    .join('|')
  const actualRoleIds = [...roleIds].sort().join('|')

  return [
    {
      name: 'Sunday reunion preview is active',
      passed: Boolean(
        weekend?.active &&
        weekend.debug &&
        weekend.finaleWeekend &&
        weekend.weekendDay === 2 &&
        weekend.stage === 'finale_reunion'
      ),
      detail: 'The reunion must be the active second day of a finale weekend preview.',
    },
    {
      name: 'Every roster identity is assigned once',
      passed:
        Boolean(preview) &&
        new Set(roleIds).size === roleIds.length &&
        actualRoleIds === expectedRoleIds &&
        roleIds.every((playerId) => playerIds.has(playerId)),
      detail: 'Each saved player appears once as a finalist or a returning visitor.',
    },
    {
      name: 'At least one returning visitor is shown',
      passed: guestIds.length > 0,
      detail: `${guestIds.length} visitor portraits are prepared for this preview.`,
    },
    {
      name: 'Player statuses and roster are unchanged',
      passed: Boolean(snapshot && samePlayerStatuses(game.players, snapshot.game.players)),
      detail: 'The preview must not reactivate, eliminate, or replace any player.',
    },
    {
      name: 'Season day is unchanged',
      passed: Boolean(snapshot && game.week === snapshot.game.week),
      detail: 'The reunion is an interlude and must not advance the numbered season day.',
    },
    {
      name: 'Social and public-opinion state are unchanged',
      passed: Boolean(
        snapshot &&
        state.social === snapshot.social &&
        state.publicOpinion === snapshot.publicOpinion
      ),
      detail: 'Previewing the reunion must not create relationships, secrets, or public effects.',
    },
  ]
}

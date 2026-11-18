import type { Player } from '../../types'

export function finalePortraitAttire(
  player: Player,
  scene: 'tribunal' | 'finalist' = 'finalist'
): 'formal' | 'informal' {
  const identity = `${player.id} ${player.name}`.trim().toLowerCase()
  if (/(^|\s)bea(\s|$)/.test(identity)) return 'informal'
  if (scene === 'tribunal' && /(^|\s)(dex|sol)(\s|$)/.test(identity)) return 'informal'
  return 'formal'
}

import { useState } from 'react'
import type { Player } from '../../types'
import assets from '../../data/tribunalStageAssets.json'
import {
  getProfilePhotoAvatarId,
  joinPublicAssetPath,
  resolveInformalCutout,
} from '../../utils/avatar'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'

/** A single placement contract: visible head-to-foot bounds, feet at bottom center. */
export default function TribunalStageFigure({
  player,
  placement,
  onSettled,
}: {
  player: Player
  placement: 'player' | 'left' | 'right'
  onSettled: (id: string) => void
}) {
  const [failed, setFailed] = useState(false)
  const original = resolveInformalCutout(player)
  const key = original ? decodeURIComponent(original.slice(original.indexOf('assets/'))) : ''
  const asset = (assets as Record<string, { file: string; width: number; height: number }>)[key]
  const cutout = asset && !getProfilePhotoAvatarId(player.avatar) && !failed

  return (
    <figure
      className={`tdc-person tdc-person--${placement}`}
      data-player-id={player.id}
      data-presentation={cutout ? 'cutout' : 'portrait'}
    >
      <div className="tdc-person__visual">
        {cutout ? (
          <img
            src={joinPublicAssetPath(asset.file)}
            alt={player.name}
            width={asset.width}
            height={asset.height}
            draggable={false}
            onLoad={() => onSettled(player.id)}
            onError={() => {
              setFailed(true)
              onSettled(player.id)
            }}
          />
        ) : (
          <div className="tdc-person__portrait" onLoadCapture={() => onSettled(player.id)}>
            <PlayerAvatar
              player={player}
              showRelationshipOutline={false}
              showEvictedStyle={false}
            />
          </div>
        )}
      </div>
    </figure>
  )
}

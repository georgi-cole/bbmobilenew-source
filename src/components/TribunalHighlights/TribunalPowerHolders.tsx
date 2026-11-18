import { useCallback, useMemo, useRef, useState } from 'react'
import type { Player } from '../../types'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import { statusBadgeImageSrc } from '../../utils/statusBadges'
import TribunalCeremonyExcerpt, { TRIBUNAL_POWERS_MS } from './TribunalCeremonyExcerpt'

function PowerHolder({
  player,
  loh,
  safety,
  onReady,
}: {
  player: Player
  loh: boolean
  safety: boolean
  onReady: (id: string, available: boolean) => void
}) {
  const actors = useMemo(() => [player], [player])
  const [available, setAvailable] = useState<boolean | null>(null)
  const ready = useCallback(
    (value: boolean) => {
      setAvailable(value)
      onReady(player.id, value)
    },
    [onReady, player.id]
  )
  const role = loh && safety ? 'LOH + POS' : loh ? 'LOH' : 'POWER OF SAFETY'
  return (
    <div
      className="tribunal-recap__power-holder"
      role="group"
      aria-label={`${player.name}: ${role}`}
    >
      {available === false && (
        <FullSizeCutoutImage
          player={player}
          attire="informal"
          alt={player.name}
          className="tribunal-recap__power-fallback"
        />
      )}
      <TribunalCeremonyExcerpt
        scene={loh ? 'loh' : 'safety'}
        players={actors}
        onReady={ready}
        paired
        durationMs={TRIBUNAL_POWERS_MS}
      />
      <div className="tribunal-recap__power-label">
        <strong>{player.name}</strong>
        <span>
          {loh && <img src={statusBadgeImageSrc('loh')} alt="" aria-hidden="true" />}
          {role}
          {safety && <img src={statusBadgeImageSrc('pos')} alt="" aria-hidden="true" />}
        </span>
      </div>
    </div>
  )
}

export default function TribunalPowerHolders({
  players,
  lohId,
  posWinnerId,
  onReady,
}: {
  players: Player[]
  lohId: string | null
  posWinnerId: string | null
  onReady: (available: boolean) => void
}) {
  const settled = useRef(new Map<string, boolean>())
  const reported = useRef(false)
  const ready = useCallback(
    (id: string, available: boolean) => {
      settled.current.set(id, available)
      if (!reported.current && settled.current.size === players.length) {
        reported.current = true
        onReady([...settled.current.values()].some(Boolean))
      }
    },
    [onReady, players.length]
  )
  return (
    <div className="tribunal-recap__power-holders" data-testid="tribunal-power-holders">
      {players.map((player) => (
        <PowerHolder
          key={player.id}
          player={player}
          loh={player.id === lohId}
          safety={player.id === posWinnerId}
          onReady={ready}
        />
      ))}
    </div>
  )
}

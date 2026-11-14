import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { getEffectiveSocialMode } from '../../social/socialMode'
import { allianceKind, isCurrentAlliance } from '../../social/reality/allianceIdentity'
import { executeHumanRealityAction } from '../../social/reality/humanFlow'
import { getRuntimeSocialActionById } from '../../social/socialActionManager'
import { normalizeActionCosts } from '../../social/smExecNormalize'

/** Keep the required choice open while the LOH pays for a normal alliance huddle. */
export default function ConfessionalAllianceConsultation() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const reality = useAppSelector((state) => state.social.reality)
  const energy = useAppSelector((state) => state.social.energyBank)
  const enabled = useAppSelector((state) => getEffectiveSocialMode(state) === 'drama')
  const [reply, setReply] = useState('')
  const action = getRuntimeSocialActionById('consult_alliance')
  const energyCost = action ? normalizeActionCosts(action, 1, true).energy : 0
  const human = game.players.find((player) => player.isUser)
  const alliances = Object.values(reality.alliances).filter(
    (alliance) =>
      isCurrentAlliance(alliance) &&
      allianceKind(alliance) === 'GROUP' &&
      human &&
      alliance.memberIds.includes(human.id) &&
      alliance.memberIds.some(
        (id) =>
          id !== human.id &&
          game.players.some(
            (player) => player.id === id && player.status !== 'evicted' && player.status !== 'jury'
          )
      )
  )
  if (!enabled || !human || !alliances.length || !action) return null
  return (
    <section className="rcd-alliance-consultation" aria-label="Alliance consultation">
      <p>You can consult your alliance before naming the backup nominee.</p>
      {alliances.map((alliance) => (
        <button
          key={alliance.id}
          type="button"
          className="rcd-read-trigger"
          disabled={(energy[human.id] ?? 0) < energyCost}
          onClick={() => {
            const advisor = alliance.memberIds.find(
              (id) =>
                id !== human.id &&
                game.players.some(
                  (player) =>
                    player.id === id && player.status !== 'evicted' && player.status !== 'jury'
                )
            )!
            const result = dispatch(
              executeHumanRealityAction({
                actorId: human.id,
                targetId: advisor,
                actionId: 'consult_alliance',
                consultationAllianceId: alliance.id,
                consultationScope: 'alliance',
              })
            )
            setReply(result.summary)
          }}
        >
          Consult {alliance.name ?? 'alliance'} · {energyCost} energy
        </button>
      ))}
      {reply && <p role="status">{reply}</p>}
    </section>
  )
}

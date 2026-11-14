import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { executeHumanRealityAction } from '../../social/reality/humanFlow'
import type { RealityAlliance } from '../../social/reality/types'
import { isCurrentAlliance } from '../../social/reality/allianceIdentity'
import { getRuntimeSocialActionById } from '../../social/socialActionManager'
import { normalizeActionCosts } from '../../social/smExecNormalize'

export default function AllianceVoteCampaign({ alliance }: { alliance: RealityAlliance }) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const resources = useAppSelector((state) => state.social)
  const [targetId, setTargetId] = useState('')
  const [reply, setReply] = useState('')
  const human = game.players.find((player) => player.isUser)
  if (
    !human ||
    game.lohId !== human.id ||
    !isCurrentAlliance(alliance) ||
    !alliance.memberIds.includes(human.id) ||
    game.publicModeEnabled ||
    game.voxPopuli?.status === 'active' ||
    !['pos_ceremony_results', 'social_2'].includes(game.phase) ||
    game.replacementNeeded
  )
    return null
  const nominees = game.players.filter(
    (player) => game.nomineeIds.includes(player.id) && !alliance.memberIds.includes(player.id)
  )
  const voters = game.players.filter(
    (player) =>
      alliance.memberIds.includes(player.id) &&
      player.id !== human.id &&
      !game.coLohIds?.includes(player.id) &&
      !player.status.split('+').includes('loh') &&
      !game.nomineeIds.includes(player.id) &&
      player.status !== 'evicted' &&
      player.status !== 'jury'
  )
  if (!nominees.length || !voters.length) return null
  const selected = nominees.find((player) => player.id === targetId) ?? nominees[0]
  const action = getRuntimeSocialActionById('rally_votes_against')
  if (!action) return null
  const costs = normalizeActionCosts(action, 1, true)
  const affordable =
    (resources.energyBank[human.id] ?? 0) >= costs.energy &&
    (resources.influenceBank?.[human.id] ?? 0) >= costs.influence &&
    (resources.infoBank?.[human.id] ?? 0) >= costs.info
  return (
    <section className="sp2-alliance-vote-campaign" aria-label="LOH alliance vote campaign">
      <h3>Ask your alliance for the vote</h3>
      <label>
        Elimination target
        <select value={selected.id} onChange={(event) => setTargetId(event.target.value)}>
          {nominees.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </label>
      {voters.map((voter) => (
        <button
          key={voter.id}
          type="button"
          disabled={!affordable}
          onClick={() => {
            const result = dispatch(
              executeHumanRealityAction({
                actorId: human.id,
                targetId: voter.id,
                actionId: 'rally_votes_against',
                subjectId: selected.id,
              })
            )
            setReply(result.summary)
          }}
        >
          Ask {voter.name} to vote out {selected.name}
        </button>
      ))}
      <p>
        Each request: {costs.energy} energy · {costs.influence} influence. Allies keep their own
        ballots.
      </p>
      {reply && <p role="status">{reply}</p>}
    </section>
  )
}

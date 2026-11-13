import type { Player } from '../types'
import type { PublicDirection } from './types'

/** Describe the completed moment; never repeat a request as an instruction. */
export function getPublicRequestCompletedBroadcast(
  direction: PublicDirection | undefined,
  players: Pick<Player, 'id' | 'name'>[]
): string {
  const targetId = direction?.targetPlayerId ?? direction?.relatedPlayerId
  const name = players.find((player) => player.id === targetId)?.name
  const target = name ?? 'the Hub'
  switch (direction?.type) {
    case 'start_drama':
    case 'confront_player':
      return `Your showdown with ${target} has the audience talking. You gave them the drama they wanted.`
    case 'get_closer':
    case 'align_with':
      return `Your connection with ${target} has caught the audience's eye. They're cheering you on.`
    case 'protect_player':
    case 'show_loyalty':
    case 'reinforce_alliance':
      return 'You stood by your people when it counted. The audience loves a little loyalty.'
    case 'apologize':
    case 'repair_relationship':
      return `You cleared the air with ${target}. The audience is warming to your softer side.`
    case 'win_competition':
    case 'win_veto':
      return 'You delivered under pressure. The audience is on its feet.'
    case 'expose_player':
      return `You pulled back the curtain on ${target}. The audience can't look away.`
    case 'target_player':
    case 'flip_vote':
    case 'influence_hoh':
    case 'break_alliance':
    case 'make_bold_move':
    case 'create_chaos':
      return 'You shook up the Hub, and the audience loved the move. They wanted a story. You gave them one.'
    default:
      return "You gave the audience the moment they were waiting for. They're cheering you on."
  }
}

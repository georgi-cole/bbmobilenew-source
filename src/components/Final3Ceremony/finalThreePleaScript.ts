import type { Player } from '../../types'
import type { FinalThreeDecisionRead } from '../../social/finalThreeDecision'

export interface FinalThreePleaExchange {
  plea: string
  response: string
}

type PleaAngle = 'friction' | 'competition' | 'bond' | 'pact' | 'survival' | 'case' | 'stakes'

interface PleaOption extends FinalThreePleaExchange {
  angle: PleaAngle
  priority: number
}

const seasonCount = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0

/**
 * Offer each finalist several *true* angles from their own season, plus two
 * different fact-neutral fallbacks. A pair is selected together: independently
 * choosing each nominee's top template could give them identical speeches.
 */
function optionsFor(nominee: Player, read: FinalThreeDecisionRead): PleaOption[] {
  const wins = seasonCount(nominee.stats?.lohWins) + seasonCount(nominee.stats?.posWins)
  const nominations = seasonCount(nominee.stats?.timesNominated)
  const hasFriction = read.tags.some((tag) =>
    ['betrayal', 'target', 'rivalry'].includes(tag)
  )
  const hasBond =
    read.affinity >= 35 || read.tags.some((tag) => ['romance', 'bromance'].includes(tag))
  const hasPact = read.pactStrength >= 0.65 || read.tags.includes('alliance')
  const choices: PleaOption[] = []

  if (hasFriction) {
    choices.push({
      angle: 'friction',
      priority: 76,
      plea:
        "We haven't agreed on every move, and I won't pretend we did. You can respect what I brought to this game without forgetting where we clashed.",
      response:
        "I'm not rewriting our history either. I hear your case, but those moments still matter to me.",
    })
  }
  if (wins > 0) {
    choices.push({
      angle: 'competition',
      priority: 76 + Math.min(wins, 5),
      plea: `I've earned ${wins} competition win${wins === 1 ? '' : 's'}. Taking me to the Final Two would let me finish what I came here to do.`,
      response: `You've earned ${wins} competition win${wins === 1 ? '' : 's'}. That record matters, even if it doesn't make this decision easy.`,
    })
  }
  if (hasBond) {
    choices.push({
      angle: 'bond',
      priority: 72,
      plea:
        'We trusted each other through this season. I hope the way we treated each other still counts when you choose who stands beside you.',
      response:
        'I remember what we built together. That connection makes this a harder choice, not an automatic one.',
    })
  }
  if (hasPact) {
    choices.push({
      angle: 'pact',
      priority: 69,
      plea:
        'We stood on the same side of this game. If our alliance still means something tonight, I want us to see the final together.',
      response:
        'I know the alliance brought us this far. I also have to think about what happens when we reach the final vote.',
    })
  }
  if (nominations > 0) {
    choices.push({
      angle: 'survival',
      priority: nominations >= 2 ? 68 + Math.min(nominations, 5) : 52,
      plea: `I've faced the block ${nominations} ${nominations === 1 ? 'time' : 'times'} and survived. I want that fight to count for something at the finish.`,
      response: `You faced the block ${nominations} ${nominations === 1 ? 'time' : 'times'} and made it here. I won't dismiss that resilience.`,
    })
  }

  // Distinct neutral alternatives are essential when both candidates have no
  // recorded wins, nominations, alliance or relationship evidence.
  choices.push(
    {
      angle: 'case',
      priority: 12,
      plea:
        "I can't reduce my whole season to one moment. I played to reach this room, and I'd like the chance to make my case to the Tribunal.",
      response:
        "I hear the argument you're making for your whole season. I need to weigh that against the choice in front of me.",
    },
    {
      angle: 'stakes',
      priority: 11,
      plea:
        "You have the final say, and I know you have your own game to protect. I'm asking you to give me the chance to stand beside you and answer for mine.",
      response:
        "I know what's at stake for you, and I have to think about my own game too. I'll make the call with both in mind.",
    }
  )
  return choices.sort((a, b) => b.priority - a.priority)
}

/**
 * Choose complementary scripts using a stable ID order, not rendering order.
 * This keeps each player's line stable across reloads and UI reordering.
 * No randomness or new achievements are introduced.
 */
export function buildFinalThreePleaExchanges(
  nominees: readonly Player[],
  reads: Record<string, FinalThreeDecisionRead>
): Record<string, FinalThreePleaExchange> {
  const sorted = [...nominees].sort((a, b) => a.id.localeCompare(b.id))
  const options = sorted.map((nominee) => optionsFor(nominee, reads[nominee.id]))
  const selected = new Map<string, PleaOption>()

  if (sorted.length === 2) {
    let bestScore = -Infinity
    for (const first of options[0]) {
      for (const second of options[1]) {
        if (first.angle === second.angle) continue
        const score = first.priority + second.priority
        if (score > bestScore) {
          bestScore = score
          selected.set(sorted[0].id, first)
          selected.set(sorted[1].id, second)
        }
      }
    }
  } else {
    sorted.forEach((nominee, index) => selected.set(nominee.id, options[index][0]))
  }

  return Object.fromEntries(
    nominees.map((nominee) => {
      const script = selected.get(nominee.id) ?? optionsFor(nominee, reads[nominee.id])[0]
      return [nominee.id, { plea: script.plea, response: script.response }]
    })
  )
}

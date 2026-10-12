import type { Player } from '../../types'
import type { RealityBelief, RealityFact } from './types'

type ConsultationPlayer = Pick<Player, 'id' | 'name' | 'status'>

export interface PreNominationLohReadInput {
  allianceName?: string
  actorId: string
  lohId: string | null
  week: number
  attendingMemberIds: readonly string[]
  players: readonly ConsultationPlayer[]
  disclosuresByMemberId?: Record<string, string>
  disclosureOutcomeByMemberId?: Record<string, 'truthful' | 'partial' | 'vague' | 'false'>
  beliefsByOwner: Record<string, Record<string, RealityBelief>>
  facts: Record<string, RealityFact>
}

interface LohClue {
  advisorId: string
  targetId: string
  kind: 'DISCLOSURE' | 'PITCH'
  sourceId?: string
}

function isActivePlayer(player: ConsultationPlayer | undefined): player is ConsultationPlayer {
  return Boolean(player && player.status !== 'evicted' && player.status !== 'jury')
}

/**
 * Summarize only pre-nomination clues held by the attending alliance members.
 * This deliberately accepts disclosed answers rather than the canonical LOH
 * target, so a private plan cannot leak through an alliance consultation.
 */
export function buildPreNominationLohRead(input: PreNominationLohReadInput): string {
  const playerById = new Map(input.players.map((player) => [player.id, player]))
  const allianceName = input.allianceName?.trim() || 'your alliance'
  const loh = input.lohId ? playerById.get(input.lohId) : undefined
  if (!isActivePlayer(loh)) {
    return 'Pre-nomination read — There is no active Head of Household to read yet.'
  }

  const activeIds = new Set(input.players.filter(isActivePlayer).map((player) => player.id))
  const clues: LohClue[] = []
  const clueKeys = new Set<string>()

  const addClue = (clue: LohClue) => {
    const key = `${clue.advisorId}:${clue.kind}:${clue.sourceId ?? ''}:${clue.targetId}`
    if (!clueKeys.has(key)) {
      clueKeys.add(key)
      clues.push(clue)
    }
  }

  for (const advisorId of input.attendingMemberIds) {
    const disclosedTargetId = input.disclosuresByMemberId?.[advisorId]
    if (
      disclosedTargetId &&
      input.disclosureOutcomeByMemberId?.[advisorId] !== 'vague' &&
      disclosedTargetId !== loh.id &&
      activeIds.has(disclosedTargetId)
    ) {
      addClue({ advisorId, targetId: disclosedTargetId, kind: 'DISCLOSURE' })
    }

    for (const belief of Object.values(input.beliefsByOwner[advisorId] ?? {})) {
      if (
        belief.propositionType !== 'TARGETING' ||
        belief.status === 'DISPROVEN' ||
        belief.status === 'STALE' ||
        belief.lastUpdatedDay !== input.week ||
        !belief.objectId ||
        !activeIds.has(belief.objectId)
      ) {
        continue
      }

      const factIdPrefix = `belief:${advisorId}:`
      if (!belief.id.startsWith(factIdPrefix)) continue
      const fact = input.facts[belief.id.slice(factIdPrefix.length)]
      const sourceId = belief.subjectIds[0]
      if (
        !fact ||
        fact.propositionType !== 'TARGETING' ||
        fact.day !== input.week ||
        fact.objectId !== belief.objectId ||
        fact.subjectIds[0] !== sourceId ||
        !fact.participantIds.includes(loh.id) ||
        !sourceId ||
        !isActivePlayer(playerById.get(sourceId)) ||
        (!fact.participantIds.includes(advisorId) && !fact.witnessIds.includes(advisorId))
      ) {
        continue
      }

      addClue({ advisorId, targetId: belief.objectId, kind: 'PITCH', sourceId })
    }
  }

  if (clues.length === 0) {
    return `Pre-nomination read — No one in ${allianceName} has a reliable read on ${loh.name}'s plan yet.`
  }

  const reports = clues.slice(0, 3).map((clue) => {
    const isCaller = clue.advisorId === input.actorId
    const advisorName = playerById.get(clue.advisorId)?.name ?? 'An ally'
    const targetName = playerById.get(clue.targetId)?.name ?? 'someone'
    if (clue.kind === 'DISCLOSURE') {
      return isCaller
        ? `You report that ${loh.name} named ${targetName} as a possible target`
        : `${advisorName} says ${loh.name} named ${targetName} as a possible target`
    }
    const sourceName = playerById.get(clue.sourceId ?? '')?.name ?? 'someone'
    if (clue.sourceId === clue.advisorId) {
      return isCaller
        ? `You report that you urged ${loh.name} to consider ${targetName}`
        : `${advisorName} says they urged ${loh.name} to consider ${targetName}`
    }
    return isCaller
      ? `You heard ${sourceName} urge ${loh.name} to consider ${targetName}`
      : `${advisorName} heard ${sourceName} urge ${loh.name} to consider ${targetName}`
  })

  const conflictTargets = new Set(clues.map((clue) => clue.targetId))
  const conflictNote = conflictTargets.size > 1 ? ' The reports point to different names.' : ''
  return `Pre-nomination read — ${reports.join('; ')}.${conflictNote} These are unconfirmed clues, not a locked nomination or alliance decision.`
}

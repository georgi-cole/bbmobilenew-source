import type { TribunalHighlight } from '../../types'

export interface TribunalRecapShot {
  kind: 'powers' | 'loh' | 'safety' | 'block' | 'exit'
  label: string
  playerIds: string[]
}

/** Read only the captured cycle, never the next day's power holders. */
export function buildTribunalRecapShots(highlight: TribunalHighlight): TribunalRecapShot[] {
  const shots: TribunalRecapShot[] = []
  const combinedPowers = highlight.kind === 'eviction' && highlight.lohId && highlight.posWinnerId
  if (combinedPowers)
    shots.push({
      kind: 'powers',
      label: 'THE POWER HOLDERS',
      playerIds: [...new Set([highlight.lohId!, highlight.posWinnerId!])],
    })
  if (!combinedPowers && highlight.lohId && ['eviction', 'final_three'].includes(highlight.kind))
    shots.push({
      kind: 'loh',
      label: highlight.kind === 'final_three' ? 'FINAL POWER' : 'LOH WINNER',
      playerIds: [highlight.lohId],
    })
  if (
    !combinedPowers &&
    highlight.posWinnerId &&
    ['eviction', 'final_four'].includes(highlight.kind)
  )
    shots.push({
      kind: 'safety',
      label: highlight.savedId ? 'POWER OF SAFETY · SAVE' : 'POWER OF SAFETY',
      playerIds: [
        ...new Set([highlight.posWinnerId, ...(highlight.savedId ? [highlight.savedId] : [])]),
      ],
    })
  if (highlight.nomineeIds.length && highlight.kind === 'eviction')
    shots.push({ kind: 'block', label: 'THE FINAL BLOCK', playerIds: highlight.nomineeIds })
  shots.push({ kind: 'exit', label: 'THE ELIMINATION', playerIds: highlight.evicteeIds })
  return shots
}

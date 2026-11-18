import { PUBLIC_JUROR_ID, type JurorReveal } from '../../store/finaleSlice'

/** Spotlight ballots only while their recipients can still decide the winner. */
export function getVoteSpotlightCount(
  ballots: readonly JurorReveal[],
  finalistIds: readonly string[]
): number {
  const [first, second] = finalistIds
  if (!first || !second) return ballots.length

  const publicIndex = ballots.findIndex((vote) => vote.jurorId === PUBLIC_JUROR_ID)
  let margin = 0
  let tribunalMargin = 0
  for (const [index, vote] of ballots.entries()) {
    const direction = vote.finalistId === first ? 1 : -1
    margin += direction
    if (vote.jurorId !== PUBLIC_JUROR_ID) tribunalMargin += direction

    const remaining = ballots.length - index - 1
    if (Math.abs(margin) > remaining) return index + 1

    // If every remaining ballot goes to the challenger, a tied combined tally
    // can still be decisive when the Tribunal alone must favor the leader.
    const remainingTribunal = remaining - Number(publicIndex > index)
    if (
      margin !== 0 &&
      Math.abs(margin) === remaining &&
      Math.sign(margin) * tribunalMargin > remainingTribunal
    ) {
      return index + 1
    }
  }
  return ballots.length
}

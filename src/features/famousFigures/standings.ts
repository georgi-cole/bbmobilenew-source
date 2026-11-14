/** The same ordering owns the trophy, the scoreboard and the campaign receipt. */
export function rankFamousFigures(
  participantIds: readonly string[],
  scores: Record<string, number>,
  roundScores: Record<string, number[]>,
  tieBreakOrder: readonly string[]
): string[] {
  const priority = new Map(tieBreakOrder.map((id, index) => [id, index]))
  return [...participantIds].sort((a, b) => {
    const scoreDifference = (scores[b] ?? 0) - (scores[a] ?? 0)
    if (scoreDifference) return scoreDifference
    const correctDifference =
      countCorrectRounds(roundScores[b]) - countCorrectRounds(roundScores[a])
    if (correctDifference) return correctDifference
    return (
      (priority.get(a) ?? Number.MAX_SAFE_INTEGER) - (priority.get(b) ?? Number.MAX_SAFE_INTEGER)
    )
  })
}

export function countCorrectRounds(roundScores: readonly number[] = []): number {
  return roundScores.filter((score) => score > 0).length
}

export function explainFamousFiguresTies(
  rankedIds: readonly string[],
  scores: Record<string, number>,
  roundScores: Record<string, number[]>,
  name: (id: string) => string
): string[] {
  const scoreGroups = new Map<number, string[]>()
  for (const id of rankedIds) {
    const score = scores[id] ?? 0
    scoreGroups.set(score, [...(scoreGroups.get(score) ?? []), id])
  }
  return [...scoreGroups].flatMap(([score, ids]) => {
    if (ids.length < 2) return []
    const correctGroups = new Map<number, string[]>()
    for (const id of ids) {
      const correct = countCorrectRounds(roundScores[id])
      correctGroups.set(correct, [...(correctGroups.get(correct) ?? []), id])
    }
    const lines =
      correctGroups.size > 1
        ? [
            `Tie at ${score} points: more correct answers place higher (${ids.map((id) => `${name(id)}: ${countCorrectRounds(roundScores[id])}`).join('; ')}).`,
          ]
        : []
    for (const [correct, tiedIds] of correctGroups) {
      if (tiedIds.length < 2) continue
      lines.push(
        `Tied at ${score} points and ${correct} correct answers: the pre-drawn tie-break order is ${tiedIds.map(name).join(', then ')}.`
      )
    }
    return lines
  })
}

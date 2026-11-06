import type { CompetitionResult } from './competitionResult'
import { useCompetitionResultCheckpoint } from './competitionResultContext'

/** Mount only when the game's final standings are ready, before Continue. */
export default function CompetitionResultCheckpoint({ result }: { result: CompetitionResult }) {
  useCompetitionResultCheckpoint(result)
  return null
}

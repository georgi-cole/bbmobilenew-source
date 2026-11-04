import type { CeremonyCastMember } from './replacement-film.js'
import type { ReplacementPresentation, CoLohAssignment } from './replacementPresentation'
export function coLeaderOutcome(
  cast: Record<string, CeremonyCastMember>,
  details: { coLohAssignments?: CoLohAssignment[]; nomineeCount?: number }
): ReplacementPresentation | null

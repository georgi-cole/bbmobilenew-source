import type { ReactNode } from 'react'
import PlayerSafetyScreen from './PlayerSafetyScreen'
import { canPlayWithSafety } from './playerSafety'
import { usePlayerSafety } from './usePlayerSafety'

export default function PlayerAdmissionBoundary({ children }: { children: ReactNode }) {
  const safety = usePlayerSafety()
  return canPlayWithSafety(safety) ? children : <PlayerSafetyScreen />
}

import { getDepressionShockLifecycleForGame } from '../features/twists/depressionShockLifecycle'
import type { PulseChronicleTheme } from './pulseChronicleCopy'

interface PulseThemeGame {
  gameId: string
  season: number
  cupidArrow?: { activatedSeason?: number | null } | null
  voxPopuli?: { activatedSeason?: number | null } | null
}

export function getPulseChronicleTheme(game: PulseThemeGame, day: number): PulseChronicleTheme {
  const format =
    game.voxPopuli?.activatedSeason === game.season
      ? 'voxPopuli'
      : game.cupidArrow?.activatedSeason === game.season
        ? 'cupidArrow'
        : 'classic'
  const lifecycle = getDepressionShockLifecycleForGame(game.gameId, day)
  return {
    format,
    ...(lifecycle === 'day1' || lifecycle === 'day2' || lifecycle === 'recovery'
      ? { depressionShock: lifecycle }
      : {}),
  }
}

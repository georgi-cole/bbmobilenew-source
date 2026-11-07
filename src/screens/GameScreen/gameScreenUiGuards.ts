export function shouldShowGameControlDock(
  hasStartedGame: boolean,
  _blockers: readonly boolean[],
  allowWhenInactive = false
): boolean {
  // The control dock is persistent chrome for the main game screen. Gameplay
  // overlays may block interaction above it, but they must never unmount the
  // navbar and leave the player without navigation after a stale flow flag.
  return hasStartedGame || allowWhenInactive
}

/** Full-screen season-end chats provide their own Continue/Skip controls. */
export function shouldRenderGameControlDock(
  dockAvailable: boolean,
  seasonFinaleActive: boolean
): boolean {
  return dockAvailable && !seasonFinaleActive
}

/** Cupid's spectator path exists only to let the development browser test finish a season. */
export function shouldEnableCupidSeasonTestSpectator(
  isDevelopmentBuild: boolean,
  enabledByTest: boolean
): boolean {
  return isDevelopmentBuild && enabledByTest
}

/** Foreground icon rotation is paused; there is no activation state to reset. */
export function resetStoryIconRotationForNextActivation(): void {
  // Keep the activation API stable while the Android launcher issue is investigated.
}

/**
 * Retain the currently enabled launcher alias throughout startup and resume.
 * Disabling the native rotation also changes aliases (it selects stage 1), so
 * neither remote-switch value may call the plugin while investigating launches
 * that close at the splash screen. Re-enable only after device validation.
 * iOS continues to use its build-time icon.
 */
export async function applyStoryIconRotation(_enabled: boolean): Promise<number | null> {
  return null
}

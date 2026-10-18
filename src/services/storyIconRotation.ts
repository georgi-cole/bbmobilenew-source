import { Capacitor, registerPlugin } from '@capacitor/core'

interface StoryIconRotationPlugin {
  applyLaunchRotation(options: { enabled: boolean }): Promise<{ stage: number }>
}

const StoryIconRotation = registerPlugin<StoryIconRotationPlugin>('StoryIconRotation')

let rotationStartedForActivation = false
let lastRotationRequestAt = 0

/** Allow the next foreground activation to advance the bundled icon story. */
export function resetStoryIconRotationForNextActivation(): void {
  rotationStartedForActivation = false
}

/** Apply one native icon stage for the current app activation. */
export async function applyStoryIconRotation(enabled: boolean): Promise<number | null> {
  if (!Capacitor.isNativePlatform() || rotationStartedForActivation) return null

  rotationStartedForActivation = true
  const now = Date.now()
  // Ignore a visibility bounce caused by the native icon-change prompt itself.
  if (now - lastRotationRequestAt < 5000) return null
  lastRotationRequestAt = now

  try {
    const result = await StoryIconRotation.applyLaunchRotation({ enabled })
    return result.stage
  } catch (error) {
    rotationStartedForActivation = false
    console.warn('[story-icon] Unable to rotate the native app icon:', error)
    return null
  }
}

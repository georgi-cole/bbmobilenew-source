import { Capacitor, registerPlugin } from '@capacitor/core'

interface StoryIconRotationPlugin {
  applyLaunchRotation(options: { enabled: boolean }): Promise<{ stage: number }>
}

const StoryIconRotation = registerPlugin<StoryIconRotationPlugin>('StoryIconRotation')

let rotationStartedForActivation = false
let lastRotationRequestAt = 0

/** Allow the next Android foreground activation to advance the icon story. */
export function resetStoryIconRotationForNextActivation(): void {
  rotationStartedForActivation = false
}

/** iOS selects its icon at build time. Only Android rotates on activation. */
export async function applyStoryIconRotation(enabled: boolean): Promise<number | null> {
  if (Capacitor.getPlatform() !== 'android' || rotationStartedForActivation) return null

  rotationStartedForActivation = true
  const now = Date.now()
  // Ignore quick visibility bounces.
  if (now - lastRotationRequestAt < 5000) return null
  lastRotationRequestAt = now

  try {
    const result = await StoryIconRotation.applyLaunchRotation({ enabled })
    return result.stage
  } catch (error) {
    rotationStartedForActivation = false
    console.warn('[story-icon] Unable to rotate the Android launcher icon:', error)
    return null
  }
}

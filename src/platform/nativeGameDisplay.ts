import { Capacitor, registerPlugin, SystemBars } from '@capacitor/core'

export interface GameDisplayState {
  active: boolean
  allowLandscape: boolean
}

interface GameDisplayPlugin {
  setState(state: GameDisplayState): Promise<void>
}

const GameDisplay = registerPlugin<GameDisplayPlugin>('GameDisplay')
let pendingUpdate = Promise.resolve()

export function hasNativeGameDisplay(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('GameDisplay')
}

/** Keep a delayed hide/rotation request from overtaking a newer menu or exit request. */
export function syncNativeGameDisplay(state: GameDisplayState): Promise<void> {
  pendingUpdate = pendingUpdate.then(async () => {
    try {
      if (state.active) await SystemBars.hide()
      else await SystemBars.show()
    } catch {
      // The measured CSS safe area remains the fallback on unsupported shells.
    }

    if (hasNativeGameDisplay()) {
      try {
        await GameDisplay.setState(state)
      } catch {
        // Display integration must never prevent a season from opening or saving.
      }
    }
  })
  return pendingUpdate
}

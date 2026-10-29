import { useEffect } from 'react'

const mounts = new Map<string, number>()

/** Portalled full-screen games can suspend the completely covered house layer. */
export function useCoveredGameScreen(portalled = true): void {
  useEffect(() => {
    const className = portalled ? 'minigame-portal-active' : 'card-minigame-active'
    mounts.set(className, (mounts.get(className) ?? 0) + 1)
    document.body.classList.add(className)
    return () => {
      const remaining = (mounts.get(className) ?? 1) - 1
      if (remaining) mounts.set(className, remaining)
      else {
        mounts.delete(className)
        document.body.classList.remove(className)
      }
    }
  }, [portalled])
}

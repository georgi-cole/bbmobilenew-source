import { canUseAdultServices } from '../../safety/playerSafety'

let contextualSession = false

export function usesContextualAdTreatment(): boolean {
  return contextualSession || !canUseAdultServices()
}

// Keep the native SDK's restricted configuration for the rest of this session.
export function retainContextualAdTreatment(): void {
  contextualSession = true
}

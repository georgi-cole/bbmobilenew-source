import type { ComponentProps, ComponentType } from 'react'

export interface ExitSoundtrackContinuation {
  /** Reuse the preceding scene's ownership group during the visual handoff. */
  presentationGroupId: string
  setActive(active: boolean): void
  finish(): void
}

type ExitProps = ComponentProps<
  typeof import('../../components/Eviction/SpotlightEvictionOverlay').default
> & {
  /** The interactive Final Three scene has completed its decision presentation. */
  decisionAlreadyPresented?: boolean
  /** An already-playing soundtrack retained until this departure hands off. */
  soundtrackContinuation?: ExitSoundtrackContinuation
}

declare const Component: ComponentType<ExitProps>
export default Component

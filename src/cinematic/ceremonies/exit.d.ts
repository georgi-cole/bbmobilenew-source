import type { ComponentProps, ComponentType } from 'react'

type ExitProps = ComponentProps<
  typeof import('../../components/Eviction/SpotlightEvictionOverlay').default
> & {
  /** The interactive Final Three scene has completed its decision presentation. */
  decisionAlreadyPresented?: boolean
}

declare const Component: ComponentType<ExitProps>
export default Component

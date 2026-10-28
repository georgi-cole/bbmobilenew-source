import { Suspense, type ReactNode } from 'react'
import './MinigameHost.css'

export default function MinigameLoadingBoundary({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <Suspense
      fallback={
        <div className="minigame-host" aria-busy="true">
          <div className="minigame-host-loading" role="status" aria-live="polite">
            Preparing {title}…
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

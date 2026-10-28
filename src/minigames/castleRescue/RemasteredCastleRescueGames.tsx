import { useLayoutEffect, useRef, useState } from 'react'
import type { CastleRescueGameProps } from './CastleRescueGame'

type RemasteredProps = Omit<CastleRescueGameProps, 'variant' | 'remastered'>

function RemasteredTwin({ part, onFinish, autoStart = true }: RemasteredProps & { part: 1 | 2 }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const finished = useRef(false)
  const [readyPart, setReadyPart] = useState<number | null>(null)
  const gameTitle = part === 1 ? 'Find Your Twin' : 'Find Your Twin 2: Lost Again'
  // Subscribe during commit so even a cached iframe cannot outrun its ready listener.
  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin)
        return
      if (event.data?.type === 'twin:ready') {
        setReadyPart(part)
        return
      }
      if (event.data?.type !== 'twin:complete' || finished.current) return
      const score = event.data.score
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) return
      finished.current = true
      onFinish?.(score)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [onFinish, part])
  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      aria-busy={readyPart !== part}
    >
      {readyPart !== part && (
        <div className="minigame-host" role="status" aria-live="polite">
          Preparing {gameTitle}…
        </div>
      )}
      <iframe
        ref={frame}
        title={`${gameTitle} — VIP edition`}
        src={`${import.meta.env.BASE_URL}minigames/twin-remastered/part${part}/index.html?autostart=${autoStart ? '1' : '0'}`}
        allowFullScreen
        style={{
          width: '100%',
          height: '100%',
          border: 0,
          display: 'block',
          visibility: readyPart === part ? 'visible' : 'hidden',
        }}
      />
    </div>
  )
}

/** Production Part 1 remaster. Gameplay/scoring stay shared; the premium renderer is explicit. */
export function RemasteredCastleRescueGame(props: RemasteredProps) {
  return <RemasteredTwin {...props} part={1} />
}

/** Production Lost Again remaster, including its castle-specific premium renderer. */
export function RemasteredBennyLennyCastleRescueGame(props: RemasteredProps) {
  return <RemasteredTwin {...props} part={2} />
}

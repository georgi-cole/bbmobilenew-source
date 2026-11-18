import { useLayoutEffect, useRef, type RefObject } from 'react'
import { BALLOT_BEAT_MS } from './finaleTiming'

interface Props {
  active: boolean
  origin: RefObject<HTMLElement | null>
  destination: RefObject<HTMLElement | null>
  name: string
  tone: 'gold' | 'violet'
}

export default function TribunalBallotFlight({ active, origin, destination, name, tone }: Props) {
  const flight = useRef<HTMLDivElement>(null)
  const movement = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    const node = flight.current
    if (!node?.animate || !origin.current || !destination.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const from = origin.current.getBoundingClientRect()
    const to = destination.current.getBoundingClientRect()
    const sourceX = from.left + from.width / 2
    const sourceY = from.top + from.height / 2
    const targetX = to.left + to.width / 2
    const targetY = to.top + to.height / 2
    node.style.setProperty('--ballot-font-size', getComputedStyle(origin.current).fontSize)
    node.style.setProperty('--ballot-flight-time', `${BALLOT_BEAT_MS.flight}ms`)

    const animation = node.animate(
      [
        { transform: `translate3d(${sourceX}px, ${sourceY}px, 0)`, opacity: 1 },
        { transform: `translate3d(${sourceX}px, ${sourceY + 12}px, 0)`, opacity: 1, offset: 0.31 },
        {
          transform: `translate3d(${targetX}px, ${targetY}px, 0)`,
          opacity: 1,
        },
      ],
      { duration: BALLOT_BEAT_MS.flight, easing: 'cubic-bezier(0.44, 0, 0.32, 1)', fill: 'both' }
    )
    movement.current = animation
    return () => {
      animation.cancel()
      movement.current = null
    }
  }, [destination, origin])

  useLayoutEffect(() => {
    if (active) movement.current?.play()
    else movement.current?.pause()
  }, [active])

  return (
    <div className="fo-ballot-flight" ref={flight} data-tone={tone} aria-hidden="true">
      <span>{name}</span>
      <i />
    </div>
  )
}

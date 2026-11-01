import { useLayoutEffect, useRef } from 'react'
import {
  animateFinaleClosingBrand,
  makeFinaleClosingBrandMarkup,
} from '../../cinematic/ceremonies/approved/finale-closing-brand.js'
import '../../cinematic/ceremonies/approved/decision-exit.css'
import { FINAL_THREE_BRAND_DURATION_MS as BRAND_DURATION_MS } from './competitionBroadcastTimeline'

/** The same ident and motion tracks used by the in-game final-day exit renderer. */
export default function FinalThreeClosingBrand({
  eyeSrc,
  active,
  paused,
}: {
  eyeSrc: string
  active: boolean
  paused: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const animations = useRef<Animation[]>([])
  const pausedRef = useRef(paused)

  useLayoutEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useLayoutEffect(() => {
    const host = root.current
    if (!active || !host) return undefined
    // The markup factory contains only fixed decorative elements; asset URLs
    // are assigned as DOM properties instead of interpolated into HTML.
    host.innerHTML = makeFinaleClosingBrandMarkup(
      (key, className) => `<img data-resource="${key}" class="${className}" alt="">`
    )
    for (const image of host.querySelectorAll('img')) {
      image.src = eyeSrc
      image.draggable = false
    }
    const created: Animation[] = []
    const canFlyOut = typeof host.querySelector('.exit-brand')?.animate === 'function'
    animateFinaleClosingBrand(
      (selector, stops) => {
        const last = stops.at(-1)!
        for (const element of host.querySelectorAll<HTMLElement>(selector)) {
          if (typeof element.animate !== 'function') {
            element.style.opacity = String(last[1])
            if (last[2]) element.style.transform = last[2]
            continue
          }
          const animation = element.animate(
            [...stops, [BRAND_DURATION_MS, last[1], last[2]]].map(
              ([ms, opacity, transform, easing]) => ({
                offset: Number(ms) / BRAND_DURATION_MS,
                opacity: Number(opacity),
                ...(transform ? { transform: String(transform) } : {}),
                ...(easing ? { easing: String(easing) } : {}),
              })
            ),
            { duration: BRAND_DURATION_MS, fill: 'both', easing: 'linear' }
          )
          if (pausedRef.current || document.hidden) animation.pause()
          created.push(animation)
        }
      },
      { startAt: 0, holdUntil: BRAND_DURATION_MS, fadeOut: false, flyToBlack: canFlyOut }
    )
    animations.current = created
    return () => {
      created.forEach((animation) => animation.cancel())
      animations.current = []
      for (const image of host.querySelectorAll('img')) image.removeAttribute('src')
      host.replaceChildren()
    }
  }, [active, eyeSrc])

  useLayoutEffect(() => {
    const synchronize = () => {
      for (const animation of animations.current) {
        if (pausedRef.current || document.hidden) {
          if (animation.playState === 'running') animation.pause()
        } else if (
          animation.playState === 'paused' &&
          Number(animation.currentTime ?? 0) < BRAND_DURATION_MS
        ) {
          animation.play()
        }
      }
    }
    synchronize()
    document.addEventListener('visibilitychange', synchronize)
    return () => document.removeEventListener('visibilitychange', synchronize)
  }, [active, paused])

  return <div className="finale-closing-brand" aria-hidden="true" ref={root} />
}

import { useEffect, useRef, useState } from 'react'
import type { Player } from '../../types'
import type { ClipController } from '../../cinematic/ceremonies/renderer'
import { findArt } from '../../cinematic/ceremonies/runtime.mjs'

export const TRIBUNAL_EXCERPT_MS = 3000
export const TRIBUNAL_POWERS_MS = 4000

interface Props {
  scene: 'loh' | 'safety' | 'nominations'
  players: Player[]
  onReady: (available: boolean) => void
  paired?: boolean
  durationMs?: number
}

/** Replays an excerpt of the existing film, with no gameplay bridge or event dispatch. */
export default function TribunalCeremonyExcerpt({
  scene,
  players,
  onReady,
  paired = false,
  durationMs = TRIBUNAL_EXCERPT_MS,
}: Props) {
  const target = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    let settled = false
    let controller: ClipController | undefined
    const settle = (available: boolean) => {
      if (cancelled || settled) return
      settled = true
      window.clearTimeout(deadline)
      if (available) setReady(true)
      else controller?.stop()
      onReady(available)
    }
    // A missing optional pack or a slow image must never hold the recap hostage.
    const deadline = window.setTimeout(() => settle(false), 2500)
    const syncVisibility = () => {
      if (document.hidden) controller?.pause()
      else controller?.resume()
    }
    document.addEventListener('visibilitychange', syncVisibility)
    void Promise.all([
      import('../../cinematic/ceremonies/renderer.js'),
      import('../../cinematic/ceremonies/cast.json'),
    ])
      .then(async ([renderer, catalog]) => {
        if (cancelled || settled) return
        const featured = scene === 'nominations' ? players : players.slice(0, 1)
        if (!featured.length || featured.length > 3) return settle(false)
        const actors = featured.map((player) => {
          const art = findArt(player, catalog.default.characters)
          return art ? { ...art, name: player.name, playerId: player.id } : null
        })
        if (actors.some((actor) => !actor)) return settle(false)
        const [a, b = a, c = a] = actors
        controller = renderer.createClip()
        const prepared = await controller.prepare(scene, { a, b, c }, 'generic', {
          nomineeCount: featured.length,
        })
        if (cancelled || settled || !prepared || !target.current) return settle(false)
        controller.mount(
          target.current,
          () => {},
          () => {},
          'generic',
          {
            excerpt: {
              // Start after every transformation/reveal: show the completed look.
              fromMs: scene === 'loh' ? 2100 : scene === 'safety' ? 2350 : 3500,
              toMs: scene === 'loh' ? 2600 : scene === 'safety' ? 3100 : 3750,
              durationMs,
              ...(paired ? { layout: 'paired' as const } : {}),
            },
          }
        )
        syncVisibility()
        settle(true)
      })
      .catch(() => settle(false))
    return () => {
      cancelled = true
      window.clearTimeout(deadline)
      document.removeEventListener('visibilitychange', syncVisibility)
      controller?.stop()
    }
  }, [scene, players, onReady, paired, durationMs])
  return (
    <div
      ref={target}
      className={`tribunal-recap__excerpt${paired ? ' tribunal-recap__excerpt--paired' : ''}${ready ? ' is-ready' : ''}`}
      data-testid="tribunal-ceremony-excerpt"
      data-scene={scene}
      aria-hidden="true"
    />
  )
}

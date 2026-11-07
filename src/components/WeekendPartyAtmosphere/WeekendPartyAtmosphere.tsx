import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { WeekendVisualTheme } from '../../utils/weekendVisualTheme'
import { usePresentationOwned } from '../../services/presentation/presentationOwnership'
import firesidePage from '../../assets/weekend/weekend-fireside-background-v3.webp'
import firesidePagePreview from '../../assets/weekend/weekend-fireside-background-v3-preview.webp'
import firesideTv from '../../assets/weekend/weekend-fireside-tv-hearth.webp'
import firesideTvPreview from '../../assets/weekend/weekend-fireside-tv-hearth-preview.webp'
import partyPage from '../../assets/weekend/weekend-party-v2.webp'
import partyPagePreview from '../../assets/weekend/weekend-party-v2-preview.webp'
import reunionPage from '../../assets/weekend/weekend-reunion-memorabilia-v2.webp'
import reunionPagePreview from '../../assets/weekend/weekend-reunion-memorabilia-v2-preview.webp'
import reunionTv from '../../assets/weekend/weekend-reunion-tv-memory-lane.webp'
import reunionTvPreview from '../../assets/weekend/weekend-reunion-tv-memory-lane-preview.webp'
import './WeekendPartyAtmosphere.css'

export type WeekendArtwork =
  | 'fireside-page'
  | 'fireside-tv'
  | 'party-page'
  | 'reunion-page'
  | 'reunion-tv'

const WEEKEND_ARTWORK: Record<WeekendArtwork, { preview: string; full: string }> = {
  'fireside-page': { preview: firesidePagePreview, full: firesidePage },
  'fireside-tv': { preview: firesideTvPreview, full: firesideTv },
  'party-page': { preview: partyPagePreview, full: partyPage },
  'reunion-page': { preview: reunionPagePreview, full: reunionPage },
  'reunion-tv': { preview: reunionTvPreview, full: reunionTv },
}

/** Low-byte preview that reveals the existing full-resolution artwork on decode. */
export function WeekendArtworkCover({
  artwork,
  surface,
}: {
  artwork: WeekendArtwork
  surface: 'page' | 'tv'
}) {
  const [fullReady, setFullReady] = useState(false)
  const { full, preview } = WEEKEND_ARTWORK[artwork]

  useEffect(() => {
    let active = true
    const image = new Image()
    image.decoding = 'async'
    const revealWhenDecoded = () => {
      const decoded = image.decode?.()
      if (decoded) {
        void decoded.then(
          () => active && setFullReady(true),
          () => {}
        )
      } else if (active) {
        setFullReady(true)
      }
    }

    image.onload = revealWhenDecoded
    image.onerror = () => {}
    image.src = full
    if (image.complete && image.naturalWidth > 0) revealWhenDecoded()

    return () => {
      active = false
      image.onload = null
      image.onerror = null
    }
  }, [full])

  return (
    <div
      className={`weekend-artwork-cover weekend-artwork-cover--${surface}`}
      data-artwork={artwork}
      data-full-ready={fullReady ? 'true' : 'false'}
      style={{ '--weekend-artwork-preview': `url("${preview}")` } as CSSProperties}
      aria-hidden="true"
    />
  )
}

function DiscoBall() {
  const id = useId()
  return (
    <svg viewBox="0 0 96 96" focusable="false">
      <defs>
        <clipPath id={`${id}-sphere`}>
          <circle cx="48" cy="48" r="43" />
        </clipPath>
        <pattern id={`${id}-mirrors`} width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#29313c" />
          <path d="M1 1h10v10H1z" fill="#f0fcff" />
          <path d="M13 1h10v10H13z" fill="#71e7ff" />
          <path d="M1 13h10v10H1z" fill="#ee8dff" />
          <path d="M13 13h10v10H13z" fill="#ffe69a" />
        </pattern>
        <radialGradient id={`${id}-shade`} cx="32%" cy="25%" r="76%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.32" stopColor="#d4ecff" stopOpacity="0.08" />
          <stop offset="0.7" stopColor="#170c3a" stopOpacity="0.18" />
          <stop offset="1" stopColor="#020409" stopOpacity="0.72" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${id}-sphere)`}>
        <rect
          className="weekend-party-disco__mirrors"
          x="-24"
          width="168"
          height="96"
          fill={`url(#${id}-mirrors)`}
        />
        <circle cx="48" cy="48" r="43" fill={`url(#${id}-shade)`} />
        <ellipse cx="30" cy="21" rx="17" ry="7" fill="#fff" opacity="0.24" />
      </g>
      <circle cx="48" cy="48" r="43" fill="none" stroke="#bfdbf7" strokeOpacity="0.45" />
      <path
        className="weekend-party-disco__glint weekend-party-disco__glint--secondary"
        d="m70 51 2 7 7 2-7 2-2 7-2-7-7-2 7-2z"
        fill="#fff6ca"
      />
      <path
        className="weekend-party-disco__glint"
        d="m29 9 2 9 9 2-9 2-2 9-2-9-9-2 9-2z"
        fill="#fff"
      />
    </svg>
  )
}

export default function WeekendPartyAtmosphere({
  active,
  animate,
  theme,
}: {
  active: boolean
  animate: boolean
  theme: WeekendVisualTheme | null
}) {
  const presentationOwned = usePresentationOwned()
  const activeThemeRef = useRef<WeekendVisualTheme | null>(null)
  const [transition, setTransition] = useState<{
    from: WeekendVisualTheme | null
    to: WeekendVisualTheme | null
    transitioning: boolean
  }>({ from: null, to: null, transitioning: false })

  useEffect(() => {
    if (activeThemeRef.current === theme) return
    const from = activeThemeRef.current
    let finishTransitionTimer: number | undefined
    const beginTransitionTimer = window.setTimeout(() => {
      activeThemeRef.current = theme
      setTransition({ from, to: theme, transitioning: true })
      finishTransitionTimer = window.setTimeout(
        () => setTransition({ from: null, to: theme, transitioning: false }),
        1050
      )
    }, 0)

    return () => {
      window.clearTimeout(beginTransitionTimer)
      if (finishTransitionTimer !== undefined) window.clearTimeout(finishTransitionTimer)
    }
  }, [theme])

  const backdropLayers =
    transition.transitioning && animate
      ? [
          { theme: transition.from, motion: 'weekend-party-backdrop--leave' },
          { theme: transition.to, motion: 'weekend-party-backdrop--enter' },
        ]
      : [{ theme: transition.to, motion: '' }]
  const pageArtwork: Record<WeekendVisualTheme, WeekendArtwork> = {
    fireside: 'fireside-page',
    party: 'party-page',
    reunion: 'reunion-page',
  }

  return (
    <>
      {backdropLayers.map(
        ({ theme: layerTheme, motion }) =>
          layerTheme && (
            <div
              key={`${layerTheme}-${motion || 'steady'}`}
              className={`weekend-party-backdrop ${motion}`.trim()}
              data-theme={layerTheme}
              data-presentation-suspended={presentationOwned || undefined}
              aria-hidden="true"
            >
              <WeekendArtworkCover artwork={pageArtwork[layerTheme]} surface="page" />
            </div>
          )
      )}
      {active && animate && (
        <div
          className="weekend-party-disco"
          data-presentation-suspended={presentationOwned || undefined}
          aria-hidden="true"
        >
          <span className="weekend-party-disco__flight weekend-party-disco__flight--first">
            <DiscoBall />
          </span>
          <span className="weekend-party-disco__flight weekend-party-disco__flight--second">
            <DiscoBall />
          </span>
        </div>
      )}
    </>
  )
}

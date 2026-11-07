import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { getEyeArtwork, LOGO_TO_EYE_MS, playLogoToEye } from './logoToEye'
import './KolequantSplash.css'

interface Props {
  /** Minimum visible time in ms before the splash may exit. */
  duration?: number
  /** Keeps the splash visible until the caller's preload work is complete. */
  ready?: boolean
  progress?: number
  status?: string
  messages?: readonly string[]
  /** The displayed background and its frame, used to align the opening eye. */
  introHub?: { frame: RefObject<HTMLDivElement | null>; url: string | null }
  onFinish?: () => void
}

const LOGO_SRC = `${import.meta.env.BASE_URL}assets/kolequant.png`
const EXIT_MS = 360

const DEFAULT_MESSAGES = [
  'Starting the Kolequant engine.',
  "Mapping today's strategy board.",
  'Calibrating the signal.',
  'Warming up the challenge floor.',
  'Stacking the social energy chips.',
  'Calling the camera drone into position.',
  'Preparing the live floor.',
] as const

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

export default function KolequantSplash({
  duration = 2200,
  ready = true,
  progress = 0,
  status,
  messages = DEFAULT_MESSAGES,
  introHub,
  onFinish,
}: Props) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [loadedArtwork, setLoadedArtwork] = useState(0)
  const sceneRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const logoRef = useRef<HTMLImageElement>(null)
  const artworkReadyAt = useRef(0)
  const finished = useRef(false)
  const onFinishRef = useRef(onFinish)
  const hubFrame = introHub?.frame
  const hubUrl = introHub?.url
  const clampedProgress = clampProgress(progress)
  const activeMessages = useMemo(
    () => (messages.length > 0 ? messages : DEFAULT_MESSAGES),
    [messages]
  )
  const progressLabel = status ?? activeMessages[messageIndex]
  const artworkReady = loadedArtwork === 3

  function markArtworkSettled(bit: number) {
    setLoadedArtwork((current) => current | bit)
  }

  function markArtworkDecoded(image: HTMLImageElement, bit: number) {
    if (typeof image.decode !== 'function') {
      markArtworkSettled(bit)
      return
    }

    void image
      .decode()
      .catch(() => undefined)
      .then(() => markArtworkSettled(bit))
  }

  useEffect(() => {
    onFinishRef.current = onFinish
  }, [onFinish])

  useEffect(() => {
    // Keep the persistent app chrome from showing through while this splash
    // owns the viewport. The class also covers WebViews without :has() support.
    document.documentElement.classList.add('kq-splash-active')
    return () => document.documentElement.classList.remove('kq-splash-active')
  }, [])

  useEffect(() => {
    if (artworkReady) artworkReadyAt.current = performance.now()
  }, [artworkReady])

  useEffect(() => {
    if (status || activeMessages.length <= 1) return
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % activeMessages.length)
    }, 1350)
    return () => window.clearInterval(timer)
  }, [activeMessages.length, status])

  useEffect(() => {
    const scene = sceneRef.current
    if (!ready || !artworkReady || !scene || finished.current) return

    const artwork = getEyeArtwork(hubUrl)
    const canMorph =
      artwork &&
      hubFrame?.current &&
      duration >= LOGO_TO_EYE_MS + 900 &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const remaining = () => Math.max(0, duration - (performance.now() - artworkReadyAt.current))
    let stopMorph: (() => void) | null = null
    let exitTimer: number | undefined
    let finishTimer: number | undefined

    const finish = () => {
      if (finished.current) return
      finished.current = true
      onFinishRef.current?.()
    }

    const start = window.setTimeout(
      () => {
        const frame = hubFrame?.current
        const canvas = canvasRef.current
        const logo = logoRef.current
        if (canMorph && frame && canvas && logo) {
          stopMorph = playLogoToEye({
            canvas,
            scene,
            logo,
            hubFrame: frame,
            artwork,
            onFinish: finish,
          })
          if (stopMorph) return
        }

        exitTimer = window.setTimeout(() => {
          scene.classList.add('kq-splash__scene--exiting')
          finishTimer = window.setTimeout(finish, EXIT_MS)
        }, remaining())
      },
      Math.max(0, remaining() - (canMorph ? LOGO_TO_EYE_MS : 0))
    )

    return () => {
      stopMorph?.()
      window.clearTimeout(start)
      window.clearTimeout(exitTimer)
      window.clearTimeout(finishTimer)
      scene.classList.remove('kq-splash__scene--exiting')
    }
  }, [artworkReady, duration, hubFrame, hubUrl, ready])

  const splashStyle = {
    '--kq-splash-min-duration': `${duration}ms`,
    '--kq-splash-progress': `${clampedProgress}%`,
  } as CSSProperties
  const className = `kq-splash${artworkReady ? ' kq-splash--artwork-ready' : ''}`

  return (
    <div
      className={className}
      style={splashStyle}
      role="status"
      aria-live="polite"
      aria-label={`${progressLabel} ${clampedProgress}%`}
    >
      <div className="kq-splash__scene" ref={sceneRef}>
        <div className="kq-splash__composition">
          <div className="kq-splash__brand">
            <div className="kq-splash__logo-wrap">
              <img
                ref={logoRef}
                src={LOGO_SRC}
                alt="Kolequant"
                className="kq-splash__logo"
                draggable={false}
                decoding="async"
                fetchPriority="high"
                onLoad={(event) => markArtworkDecoded(event.currentTarget, 1)}
                onError={() => markArtworkSettled(1)}
              />
              <img
                src={LOGO_SRC}
                alt=""
                className="kq-splash__dna-glow"
                draggable={false}
                aria-hidden="true"
                decoding="async"
                onLoad={(event) => markArtworkDecoded(event.currentTarget, 2)}
                onError={() => markArtworkSettled(2)}
              />
            </div>
            <p className="kq-splash__title">The Big Eye</p>
          </div>
          <div className="kq-splash__preload" aria-hidden="true">
            <div className="kq-splash__preload-row">
              <span>{progressLabel}</span>
              <span>{clampedProgress}%</span>
            </div>
            <div className="kq-splash__bar-track">
              <div className="kq-splash__bar-fill" />
            </div>
          </div>
          <div className="kq-splash__footer">
            <p className="kq-splash__tagline">Life doesn't have to be short</p>
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="kq-splash__morph" aria-hidden="true" />
    </div>
  )
}

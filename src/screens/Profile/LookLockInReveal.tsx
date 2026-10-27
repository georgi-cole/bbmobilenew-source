import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { joinPublicAssetPath } from '../../utils/avatar'
import { PORTRAIT_FRAMING } from '../../appearance/portraitFraming'
import './LookLockInReveal.css'

export type LockInLook = {
  lookId: string
  label: string
  displayName: string
  casualUrl: string
  portraitUrl: string
  headTopPercent: number
  source: { left: number; top: number; width: number; height: number } | null
  readyEyebrow?: string
  completionCopy?: string
  startVeiled?: boolean
}

export const LOCK_IN_FRAME_URL = joinPublicAssetPath('assets/dressing-room/antique-gold-frame.webp')
const REVEAL_DURATION = 1250
const px = (value: number) => value + 'px'

function revealGeometry(look: LockInLook) {
  const width = window.innerWidth
  const height = window.innerHeight
  const size = Math.min(width * 0.84, height * 0.45, 380)
  const left = (width - size) / 2
  const top = Math.max(72, (height - size - 212) / 2)
  const inset = size * 0.17
  const opening = size - inset * 2
  const planeLeft = left + inset
  const planeTop = top + inset
  const source = look.source?.width
    ? look.source
    : { left, top, width: size * 0.8, height: size * 1.6 }
  const framing = PORTRAIT_FRAMING[look.lookId]
  const zoom = framing
    ? (opening * framing.portrait[2]) / (source.height * framing.figure[2])
    : (opening * 2.05) / source.width
  const imageWidth = source.width * zoom
  const imageHeight = source.height * zoom
  const imageLeft = framing
    ? opening * framing.portrait[0] - imageWidth * framing.figure[0]
    : (opening - imageWidth) / 2
  const imageTop = framing
    ? opening * framing.portrait[1] - imageHeight * framing.figure[1]
    : -imageHeight * (look.headTopPercent / 100) - opening * 0.01
  const startScale = 1 / zoom

  return {
    planeLeft,
    planeTop,
    opening,
    startScale,
    startX: source.left - planeLeft - imageLeft * startScale,
    startY: source.top - planeTop - imageTop * startScale,
    css: {
      '--look-frame-size': px(size),
      '--look-frame-inset': px(inset),
      '--look-copy-top': px(top + size + 28),
      '--look-source-x': px(source.left),
      '--look-source-y': px(source.top),
      '--look-source-width': px(source.width),
      '--look-source-height': px(source.height),
      '--look-portrait-source-width': px(imageWidth),
      '--look-portrait-source-height': px(imageHeight),
      '--look-portrait-source-x': px(imageLeft),
      '--look-portrait-source-y': px(imageTop),
    } as CSSProperties,
  }
}

/** One progress value moves and dissolves the entire composition; nothing is cut out in stages. */
export default function LookLockInReveal({
  look,
  onComplete,
}: {
  look: LockInLook
  onComplete: () => void
}) {
  const reducedMotion = useReducedMotion()
  const dialogRef = useRef<HTMLDivElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)
  const startedAt = useRef(0)
  const [geometry] = useState(() => revealGeometry(look))
  const [portraitStatus, setPortraitStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [frameStatus, setFrameStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [finished, setFinished] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const progress = useMotionValue(reducedMotion ? 1 : 0)
  const x = useTransform(progress, [0, 1], [geometry.startX, 0])
  const y = useTransform(progress, [0, 1], [geometry.startY, 0])
  const scale = useTransform(progress, [0, 1], [geometry.startScale, 1])
  const bodyOpacity = useTransform(progress, (value) => (1 - value) * (1 - value))
  const detailsOpacity = useTransform(progress, (value) => value * value)
  const detailsY = useTransform(progress, [0, 1], [8, 0])
  const veilOpacity = useTransform(progress, (value) =>
    look.startVeiled ? 1 : Math.min(1, value * 2)
  )
  const chapterOpacity = useTransform(progress, (value) => value * 0.8)
  const ready = Boolean(reducedMotion || skipped || finished)
  const id = useId().replace(/:/g, '')

  useLayoutEffect(() => {
    startedAt.current = performance.now()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    if (portraitStatus !== 'loading' && frameStatus !== 'loading') return
    const timeout = window.setTimeout(
      () => {
        setPortraitStatus((current) => (current === 'loading' ? 'error' : current))
        setFrameStatus((current) => (current === 'loading' ? 'error' : current))
      },
      Math.max(0, 6000 - (performance.now() - startedAt.current))
    )
    return () => window.clearTimeout(timeout)
  }, [portraitStatus, frameStatus])

  useEffect(() => {
    if (reducedMotion || skipped) {
      progress.set(1)
      return
    }
    if (portraitStatus === 'loading' || frameStatus === 'loading') return
    const playback = animate(progress, 1, {
      duration: REVEAL_DURATION / 1000,
      ease: [0.22, 0.8, 0.2, 1],
      onComplete: () => setFinished(true),
    })
    return () => playback.stop()
  }, [portraitStatus, frameStatus, reducedMotion, skipped, progress])

  useEffect(() => {
    if (ready) continueRef.current?.focus()
  }, [ready])

  function skipReveal() {
    progress.stop()
    progress.set(1)
    setSkipped(true)
  }

  return createPortal(
    <div
      ref={dialogRef}
      className={[
        'look-lock',
        ready ? 'look-lock--ready' : '',
        portraitStatus === 'error' ? 'look-lock--fallback' : '',
        frameStatus === 'error' ? 'look-lock--frame-fallback' : '',
      ].join(' ')}
      style={geometry.css}
      role="dialog"
      aria-modal="true"
      aria-labelledby={id + '-title'}
      aria-describedby={id + '-copy'}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          if (ready) onComplete()
          else skipReveal()
        }
        if (event.key === 'Tab') {
          event.preventDefault()
          dialogRef.current
            ?.querySelector<HTMLButtonElement>('button:not(:disabled):not([aria-hidden="true"])')
            ?.focus()
        }
      }}
    >
      <motion.div className="look-lock__veil" aria-hidden="true" style={{ opacity: veilOpacity }} />
      <motion.p
        className="look-lock__chapter"
        aria-hidden="true"
        style={{ opacity: chapterOpacity }}
      >
        The Big Eye <span /> Your next chapter
      </motion.p>
      <motion.div
        className="look-lock__plane"
        aria-hidden="true"
        style={{
          left: geometry.planeLeft,
          top: geometry.planeTop,
          width: geometry.opening,
          height: geometry.opening,
          x,
          y,
          scale,
        }}
      >
        <motion.img
          className="look-lock__body"
          src={look.casualUrl}
          alt=""
          style={{ opacity: bodyOpacity }}
        />
        <div className="look-lock__portrait-window">
          <img className="look-lock__portrait-fallback" src={look.casualUrl} alt="" />
          <motion.img
            className="look-lock__portrait"
            src={look.portraitUrl}
            alt=""
            style={{ opacity: portraitStatus === 'error' ? 0 : progress }}
            onLoad={() => {
              if (portraitStatus === 'loading') setPortraitStatus('loaded')
            }}
            onError={() => setPortraitStatus('error')}
          />
        </div>
        <motion.img
          className="look-lock__frame"
          src={LOCK_IN_FRAME_URL}
          alt=""
          style={{ opacity: progress }}
          onLoad={() => {
            if (frameStatus === 'loading') setFrameStatus('loaded')
          }}
          onError={() => setFrameStatus('error')}
        />
        <motion.div className="look-lock__seal" style={{ opacity: detailsOpacity }}>
          <svg viewBox="0 0 32 32" fill="none">
            <path
              d="M8 16.5 13.5 22 24 10.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>
      </motion.div>
      <motion.div className="look-lock__copy" style={{ opacity: detailsOpacity, y: detailsY }}>
        <p className="look-lock__eyebrow" role="status">
          {ready ? (look.readyEyebrow ?? 'Look locked in') : 'Your next chapter'}
        </p>
        <h2 id={id + '-title'}>{look.displayName || look.label}</h2>
        <div className="look-lock__name-rule" aria-hidden="true">
          <span />
        </div>
        <p id={id + '-copy'}>{look.completionCopy ?? 'Saved for your next season.'}</p>
        <button
          ref={continueRef}
          type="button"
          className="look-lock__continue"
          onClick={onComplete}
          disabled={!ready}
          tabIndex={ready ? 0 : -1}
          aria-hidden={ready ? undefined : true}
        >
          Continue
        </button>
      </motion.div>
      {!ready && (
        <button type="button" className="look-lock__skip" onClick={skipReveal}>
          Skip reveal
        </button>
      )}
    </div>,
    document.body
  )
}

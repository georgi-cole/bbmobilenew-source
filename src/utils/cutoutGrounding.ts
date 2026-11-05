import type { CSSProperties } from 'react'
import anchors from './cutout-grounding.json'

/** Measured at authoring time; no image scanning or layout work during playback. */
export function groundedCutoutStyle(src: string): CSSProperties {
  if (!src.includes('assets/')) return {}
  let path: string
  try {
    path = decodeURI(src.split(/[?#]/)[0])
  } catch {
    return {}
  }
  const key = path.slice(path.indexOf('assets/'))
  const anchor = (anchors as Record<string, { aspect: number; feetY: number }>)[key]
  if (!anchor) return {}
  return {
    position: 'absolute',
    top: 'auto',
    right: 'auto',
    bottom: 'var(--cutout-feet-inset, 0px)',
    left: '50%',
    width: `min(100cqw, calc((100cqh - var(--cutout-feet-inset, 0px)) * ${anchor.aspect}))`,
    height: 'auto',
    maxWidth: 'none',
    maxHeight: 'none',
    aspectRatio: String(anchor.aspect),
    objectFit: 'fill',
    transform: `translate(-50%, ${(1 - anchor.feetY) * 100}%)`,
  }
}

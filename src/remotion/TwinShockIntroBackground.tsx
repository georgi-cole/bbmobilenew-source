import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import type { CSSProperties } from 'react'

const DURATION_FRAMES = 486

const scenes = [
  { source: 'assets/twin-shock/twin-shock-childhood.webp', from: 42, to: 126, drift: -1.2 },
  { source: 'assets/twin-shock/twin-shock-roadtrip.webp', from: 126, to: 213, drift: 1.1 },
  { source: 'assets/twin-shock/twin-shock-lia-ali-reveal.webp', from: 213, to: 486, drift: -0.8 },
] as const

function opacityForScene(frame: number, from: number, to: number): number {
  const enter = interpolate(frame, [from - 12, from + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const leave = interpolate(frame, [to - 8, to + 12], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return Math.min(enter, leave)
}

export function TwinShockIntroBackground() {
  const frame = useCurrentFrame()
  const signalOpacity = interpolate(frame, [0, 12, 34, 48], [1, 1, 0.7, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scanProgress = interpolate(frame, [18, DURATION_FRAMES - 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#08050f', overflow: 'hidden' }}>
      <Img
        src={staticFile(scenes[2].source)}
        style={{
          position: 'absolute',
          inset: '-3%',
          width: '106%',
          height: '106%',
          objectFit: 'cover',
          objectPosition: 'center 27%',
          opacity: 0.28 * signalOpacity,
          filter: 'saturate(0.3) brightness(0.28) blur(3px)',
          transform: `scale(1.05) translateX(${Math.sin(frame / 40) * 0.4}%)`,
        }}
      />
      {scenes.map((scene) => {
        const progress = Math.max(0, Math.min(1, (frame - scene.from) / (scene.to - scene.from)))
        const imageStyle: CSSProperties = {
          position: 'absolute',
          inset: '-3%',
          width: '106%',
          height: '106%',
          objectFit: 'cover',
          objectPosition: 'center',
          opacity: opacityForScene(frame, scene.from, scene.to),
          filter: 'saturate(0.9) brightness(0.76)',
          transform: `scale(${1.06 + progress * 0.045}) translate3d(${scene.drift * progress}%, ${-progress * 0.5}%, 0)`,
        }
        return <Img key={scene.source} src={staticFile(scene.source)} style={imageStyle} />
      })}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(8,5,15,.32), transparent 30%, rgba(8,5,15,.08) 54%, rgba(8,5,15,.92)), radial-gradient(circle at 50% 40%, transparent 28%, rgba(8,5,15,.34) 76%)',
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.12,
          background:
            'repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,.12) 4px)',
          transform: `translateY(${scanProgress * 0.01}%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: `${-16 + scanProgress * 132}%`,
          right: 0,
          left: 0,
          height: '16%',
          background: 'linear-gradient(180deg, transparent, rgba(122,226,255,.18), transparent)',
          mixBlendMode: 'screen',
        }}
      />
    </AbsoluteFill>
  )
}

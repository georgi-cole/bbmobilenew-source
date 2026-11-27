import type { CSSProperties } from 'react'
import { WHEEL_SECTORS } from '../../../features/riskWheel/riskWheelSlice'
import { SECTOR_ANGLE } from './abyssPresentation'

const sectorColors = [
  '#25476e',
  '#2b3b79',
  '#294d62',
  '#315560',
  '#443675',
  '#623c72',
  '#735024',
  '#806026',
  '#9a6828',
  '#383c4a',
  '#5b3d2d',
  '#465475',
  '#753544',
  '#803849',
  '#4d233e',
  '#6b2971',
]
const sectorLights = [
  '#79b9fb',
  '#8498ff',
  '#79c8ef',
  '#81d8d9',
  '#b6a1ff',
  '#e890d6',
  '#ffc174',
  '#ffce79',
  '#ffdd9a',
  '#cad4ed',
  '#f5a77e',
  '#97b0ff',
  '#ff8d9e',
  '#ff798d',
  '#f18bcc',
  '#ed92ff',
]
const wheelPaint =
  'conic-gradient(' +
  sectorColors
    .map((color, index) => {
      const start = index * SECTOR_ANGLE
      const end = start + SECTOR_ANGLE
      return (
        color +
        ' ' +
        start +
        'deg ' +
        (end - 0.5) +
        'deg, #af9dcc ' +
        (end - 0.5) +
        'deg ' +
        end +
        'deg'
      )
    })
    .join(', ') +
  ')'

const wedges = WHEEL_SECTORS.map(({ type, label, value }, index) => {
  const angle = (index + 0.5) * SECTOR_ANGLE
  const radians = (angle * Math.PI) / 180
  return {
    angle,
    label:
      type === 'bankrupt'
        ? 'VOID'
        : type === 'skip'
          ? 'STOP'
          : (value ?? 0) < 0
            ? '−' + label
            : label,
    left: 50 + 36 * Math.sin(radians) + '%',
    top: 50 - 36 * Math.cos(radians) + '%',
  }
})

interface Props {
  rotation: number
  duration: number
  spinning: boolean
  landedSector: number | undefined
  canSpin: boolean
  spinLabel: string
  onSpin: () => void
}

export function AbyssWheel({
  rotation,
  duration,
  spinning,
  landedSector,
  canSpin,
  spinLabel,
  onSpin,
}: Props) {
  const showLanding = !spinning && landedSector !== undefined
  return (
    <div
      className="abyss-wheel-shell"
      data-spinning={spinning}
      data-omen={showLanding ? WHEEL_SECTORS[landedSector].type : undefined}
    >
      <div className="abyss-wheel-rim">
        <div
          className="abyss-wheel"
          aria-hidden="true"
          style={
            {
              '--wheel-paint': wheelPaint,
              transform: 'rotate(' + rotation + 'deg)',
              transitionDuration: duration + 'ms',
            } as CSSProperties
          }
        >
          {showLanding && (
            <div
              className="abyss-sector-hit"
              key={landedSector}
              style={
                {
                  '--sector-start': landedSector * SECTOR_ANGLE + 'deg',
                  '--sector-end': (landedSector + 1) * SECTOR_ANGLE + 'deg',
                  '--sector-light': sectorLights[landedSector],
                } as CSSProperties
              }
            />
          )}
          {wedges.map(({ angle, label, left, top }) => {
            const visibleAngle = (((angle + rotation) % 360) + 360) % 360
            const wedgeAngle = visibleAngle > 90 && visibleAngle < 270 ? angle + 180 : angle
            return (
              <span
                className="abyss-wedge"
                key={angle}
                style={{ left, top, '--wedge-angle': wedgeAngle + 'deg' } as CSSProperties}
              >
                {label}
              </span>
            )
          })}
        </div>
        <button
          type="button"
          className="abyss-eye"
          aria-label={spinLabel}
          aria-busy={spinning}
          disabled={!canSpin}
          onClick={onSpin}
        >
          <span aria-hidden="true" />
        </button>
        <div className="abyss-pointer" aria-hidden="true" />
      </div>
    </div>
  )
}

import { useId } from 'react'
import './WeekendPartyAtmosphere.css'

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
}: {
  active: boolean
  animate: boolean
}) {
  return (
    <>
      <div
        className={`weekend-party-backdrop${active ? ' weekend-party-backdrop--active' : ''}`}
        aria-hidden="true"
      />
      {active && animate && (
        <div className="weekend-party-disco" aria-hidden="true">
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

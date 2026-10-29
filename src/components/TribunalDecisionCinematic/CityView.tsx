import { useId } from 'react'

/** Static scenery only: shared by a lounge window and the outward-facing exit. */
export default function CityView() {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      className="tdc-city"
      viewBox="0 0 640 440"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x2="0" y2="1">
          <stop stopColor="#11182d" />
          <stop offset="0.64" stopColor="#3b3549" />
          <stop offset="1" stopColor="#8b6d68" />
        </linearGradient>
        <linearGradient id={`${id}-haze`} x2="0" y2="1">
          <stop stopColor="#b5a2ac" stopOpacity="0" />
          <stop offset="1" stopColor="#b5a2ac" stopOpacity="0.16" />
        </linearGradient>
        <pattern id={`${id}-lights`} width="18" height="23" patternUnits="userSpaceOnUse">
          <rect x="4" y="4" width="3" height="4" fill="#ead5ab" opacity="0.58" />
          <rect x="12" y="14" width="2" height="3" fill="#b9cde4" opacity="0.35" />
        </pattern>
        <pattern id={`${id}-near-lights`} width="26" height="31" patternUnits="userSpaceOnUse">
          <rect x="6" y="8" width="4" height="6" fill="#f0d6a1" opacity="0.68" />
          <rect x="17" y="22" width="3" height="4" fill="#f0d6a1" opacity="0.32" />
        </pattern>
      </defs>
      <path fill={`url(#${id}-sky)`} d="M0 0h640v440H0z" />
      <path
        fill="#374052"
        d="M0 260h22v-47h18v26h17v-62h28v45h16v-32h24v53h18v-78h30v35h20v-61h32v83h23v-45h18v-47h26v74h20v-36h21v40h15v-70h31v34h17v-69h27v74h15v-34h23v44h20v-83h23v55h25v-26h32v54h17v-63h30v42h20v-19h30v153H0z"
      />
      <path fill={`url(#${id}-haze)`} d="M0 140h640v215H0z" />
      <path
        fill="#202938"
        d="M0 440V287h35v-55h41v97h27V215h46v-12h10v112h30v-64h33v-42h21v122h33V170h48v-11h9v155h28v-76h44v44h23V195h38v-26h10v141h25v-64h48v71h24V220h33v-11h13v88h32V186h42v254z"
      />
      <path
        fill={`url(#${id}-lights)`}
        d="M0 440V287h35v-55h41v97h27V215h46v-12h10v112h30v-64h33v-42h21v122h33V170h48v-11h9v155h28v-76h44v44h23V195h38v-26h10v141h25v-64h48v71h24V220h33v-11h13v88h32V186h42v254z"
      />
      <path
        fill="#141c29"
        d="M0 440V332h59v-47h57v91h43v-32h65v96h31V300h60v140h26v-67h54v67h39V319h65v121h31V357h57v-50h53v133z"
      />
      <path
        fill={`url(#${id}-near-lights)`}
        opacity="0.7"
        d="M0 440V332h59v-47h57v91h43v-32h65v96h31V300h60v140h26v-67h54v67h39V319h65v121h31V357h57v-50h53v133z"
      />
      <path fill="#c5d3e8" opacity="0.035" d="M32 0h106L0 345V80zm114 0h13L0 381v-27z" />
    </svg>
  )
}

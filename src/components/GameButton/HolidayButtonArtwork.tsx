import { useId } from 'react'
import type { ReactNode } from 'react'
import type { HolidayThemeKey } from '../../utils/skinAssets'

const BUTTON_SHAPE = `M 22 18
  Q 30 10, 42 10
  L 548 10
  Q 574 10, 592 24
  L 622 78
  L 586 140
  Q 570 150, 542 150
  L 52 148
  Q 28 148, 18 130
  L 10 84
  Q 6 76, 12 66
  L 22 18`

const holidaySurfaces: Record<
  HolidayThemeKey,
  { colors: [string, string, string]; edge: string; glow: string }
> = {
  halloween: {
    colors: ['#241831', '#56375f', '#33203e'],
    edge: '#F0AA70',
    glow: 'rgba(240, 145, 73, 0.38)',
  },
  christmas: {
    colors: ['#104B39', '#247454', '#123F3A'],
    edge: '#E8C978',
    glow: 'rgba(232, 195, 103, 0.36)',
  },
  newYear: {
    colors: ['#16234F', '#304C83', '#20264D'],
    edge: '#F0D28C',
    glow: 'rgba(240, 204, 117, 0.4)',
  },
  easter: {
    colors: ['#635DA4', '#9A70B3', '#568D83'],
    edge: '#F7E6CC',
    glow: 'rgba(213, 165, 234, 0.36)',
  },
  independenceDay: {
    colors: ['#182B55', '#683C58', '#263B66'],
    edge: '#D7DDF4',
    glow: 'rgba(152, 183, 255, 0.34)',
  },
}

export default function HolidayButtonArtwork({ theme }: { theme: HolidayThemeKey }) {
  const idPrefix = `holiday-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const surface = holidaySurfaces[theme]

  return (
    <span className="btn-holiday-artwork" aria-hidden="true">
      <svg viewBox="0 0 640 156" preserveAspectRatio="none" data-theme={theme}>
        <defs>
          <linearGradient id={`${idPrefix}-surface`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor={surface.colors[0]} />
            <stop offset="52%" stopColor={surface.colors[1]} />
            <stop offset="100%" stopColor={surface.colors[2]} />
          </linearGradient>
          <linearGradient id={`${idPrefix}-sheen`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#FFFFFF" stopOpacity=".32" />
            <stop offset="75%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${idPrefix}-clip`}>
            <path d={BUTTON_SHAPE} />
          </clipPath>
        </defs>

        <path d={BUTTON_SHAPE} fill={`url(#${idPrefix}-surface)`} />
        <g clipPath={`url(#${idPrefix}-clip)`}>
          {renderHolidayArtwork(theme)}
          <path d="M 28 14 L 530 14 L 496 65 L 46 53 Z" fill="#FFFFFF" opacity=".14" />
          <path d="M 24 87 L 566 80 L 610 138 L 40 146 Z" fill="#090B20" opacity=".24" />
          <rect width="640" height="156" fill={`url(#${idPrefix}-sheen)`} opacity=".18" />
        </g>
        <path
          d={BUTTON_SHAPE}
          fill="none"
          stroke={surface.edge}
          strokeWidth="2.3"
          strokeOpacity=".94"
        />
      </svg>
    </span>
  )
}

function renderHolidayArtwork(theme: HolidayThemeKey): ReactNode {
  switch (theme) {
    case 'halloween':
      return <HalloweenArtwork />
    case 'christmas':
      return <ChristmasArtwork />
    case 'newYear':
      return <NewYearArtwork />
    case 'easter':
      return <EasterArtwork />
    case 'independenceDay':
      return <IndependenceDayArtwork />
  }
}

function HalloweenArtwork() {
  return (
    <>
      <g
        data-motif="spiderweb"
        fill="none"
        stroke="#EBD9EF"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity=".78"
      >
        <path d="M 16 14 L 158 88 M 16 14 L 128 14 M 16 14 L 16 119 M 16 14 L 65 137 M 16 14 L 155 49 M 16 14 L 99 121" />
        <path d="M 36 25 Q 51 30 44 45 T 33 62 Q 49 66 42 81 T 29 98 M 64 40 Q 80 45 73 60 T 58 78 Q 76 82 68 99 T 47 116 M 94 56 Q 109 61 101 75 T 84 91" />
        <path d="M 624 142 L 490 77 M 624 142 L 520 142 M 624 142 L 624 47 M 624 142 L 565 28 M 624 142 L 505 111 M 624 142 L 548 55" />
        <path d="M 604 130 Q 589 126 596 111 T 608 94 Q 591 90 599 75 T 616 58 M 578 118 Q 563 114 571 99 T 584 81 Q 565 77 574 62 T 592 45" />
      </g>
      <g data-motif="ghost" transform="translate(122 48)">
        <path
          d="M 3 69 L 3 31 C 3 13 15 3 32 3 C 49 3 61 14 61 31 L 61 69 L 50 62 L 40 70 L 31 62 L 20 70 L 11 62 Z"
          fill="#FFF5E8"
          stroke="#D9C9EA"
          strokeWidth="2.2"
        />
        <ellipse cx="22" cy="35" rx="3.1" ry="4.2" fill="#42304F" />
        <ellipse cx="42" cy="35" rx="3.1" ry="4.2" fill="#42304F" />
        <ellipse cx="32" cy="46" rx="2.3" ry="3.1" fill="#42304F" />
        <path
          d="M 14 50 Q 18 54 21 50 M 43 50 Q 47 54 50 50"
          fill="none"
          stroke="#E39A8E"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      <g data-motif="hanging-spider" transform="translate(501 38)">
        <path d="M 0 -28 V -4" stroke="#EBD9EF" strokeWidth="1.6" />
        <ellipse cy="4" rx="8" ry="9.5" fill="#201529" stroke="#EBAA70" strokeWidth="1.8" />
        <circle cx="-2.5" cy="2" r="1.2" fill="#FFD48A" />
        <circle cx="2.5" cy="2" r="1.2" fill="#FFD48A" />
        <path
          d="M -6 0 L -13 -5 M -7 4 L -16 5 M -5 9 L -11 15 M 6 0 L 13 -5 M 7 4 L 16 5 M 5 9 L 11 15"
          stroke="#EBAA70"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <g data-motif="pumpkin" transform="translate(535 103)">
        <path
          d="M -2 -23 C -14 -25 -20 -15 -20 -2 C -20 12 -11 22 0 21 C 11 22 20 12 20 -2 C 20 -15 14 -25 2 -23 C 1 -30 3 -33 8 -35 C 2 -37 -2 -33 -2 -23 Z"
          fill="#EE913E"
          stroke="#FFD08C"
          strokeWidth="2"
        />
        <path
          d="M -12 -5 L -5 2 L -13 3 Z M 12 -5 L 5 2 L 13 3 Z M -9 10 Q 0 17 9 10 L 6 6 L 2 9 L -1 6 L -5 9 L -8 6 Z"
          fill="#43264C"
          stroke="#43264C"
          strokeLinejoin="round"
        />
        <path
          d="M -2 -23 Q 1 -28 7 -29"
          fill="none"
          stroke="#A9C889"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </g>
    </>
  )
}

function EasterArtwork() {
  return (
    <>
      <path
        d="M 0 110 C 115 67 224 68 324 101 S 520 136 640 93 L 640 126 C 510 164 415 149 315 119 S 113 100 0 140 Z"
        fill="#D6EFC7"
        opacity=".42"
      />
      <g data-motif="bunny" transform="translate(116 48)">
        <path
          d="M 17 35 C 11 17 12 -1 20 -3 C 29 -4 29 15 30 29 C 34 13 38 -3 47 0 C 56 4 48 25 45 37 C 57 43 62 54 58 67 C 54 82 39 89 25 85 C 10 82 2 69 5 55 C 6 46 10 40 17 35 Z"
          fill="#FFF1E2"
          stroke="#D7BDDB"
          strokeWidth="2.2"
        />
        <path
          d="M 19 4 C 17 15 18 24 21 32 M 43 8 C 41 19 39 27 36 33"
          fill="none"
          stroke="#E9A9BD"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <ellipse cx="23" cy="53" rx="2.4" ry="3.4" fill="#51415B" />
        <ellipse cx="42" cy="53" rx="2.4" ry="3.4" fill="#51415B" />
        <path d="M 30 61 Q 33 57 36 61 Q 34 65 33 65 Q 31 65 30 61 Z" fill="#D9899D" />
        <path
          d="M 27 68 Q 33 73 39 68"
          fill="none"
          stroke="#8D647E"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="15" cy="63" r="4" fill="#F1B4BE" opacity=".7" />
        <circle cx="50" cy="63" r="4" fill="#F1B4BE" opacity=".7" />
      </g>
      <g data-motif="easter-egg" transform="translate(528 100)">
        <path
          d="M 0 -30 C -16 -30 -26 -6 -25 12 C -24 30 -14 39 0 39 C 14 39 24 30 25 12 C 26 -6 16 -30 0 -30 Z"
          fill="#E9B6D6"
          stroke="#FFF0D4"
          strokeWidth="2.4"
        />
        <path
          d="M -22 -7 Q 0 2 22 -7 M -24 12 Q 0 4 24 12 M -18 27 Q 0 18 18 27"
          fill="none"
          stroke="#FFF5DE"
          strokeWidth="3.2"
        />
        <circle cx="-7" cy="-18" r="2.2" fill="#9ECBA1" />
        <circle cx="8" cy="20" r="2.2" fill="#E99D78" />
      </g>
      <g fill="#FFF1D8" opacity=".9" data-motif="spring-sparkles">
        <path d="M 205 43 L 208 50 L 215 53 L 208 56 L 205 63 L 202 56 L 195 53 L 202 50 Z" />
        <path d="M 463 91 L 465 96 L 470 98 L 465 100 L 463 105 L 461 100 L 456 98 L 461 96 Z" />
      </g>
    </>
  )
}

function ChristmasArtwork() {
  return (
    <>
      <path
        d="M 0 130 C 145 108 235 132 335 139 S 530 128 640 103 L 640 156 L 0 156 Z"
        fill="#9B3442"
        opacity=".46"
      />
      <path
        d="M 42 29 C 132 12 209 19 285 30 S 437 44 518 27 S 596 15 625 25"
        fill="none"
        stroke="#EBD18A"
        strokeWidth="2.4"
      />
      <g data-motif="tree-lights" fill="#FFE08C" stroke="#FFF2C8" strokeWidth="1">
        <circle cx="78" cy="23" r="4" />
        <circle cx="156" cy="20" r="4.2" />
        <circle cx="234" cy="24" r="4" />
        <circle cx="314" cy="33" r="4" />
        <circle cx="395" cy="34" r="4.2" />
        <circle cx="477" cy="28" r="4" />
        <circle cx="552" cy="20" r="4" />
      </g>
      <g data-motif="christmas-tree" transform="translate(126 30)">
        <path
          d="M 0 -8 L 4 0 L 13 1 L 6 7 L 8 16 L 0 12 L -8 16 L -6 7 L -13 1 L -4 0 Z"
          fill="#FFE28B"
          stroke="#FFF1B8"
          strokeWidth="1"
        />
        <path d="M 0 8 L -29 47 L 29 47 Z" fill="#37845A" stroke="#9CCB9E" strokeWidth="1.8" />
        <path d="M 0 30 L -39 76 L 39 76 Z" fill="#286D4B" stroke="#9CCB9E" strokeWidth="1.8" />
        <path d="M 0 55 L -48 105 L 48 105 Z" fill="#1D5C42" stroke="#9CCB9E" strokeWidth="1.8" />
        <path d="M -7 105 H 7 V 119 H -7 Z" fill="#9D674B" />
        <path
          d="M -22 52 Q 0 64 23 52 M -31 80 Q 0 94 32 79"
          fill="none"
          stroke="#EBCB76"
          strokeWidth="2.4"
        />
        <g fill="#E66D6C" stroke="#FFDCA2" strokeWidth="1.2">
          <circle cx="-13" cy="48" r="4" />
          <circle cx="13" cy="54" r="4" />
          <circle cx="-22" cy="77" r="4.2" />
          <circle cx="10" cy="75" r="4" />
          <circle cx="26" cy="85" r="4" />
        </g>
      </g>
      <g data-motif="presents" transform="translate(489 105)">
        <path d="M -21 -11 H 16 V 20 H -21 Z" fill="#B94250" stroke="#FFD18E" strokeWidth="1.8" />
        <path d="M -4 -11 V 20 M -21 0 H 16" stroke="#F5D88A" strokeWidth="4" />
        <path
          d="M -4 -12 C -23 -14 -22 -28 -13 -27 C -7 -26 -5 -18 -4 -12 C -2 -21 5 -29 11 -25 C 18 -20 7 -13 -4 -12 Z"
          fill="#E9C66F"
          stroke="#FFF0BD"
          strokeWidth="1.4"
        />
        <path d="M 22 -1 H 51 V 23 H 22 Z" fill="#D9A64F" stroke="#FFE5A5" strokeWidth="1.6" />
        <path d="M 36 -1 V 23 M 22 8 H 51" stroke="#F8E6AF" strokeWidth="3" />
      </g>
      <g data-motif="candy-canes" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 553 111 V 83 C 553 68 576 68 576 83 V 92" stroke="#FFF0DB" strokeWidth="9" />
        <path
          d="M 553 106 V 83 C 553 72 568 72 571 81 M 572 88 V 93"
          stroke="#D94E57"
          strokeWidth="3.5"
        />
        <path d="M 584 114 V 95 C 584 82 603 82 603 95 V 101" stroke="#FFF0DB" strokeWidth="8" />
        <path
          d="M 584 110 V 95 C 584 85 596 85 599 93 M 599 98 V 102"
          stroke="#D94E57"
          strokeWidth="3.2"
        />
      </g>
    </>
  )
}

function NewYearArtwork() {
  return (
    <>
      <g data-motif="fireworks" fill="none" stroke="#F6D98F" strokeLinecap="round">
        <g strokeWidth="2.6">
          <path d="M 107 73 V 32 M 107 73 L 81 47 M 107 73 L 134 47 M 107 73 L 72 74 M 107 73 L 143 74 M 107 73 L 84 103 M 107 73 L 131 103" />
          <path d="M 546 72 V 35 M 546 72 L 521 47 M 546 72 L 571 47 M 546 72 L 511 73 M 546 72 L 581 73 M 546 72 L 525 102 M 546 72 L 568 102" />
        </g>
        <g strokeWidth="1.5" opacity=".78">
          <path d="M 107 35 V 23 M 88 53 L 78 44 M 80 73 H 68 M 134 73 H 146 M 90 95 L 82 105 M 125 95 L 133 105" />
          <path d="M 546 38 V 25 M 527 53 L 517 44 M 519 72 H 507 M 572 72 H 584 M 530 94 L 522 104 M 562 94 L 570 104" />
        </g>
      </g>
      <g data-motif="midnight-clock" transform="translate(168 82)">
        <circle r="31" fill="#18234B" stroke="#F5D891" strokeWidth="3" />
        <circle r="25" fill="none" stroke="#F5D891" strokeWidth="1" strokeOpacity=".62" />
        <g stroke="#F6E7BC" strokeWidth="2.2" strokeLinecap="round">
          <path d="M 0 -21 V -17 M 21 0 H 17 M 0 21 V 17 M -21 0 H -17" />
        </g>
        <path
          d="M 0 0 V -16 M 0 0 L 13 -6"
          stroke="#FFE9A9"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle r="3.2" fill="#FFF1C6" />
      </g>
      <text
        data-motif="new-year-number"
        x="504"
        y="92"
        textAnchor="middle"
        fill="#FFE2A0"
        fontSize="28"
        fontWeight="800"
        letterSpacing="1.5"
      >
        2027
      </text>
      <path
        d="M 38 138 C 188 128 433 149 600 121"
        fill="none"
        stroke="#E7C978"
        strokeWidth="2"
        strokeOpacity=".72"
      />
      <g fill="#FFE9AD" opacity=".9">
        <circle cx="229" cy="48" r="2.3" />
        <circle cx="260" cy="111" r="1.8" />
        <circle cx="410" cy="43" r="2.2" />
        <circle cx="438" cy="106" r="1.8" />
      </g>
    </>
  )
}

function IndependenceDayArtwork() {
  return (
    <>
      <g data-motif="flag-stripes" opacity=".72">
        <path
          d="M 0 102 C 128 79 220 83 320 105 S 510 129 640 96 V 111 C 508 145 414 133 316 114 S 130 97 0 119 Z"
          fill="#D85A67"
        />
        <path
          d="M 0 130 C 128 107 220 111 320 133 S 510 157 640 124 V 139 C 508 173 414 161 316 142 S 130 125 0 147 Z"
          fill="#F2E9E6"
          opacity=".92"
        />
      </g>
      <g data-motif="stars" fill="#FFF0C8">
        <path d="M 114 38 L 118 48 L 129 49 L 121 56 L 123 67 L 114 62 L 105 67 L 107 56 L 99 49 L 110 48 Z" />
        <path d="M 526 46 L 529 53 L 537 54 L 531 59 L 533 67 L 526 63 L 519 67 L 521 59 L 515 54 L 523 53 Z" />
        <circle cx="158" cy="82" r="2.3" />
        <circle cx="484" cy="82" r="2" />
        <circle cx="461" cy="48" r="1.8" />
      </g>
      <path
        d="M 38 139 C 185 127 432 151 601 120"
        fill="none"
        stroke="#E5C778"
        strokeWidth="2"
        opacity=".7"
      />
    </>
  )
}

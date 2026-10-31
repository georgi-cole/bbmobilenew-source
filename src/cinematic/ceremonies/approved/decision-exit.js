// Shared lab choreography. No game state, routing or ceremony hooks.
import { ROLE_PACKS, ROLE_CASTS } from './role-contract.js'
export const DECISION_IDS = ['exit', 'tiebreak', 'final4', 'final3']
const common = [
  'cinema_hall',
  'cinema_portal',
  'cinema_exitC',
  'cinema_avatarC',
  'cinema_eliminatedStamp',
]
const people = [
  'cinema_standA',
  'cinema_standB',
  'cinema_standC',
  'cinema_decisionA',
  'cinema_decisionB',
]
export const DECISION_CONFIG = Object.fromEntries(
  DECISION_IDS.map((id) => {
    const suspense = id === 'final4' || id === 'final3',
      exitAt = id === 'exit' ? 0 : suspense ? 4400 : 3200,
      avatarAt = exitAt + 4600,
      duration = avatarAt + 5600
    return [
      id,
      {
        duration,
        exitAt,
        avatarAt,
        art: [
          ...common,
          ...(id === 'exit' ? [] : people),
          ...(['final4', 'exit'].includes(id) ? [] : ['cinema_crown']),
        ],
        description:
          id === 'exit'
            ? 'The new Hub exit: a continuous walk through the doorway, doors close, then the camera pushes into the exit and hands off to the game’s portrait elimination treatment.'
            : (id === 'final4'
                ? 'The Safety holder faces the two nominees; the protected LOH stays off-stage.'
                : id === 'final3'
                  ? 'The final LOH faces the other two finalists.'
                  : 'The LOH faces both nominees after a 4–4 tie.') +
              ' A decision isolates Player C in light. They leave through the Hub doors, followed by a camera push into the familiar avatar elimination treatment.',
        beats: [
          ...(exitAt
            ? [
                [
                  '00.0',
                  id === 'final4'
                    ? 'Safety holder faces the two nominees'
                    : 'The LOH faces both nominees',
                ],
                [
                  suspense ? '03.2' : '01.9',
                  'The decision lands; only the eliminated player stays lit',
                ],
              ]
            : []),
          [(exitAt / 1000).toFixed(1), 'A continuous walk through the Hub exit'],
          [((exitAt + 3900) / 1000).toFixed(1), 'Doors close; the camera approaches'],
          [(avatarAt / 1000).toFixed(1), 'The game’s avatar elimination treatment'],
        ],
        moments: exitAt
          ? [
              1100,
              ...(suspense ? [2100, 3100, 3900] : [2650]),
              exitAt + 1800,
              exitAt + 3400,
              avatarAt + 2700,
            ]
          : [1100, 2600, 4000, avatarAt + 2700],
      },
    ]
  })
)
const art = (key, cls, layer = 'props') =>
  '<img data-resource="' +
  key +
  '" class="' +
  cls +
  ' cine-layer" data-layer="' +
  layer +
  '" alt="">'
const person = (key, cls, label) =>
  '<div class="decision-person ' +
  cls +
  ' cine-layer" data-layer="actors"><i class="decision-contact"></i>' +
  art(key, 'decision-body', 'actors') +
  '<span class="decision-badge">' +
  label +
  '</span></div>'
export function makeDecisionScene(id, images, cast = 0, { nativeHandoff = false } = {}) {
  const suspense = id === 'final4' || id === 'final3',
    order = ROLE_CASTS[cast] || ROLE_CASTS[0],
    holder = id === 'final4' ? order[1] : order[0],
    survivor = id === 'final4' ? order[0] : order[1],
    label = 'PLAYER ' + holder.toUpperCase(),
    holderPose = ROLE_PACKS[holder].poses.decisionBack
  const root = document.createElement('div')
  root.className = 'c-scene cinema-v2 cinema-v3 cinema-v4 decision-film film-' + id
  root.dataset.cast = cast
  root.dataset.evictee = 'c'
  if (suspense) root.classList.add('suspense-decision')
  root.setAttribute('aria-hidden', 'true')
  const role = id === 'final4' ? 'SAFETY HOLDER · SOLE VOTE' : 'LEADER OF THE HUB'
  const departing = (cls) =>
    '<div class="cine-departure ' +
    cls +
    ' cine-layer" data-layer="actors">' +
    art('cinema_exitC', 'cine-rear', 'actors') +
    '</div>'
  const decision =
    id === 'exit'
      ? ''
      : '<div class="decision-shot"><div class="decision-camera">' +
        art('cinema_hall', 'decision-bg', 'set') +
        '<div class="decision-room-dim cine-layer" data-layer="light"></div>' +
        person(
          ROLE_PACKS[survivor].poses.ceremonyFront,
          'decision-survivor',
          'PLAYER ' + survivor.toUpperCase() + ' · NOMINEE'
        ) +
        '<div class="decision-survivor-shade"></div><div class="decision-spotlight cine-layer" data-layer="light"></div>' +
        person('cinema_standC', 'decision-evictee', 'PLAYER C · NOMINEE') +
        person(holderPose, 'decision-holder', label + ' · ' + role) +
        (id === 'final4' ? '' : art('cinema_crown', 'decision-insignia crown')) +
        '<div class="decision-holder-shade"></div></div><div class="decision-intro cine-layer" data-layer="titles">' +
        (id === 'tiebreak'
          ? '4–4 · THE LOH BREAKS THE TIE'
          : id === 'final4'
            ? 'FINAL FOUR · THE LOH IS ALREADY SAFE'
            : 'FINAL THREE · THE LOH MUST CHOOSE') +
        '</div><div class="decision-verdict cine-layer" data-layer="titles"><span>' +
        label +
        (id === 'final4' ? ' CASTS THE ONLY VOTE' : ' MAKES THE DECISION') +
        '</span><h3>Player C</h3><p>' +
        (id === 'tiebreak'
          ? 'ELIMINATED · 5–4'
          : id === 'final4'
            ? 'ELIMINATED · 1–0'
            : 'ELIMINATED · THIRD PLACE') +
        '</p></div></div>'
  root.innerHTML =
    decision +
    (suspense
      ? '<div class="decision-suspense cine-layer" data-layer="titles">' +
        (id === 'final4' ? 'ONE VOTE. NO WAY BACK.' : 'ONE PLACE IN THE FINAL TWO.') +
        '</div>'
      : '') +
    '<div class="exit-shot"><div class="exit-camera">' +
    art('cinema_hall', 'exit-background', 'set') +
    departing('departure-near') +
    '<div class="doorway-volume">' +
    departing('departure-far') +
    '</div><div class="cine-gates cine-layer" data-layer="props">' +
    art('cinema_portal', 'cine-gate gate-left') +
    art('cinema_portal', 'cine-gate gate-right') +
    '</div><div class="exit-light cine-layer" data-layer="light"></div></div><div class="exit-caption cine-layer" data-layer="titles"><span>PLAYER C</span><h3>One last goodbye.</h3><p>LEAVING THE HUB</p></div></div><div class="decision-cut cine-layer" data-layer="light"></div><div class="handoff-veil cine-layer" data-layer="light"></div>' +
    (nativeHandoff
      ? ''
      : '<div class="avatar-sequence"><div class="avatar-stage"><div class="avatar-dim"></div><div class="avatar-hero cine-layer" data-layer="actors">' +
        art('cinema_avatarC', 'avatar-photo avatar-colour', 'actors') +
        art('cinema_avatarC', 'avatar-photo avatar-grade', 'actors') +
        '<div class="avatar-vignette"></div><div class="avatar-scanlines"></div></div><div class="avatar-live cine-layer" data-layer="titles">LIVE</div><div class="avatar-lower-third cine-layer" data-layer="titles"><span>' +
        (id === 'final3' ? 'THIRD PLACE' : 'ELIMINATED FROM THE HUB') +
        '</span><h3>Player C</h3></div>' +
        art('cinema_eliminatedStamp', 'avatar-stamp', 'titles') +
        '<div class="avatar-roster-label">PLAYER C · ELIMINATED</div></div></div>') +
    '<div class="cine-letterbox letterbox-top"></div><div class="cine-letterbox letterbox-bottom"></div><div class="cine-sequence">THE BIG EYE <i></i> CEREMONY FILM</div>'
  for (const node of root.querySelectorAll('[data-resource]')) {
    const key = node.dataset.resource
    if (!images[key]) throw new Error('Missing resource ' + key)
    const img = images[key].cloneNode()
    img.className = node.className
    img.dataset.layer = node.dataset.layer
    img.dataset.resource = key
    img.alt = ''
    img.draggable = false
    node.replaceWith(img)
  }
  const holderNode = root.querySelector('.decision-holder')
  if (holderNode) {
    const insignia = root.querySelector('.decision-insignia')
    if (insignia) holderNode.append(insignia)
    for (const node of root.querySelectorAll('.decision-holder,.decision-survivor')) {
      const shade = node.querySelector('.decision-body').cloneNode()
      shade.classList.add('decision-dark-body')
      node.insertBefore(shade, node.querySelector('.decision-badge'))
    }
  }
  return root
}
export function animateDecisionScene(id, root, a, { nativeHandoff = false } = {}) {
  const suspense = id === 'final4' || id === 'final3'
  const pairedExit = root.classList.contains('paired-film')
  const { duration: d, exitAt: e, avatarAt: v } = DECISION_CONFIG[id],
    smooth = 'cubic-bezier(.16,1,.3,1)'
  const hold = (sel, frames) => a(sel, [...frames, [d, frames.at(-1)[1], frames.at(-1)[2]]])
  a(root, [
    [0, 1],
    [d - 220, 1],
    [d, 0],
  ])
  if (e) {
    hold('.decision-shot', [
      [0, 1],
      [e - 1, 1, undefined, 'steps(1,end)'],
      [e, 0],
    ])
    hold(
      '.decision-camera',
      suspense
        ? [
            [0, 1, 'translateY(1%) scale(1.08)', smooth],
            [850, 1, 'translateX(0) translateY(0) scale(1)', 'cubic-bezier(.45,0,.25,1)'],
            [1750, 1, 'translateX(8%) translateY(2%) scale(1.18)'],
            [2250, 1, 'translateX(8%) translateY(2%) scale(1.18)', 'cubic-bezier(.45,0,.25,1)'],
            [3150, 1, 'translateX(-24%) translateY(5%) scale(1.42)'],
            [e, 1, 'translateX(-27%) translateY(6%) scale(1.5)'],
          ]
        : [
            [0, 1, 'translateY(2%) scale(1.13)', smooth],
            [1050, 1, 'translateY(0) scale(1)'],
            [1900, 1, 'translateX(0) scale(1)'],
            [2900, 1, 'translateX(-3%) scale(1.07)'],
          ]
    )
    const decisionBeat = (sel, frames) =>
      hold(
        sel,
        frames.map(([t, ...rest]) => [
          suspense && t >= 1700 ? t + (t <= 1900 ? 900 : 1000) : t,
          ...rest,
        ])
      )
    if (suspense)
      hold('.decision-suspense', [
        [0, 0, 'translateY(5px)'],
        [1750, 0, 'translateY(5px)'],
        [2150, 0.8, 'translateY(0)'],
        [2550, 0.8],
        [2900, 0],
      ])
    hold('.decision-intro', [
      [0, 0, 'translateY(-12px)'],
      [650, 1, 'translateY(0)'],
      [1550, 1],
      [1850, 0],
    ])
    decisionBeat('.decision-holder', [
      [0, 1, 'translateX(-4%) rotate(-2deg)', smooth],
      [1300, 1, 'translateX(0) rotate(0deg)'],
      [1700, 1, 'translateX(0) rotate(0deg)'],
      [2150, 1, 'translateX(1%) rotate(1deg)'],
    ])
    decisionBeat('.decision-room-dim', [
      [0, 0],
      [1800, 0],
      [2250, 0.82],
    ])
    decisionBeat('.decision-holder-shade', [
      [0, 0],
      [1900, 0],
      [2350, 0.77],
    ])
    decisionBeat('.decision-holder .decision-dark-body', [
      [0, 0],
      [1900, 0],
      [2350, 1],
    ])
    decisionBeat(
      '.decision-holder .decision-badge,.decision-holder .decision-insignia,.decision-survivor .decision-badge',
      [
        [0, 1],
        [1900, 1],
        [2350, 0.18],
      ]
    )
    decisionBeat('.decision-survivor .decision-dark-body', [
      [0, 0],
      [1850, 0],
      [2300, 1],
    ])
    decisionBeat('.decision-survivor-shade', [
      [0, 0],
      [1850, 0],
      [2300, 0.82],
    ])
    decisionBeat('.decision-spotlight', [
      [0, 0, 'scaleX(.65)'],
      [1800, 0, 'scaleX(.65)'],
      [2300, 0.8, 'scaleX(1)'],
    ])

    decisionBeat('.decision-verdict', [
      [0, 0, 'translateY(16px)'],
      [2150, 0, 'translateY(16px)', smooth],
      [2600, 1, 'translateY(0)'],
    ])
    hold('.decision-cut', [
      [0, 0],
      [e - 180, 0],
      [e - 45, 1],
      [e + 65, 1],
      [e + 310, 0],
    ])
  }
  hold('.exit-shot', [
    [0, e ? 0 : 1, undefined, 'steps(1,end)'],
    ...(e ? [[e, 1]] : []),
    [v + 120, 1, undefined, 'steps(1,end)'],
    [v + 121, 0],
  ])
  const path = [
    [e, 1, 'translateY(7%) scale(1)'],
    ...(pairedExit
      ? [
          [e + 650, 1, 'translateY(2%) scale(.98)'],
          [e + 1300, 1, 'translateY(-12%) scale(.9)'],
          [e + 1900, 1, 'translateY(-30%) scale(.78)'],
          [e + 2300, 1, 'translateY(-46%) scale(.65)'],
          [e + 3000, 1, 'translateY(-63%) scale(.55)'],
          [e + 3400, 1, 'translateY(-67%) scale(.52)'],
        ]
      : [
          [e + 650, 1, 'translateY(-8%) scale(.92)'],
          [e + 1300, 1, 'translateY(-28%) scale(.8)'],
          [e + 1900, 1, 'translateY(-47%) scale(.68)'],
          [e + 2300, 1, 'translateY(-61%) scale(.6)'],
          [e + 3000, 1, 'translateY(-82%) scale(.48)'],
        ]),
  ]
  for (const selector of ['.departure-near', '.departure-far'])
    a(selector, [
      [0, 1, 'translateY(7%) scale(1)'],
      ...path.filter((x) => x[0] > 0),
      [d, 1, path.at(-1)[2]],
    ])
  const thresholdAt = pairedExit ? e + 3000 : e + 2300
  // Binary depth transfer at the threshold. Both sprites stay fully opaque.
  hold('.departure-near .cine-rear', [
    [0, 1],
    [thresholdAt - 1, 1, undefined, 'steps(1,end)'],
    [thresholdAt, 0],
  ])
  hold('.departure-far .cine-rear', [
    [0, 0, undefined, 'steps(1,end)'],
    [thresholdAt, 1],
  ])
  for (const [sel, dir, mirror] of [
    ['.gate-left', -1, ''],
    ['.gate-right', 1, ' scaleX(-1)'],
  ]) {
    const open = 'translateX(' + dir * 105 + '%)' + mirror
    const closed = 'translateX(0)' + mirror
    hold(
      sel,
      pairedExit
        ? [
            [0, 1, closed],
            [e + 500, 1, open],
            [e + 3300, 1, open, 'cubic-bezier(.45,0,.2,1)'],
            [e + 3900, 1, closed],
          ]
        : [
            [0, 1, open],
            [e + 3200, 1, open, 'cubic-bezier(.45,0,.2,1)'],
            [e + 3900, 1, closed],
          ]
    )
  }
  hold('.exit-camera', [
    [0, 1, 'scale(1.02)'],
    [e + 3300, 1, 'scale(1.02)'],
    [e + 3900, 1, 'scale(1.05)', 'cubic-bezier(.6,.05,.55,1)'],
    [v + 140, 1, 'scale(4.8)'],
  ])
  hold('.exit-light', [
    [0, 0.5],
    [e + 3000, 0.35],
    [e + 3900, 0.05],
  ])
  hold('.exit-caption', [
    [0, 0],
    [e + 250, 0, 'translateY(10px)'],
    [e + 750, 1, 'translateY(0)'],
    [e + 3000, 1],
    [e + 3450, 0],
  ])
  hold('.handoff-veil', [
    [0, 0],
    [v - 200, 0],
    [v + 40, 0.96],
    [v + 170, 0.96],
    [v + 470, 0],
  ])
  if (nativeHandoff) return
  hold('.avatar-sequence', [
    [0, 0, undefined, 'steps(1,end)'],
    [v + 80, 1],
  ])
  // Runtime omits this laboratory portrait recreation. Premium departures
  // reveal the original roster confirmation and commit through its outcome
  // callback once; Standard/fallback keep SpotlightEvictionOverlay.
  // Local preview of SpotlightEvictionOverlay's 5.4s portrait choreography.
  // Reuse its actual stamp artwork and timing; no Redux/game callbacks are invoked.
  hold('.avatar-hero', [
    [0, 1, 'translateY(-8%) scale(1.12)'],
    [v + 80, 1, 'translateY(-8%) scale(1.12)', smooth],
    [v + 560, 1, 'translateY(0) scale(1)'],
    [v + 4800, 1, 'translateY(0) scale(1)', 'cubic-bezier(.25,.46,.45,.94)'],
    [v + 5400, 1, 'translateY(30%) scale(.19)'],
  ])
  hold('.avatar-photo', [
    [0, 1, 'translateY(0) scale(1)'],
    [v + 900, 1, 'translateY(0) scale(1)'],
    [v + 1800, 1, 'translateY(-1%) scale(1.04)'],
  ])
  // Static graded copy is crossfaded once: no animated blur or colour filter.
  hold('.avatar-grade', [
    [0, 0],
    [v + 1800, 0],
    [v + 2150, 1],
  ])
  hold('.avatar-vignette', [
    [0, 0],
    [v + 1800, 0],
    [v + 2150, 1],
  ])
  hold('.avatar-live', [
    [0, 0],
    [v + 750, 0],
    [v + 900, 1],
    [v + 4650, 1],
    [v + 4800, 0],
  ])
  hold('.avatar-lower-third', [
    [0, 0, 'translateY(110%)'],
    [v + 2100, 0, 'translateY(110%)'],
    [v + 2320, 1, 'translateY(0)'],
    [v + 4650, 1],
    [v + 4800, 0, 'translateY(110%)'],
  ])
  hold('.avatar-stamp', [
    [0, 0, 'translate(-50%,-50%) scale(2.4) rotate(-14deg)'],
    [v + 2160, 0, 'translate(-50%,-50%) scale(2.4) rotate(-14deg)'],
    [v + 2390, 1, 'translate(-50%,-50%) scale(.96) rotate(-12deg)'],
    [v + 2490, 1, 'translate(-50%,-50%) scale(1) rotate(-12deg)'],
    [v + 4650, 1, 'translate(-50%,-50%) scale(1) rotate(-12deg)'],
    [v + 4770, 0, 'translate(-50%,-50%) scale(.7) rotate(-12deg)'],
  ])
  hold('.avatar-roster-label', [
    [0, 0],
    [v + 5200, 0],
    [v + 5400, 1],
  ])
}

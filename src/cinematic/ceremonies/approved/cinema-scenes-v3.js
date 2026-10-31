import { ROLE_PACKS, ROLE_CASTS } from './role-contract.js'
export const CINEMA_IDS = ['tiebreak', 'ambush', 'allPower', 'shock', 'final4', 'final3']
const actors = Object.values(ROLE_PACKS).map((p) => p.poses.ceremonyFront)
const shared = ['cinema_hall', 'cinema_atmosphere', 'cinema_portal']
export const CINEMA_CONFIG = {
  tiebreak: {
    duration: 7000,
    art: [...shared, ...actors.slice(0, 2), 'cinema_console', 'cinema_token'],
    description:
      'The votes are tied 4–4. The LOH’s gold deciding vote lands and travels to its target; the tally changes to 5–4 and the eliminated nominee is identified.',
    beats: [
      ['00.0', 'Enter the chamber: a 4–4 tie'],
      ['01.9', 'The LOH’s deciding vote lands'],
      ['03.7', 'The vote reaches its target: 5–4'],
    ],
    moments: [1000, 2800, 5200],
  },
  ambush: {
    duration: 7000,
    art: [...shared, ...actors, 'cinema_shield'],
    description:
      'Safety rescues one initial nominee, visibly opening a replacement slot. The camera crosses the room as the portal reveals the hidden target; red light locks the new nominee onto the block.',
    beats: [
      ['00.0', 'The original nominees'],
      ['01.4', 'Safety opens a replacement slot'],
      ['03.1', 'The ambush target is nominated'],
    ],
    moments: [900, 2000, 4700],
  },
  allPower: {
    duration: 8600,
    art: [
      'cinema_royalRoom',
      'cinema_city',
      'cinema_throne',
      'cinema_standA',
      'cinema_seatedA',
      'cinema_shield',
      'cinema_crown',
      'cinema_atmosphere',
      'cinema_portal',
    ],
    description:
      'Enter the royal room, receive Safety and reveal the seated holder of both powers. The camera then passes the throne and approaches the city through the real window aperture before the final title.',
    beats: [
      ['00.0', 'Enter the royal room'],
      ['01.5', 'Safety joins the crown'],
      ['02.9', 'The sovereign is revealed'],
      ['04.4', 'Pass the throne and approach the city'],
    ],
    moments: [900, 2300, 4100, 6400, 7800],
  },
  shock: {
    duration: 6200,
    art: ['cinema_shockRoom', 'cinema_city', 'cinema_atmosphere', 'cinema_portal'],
    description:
      'The camera pulls away from the city watched through the Eye. The broadcast is interrupted by an aperture sweep, moving light rings and a visual cue specific to the selected shock.',
    beats: [
      ['00.0', 'The Eye watches the city'],
      ['01.8', 'The broadcast is interrupted'],
      ['02.5', 'The actual twist is announced'],
    ],
    moments: [900, 2100, 4400],
  },
  final4: {
    duration: 7200,
    art: [...shared, ...actors, 'cinema_console', 'cinema_token', 'cinema_shield'],
    description:
      'Three eligible players enter. The Safety holder is protected in gold; their single vote travels to one of the two nominees. A clear 1–0 verdict identifies who leaves. The LOH stays off-stage.',
    beats: [
      ['00.0', 'Safety holder and two nominees'],
      ['01.9', 'The holder casts the only vote'],
      ['03.8', 'The 1–0 verdict is revealed'],
    ],
    moments: [1000, 2800, 5400],
  },
  final3: {
    duration: 8400,
    art: [...shared, ...actors, 'cinema_exitC', 'cinema_crown'],
    description:
      'The final LOH names the third-place finisher. After the camera changes, the player walks all the way to the threshold, passes inside the doorway without fading, and is hidden by the closing doors.',
    beats: [
      ['00.0', 'The final LOH faces two finalists'],
      ['02.0', 'Third place is named'],
      ['03.0', 'The player reaches and crosses the doorway'],
    ],
    moments: [1300, 4000, 5100, 6100, 7400],
  },
}

const art = (key, cls, layer = 'props') =>
  `<img data-cinema-art="${key}" class="${cls} cine-layer" data-layer="${layer}" alt="">`
const actor = (key, role, { crown = false, badge = '' } = {}) =>
  `<div class="cine-person ${role} cine-layer" data-layer="actors"><div class="cine-reflection">${art(key, 'cine-reflected-body', 'actors')}</div><i class="cine-contact"></i>${art(key, 'cine-body', 'actors')}${crown ? art('cinema_crown', 'cine-crown', 'props') : ''}${badge ? `<div class="actor-badge">${badge}</div>` : ''}</div>`
const bg = (key) => art(key, 'cine-bg', 'set')
const gates = () =>
  `<div class="cine-gates cine-layer" data-layer="props">${art('cinema_portal', 'cine-gate gate-left')}${art('cinema_portal', 'cine-gate gate-right')}</div>`
const title = (kicker, heading, sub) =>
  `<div class="cine-titles cine-layer" data-layer="titles"><span>${kicker}</span><h3>${heading}</h3><p>${sub}</p><i></i></div>`
const beat = (cls, txt) =>
  `<div class="cine-beat ${cls} cine-layer" data-layer="titles">${txt}</div>`
const voting = () =>
  `<div class="cine-voting cine-layer" data-layer="props">${art('cinema_console', 'cine-console')}${art('cinema_token', 'cine-token')}<i class="cine-token-light"></i><div class="vote-caption">ONE DECIDING VOTE</div></div>`
const tally = (cls, left, right) =>
  `<div class="vote-tally ${cls} cine-layer" data-layer="titles"><b>${left}</b><i>–</i><b>${right}</b></div>`
const bracket = (name) =>
  `<div class="verdict-bracket cine-layer" data-layer="light"><i></i><i></i><span>${name} · ELIMINATED</span></div>`
const royalRoom = () =>
  `<div class="city-depth cine-layer" data-layer="set">${art('cinema_city', 'city-plate', 'set')}<i class="city-light city-light-a"></i><i class="city-light city-light-b"></i></div><div class="royal-room-plane">${art('cinema_royalRoom', 'cine-bg royal-window-room', 'set')}<div class="royal-glass cine-layer" data-layer="light"><i></i><i></i></div></div>`
const shockRoom = () =>
  `<div class="eye-city-depth cine-layer" data-layer="set">${art('cinema_city', 'eye-city-plate', 'set')}</div>${art('cinema_shockRoom', 'cine-bg eye-window-room', 'set')}`
const pulse = () =>
  '<div class="ceremony-energy cine-layer" data-layer="light"><i class="energy-ring ring-a"></i><i class="energy-ring ring-b"></i><i class="energy-core"></i></div>'
const entrance = () =>
  `<div class="depth-entrance cine-layer" data-layer="props"><div class="entrance-wing wing-left">${art('cinema_portal', 'entrance-panel')}</div><div class="entrance-wing wing-right">${art('cinema_portal', 'entrance-panel')}</div></div><div class="foreground-jamb jamb-left cine-layer" data-layer="props"></div><div class="foreground-jamb jamb-right cine-layer" data-layer="props"></div>`

export function makeCinemaScene(id, images, variant, cast = 0) {
  const order = ROLE_CASTS[cast] || ROLE_CASTS[0],
    a = ROLE_PACKS[order[0]].poses.ceremonyFront,
    b = ROLE_PACKS[order[1]].poses.ceremonyFront,
    c = ROLE_PACKS.c.poses.ceremonyFront
  const names = order.map((x) => 'Player ' + x.toUpperCase())
  const root = document.createElement('div')
  root.className = `c-scene c-${id} cinema-v2 cinema-v3 film-${id}`
  root.dataset.cast = cast
  root.setAttribute('aria-hidden', 'true')
  let wide = '',
    detail = '',
    copy = '',
    extra = ''
  if (id === 'tiebreak') {
    wide =
      bg('cinema_hall') +
      actor(a, 'role-left', { badge: names[0] }) +
      actor(b, 'role-right', { badge: names[1] }) +
      voting() +
      tally('tally-before', '4', '4') +
      tally('tally-after', '4', '5') +
      art('cinema_token', 'vote-flight') +
      bracket(names[1]) +
      '<div class="verdict-trail"></div>'
    detail = bg('cinema_hall') + voting()
    copy = title(
      'TIEBREAK · LOH’S DECIDING VOTE',
      names[1] + ' is eliminated.',
      '5–4. THE LOH BROKE THE TIE.'
    )
    extra =
      beat('beat-initial', 'THE VOTE IS TIED · 4–4') +
      beat('beat-action', 'THE LOH CASTS THE DECIDING VOTE')
  }
  if (id === 'final4') {
    wide =
      bg('cinema_hall') +
      actor(a, 'role-left f4-left', { badge: names[0] + ' · NOMINEE' }) +
      actor(b, 'role-center f4-center', { badge: names[1] + ' · SAFETY' }) +
      actor(c, 'role-right f4-right', { badge: names[2] + ' · NOMINEE' }) +
      art('cinema_shield', 'cine-small-shield') +
      art('cinema_token', 'vote-flight') +
      tally('tally-after', '0', '1') +
      bracket(names[2]) +
      '<div class="verdict-trail"></div><div class="safety-spotlight"></div>'
    detail = bg('cinema_hall') + voting()
    copy = title(
      'FINAL FOUR · THE SOLE VOTE',
      names[2] + ' is eliminated.',
      '1–0. ' + names[1].toUpperCase() + ' CAST THE ONLY VOTE.'
    )
    extra =
      beat('beat-initial', 'THE LOH IS SAFE · THREE PLAYERS IN THE CEREMONY') +
      beat('beat-action', names[1].toUpperCase() + ' HOLDS SAFETY AND THE SOLE VOTE')
  }
  if (id === 'ambush') {
    wide =
      bg('cinema_hall') +
      actor(a, 'role-left ambush-original-left', { badge: names[0] }) +
      actor(b, 'role-right ambush-original-right', { badge: names[1] }) +
      art('cinema_shield', 'ambush-save-shield') +
      '<div class="slot-open">SAVED<br><span>REPLACEMENT SLOT OPEN</span></div>'
    detail =
      bg('cinema_hall') +
      actor(a, 'role-back-left', { badge: 'SAVED' }) +
      actor(b, 'role-back-right', { badge: 'NOMINATED' }) +
      '<div class="cine-danger cine-layer" data-layer="light"></div><div class="cine-danger-ring cine-layer" data-layer="light"></div>' +
      actor(c, 'role-target', { badge: names[2] }) +
      gates() +
      '<div class="nomination-lock lock-left"></div><div class="nomination-lock lock-right"></div>'
    copy = title(
      'AMBUSH · THE REPLACEMENT NOMINEE',
      names[2] + ' is nominated.',
      'SAFETY SAVED ' + names[0].toUpperCase() + '. THE HIDDEN TARGET TAKES THE SLOT.'
    )
    extra =
      beat('beat-initial', 'THE ORIGINAL NOMINEES') +
      beat('beat-action', 'SAFETY OPENS A REPLACEMENT SLOT')
  }
  if (id === 'allPower') {
    wide =
      royalRoom() +
      actor(ROLE_PACKS.a.poses.ceremonyFront, 'power-standing', { crown: true }) +
      art('cinema_shield', 'power-award-shield')
    detail =
      royalRoom() +
      `<div class="royal-group">${art('cinema_throne', 'cine-throne')}<div class="cine-royal cine-layer" data-layer="actors">${art(ROLE_PACKS.a.poses.royalSeated, 'cine-seated', 'actors')}${art('cinema_crown', 'cine-royal-crown')}</div>${art('cinema_shield', 'cine-royal-shield')}</div><div class="royal-aura"></div>`
    copy = title(
      'LEADER OF THE HUB + POWER OF SAFETY',
      'All the power.',
      'PLAYER A HOLDS BOTH THE CROWN AND THE SHIELD.'
    )
    extra =
      beat('beat-initial', 'LEADER OF THE HUB') +
      beat('beat-action', 'THE SAFETY SHIELD JOINS THE CROWN')
  }
  if (id === 'shock') {
    root.dataset.shock = variant.tone
    root.dataset.motif = variant.motif
    wide = shockRoom()
    detail =
      shockRoom() +
      '<div class="cine-eye-bloom cine-layer" data-layer="light"></div><div class="eye-orbit orbit-a"></div><div class="eye-orbit orbit-b"></div><div class="shock-motif"><i></i><i></i><b></b></div>'
    copy = title('THE BIG EYE · SHOCK ANNOUNCEMENT', variant.title, variant.copy)
    extra =
      beat('beat-initial', 'THE EYE IS WATCHING') + beat('beat-action', 'BROADCAST INTERRUPTED')
  }
  if (id === 'final3') {
    wide =
      bg('cinema_hall') +
      actor(a, 'role-center f3-loh', { crown: true, badge: names[0] + ' · LOH' }) +
      actor(b, 'role-left f3-survivor', { badge: names[1] }) +
      actor(c, 'role-right f3-third', { badge: names[2] }) +
      '<div class="final-decision">' +
      names[2].toUpperCase() +
      '<span>FINISHES IN THIRD PLACE</span></div>'
    const departing = (cls) =>
      `<div class="cine-departure ${cls} cine-layer" data-layer="actors">${art(ROLE_PACKS.c.poses.exitBack, 'cine-rear', 'actors')}</div>`
    detail =
      bg('cinema_hall') +
      actor(a, 'role-left f3-finalist', { badge: names[0] }) +
      actor(b, 'role-right f3-finalist', { badge: names[1] }) +
      departing('departure-near') +
      '<div class="doorway-volume">' +
      departing('departure-far') +
      '</div>' +
      gates() +
      '<div class="portal-floor-light"></div>'
    copy = title(
      'THE FINAL TWO',
      names[0] + ' & ' + names[1],
      names[2].toUpperCase() + ' LEFT THE HUB IN THIRD PLACE.'
    )
    extra =
      beat('beat-initial', 'THE FINAL LOH MUST CHOOSE') +
      beat('beat-action', names[0].toUpperCase() + ' ELIMINATES ' + names[2].toUpperCase())
  }
  root.innerHTML = `<div class="cine-shot shot-wide"><div class="cine-world">${wide}</div></div><div class="cine-shot shot-detail"><div class="cine-world">${detail}</div></div>${art('cinema_atmosphere', 'cine-atmosphere', 'light')}<div class="cine-grade cine-layer" data-layer="light"></div>${entrance()}<div class="cine-cut"><i></i></div><div class="transition-blade">${art('cinema_portal', 'transition-texture')}</div>${pulse()}<div class="cine-sweep cine-layer" data-layer="light"></div>${extra}${copy}<div class="cine-letterbox letterbox-top"></div><div class="cine-letterbox letterbox-bottom"></div><div class="cine-sequence">THE BIG EYE <i></i> CEREMONY FILM</div>`
  for (const node of root.querySelectorAll('[data-cinema-art]')) {
    const source = images[node.dataset.cinemaArt]
    if (!source) throw new Error('Missing resource ' + node.dataset.cinemaArt)
    const image = source.cloneNode()
    image.className = node.className
    image.dataset.layer = node.dataset.layer
    image.alt = ''
    image.draggable = false
    node.replaceWith(image)
  }
  if (id === 'shock') {
    root.querySelector('.cine-titles h3').classList.add('shock-title')
    root.querySelector('.cine-titles p').classList.add('shock-copy')
  }
  return root
}

export function animateCinemaScene(id, root, a) {
  const d = CINEMA_CONFIG[id].duration,
    settle = 'cubic-bezier(.16,1,.3,1)'
  a(root, [
    [0, 0],
    [120, 1],
    [d - 250, 1],
    [d, 0],
  ])
  a('.wing-left', [
    [0, 1, 'translateX(0)'],
    [120, 1, 'translateX(0)', settle],
    [1050, 1, 'translateX(-108%)'],
    [d, 1, 'translateX(-108%)'],
  ])
  a('.wing-right', [
    [0, 1, 'translateX(0)'],
    [120, 1, 'translateX(0)', settle],
    [1050, 1, 'translateX(108%)'],
    [d, 1, 'translateX(108%)'],
  ])
  a('.jamb-left', [
    [0, 1, 'translateX(0) scale(1.6)'],
    [1400, 1, 'translateX(-115%) scale(1)'],
    [d, 1, 'translateX(-115%) scale(1)'],
  ])
  a('.jamb-right', [
    [0, 1, 'translateX(0) scale(1.6)'],
    [1400, 1, 'translateX(115%) scale(1)'],
    [d, 1, 'translateX(115%) scale(1)'],
  ])
  a('.cine-atmosphere', [
    [0, 0.25, 'translateX(-4%) scale(1.1)'],
    [d, 0.38, 'translateX(3%) scale(1.04)'],
  ])
  a('.beat-initial', [
    [0, 0, 'translateY(-8px)'],
    [700, 1, 'translateY(0)'],
    [1500, 1, 'translateY(0)'],
    [1800, 0, 'translateY(-5px)'],
    [d, 0],
  ])
  a('.beat-action', [
    [0, 0, 'translateY(-5px)'],
    [1500, 0, 'translateY(-5px)'],
    [1900, 1, 'translateY(0)'],
    [id === 'final3' ? 2850 : 3300, 1, 'translateY(0)'],
    [id === 'final3' ? 3050 : 3550, 0, 'translateY(-4px)'],
    [d, 0],
  ])
  const titleAt = {
    tiebreak: 4800,
    final4: 4900,
    ambush: 4300,
    allPower: 7200,
    shock: 2500,
    final3: 6900,
  }[id]
  a('.cine-titles', [
    [0, 0, 'translateY(16px)'],
    [titleAt, 0, 'translateY(16px)'],
    [titleAt + 550, 1, 'translateY(0)'],
    [d, 1, 'translateY(0)'],
  ])
  a('.cine-sweep', [
    [0, 0, 'translateX(-150%) skewX(-15deg)'],
    [titleAt - 250, 0, 'translateX(-150%) skewX(-15deg)'],
    [titleAt + 100, 0.35, 'translateX(0) skewX(-15deg)'],
    [titleAt + 800, 0, 'translateX(200%) skewX(-15deg)'],
    [d, 0],
  ])
  const cuts = {
      tiebreak: [1900, 3700],
      final4: [1900, 3800],
      ambush: [2900],
      allPower: [2900],
      shock: [1800],
      final3: [2900],
    }[id],
    first = cuts[0],
    last = cuts[1]
  const wide = [
    [0, 1, 'translateX(-2%) translateY(2%) scale(1.22)'],
    [1100, 1, 'translateX(0) translateY(0) scale(1.04)'],
    [first - 80, 1, 'translateX(1%) translateY(-1%) scale(1.1)', 'steps(1,end)'],
    [first, 0, 'translateX(1%) translateY(-1%) scale(1.1)'],
  ]
  const detail = [
    [0, 0, 'translateX(-2%) translateY(1%) scale(1.12)', 'steps(1,end)'],
    [first, 1, 'translateX(-2%) translateY(1%) scale(1.12)'],
  ]
  if (last) {
    wide.push(
      [last - 80, 0, 'translateX(2%) translateY(0) scale(1.03)', 'steps(1,end)'],
      [last, 1, 'translateX(2%) translateY(0) scale(1.03)'],
      [d, 1, 'translateX(-1%) translateY(-1%) scale(1.11)']
    )
    detail.push(
      [last - 80, 1, 'translateX(0) translateY(-1%) scale(1.02)', 'steps(1,end)'],
      [last, 0, 'translateX(0) translateY(-1%) scale(1.02)'],
      [d, 0]
    )
  } else {
    wide.push([d, 0])
    detail.push(
      [first + 750, 1, 'translateX(0) translateY(0) scale(1.02)'],
      [d, 1, 'translateX(1%) translateY(-1%) scale(1.065)']
    )
  }
  a('.shot-wide', wide)
  a('.shot-detail', detail)
  const cover = [[0, 0]],
    blade = [[0, 0, 'translateX(-250%) rotateY(15deg)']]
  for (const at of cuts) {
    cover.push([at - 200, 0], [at - 65, 1], [at + 75, 1], [at + 340, 0])
    blade.push(
      [at - 320, 0, 'translateX(-250%) rotateY(15deg)'],
      [at - 120, 1, 'translateX(-20%) rotateY(0)'],
      [at + 80, 1, 'translateX(130%) rotateY(-15deg)'],
      [at + 400, 0, 'translateX(320%) rotateY(-15deg)']
    )
  }
  cover.push([d, 0])
  blade.push([d, 0, 'translateX(320%) rotateY(-15deg)'])
  a('.cine-cut', cover)
  a('.transition-blade', blade)
  const impact = id === 'allPower' ? 2900 : id === 'ambush' ? 3400 : cuts.at(-1)
  a('.ring-a', [
    [0, 0, 'scale(.3)'],
    [impact - 120, 0, 'scale(.3)'],
    [impact + 100, 0.6, 'scale(.7)'],
    [impact + 750, 0, 'scale(1.8)'],
    [d, 0],
  ])
  a('.ring-b', [
    [0, 0, 'scale(.4)'],
    [impact, 0, 'scale(.4)'],
    [impact + 220, 0.4, 'scale(.8)'],
    [impact + 950, 0, 'scale(2)'],
    [d, 0],
  ])
  a('.energy-core', [
    [0, 0],
    [impact - 80, 0],
    [impact + 100, 0.4],
    [impact + 600, 0],
    [d, 0],
  ])
  if (id === 'tiebreak' || id === 'final4') {
    a('.shot-detail .cine-token', [
      [0, 0, 'translateY(-35px) rotate(-12deg) scaleY(.5)'],
      [1900, 0, 'translateY(-35px) rotate(-12deg) scaleY(.5)'],
      [2250, 1, 'translateY(3px) rotate(0) scaleY(.5)'],
      [2450, 1, 'translateY(0) rotate(0) scaleY(.5)'],
      [d, 1, 'translateY(0) rotate(0) scaleY(.5)'],
    ])
    a('.shot-detail .cine-token-light', [
      [0, 0],
      [2200, 0],
      [2450, 0.85],
      [d, 0.25],
    ])
    a('.vote-flight', [
      [0, 0, 'translateX(0) translateY(0) rotate(0) scaleY(.5)'],
      [last + 50, 0, 'translateX(0) translateY(0) rotate(0) scaleY(.5)'],
      [last + 220, 1, 'translateX(60%) translateY(-90%) rotate(8deg) scaleY(.5)'],
      [last + 750, 1, 'translateX(330%) translateY(-70%) rotate(0) scale(.75) scaleY(.5)'],
      [last + 920, 0, 'translateX(330%) translateY(-70%) rotate(0) scale(.75) scaleY(.5)'],
      [d, 0],
    ])
    a('.verdict-trail', [
      [0, 0, 'scaleX(0)'],
      [last + 100, 0, 'scaleX(0)'],
      [last + 700, 0.8, 'scaleX(1)'],
      [last + 1100, 0.15, 'scaleX(1)'],
      [d, 0.15],
    ])
    a('.verdict-bracket', [
      [0, 0, 'scaleY(.65)'],
      [last + 700, 0, 'scaleY(.65)'],
      [last + 1050, 1, 'scaleY(1)'],
      [d, 1, 'scaleY(1)'],
    ])
    a('.tally-after', [
      [0, 0],
      [last + 750, 0],
      [last + 1000, 1],
      [d, 1],
    ])
    a(
      id === 'tiebreak'
        ? '.shot-wide .role-right .actor-badge'
        : '.shot-wide .f4-right .actor-badge',
      [
        [0, 1],
        [last + 700, 1],
        [last + 1000, 0],
        [d, 0],
      ]
    )
    if (id === 'tiebreak')
      a('.tally-before', [
        [0, 1],
        [1800, 1],
        [1900, 0],
        [last, 0],
        [last + 200, 1],
        [last + 750, 1],
        [last + 950, 0],
        [d, 0],
      ])
    else {
      a('.cine-small-shield', [
        [0, 0, 'translateX(-50px) translateY(-8px) rotate(-15deg) scale(.6)'],
        [900, 1, 'translateX(0) translateY(0) rotate(-6deg) scale(1.08)'],
        [1400, 1, 'translateX(0) translateY(0) rotate(-6deg) scale(1)'],
        [d, 1, 'translateX(0) translateY(0) rotate(-6deg) scale(1)'],
      ])
      a('.safety-spotlight', [
        [0, 0],
        [1000, 0.75],
        [d, 0.4],
      ])
    }
  }
  if (id === 'ambush') {
    a('.ambush-save-shield', [
      [0, 0, 'translateX(-90px) translateY(-35px) rotate(-20deg) scale(.5)'],
      [900, 0, 'translateX(-90px) translateY(-35px) rotate(-20deg) scale(.5)'],
      [1500, 1, 'translateX(0) translateY(0) rotate(0) scale(1.08)'],
      [1900, 1, 'translateX(0) translateY(0) rotate(0) scale(1)'],
      [d, 1, 'translateX(0) translateY(0) rotate(0) scale(1)'],
    ])
    a('.slot-open', [
      [0, 0],
      [1500, 0],
      [1950, 1],
      [d, 1],
    ])
    a('.ambush-original-left .actor-badge', [
      [0, 1],
      [1450, 1],
      [1750, 0],
      [d, 0],
    ])
    a('.cine-danger', [
      [0, 0],
      [3000, 0],
      [3650, 0.9],
      [d, 0.6],
    ])
    a('.cine-danger-ring', [
      [0, 0, 'scale(.7)'],
      [3200, 0, 'scale(.7)'],
      [3700, 1, 'scale(1)'],
      [d, 0.65, 'scale(1)'],
    ])
    a('.lock-left', [
      [0, 0, 'translateX(-70px)'],
      [3300, 0, 'translateX(-70px)'],
      [3900, 1, 'translateX(0)'],
      [d, 1, 'translateX(0)'],
    ])
    a('.lock-right', [
      [0, 0, 'translateX(70px)'],
      [3300, 0, 'translateX(70px)'],
      [3900, 1, 'translateX(0)'],
      [d, 1, 'translateX(0)'],
    ])
  }
  if (id === 'ambush' || id === 'final3') {
    const close = id === 'final3',
      start = close ? 6100 : 2900,
      end = close ? 6800 : 3500
    a('.gate-left', [
      [0, 1, `translateX(${close ? -105 : 0}%)`],
      [start, 1, `translateX(${close ? -105 : 0}%)`],
      [end, 1, `translateX(${close ? 0 : -105}%)`],
      [d, 1, `translateX(${close ? 0 : -105}%)`],
    ])
    a('.gate-right', [
      [0, 1, `translateX(${close ? 105 : 0}%) scaleX(-1)`],
      [start, 1, `translateX(${close ? 105 : 0}%) scaleX(-1)`],
      [end, 1, `translateX(${close ? 0 : 105}%) scaleX(-1)`],
      [d, 1, `translateX(${close ? 0 : 105}%) scaleX(-1)`],
    ])
  }
  if (id === 'allPower') {
    a('.power-award-shield', [
      [0, 0, 'translateX(-140px) translateY(-40px) rotate(-30deg) scale(.5)'],
      [1200, 0, 'translateX(-140px) translateY(-40px) rotate(-30deg) scale(.5)'],
      [2050, 1, 'translateX(0) translateY(0) rotate(-8deg) scale(1.12)'],
      [2500, 1, 'translateX(0) translateY(0) rotate(-8deg) scale(1)'],
      [d, 1, 'translateX(0) translateY(0) rotate(-8deg) scale(1)'],
    ])
    a('.royal-group', [
      [0, 1, 'translateX(0) translateY(18px) scale(.97)'],
      [2900, 1, 'translateX(0) translateY(18px) scale(.97)'],
      [3650, 1, 'translateX(0) translateY(0) scale(1.015)'],
      [4400, 1, 'translateX(0) translateY(0) scale(1)', 'cubic-bezier(.55,.05,.65,1)'],
      [6600, 1, 'translateX(-140%) translateY(35%) scale(2.2)'],
      [d, 1, 'translateX(-140%) translateY(35%) scale(2.2)'],
    ])
    a('.shot-detail .royal-room-plane', [
      [0, 1, 'translateX(0) scale(1)'],
      [4400, 1, 'translateX(0) scale(1)', 'cubic-bezier(.55,.05,.65,1)'],
      [6600, 1, 'translateX(-3%) scale(3.2)'],
      [d, 1, 'translateX(-3%) scale(3.2)'],
    ])
    a('.royal-aura', [
      [0, 0],
      [2900, 0],
      [3550, 0.65],
      [d, 0.25],
    ])
  }
  if (id === 'allPower' || id === 'shock') {
    a('.city-plate, .eye-city-plate', [
      [0, 1, 'translateX(-1%) scale(1.02)'],
      [d, 1, 'translateX(1%) scale(1.04)'],
    ])
    if (id === 'allPower') {
      a('.royal-glass', [
        [0, 0.3, 'translateX(-1%)'],
        [d, 0.5, 'translateX(1%)'],
      ])
      a('.city-light', [
        [0, 0.2],
        [1500, 0.6],
        [3200, 0.25],
        [4700, 0.65],
        [d, 0.3],
      ])
    } else {
      a('.shot-wide .cine-world', [
        [0, 1, 'translateY(0) scale(2.8)'],
        [1800, 1, 'translateY(0) scale(1.65)'],
        [d, 1, 'translateY(0) scale(1.65)'],
      ])
      a('.cine-eye-bloom', [
        [0, 0],
        [1800, 0],
        [2300, 0.8],
        [2900, 0.3],
        [d, 0.25],
      ])
      a('.orbit-a', [
        [0, 0, 'scale(.5) rotate(-20deg)'],
        [1850, 0, 'scale(.5) rotate(-20deg)'],
        [2400, 0.65, 'scale(1) rotate(0deg)'],
        [3500, 0, 'scale(1.8) rotate(30deg)'],
        [d, 0],
      ])
      a('.orbit-b', [
        [0, 0, 'scale(.6) rotate(20deg)'],
        [2050, 0, 'scale(.6) rotate(20deg)'],
        [2700, 0.5, 'scale(1.1) rotate(0)'],
        [3800, 0, 'scale(2) rotate(-30deg)'],
        [d, 0],
      ])
      a('.shock-motif', [
        [0, 0, 'translateY(15px) scale(.8)'],
        [2300, 0, 'translateY(15px) scale(.8)'],
        [2900, 0.9, 'translateY(0) scale(1)'],
        [d, 0.9, 'translateY(0) scale(1)'],
      ])
    }
  }
  if (id === 'final3') {
    a('.final-decision', [
      [0, 0, 'translateY(10px)'],
      [1700, 0, 'translateY(10px)'],
      [2200, 1, 'translateY(0)'],
      [d, 1, 'translateY(0)'],
    ])
    const path = [
      [0, 1, 'translateY(7%) scale(1)'],
      [2900, 1, 'translateY(7%) scale(1)'],
      [3550, 1, 'translateY(-8%) scale(.92)'],
      [4200, 1, 'translateY(-28%) scale(.8)'],
      [4800, 1, 'translateY(-47%) scale(.68)'],
      [5200, 1, 'translateY(-61%) scale(.6)'],
      [5900, 1, 'translateY(-82%) scale(.48)'],
      [d, 1, 'translateY(-82%) scale(.48)'],
    ]
    a('.cine-departure', path)
    // A binary depth transfer at the physical threshold, never a disappearance fade.
    a('.departure-near', [
      [0, 1],
      [5199, 1, undefined, 'steps(1,end)'],
      [5200, 0],
      [d, 0],
    ])
    a('.departure-far', [
      [0, 0],
      [5199, 0, undefined, 'steps(1,end)'],
      [5200, 1],
      [d, 1],
    ])
    a('.portal-floor-light', [
      [0, 0.3],
      [2900, 0.3],
      [5200, 0.65],
      [6800, 0.2],
      [d, 0.2],
    ])
  }
}

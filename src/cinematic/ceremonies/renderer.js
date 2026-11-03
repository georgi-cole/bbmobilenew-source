import {
  replacementResources,
  makeReplacementFilm,
  animateReplacementFilm,
} from './replacement-film.js'
import replacementStyles from './replacement-film.css?raw'
import sheet0 from './approved/styles.css?raw'
import sheet1 from './approved/ceremony-lab.css?raw'
import sheet2 from './approved/cinema-scenes.css?raw'
import sheet3 from './approved/cinema-depth.css?raw'
import sheet4 from './approved/cinema-refinement.css?raw'
import sheet5 from './approved/cinema-finesse.css?raw'
import decisionExitStyles from './approved/decision-exit.css?raw'
import fittingStyles from './fitting.css?raw'
import { decorateShock, animateShockTheme } from './shock-themes.js'
import { CEREMONIES, SHOCK_VARIANTS } from './approved/ceremony-player.js'
import { makeScene, animateScene } from './approved/ceremony-storyboards.js'
import {
  DECISION_CONFIG,
  FINAL_EXIT_BRAND_RESOURCE,
  getDecisionTiming,
  makeDecisionScene,
  animateDecisionScene,
} from './approved/decision-exit.js'
import shared from './shared-manifest.json'
import announcementAtmosphere from './optical.json'
import premiumVfx from './vfx.json'
import { shockMotifKeys } from './shock-motifs.js'
import { baseScene } from './mode-routing.mjs'
import {
  MODE_SCENES,
  modeResources,
  adaptModeFilm,
  makeVoxFilm,
  animateVoxFilm,
  animateModeLayers,
} from './mode-films.js'
import modeStyles from './mode-films.css?raw'

export const SCENES = {
  replacement: { label: 'Replacement nomination', duration: 4500 },
  loh: { label: 'LOH crowning', duration: 3200 },
  ...CEREMONIES,
  ...MODE_SCENES,
  nominations: { ...CEREMONIES.nominations, duration: 7600 },
}
export const OPTIONS = Object.keys(SCENES)
const props = {
  shield: 'safety-shield-reveal',
  platform: 'danger-platform',
  curtain: 'curtain',
  crown: 'crown',
  throne: 'throne',
  cinema_hall: 'hub-chamber',
  cinema_portal: 'door-leaf',
  cinema_crown: 'crown',
  cinema_throne: 'throne',
  cinema_atmosphere: 'atmosphere',
  cinema_royalRoom: 'royal-room',
  cinema_city: 'hub-city',
  cinema_shield: 'shield',
  cinema_sanctuary: 'sanctuary',
  cinema_danger: 'danger-chamber',
  cinema_shockRoom: 'shock-chamber',
  cinema_console: 'power-console',
  cinema_token: 'decision-token',
}
let stylePromise
const percent = (n) => (n * 100).toFixed(4) + '%'

export function sceneResources(id, cast, shockType = 'doubleEviction', details = {}) {
  if (id === 'replacement') return replacementResources(cast, details, shared)
  const mode = id
  const extra = modeResources(mode, cast, shared, premiumVfx)
  id = baseScene(id)
  if (!id) return extra
  if (mode === 'cupidNominations') cast = { a: cast.a, b: cast.c, c: cast.e ?? cast.a }
  const pose = (actor, key) => ({ ...cast[actor].poses[key], character: cast[actor].id, pose: key })
  const actors = {
    male: pose('a', 'front'),
    female: pose(id === 'save' ? 'a' : 'b', 'front'),
    knight: pose('a', 'safety-knight'),
    cinema_standA: pose('a', 'front'),
    cinema_standB: pose('b', 'front'),
    cinema_standC: pose('c', 'front'),
    cinema_decisionA: pose('a', 'decision-back'),
    cinema_decisionB: pose('b', 'decision-back'),
    cinema_exitC: pose('c', 'exit-back'),
    cinema_seatedA: pose('a', 'royal-seated'),
    winner: pose('a', 'front'),
    royal: pose('a', 'royal-standing'),
    seated: pose('a', 'royal-seated'),
  }
  const keys =
    id === 'loh'
      ? [
          'winner',
          'royal',
          'crown',
          'curtain',
          'cinema_royalRoom',
          ...(mode === 'cupidPower' ? ['seated', 'throne'] : []),
        ]
      : SCENES[id].art.filter((key) => !['cinema_avatarC', 'cinema_eliminatedStamp'].includes(key))
  if (
    id === 'nominations' &&
    mode === 'nominations' &&
    cast.d &&
    !(details.coLohAssignments?.length > 1)
  ) {
    keys.push('nomination_seated', 'throne', 'crown', 'cinema_royalRoom')
    actors.nomination_seated = pose('d', 'royal-seated')
  }
  if (id === 'shock') keys.push('shockAtmosphere', 'shockMist', ...shockMotifKeys(shockType))
  if (
    id === 'nominations' &&
    new Set([cast.a, cast.b, cast.c].map((actor) => actor.playerId ?? actor.id)).size === 3
  )
    keys.push('cinema_standC')
  // Final 4 needs only its Safety holder's rear pose and the two nominees.
  const needed = keys.filter(
    (key) =>
      !(DECISION_CONFIG[id] && key === (id === 'final4' ? 'cinema_decisionA' : 'cinema_decisionB'))
  )
  return {
    ...Object.fromEntries(
      needed.map((key) => {
        if (premiumVfx[key]) return [key, premiumVfx[key]]
        if (key === 'shockAtmosphere') return [key, announcementAtmosphere]
        if (actors[key]) return [key, actors[key]]
        const file = props[key] + '.webp',
          asset = shared[file]
        if (!asset) throw new Error('No reusable resource for ' + key)
        return [key, { src: 'assets/ceremonies/shared/' + file, ...asset }]
      })
    ),
    ...extra,
    ...(details.closingBrand === true && ['exit', 'final3'].includes(mode)
      ? { cinema_closingEye: FINAL_EXIT_BRAND_RESOURCE }
      : {}),
  }
}

function fitCrown(crown, pose) {
  const { x, baseY, width, angle } = pose.crown
  crown.style.cssText = `position:absolute;left:${percent(x - width / 2)};top:${percent(baseY - ((((width * pose.width) / pose.height) * 44) / 144) * 0.88)};width:${percent(width)};height:auto;opacity:1;transform:rotate(${angle}deg);transform-origin:50% 88%;z-index:6`
  crown.dataset.fittedCrown = pose.pose
}

function fitScene(root, id, images, resources, cast) {
  root.dataset.rehearsal = id
  // All pack frames are 2:3. Parent containers keep that exact aspect ratio,
  // avoiding object-fit letterboxing between the anchor and the visible head.
  const fit = (image, crown) => {
    const pose = resources[image?.dataset.resourceKey]
    if (pose && crown) fitCrown(crown, pose)
  }
  if (id === 'allPower') {
    fit(
      root.querySelector('.power-standing .cine-body'),
      root.querySelector('.power-standing .cine-crown')
    )
    fit(root.querySelector('.cine-seated'), root.querySelector('.cine-royal-crown'))
    const pose = resources.cinema_seatedA
    const throne = root.querySelector('.cine-throne')
    throne.style.transform = `translate(${percent(pose.throne.x)},${percent(pose.throne.y)}) scale(${pose.throne.scale})`
  }
  if (DECISION_CONFIG[id] && id !== 'exit') {
    fit(
      root.querySelector('.decision-holder .decision-body'),
      root.querySelector('.decision-insignia')
    )
  }
  if (id === 'safety') {
    const shield = images.shield.cloneNode()
    shield.className = 'fitted-knight-shield'
    root.append(shield)
  }
  // Reuse the approved text/layout but replace every sample identity, including
  // titles and captions. Text nodes only; no identity goes into HTML strings.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    walker.currentNode.textContent = walker.currentNode.textContent.replace(
      /Player ([ABC])/gi,
      (match, letter) => {
        const name = cast[letter.toLowerCase()].name
        return match === match.toUpperCase() ? name.toUpperCase() : name
      }
    )
  }
}

function makeLoh(images) {
  const root = document.createElement('div')
  root.className = 'loh-scene fitted-loh'
  root.innerHTML =
    '<div class="loh-backdrop"></div><div class="loh-halo"></div><div class="loh-floor"></div><div class="loh-room-pieces"></div><div class="loh-figure"><div class="loh-before loh-pose"></div><div class="loh-royal loh-pose"></div></div><div class="loh-flash"></div><div class="loh-titles"><div class="loh-kicker">ALL HAIL YOUR NEW</div><div class="loh-name">Leader of the Hub</div><div class="loh-title">THE CROWN IS YOURS.</div></div>'
  const clone = (key, cls) => {
    const image = images[key].cloneNode()
    image.className = cls
    return image
  }
  root.querySelector('.loh-backdrop').append(clone('cinema_royalRoom', 'loh-backdrop-image'))
  for (const [pose, target] of [
    ['winner', '.loh-before'],
    ['royal', '.loh-royal'],
  ]) {
    root.querySelector(target).append(clone(pose, 'loh-person'), clone('crown', 'loh-crown'))
  }
  if (images.seated) {
    const seated = document.createElement('div')
    seated.className = 'loh-seated'
    seated.append(
      clone('throne', 'loh-seat-throne'),
      clone('seated', 'loh-seated-image'),
      clone('crown', 'loh-seated-crown')
    )
    root.append(seated)
    const flash = document.createElement('div')
    flash.className = 'loh-seat-flash'
    root.append(flash)
  }
  const room = root.querySelector('.loh-room-pieces')
  for (const direction of ['left', 'right']) {
    const wrap = document.createElement('div')
    wrap.className = 'loh-curtain loh-curtain-' + direction
    wrap.append(clone('curtain', 'loh-prop-image'))
    room.append(wrap)
  }
  return root
}

function addRoyalNomination(root, images, resources, cast) {
  const shot = document.createElement('div')
  shot.className = 'nom-decision'
  shot.innerHTML =
    '<div class="nom-decision-room"></div><div class="nom-decision-shadow"></div><div class="nom-decision-figure"></div><div class="nom-decision-caption"><span>THE LEADER OF THE HUB</span><strong></strong><em>DECISION IN PROGRESS</em><i class="nom-decision-progress"></i></div>'
  const copy = (key, className) => {
    const image = images[key].cloneNode()
    image.className = className
    return image
  }
  shot.querySelector('.nom-decision-room').append(copy('cinema_royalRoom', 'nom-decision-backdrop'))
  const figure = shot.querySelector('.nom-decision-figure')
  figure.append(
    copy('throne', 'nom-decision-throne'),
    copy('nomination_seated', 'nom-decision-person'),
    copy('crown', 'nom-decision-crown')
  )
  const throne = resources.nomination_seated.throne
  figure.querySelector('.nom-decision-throne').style.transform =
    `translate(${percent(throne.x)},${percent(throne.y)}) scale(${throne.scale})`
  fitCrown(figure.querySelector('.nom-decision-crown'), resources.nomination_seated)
  shot.querySelector('.nom-decision-caption strong').textContent = cast.d.name
  root.append(shot)
  root.classList.add('nom-royal')
}

function addCoLohNominationIntro(root, cast, assignments) {
  if (assignments?.length !== 2) return false
  const byPlayerId = (id) => Object.values(cast).find((actor) => actor?.playerId === id)
  const intro = document.createElement('div')
  intro.className = 'nom-coloh-intro'
  const header = document.createElement('div')
  header.className = 'nom-coloh-header'
  header.textContent = 'TWO LEADERS · TWO CHOICES'
  intro.append(header)
  for (const [index, assignment] of assignments.slice(0, 2).entries()) {
    const leader = byPlayerId(assignment.coLohId)
    const nominee = byPlayerId(assignment.nomineeId)
    const beat = document.createElement('div')
    beat.className = 'nom-coloh-beat'
    beat.dataset.beat = String(index)
    const credit = document.createElement('span')
    credit.textContent = `${leader?.name ?? 'Co-Leader'} NOMINATES`
    const nomineeName = document.createElement('strong')
    nomineeName.textContent = nominee?.name ?? 'Nominee'
    const selected = document.createElement('em')
    selected.textContent = 'SELECTED FOR THE BLOCK'
    beat.append(credit, nomineeName, selected)
    intro.append(beat)
    const slotIndex = ['a', 'b'].findIndex((key) => cast[key]?.playerId === assignment.nomineeId)
    root.querySelector(slotIndex === 0 ? '.nom-first' : '.nom-second').dataset.choiceOrder =
      String(index)
  }
  root.append(intro)
  root.classList.add('nom-coloh-active')
  root.querySelector('.c-caption strong').textContent = 'The block is set.'
  return true
}

function calibrateNominationBlock(root, cast) {
  root.classList.add('nom-calibrated')
  for (const [index, pod] of [...root.querySelectorAll('.nom-pod')].entries()) {
    const pose = cast[['a', 'b', 'c'][index]].poses.front
    const width = root.classList.contains('nom-three') ? 31 : 44
    pod.style.setProperty('--platform-surface-offset', `${width * (64 / 400)}cqw`)
    const person = pod.querySelector('.nom-person')
    person.style.setProperty('--feet-y', `${pose.feetY * 100}%`)
    if (root.classList.contains('nom-coloh-active'))
      pod.querySelector('.nom-label').textContent = cast[['a', 'b', 'c'][index]].name
    const contact = document.createElement('i')
    contact.className = 'nom-contact'
    pod.append(contact)
  }
}

function animateNominationFilm(root, a, duration) {
  const solo = root.classList.contains('nom-solo')
  const third = Boolean(root.querySelector('.nom-third'))
  const royal = Boolean(root.querySelector('.nom-decision'))
  const coLoh = Boolean(root.querySelector('.nom-coloh-intro'))
  const count = solo ? 1 : third ? 3 : 2
  const establishSeconds = solo ? 0.75 : coLoh ? 0.45 : royal ? 2.7 : 0.4
  const revealAt = solo ? 1.1 : coLoh ? 1.35 : royal ? 3.05 : 1.05
  const captionAt = duration - 1620
  a(root, [
    [0, 0],
    [180, 1],
    [duration, 1],
  ])
  a('.ceremony-backdrop', [
    [0, 0.42, 'translateY(1%) scale(1.07)'],
    [duration, 0.62, 'translateY(-0.7%) scale(1.015)'],
  ])
  a('.nom-chasm', [
    [0, 0],
    [Math.round(establishSeconds * 1000), 0],
    [Math.round((establishSeconds + 0.4) * 1000), 0.84],
    [duration, 0.9],
  ])
  a('.nom-warning', [
    [0, 0],
    [Math.round(establishSeconds * 1000), 0],
    [Math.round((establishSeconds + 0.28) * 1000), 1],
    [duration, 1],
  ])

  for (const [index, selector] of ['.nom-first', '.nom-second', '.nom-third'].entries()) {
    const pod = root.querySelector(selector)
    if (!pod || (solo && index > 0)) continue
    const start = coLoh
      ? index === 2
        ? 3.6
        : 1.35 + Number(pod.dataset.choiceOrder ?? index) * 1.35
      : revealAt + index * (solo ? 0 : 0.86)
    const enter = Math.round(start * 1000)
    const settle = Math.round((start + 0.38) * 1000)
    a(pod, [
      [0, 1],
      [duration, 1],
    ])
    for (const actor of pod.querySelectorAll('.nom-person'))
      a(actor, [
        [0, 0],
        [enter, 0],
        [settle, 1],
        [duration, 1],
      ])
    if (pod.querySelector('.nom-contact'))
      a(`${selector} .nom-contact`, [
        [0, 0],
        [enter, 0],
        [settle, 0.7],
        [duration, 0.7],
      ])
    if (pod.querySelector('.nom-label'))
      a(`${selector} .nom-label`, [
        [0, 0],
        [settle + 150, 0],
        [settle + 350, 1],
        [duration, 1],
      ])
    a(`${selector} .nom-aura`, [
      [0, 0],
      [enter, 0],
      [settle + 180, 0.78],
      [duration, 0.45],
    ])
  }

  a('.c-caption', [
    [0, 0, 'translateY(10px)'],
    [captionAt, 0, 'translateY(10px)'],
    [captionAt + 200, 1, 'translateY(0)'],
    [duration, 1, 'translateY(0)'],
  ])

  if (royal) {
    const decisionEnd = Math.round((establishSeconds + 0.38) * 1000)
    a('.nom-decision', [
      [0, 1],
      [Math.round((establishSeconds - 0.22) * 1000), 1],
      [decisionEnd, 0],
      [duration, 0],
    ])
    a('.nom-decision-figure', [
      [0, 0.9, 'scale(1.045)'],
      [Math.min(650, Math.round((establishSeconds - 0.32) * 1000)), 1, 'scale(1.018)'],
      [Math.round((establishSeconds - 0.22) * 1000), 1, 'scale(1)'],
      [duration, 1, 'scale(1)'],
    ])
    a('.nom-decision-caption', [
      [0, 0],
      [450, 1],
      [Math.round((establishSeconds - 0.25) * 1000), 1],
      [decisionEnd, 0],
      [duration, 0],
    ])
    a('.nom-decision-progress', [
      [0, 1, 'scaleX(0)'],
      [Math.round((establishSeconds - 0.15) * 1000), 1, 'scaleX(.96)'],
      [decisionEnd, 1, 'scaleX(1)'],
      [duration, 1, 'scaleX(1)'],
    ])
  }

  if (coLoh) {
    a('.nom-coloh-intro', [
      [0, 1],
      [3750, 1],
      [4100, 0],
      [duration, 0],
    ])
    for (const [index, beat] of root.querySelectorAll('.nom-coloh-beat').entries()) {
      const start = index === 0 ? 500 : 2100
      a(beat, [
        [0, 0, 'translateY(12px) scale(.99)'],
        [start, 0, 'translateY(12px) scale(.99)'],
        [start + 250, 1, 'translateY(0) scale(1)'],
        [start + 1200, 1, 'translateY(0) scale(1)'],
        [start + 1450, 0, 'translateY(-5px) scale(.995)'],
        [duration, 0],
      ])
    }
  }

  // Reserve a full second for the final line before the single outer fade to game.
  if (duration - captionAt - 420 < 1200) throw new Error('Nomination caption hold is too short')
  if (count === 1 && root.querySelector('.nom-second'))
    root.querySelector('.nom-second').style.display = 'none'
  if (root.querySelector('.nom-decision'))
    root.dataset.decisionHoldMs = String(duration - Math.round(establishSeconds * 1000))
}

function animateRoyalNomination(root, a) {
  const end = 7600
  a(root, [
    [0, 0],
    [180, 1],
    [end - 340, 1],
    [end, 0],
  ])
  a('.nom-decision', [
    [0, 1],
    [2450, 1],
    [3000, 0],
    [end, 0],
  ])
  a('.nom-decision-figure', [
    [0, 0.74, 'scale(1.09)'],
    [700, 1, 'scale(1.02)'],
    [2450, 1, 'scale(1)'],
    [end, 1],
  ])
  a('.nom-decision-caption', [
    [0, 0],
    [800, 1],
    [2300, 1],
    [2760, 0],
    [end, 0],
  ])
  a('.nom-decision-progress', [
    [0, 1, 'scaleX(0)'],
    [450, 1, 'scaleX(0)'],
    [2550, 1, 'scaleX(1)'],
    [end, 1, 'scaleX(1)'],
  ])
  a('.ceremony-backdrop', [
    [0, 0.45, 'translateY(1%) scale(1.08)'],
    [end, 0.62, 'translateY(-1%) scale(1.01)'],
  ])
  a('.nom-chasm', [
    [0, 0],
    [2700, 0],
    [3300, 0.92],
    [end, 1],
  ])
  a('.nom-warning', [
    [0, 0],
    [3050, 0],
    [3450, 1],
    [end, 1],
  ])
  for (const [index, selector] of ['.nom-first', '.nom-second', '.nom-third'].entries()) {
    if (!root.querySelector(selector)) continue
    const start = 3300 + index * 1150
    a(selector, [
      [0, 0, 'translateY(16px) scale(1.035)'],
      [start, 0, 'translateY(16px) scale(1.035)'],
      [start + 480, 1, 'translateY(0) scale(1)'],
      [end, 1, 'translateY(0) scale(1)'],
    ])
    a(`${selector} .nom-aura`, [
      [0, 0],
      [start + 100, 0],
      [start + 450, 0.8],
      [end, 0.48],
    ])
  }
  a('.c-caption', [
    [0, 0, 'translateY(12px)'],
    [root.querySelector('.nom-third') ? 6080 : 5450, 0, 'translateY(12px)'],
    [root.querySelector('.nom-third') ? 6500 : 5900, 1, 'translateY(0)'],
    [end, 1],
  ])
}

function animateLoh(root, a) {
  const seated = Boolean(root.querySelector('.loh-seated'))
  const end = seated ? 4400 : 3200
  a(root, [
    [0, 0],
    [180, 1],
    [end - 380, 1],
    [end, 0],
  ])
  a('.loh-backdrop', [
    [0, 0.35, 'scale(1.09)'],
    [end, 0.58, 'scale(1.015)'],
  ])
  a('.loh-figure', [
    [0, 0, 'translateY(22px) scale(.94)'],
    [550, 1, 'translateY(0) scale(1)'],
    [2319, 1, 'scale(1.008)', 'steps(1,end)'],
    ...(seated ? [[2320, 0]] : []),
    [end, seated ? 0 : 1, 'scale(1.008)'],
  ])
  a('.loh-crown', [
    [0, 0, 'translateY(-36px)'],
    [650, 0, 'translateY(-36px)'],
    [1060, 1, 'translateY(-2px)'],
    [1160, 1, 'translateY(0)'],
    [end, 1, 'translateY(0)'],
  ])
  a('.loh-before', [
    [0, 1],
    [1300, 1],
    [1660, 0],
    [end, 0],
  ])
  a('.loh-royal', [
    [0, 0],
    [1300, 0],
    [1660, 1],
    [end, 1],
  ])
  a('.loh-flash', [
    [0, 0],
    [1260, 0],
    [1420, 0.65],
    [1770, 0],
    [end, 0],
  ])
  a('.loh-halo', [
    [0, 0, 'scale(.8)'],
    [580, 0.7, 'scale(1)'],
    [1700, 1, 'scale(1.12)'],
    [end, 0.8, 'scale(1.15)'],
  ])
  a('.loh-floor', [
    [0, 0],
    [600, 1],
    [end, 1],
  ])
  for (const [side, dir] of [
    ['left', -1],
    ['right', 1],
  ])
    a('.loh-curtain-' + side, [
      [0, 0, `translateX(${dir * 125}px)`],
      [1120, 0, `translateX(${dir * 125}px)`],
      [1760, 1, 'translateX(0)'],
      [end, 1],
    ])
  if (seated) {
    a('.loh-seat-flash', [
      [0, 0],
      [2170, 0],
      [2260, 1],
      [2370, 1],
      [2610, 0],
      [4400, 0],
    ])
    a('.loh-seated', [
      [0, 0, 'scale(1.035)', 'steps(1,end)'],
      [2320, 1, 'scale(1.035)'],
      [2730, 1, 'scale(1)'],
      [3980, 1, 'scale(1.012)'],
      [4400, 1, 'scale(1.012)'],
    ])
  }
  a('.loh-titles', [
    [0, 0, 'translateY(10px)'],
    [1660, 0, 'translateY(10px)'],
    [2040, 1, 'translateY(0)'],
    [end, 1],
  ])
}

function loadImage(resource, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const abort = () => {
      image.removeAttribute('src')
      reject(new DOMException('Cancelled', 'AbortError'))
    }
    signal.addEventListener('abort', abort, { once: true })
    image.decoding = 'async'
    image.alt = ''
    image.draggable = false
    image.src = new URL(
      import.meta.env.BASE_URL + resource.src.replace(/^\//, ''),
      document.baseURI
    ).href
    if (resource.character) {
      image.dataset.character = resource.character
      image.dataset.pose = resource.pose
    }
    image.decode().then(
      () => {
        signal.removeEventListener('abort', abort)
        resolve(image)
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
  })
}

export function createClip() {
  let animations = [],
    timers = new Set(),
    transitionNodes = [],
    host = null,
    prepared = null,
    aborter = new AbortController(),
    dead = false
  let startTime = null,
    sceneId,
    handedOff = false,
    nativeRevealed = false,
    root
  let paused = false
  const pausedAnimations = new Set()
  const schedule = (entry) => {
    entry.due = performance.now() + entry.remaining
    entry.handle = setTimeout(() => {
      timers.delete(entry)
      if (!dead) entry.callback()
    }, entry.remaining)
  }
  const later = (callback, ms) => {
    const entry = { callback, remaining: ms, due: 0, handle: null }
    timers.add(entry)
    if (!paused) schedule(entry)
    return entry
  }
  const pause = () => {
    if (dead) return
    const wasPaused = paused
    paused = true
    for (const entry of wasPaused ? [] : timers) {
      entry.remaining = Math.max(0, entry.due - performance.now())
      clearTimeout(entry.handle)
      entry.handle = null
    }
    for (const animation of animations)
      if (animation.playState === 'running') {
        pausedAnimations.add(animation)
        animation.pause()
      }
  }
  const resume = () => {
    if (dead || !paused) return
    paused = false
    for (const entry of timers) schedule(entry)
    for (const animation of pausedAnimations) if (animations.includes(animation)) animation.play()
    pausedAnimations.clear()
  }
  const dropFilm = () => {
    for (const animation of animations) {
      animation.cancel()
      // Break native KeyframeEffect → element references as well as JS refs.
      animation.effect = null
    }
    animations = []
    for (const img of host?.shadowRoot?.querySelectorAll('img') ?? []) img.removeAttribute('src')
    host?.shadowRoot?.replaceChildren()
    transitionNodes.forEach((node) => node.remove())
    transitionNodes = []
    host?.remove()
    host = null
    root = null
    if (prepared) for (const img of Object.values(prepared.images)) img.removeAttribute('src')
    prepared = null
  }
  const stop = () => {
    dead = true
    aborter.abort()
    for (const timer of timers) clearTimeout(timer.handle)
    timers.clear()
    pausedAnimations.clear()
    dropFilm()
  }
  return {
    stop,
    pause,
    resume,
    setVisible(visible) {
      if (host) host.style.visibility = visible ? 'visible' : 'hidden'
      transitionNodes.forEach((node) => (node.style.visibility = visible ? 'visible' : 'hidden'))
    },
    async prepare(id, cast, shockType = 'doubleEviction', details = {}) {
      sceneId = id
      const resources = sceneResources(id, cast, shockType, details),
        start = performance.now()
      stylePromise ??= Promise.resolve(
        [
          sheet0,
          sheet1,
          sheet2,
          sheet3,
          sheet4,
          sheet5,
          decisionExitStyles,
          fittingStyles,
          modeStyles,
          replacementStyles,
        ].join('\n')
      )
      const entries = await Promise.all(
        Object.entries(resources).map(async ([key, resource]) => {
          const image = await loadImage(resource, aborter.signal)
          image.dataset.resourceKey = key
          return [key, image]
        })
      )
      const css = await stylePromise
      if (dead) return null
      prepared = {
        images: Object.fromEntries(entries),
        resources,
        css,
        cast,
        details,
        preparationMs: performance.now() - start,
        transferBytes: [
          ...new Map(Object.values(resources).map((r) => [r.src, r])).values(),
        ].reduce((n, r) => n + r.bytes, 0),
        decodedBytes: [...new Map(Object.values(resources).map((r) => [r.src, r])).values()].reduce(
          (n, r) => n + r.width * r.height * 4,
          0
        ),
      }
      return prepared
    },
    mount(parent, onHandoff, onComplete, shockType = 'doubleEviction', options = {}) {
      if (dead || !prepared) return
      const id = baseScene(sceneId),
        decision = Boolean(DECISION_CONFIG[id]),
        { images, resources, css, cast, details } = prepared
      const decisionOptions = {
        nativeHandoff: true,
        closingBrand: details.closingBrand === true && ['exit', 'final3'].includes(sceneId),
      }
      const decisionTiming = decision ? getDecisionTiming(id, decisionOptions) : null
      host = document.createElement('div')
      host.className = 'game-sample-film'
      parent.append(host)
      const shadow = host.attachShadow({ mode: 'open' }),
        style = document.createElement('style')
      style.textContent = css
      const stage = document.createElement('div')
      stage.className = 'stage is-playing'
      root =
        id === 'replacement'
          ? makeReplacementFilm(images, cast, details.replacementOutcome)
          : !id
            ? makeVoxFilm(sceneId, images, cast, details)
            : id === 'loh'
              ? makeLoh(images)
              : decision
                ? makeDecisionScene(id, images, 0, decisionOptions)
                : makeScene(id, images, SHOCK_VARIANTS[shockType] || SHOCK_VARIANTS.generic, 0)
      if (id === 'nominations' && sceneId !== 'cupidNominations' && details.nomineeCount === 1) {
        root.classList.add('nom-solo')
      }
      if (
        id === 'nominations' &&
        images.cinema_standC &&
        sceneId !== 'cupidNominations' &&
        !root.classList.contains('nom-solo')
      ) {
        root.classList.add('nom-three')
        const third = root.querySelector('.nom-second').cloneNode(true)
        third.classList.replace('nom-second', 'nom-third')
        const portrait = images.cinema_standC.cloneNode()
        portrait.className = 'nom-person'
        third.querySelector('.nom-person').replaceWith(portrait)
        third.querySelector('.nom-label span').textContent = '03'
        root.append(third)
        root.querySelector('.c-caption strong').textContent = 'Three names. One block.'
      }
      if (
        sceneId === 'nominations' &&
        images.nomination_seated &&
        (!details.coLohAssignments || details.coLohAssignments.length < 2)
      )
        addRoyalNomination(root, images, resources, cast)
      if (id === 'shock') decorateShock(root, shockType, images)
      if (id) fitScene(root, id, images, resources, cast)
      if (id === 'loh') {
        for (const [selector, key] of [
          ['.loh-before .loh-crown', 'winner'],
          ['.loh-royal .loh-crown', 'royal'],
        ])
          fitCrown(root.querySelector(selector), resources[key])
        if (resources.seated) {
          fitCrown(root.querySelector('.loh-seated-crown'), resources.seated)
          const t = resources.seated.throne
          root.querySelector('.loh-seat-throne').style.transform =
            `translate(${percent(t.x)},${percent(t.y)}) scale(${t.scale})`
        }
        root.querySelector('.loh-name').textContent = cast.a.name
      }
      if (sceneId !== id) adaptModeFilm(sceneId, root, images, resources, cast, details, fitCrown)
      if (root.classList.contains('nom-solo')) {
        root.querySelector('.nom-second').remove()
        root.querySelector('.nom-label').remove()
      }
      if (sceneId === 'nominations') addCoLohNominationIntro(root, cast, details.coLohAssignments)
      if (
        id === 'nominations' &&
        (root.classList.contains('nom-solo') || root.classList.contains('nom-coloh-active'))
      )
        calibrateNominationBlock(root, cast)
      if (id === 'nominations' && root.classList.contains('nom-solo')) {
        const title = root.querySelector('.c-caption strong')
        const subtitle = root.querySelector('.c-caption em')
        if (sceneId === 'voxNominations') {
          root.querySelector('.nom-warning').textContent = 'SECRET HUBMATE BALLOTS · COUNTED'
          title.textContent = `${cast.a.name} is nominated.`
          subtitle.textContent = 'THE PUBLIC WILL VOTE TO ELIMINATE.'
        } else {
          title.textContent = `${cast.a.name} is nominated.`
          subtitle.textContent = 'ONE NAME. ONE PLACE ON THE BLOCK.'
        }
      }
      stage.append(root)
      shadow.append(style, stage)
      const duration =
        details.replacementOutcome?.durationMs ??
        decisionTiming?.duration ??
        (root.classList.contains('nom-coloh-active')
          ? 6000
          : id === 'nominations' && root.classList.contains('nom-solo')
            ? 3800
            : SCENES[sceneId].duration)
      startTime = document.timeline.currentTime
      if (id === 'nominations' && options.matchHandoff) {
        const rect = options.origin
        host.style.transformOrigin = rect
          ? `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`
          : '50% 50%'
        animations.push(
          host.animate(
            [
              { opacity: 0, transform: 'scale(1.018)' },
              { opacity: 1, transform: 'scale(1)' },
            ],
            { duration: 280, fill: 'both', easing: 'cubic-bezier(.18,.65,.3,1)' }
          )
        )
      }

      const a = (selector, stops) => {
        const targets =
          typeof selector === 'string' ? [...root.querySelectorAll(selector)] : [selector]
        if (!targets.length) throw new Error('Missing film layer ' + selector)
        for (const node of targets) {
          const fittedRotation = node.dataset.fittedCrown ? node.style.transform : ''
          const animation = node.animate(
            stops.map(([ms, opacity, transform, easing]) => ({
              offset: ms / duration,
              opacity:
                id === 'nominations' && options.matchHandoff && node === root && ms === duration
                  ? 1
                  : opacity,
              ...(transform
                ? { transform: transform + (fittedRotation ? ' ' + fittedRotation : '') }
                : {}),
              ...(easing ? { easing } : {}),
            })),
            { duration, fill: 'both', easing: 'linear' }
          )
          animation.startTime = startTime
          animations.push(animation)
        }
      }
      if (id === 'replacement')
        animateReplacementFilm(root, a, details.replacementOutcome, duration)
      else if (!id) animateVoxFilm(sceneId, root, a, duration, later)
      else if (id === 'loh') animateLoh(root, a)
      else if (decision) animateDecisionScene(id, root, a, decisionOptions)
      else if (root.classList.contains('nom-calibrated')) animateNominationFilm(root, a, duration)
      else if (root.classList.contains('nom-royal')) animateRoyalNomination(root, a)
      else if (id === 'nominations' && sceneId === id)
        animateScene(id, root, (selector, stops) =>
          a(
            selector,
            stops.map(([ms, ...rest]) => [Math.round((ms / 4800) * duration), ...rest])
          )
        )
      else animateScene(id, root, a, SHOCK_VARIANTS[shockType] || SHOCK_VARIANTS.generic)
      if (
        id === 'nominations' &&
        images.cinema_standC &&
        sceneId === id &&
        !root.classList.contains('nom-royal') &&
        !root.classList.contains('nom-calibrated')
      ) {
        a('.nom-third', [
          [0, 0, 'translateY(18px)'],
          [2700, 0, 'translateY(18px)'],
          [3280, 1, 'translateY(0)'],
          [duration, 1],
        ])
        a('.nom-third .nom-aura', [
          [0, 0],
          [2950, 0],
          [3370, 0.8],
          [duration, 0.5],
        ])
      }
      if (id === 'shock') animateShockTheme(root, shockType, a, duration)
      if (sceneId !== id) animateModeLayers(sceneId, root, a, duration)
      if (id === 'safety')
        a('.fitted-knight-shield', [
          [0, 0],
          [1680, 0],
          [1810, 1],
          [4200, 1],
        ])
      const endAt =
        decisionTiming?.handoffAt ??
        (id === 'replacement' || root.classList.contains('nom-calibrated')
          ? duration - 220
          : duration)
      later(() => {
        if (dead) return
        if (decision) {
          animations.forEach((a) => {
            a.pause()
            a.currentTime = endAt
          })
          handedOff = true
          onHandoff()
        } else if (id === 'nominations' && options.matchHandoff) {
          onHandoff()
          animations.push(
            host.animate(
              [
                { opacity: 1, transform: 'scale(1)' },
                { opacity: 0, transform: 'scale(.985)' },
              ],
              { duration: 240, fill: 'both', easing: 'ease-in-out' }
            )
          )
          later(() => {
            stop()
            onComplete()
          }, 250)
        } else {
          animations.push(
            host.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 220,
              fill: 'both',
              easing: 'ease-in-out',
            })
          )
          later(() => {
            stop()
            onComplete()
          }, 230)
        }
      }, endAt)
    },
    nativeReady(rosterOnly = false) {
      if (dead || !handedOff || nativeRevealed) return
      nativeRevealed = true
      // Premium departures reveal the coloured roster immediately. The full native
      // fallback still covers its 480 ms tile-to-Grey-Lux expansion.
      later(
        () => {
          if (!host || dead) return
          const fade = host.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: rosterOnly ? 140 : 260,
            fill: 'both',
          })
          animations.push(fade)
          later(dropFilm, rosterOnly ? 150 : 270)
        },
        rosterOnly ? 0 : 480
      )
    },
    seek(ms) {
      for (const timer of timers) clearTimeout(timer.handle)
      timers.clear()
      animations.forEach((a) => {
        a.pause()
        a.currentTime = ms
      })
    },
    get root() {
      return root
    },
    get metrics() {
      return prepared
        ? {
            preparationMs: prepared.preparationMs,
            transferBytes: prepared.transferBytes,
            decodedBytes: prepared.decodedBytes,
          }
        : null
    },
    get counts() {
      return {
        animations: animations.length,
        timers: timers.size,
        mounted: Boolean(host),
        retainedImages: prepared ? Object.keys(prepared.images).length : 0,
      }
    },
  }
}

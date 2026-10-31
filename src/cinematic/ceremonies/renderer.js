import sheet0 from './approved/styles.css?raw'
import sheet1 from './approved/ceremony-lab.css?raw'
import sheet2 from './approved/cinema-scenes.css?raw'
import sheet3 from './approved/cinema-depth.css?raw'
import sheet4 from './approved/cinema-refinement.css?raw'
import sheet5 from './approved/cinema-finesse.css?raw'
import fittingStyles from './fitting.css?raw'
import { decorateShock, animateShockTheme } from './shock-themes.js'
import { CEREMONIES, SHOCK_VARIANTS } from './approved/ceremony-player.js'
import { makeScene, animateScene } from './approved/ceremony-storyboards.js'
import {
  DECISION_CONFIG,
  makeDecisionScene,
  animateDecisionScene,
} from './approved/decision-exit.js'
import shared from './shared-manifest.json'
import announcementAtmosphere from './optical.json'
import premiumVfx from './vfx.json'
import { shockMotifKeys } from './shock-motifs.js'

export const SCENES = { loh: { label: 'LOH crowning', duration: 4400 }, ...CEREMONIES }
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

export function sceneResources(id, cast, shockType = 'doubleEviction') {
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
      ? ['winner', 'royal', 'seated', 'throne', 'crown', 'curtain', 'cinema_royalRoom']
      : SCENES[id].art.filter((key) => !['cinema_avatarC', 'cinema_eliminatedStamp'].includes(key))
  if (id === 'shock') keys.push('shockAtmosphere', 'shockMist', ...shockMotifKeys(shockType))
  if (id === 'nominations' && new Set([cast.a.id, cast.b.id, cast.c.id]).size === 3)
    keys.push('cinema_standC')
  // Final 4 needs only its Safety holder's rear pose and the two nominees.
  const needed = keys.filter(
    (key) =>
      !(DECISION_CONFIG[id] && key === (id === 'final4' ? 'cinema_decisionA' : 'cinema_decisionB'))
  )
  return Object.fromEntries(
    needed.map((key) => {
      if (premiumVfx[key]) return [key, premiumVfx[key]]
      if (key === 'shockAtmosphere') return [key, announcementAtmosphere]
      if (actors[key]) return [key, actors[key]]
      const file = props[key] + '.webp',
        asset = shared[file]
      if (!asset) throw new Error('No reusable resource for ' + key)
      return [key, { src: 'assets/ceremonies/shared/' + file, ...asset }]
    })
  )
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
    '<div class="loh-backdrop"></div><div class="loh-halo"></div><div class="loh-floor"></div><div class="loh-room-pieces"></div><div class="loh-figure"><div class="loh-before loh-pose"></div><div class="loh-royal loh-pose"></div></div><div class="loh-seated"></div><div class="loh-flash"></div><div class="loh-seat-flash"></div><div class="loh-titles"><div class="loh-kicker">ALL HAIL YOUR NEW</div><div class="loh-name">Leader of the Hub</div><div class="loh-title">THE CROWN IS YOURS.</div></div>'
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
  const seated = root.querySelector('.loh-seated')
  seated.append(
    clone('throne', 'loh-seat-throne'),
    clone('seated', 'loh-seated-image'),
    clone('crown', 'loh-seated-crown')
  )
  const room = root.querySelector('.loh-room-pieces')
  for (const direction of ['left', 'right']) {
    const wrap = document.createElement('div')
    wrap.className = 'loh-curtain loh-curtain-' + direction
    wrap.append(clone('curtain', 'loh-prop-image'))
    room.append(wrap)
  }
  return root
}

function animateLoh(root, a) {
  a(root, [
    [0, 0],
    [180, 1],
    [4020, 1],
    [4400, 0],
  ])
  a('.loh-backdrop', [
    [0, 0.35, 'scale(1.09)'],
    [4400, 0.58, 'scale(1.015)'],
  ])
  a('.loh-figure', [
    [0, 0, 'translateY(22px) scale(.94)'],
    [550, 1, 'translateY(0) scale(1)'],
    [2319, 1, 'scale(1.008)', 'steps(1,end)'],
    [2320, 0],
    [4400, 0],
  ])
  a('.loh-crown', [
    [0, 0, 'translateY(-36px)'],
    [650, 0, 'translateY(-36px)'],
    [1060, 1, 'translateY(-2px)'],
    [1160, 1, 'translateY(0)'],
    [4400, 1, 'translateY(0)'],
  ])
  a('.loh-before', [
    [0, 1],
    [1300, 1],
    [1660, 0],
    [4400, 0],
  ])
  a('.loh-royal', [
    [0, 0],
    [1300, 0],
    [1660, 1],
    [4400, 1],
  ])
  a('.loh-flash', [
    [0, 0],
    [1260, 0],
    [1420, 0.65],
    [1770, 0],
    [4400, 0],
  ])
  a('.loh-halo', [
    [0, 0, 'scale(.8)'],
    [580, 0.7, 'scale(1)'],
    [1700, 1, 'scale(1.12)'],
    [4400, 0.8, 'scale(1.15)'],
  ])
  a('.loh-floor', [
    [0, 0],
    [600, 1],
    [4400, 1],
  ])
  for (const [side, dir] of [
    ['left', -1],
    ['right', 1],
  ])
    a('.loh-curtain-' + side, [
      [0, 0, `translateX(${dir * 125}px)`],
      [1120, 0, `translateX(${dir * 125}px)`],
      [1760, 1, 'translateX(0)'],
      [4400, 1],
    ])
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
  a('.loh-titles', [
    [0, 0, 'translateY(10px)'],
    [1660, 0, 'translateY(10px)'],
    [2040, 1, 'translateY(0)'],
    [4400, 1],
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
    async prepare(id, cast, shockType = 'doubleEviction') {
      sceneId = id
      const resources = sceneResources(id, cast, shockType),
        start = performance.now()
      stylePromise ??= Promise.resolve(
        [sheet0, sheet1, sheet2, sheet3, sheet4, sheet5, fittingStyles].join('\n')
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
      const id = sceneId,
        decision = Boolean(DECISION_CONFIG[id]),
        { images, resources, css, cast } = prepared
      host = document.createElement('div')
      host.className = 'game-sample-film'
      parent.append(host)
      const shadow = host.attachShadow({ mode: 'open' }),
        style = document.createElement('style')
      style.textContent = css
      const stage = document.createElement('div')
      stage.className = 'stage is-playing'
      root =
        id === 'loh'
          ? makeLoh(images)
          : decision
            ? makeDecisionScene(id, images, 0, { nativeHandoff: true })
            : makeScene(id, images, SHOCK_VARIANTS[shockType] || SHOCK_VARIANTS.generic, 0)
      if (id === 'nominations' && images.cinema_standC) {
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
      if (id === 'shock') decorateShock(root, shockType, images)
      fitScene(root, id, images, resources, cast)
      if (id === 'loh') {
        for (const [selector, key] of [
          ['.loh-before .loh-crown', 'winner'],
          ['.loh-royal .loh-crown', 'royal'],
          ['.loh-seated-crown', 'seated'],
        ])
          fitCrown(root.querySelector(selector), resources[key])
        const t = resources.seated.throne
        root.querySelector('.loh-seat-throne').style.transform =
          `translate(${percent(t.x)},${percent(t.y)}) scale(${t.scale})`
        root.querySelector('.loh-name').textContent = cast.a.name
      }
      stage.append(root)
      shadow.append(style, stage)
      const duration = SCENES[id].duration
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
        if (rect) {
          const glow = document.createElement('div')
          glow.className = 'vip-nomination-match'
          Object.assign(glow.style, {
            position: 'fixed',
            left: rect.left + 'px',
            top: rect.top + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px',
            border: '1px solid #cfb377',
            borderRadius: '18px',
            boxShadow: '0 0 24px #c09c5c88',
            pointerEvents: 'none',
            zIndex: 10002,
          })
          parent.append(glow)
          transitionNodes.push(glow)
          animations.push(
            glow.animate(
              [
                { opacity: 0, transform: 'scale(1)' },
                { opacity: 1, offset: 0.3 },
                { opacity: 0, transform: 'scale(1.12)' },
              ],
              { duration: 360, fill: 'both', easing: 'ease-out' }
            )
          )
          later(() => glow.remove(), 370)
        }
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
      if (id === 'loh') animateLoh(root, a)
      else if (decision) animateDecisionScene(id, root, a, { nativeHandoff: true })
      else animateScene(id, root, a, SHOCK_VARIANTS[shockType] || SHOCK_VARIANTS.generic)
      if (id === 'nominations' && images.cinema_standC) {
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
      if (id === 'safety')
        a('.fitted-knight-shield', [
          [0, 0],
          [1680, 0],
          [1810, 1],
          [4200, 1],
        ])
      const endAt = decision ? DECISION_CONFIG[id].avatarAt + 140 : duration
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
          stop()
          onComplete()
        }
      }, endAt)
    },
    nativeReady() {
      if (dead || !handedOff || nativeRevealed) return
      nativeRevealed = true
      // The real component begins over its measured roster tile. Cover that
      // expansion; reveal its real Grey Lux portrait after its 480 ms push.
      later(() => {
        if (!host || dead) return
        const fade = host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'both' })
        animations.push(fade)
        later(dropFilm, 270)
      }, 480)
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

import './finalDecisionScene.css'
import { paginateCeremonyCaption } from './finalDecisionCaptions.mjs'

// A reusable physical housing with a live DOM screen. The generated asset
// supplies only the object; all changing broadcast content stays editable.
function createCeremonyMonitor(parent, options) {
  const cfg = options || {}
  const element = document.createElement('div')
  element.className = 'fd-monitor'
  element.style.aspectRatio = String(cfg.aspectRatio || 1923 / 818)
  element.dataset.hasHousing = String(Boolean(cfg.src))
  if (cfg.src) {
    const housing = document.createElement('img')
    housing.className = 'fd-monitor-housing'
    housing.src = cfg.src
    housing.alt = ''
    housing.draggable = false
    housing.setAttribute('aria-hidden', 'true')
    element.appendChild(housing)
  }
  const screen = document.createElement('div')
  screen.className = 'fd-monitor-screen'
  const rect = cfg.screen || { x: 0.071, y: 0.165, width: 0.858, height: 0.642 }
  screen.style.left = rect.x * 100 + '%'
  screen.style.top = rect.y * 100 + '%'
  screen.style.width = rect.width * 100 + '%'
  screen.style.height = rect.height * 100 + '%'
  const content = document.createElement('div')
  content.className = 'fd-monitor-content'
  screen.appendChild(content)
  element.appendChild(screen)
  parent.appendChild(element)
  return {
    element,
    screen,
    content,
    setFrame(kind, render) {
      element.dataset.frame = kind
      content.replaceChildren()
      if (typeof render === 'function') render(content)
      else if (render && render.nodeType) content.appendChild(render)
      else if (render != null) content.textContent = String(render)
    },
    dispose() {
      element.remove()
    },
  }
}

// A store-independent presentation. This component never rolls an outcome,
// applies an eviction, pays a reward or advances the game.
function mountFinalDecision(root, config) {
  if (!root) throw new Error('Final decision preview requires a root element.')
  const cfg = config || {}
  const isPreview = Boolean(cfg.preview)
  const fixture = cfg.fixture || {}
  const nominees = fixture.nominees || []
  if (
    nominees.length !== 2 ||
    !nominees[0].id ||
    !nominees[1].id ||
    nominees[0].id === nominees[1].id
  ) {
    throw new Error('The final decision requires exactly two distinct nominees.')
  }
  const holder = fixture.holder || { id: 'player', name: 'You' }
  // A broadcast receives the game's resolved decision. It may reveal that
  // result, but it must never choose a replacement or leak it before the seal.
  const automaticDecision = cfg.automaticDecision ? { ...cfg.automaticDecision } : null
  if (
    automaticDecision &&
    (typeof automaticDecision.evicteeId !== 'string' ||
      automaticDecision.evicteeId === holder.id ||
      !nominees.some((person) => person.id === automaticDecision.evicteeId))
  ) {
    throw new Error('The automatic final decision must name one of the two nominees.')
  }
  const viewerIsNominee = nominees.some((person) => person.id === cfg.viewerId)
  const scene = root.querySelector('.scene') || root.appendChild(document.createElement('div'))
  scene.classList.add('scene')
  const assets = cfg.assets || {}
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  let reduced =
    cfg.reducedMotion === undefined ? Boolean(mq && mq.matches) : Boolean(cfg.reducedMotion)
  let disposed = false
  let stage = 'welcome'
  let selected = null
  let confirmed = null
  let committed = false
  let completed = false
  let announcementFrame = 0
  let captionPage = 0
  let captionPages = []
  let screenAnimation = null
  let cameraAnimation = null
  let compositionSize = ''
  let reviewIndex = -1
  let manualReadingStage = null
  let run = 1
  let timer = null
  const pauses = new Set()
  if (document.hidden) pauses.add('visibility')
  if (cfg.initiallyPaused) pauses.add('presentation')
  const animations = new Set()
  const ambientAnimations = new Set()
  const cameraDollyPath = [
    { offset: 0, x: -0.3, y: 0.18, zoom: 0 },
    { offset: 0.5, x: 0.08, y: 0.03, zoom: 0.012 },
    { offset: 1, x: 0.45, y: -0.12, zoom: 0.02 },
  ]
  const layerNodes = {}
  const layerState = {
    background: true,
    cast: true,
    foreground: true,
    token: true,
    monitor: true,
    lighting: true,
  }
  const cleanups = []
  let decisionCount = 0
  let completionCount = 0

  const node = (tag, cls, parent, text) => {
    const el = document.createElement(tag)
    if (cls) el.className = cls
    if (text != null) el.textContent = text
    if (parent) parent.appendChild(el)
    return el
  }
  const source = (key) => {
    const item = assets[key]
    return typeof item === 'string' ? item : (item && item.src) || ''
  }
  const image = (key, cls, parent, alt) => {
    const el = node('img', cls, parent)
    el.alt = alt || ''
    el.draggable = false
    el.decoding = 'async'
    const src = source(key)
    if (src) el.src = src
    else el.hidden = true
    return el
  }
  const button = (label, cls, parent, action) => {
    const el = node('button', cls, parent, label)
    el.type = 'button'
    el.addEventListener('click', action)
    return el
  }
  const fire = (name, payload) => {
    if (typeof cfg[name] === 'function') cfg[name](payload)
  }

  scene.replaceChildren()
  scene.setAttribute(
    'aria-label',
    automaticDecision
      ? viewerIsNominee
        ? 'Classic Final Three: your place in the final'
        : 'Classic Final Three: the final decision'
      : 'Classic Final Three: your last decision'
  )
  scene.dataset.decisionMode = automaticDecision ? 'automatic' : 'interactive'
  scene.dataset.viewerRole = automaticDecision
    ? viewerIsNominee
      ? 'nominee'
      : 'spectator'
    : 'holder'
  scene.dataset.noMotion = String(reduced)
  // The slow dolly lives above shot framing so a new speaker never restarts it.
  // Screen copy and controls stay outside the moving camera.
  const cameraDrift = node('div', 'fd-camera-drift', scene)
  const world = node('div', 'fd-world', cameraDrift)
  const backdrop = image('background', 'fd-background', world, '')
  backdrop.setAttribute('aria-hidden', 'true')
  node('div', 'fd-architecture-shade', world).setAttribute('aria-hidden', 'true')
  layerNodes.background = [backdrop]
  const light = node('div', 'fd-light-layer', world)
  light.setAttribute('aria-hidden', 'true')
  const leftBeam = node('div', 'fd-beam fd-beam--left', light)
  const rightBeam = node('div', 'fd-beam fd-beam--right', light)
  const halo = node('div', 'fd-halo', light)
  const backlight = node('div', 'fd-backlight', light)
  const floorLight = node('div', 'fd-floor-light', light)
  const architectureSweep = node('div', 'fd-architecture-sweep', light)
  node('div', 'fd-speaker-focus', light)
  const eliminationLight = node('div', 'fd-elimination-light', world)
  eliminationLight.setAttribute('aria-hidden', 'true')
  const dustRoot = node('div', 'fd-dust', world)
  dustRoot.setAttribute('aria-hidden', 'true')
  const dust = Array.from({ length: 14 }, (_, index) => {
    const mote = node('i', 'fd-dust-mote', dustRoot)
    mote.style.left = ((index * 29 + 7) % 94) + '%'
    mote.style.top = 29 + ((index * 17) % 59) + '%'
    return mote
  })
  const actorRoot = node('div', 'fd-actors', world)
  const actors = []
  function actor(person, role, assetKey) {
    const el = node('div', 'fd-actor fd-actor--' + role, actorRoot)
    el.dataset.playerId = person.id
    node('div', 'fd-contact', el).setAttribute('aria-hidden', 'true')
    node('div', 'fd-actor-rim', el).setAttribute('aria-hidden', 'true')
    const pose = node('div', 'fd-pose', el)
    image(assetKey, 'fd-figure', pose, person.name)
    if (role === 'holder') {
      el.setAttribute('aria-label', holder.name + ', Final Power holder')
      if (source('crown')) {
        const crown = image('crown', 'fd-crown', pose, '')
        // Default calibration is the explicitly selected demo pack,
        // character-3 / royal-standing. Other packs supply their own anchor.
        const anchor = cfg.holderCrownAnchor ||
          holder.crownAnchor || {
            x: 0.50208,
            baseY: 0.06878,
            width: 0.11162,
            angle: 0,
          }
        crown.style.width = anchor.width * 100 + '%'
        crown.style.left = (anchor.x - anchor.width / 2) * 100 + '%'
        crown.style.top = (anchor.baseY - anchor.width * (2 / 3) * (44 / 144)) * 100 + '%'
        crown.style.transform = 'rotate(' + (anchor.angle || 0) + 'deg)'
      }
    }
    actors.push(el)
    return el
  }
  const holderActor = actor(holder, 'holder', 'holder')
  const nomineeActors = nominees.map((person, index) =>
    actor(person, index === 0 ? 'aria' : 'dex', person.assetKey || person.id)
  )
  layerNodes.cast = [actorRoot]
  const mist = image('mist', 'fd-mist', world, '')
  const foregroundDepth = node('div', 'fd-foreground-depth', world)
  const foreground = image('foreground', 'fd-foreground', foregroundDepth, '')
  layerNodes.foreground = [foreground]
  const token = node('div', 'fd-token', world)
  token.setAttribute('aria-hidden', 'true')
  const tokenFloat = node('div', 'fd-token-float', token)
  const tokenAura = node('div', 'fd-token-aura', tokenFloat)
  image('token', '', tokenFloat, '')
  layerNodes.token = [token]
  layerNodes.lighting = [light, mist, dustRoot, eliminationLight]
  node('div', 'fd-grade', scene).setAttribute('aria-hidden', 'true')
  const monitor = createCeremonyMonitor(scene, { ...(cfg.monitor || {}), src: source('monitor') })
  const monitorSheen = node('div', 'fd-monitor-sheen', monitor.element)
  monitorSheen.setAttribute('aria-hidden', 'true')
  layerNodes.monitor = [monitor.element]
  const topbar = node('div', 'fd-topbar', scene)
  const reviewButton = button('Review finalists', 'fd-top-button fd-review-button', topbar, () =>
    openReview()
  )
  reviewButton.setAttribute('aria-label', 'Review finalist comparisons')
  const bottom = node('div', 'fd-bottom', scene)
  const actions = node('div', 'fd-actions', bottom)
  const live = node('p', 'fd-sr', scene)
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')

  let tools = null
  if (isPreview) {
    tools = node('details', 'fd-layer-tools', root)
    node('summary', '', tools, 'Scene layers')
    const options = node('div', 'fd-layer-options', tools)
    const layerLabels = {
      background: 'Architecture',
      cast: 'Characters',
      foreground: 'Decision desk',
      token: 'Decision seal',
      monitor: 'Broadcast monitor',
      lighting: 'Lighting & mist',
    }
    Object.keys(layerLabels).forEach((key) => {
      const label = node('label', '', options)
      const checkbox = node('input', '', label)
      checkbox.type = 'checkbox'
      checkbox.checked = true
      node('span', '', label, layerLabels[key])
      checkbox.addEventListener('change', () => {
        layerState[key] = checkbox.checked
        ;(layerNodes[key] || []).forEach((el) => {
          el.style.visibility = checkbox.checked ? '' : 'hidden'
        })
      })
    })
    node(
      'p',
      'fd-layer-hint',
      tools,
      'Each layer remains separate. Open this view to pause the scene and inspect the composition.'
    )
    const onToolsToggle = () => {
      if (tools.open) addPause('layers')
      else removePause('layers')
    }
    tools.addEventListener('toggle', onToolsToggle)
    cleanups.push(() => tools.removeEventListener('toggle', onToolsToggle))
  }

  function snapshot() {
    return {
      stage,
      decisionMode: automaticDecision ? 'automatic' : 'interactive',
      viewerRole: scene.dataset.viewerRole,
      selectedId: selected,
      confirmedId: confirmed,
      keptId: confirmed ? nominees.find((p) => p.id !== confirmed).id : null,
      paused: pauses.size > 0,
      pauseReasons: Array.from(pauses),
      decisionCount,
      completionCount,
      run,
      reducedMotion: reduced,
      layers: { ...layerState },
      screenFrame: monitor.element.dataset.frame,
      announcementFrame,
      captionPage,
      captionPageCount: captionPages.length,
      reviewing: reviewIndex >= 0,
      reviewIndex,
      isolatedPlayerId: confirmed,
      disposed,
    }
  }
  function cancelTimer() {
    if (!timer) return
    window.clearTimeout(timer.id)
    timer = null
  }
  function armTimer() {
    if (!timer || pauses.size || disposed) return
    timer.start = performance.now()
    timer.id = window.setTimeout(
      () => {
        const runTimer = timer
        timer = null
        if (!disposed && runTimer) runTimer.fn()
      },
      Math.max(0, timer.remaining)
    )
  }
  function schedule(ms, fn) {
    cancelTimer()
    timer = { remaining: ms, start: performance.now(), fn, id: null }
    armTimer()
  }
  function freezeAnimation(animation) {
    // pause() settles on the browser's next animation tick. Pin its current time
    // immediately so even that pending tick cannot advance an owned shot.
    const time = animation.currentTime
    animation.pause()
    if (time != null) animation.currentTime = time
  }
  function animate(el, frames, options, ambient = false) {
    if (reduced || !el || typeof el.animate !== 'function') return null
    const animation = el.animate(frames, options)
    const owned = ambient ? ambientAnimations : animations
    owned.add(animation)
    // Forward-filled animations still affect the element after finishing.
    // Retain ownership so the next stage, replay or disposal can cancel them.
    animation.onfinish = () => {
      if (options.fill !== 'forwards' && options.fill !== 'both') owned.delete(animation)
    }
    animation.oncancel = () => owned.delete(animation)
    if (pauses.size) freezeAnimation(animation)
    return animation
  }
  function stopAnimations(includeAmbient = false) {
    Array.from(animations).forEach((animation) => animation.cancel())
    animations.clear()
    if (includeAmbient) {
      Array.from(ambientAnimations).forEach((animation) => animation.cancel())
      ambientAnimations.clear()
    }
  }
  function startAmbientMotion() {
    if (reduced || disposed || ambientAnimations.size) return
    const loop = (element, frames, duration, delay = 0) =>
      animate(
        element,
        frames,
        { duration, delay, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
        true
      )
    // One shared camera path gives the architecture, cast and near desk a
    // coherent sense of depth. Its long travel survives every story beat;
    // different depths amplify the same move rather than bob independently.
    const dolly = (element, depth, baseScale = 1) =>
      animate(
        element,
        cameraDollyPath.map(({ offset, x, y, zoom }) => ({
          offset,
          transform:
            'translate3d(' +
            x * depth +
            '%,' +
            y * depth +
            '%,0) scale(' +
            (baseScale + zoom * depth) +
            ')',
        })),
        {
          duration: 24000,
          iterations: Infinity,
          direction: 'alternate',
          easing: 'cubic-bezier(.45,0,.55,1)',
        },
        true
      )
    dolly(cameraDrift, 1)
    dolly(backdrop, -0.35, 1.035)
    dolly(foregroundDepth, 0.55)
    loop(leftBeam, [{ transform: 'rotate(-18deg)' }, { transform: 'rotate(12deg)' }], 6700)
    loop(rightBeam, [{ transform: 'rotate(18deg)' }, { transform: 'rotate(-12deg)' }], 7900)
    loop(
      backlight,
      [
        { opacity: 0.45, transform: 'scaleX(.82)' },
        { opacity: 0.85, transform: 'scaleX(1.12)' },
      ],
      5800
    )
    loop(
      floorLight,
      [
        { opacity: 0.45, transform: 'translateX(-8%)' },
        { opacity: 0.85, transform: 'translateX(8%)' },
      ],
      7300
    )
    loop(
      architectureSweep,
      [
        { transform: 'translateX(-110%) skewX(-18deg)', opacity: 0 },
        { transform: 'translateX(-20%) skewX(-18deg)', opacity: 0.35, offset: 0.4 },
        { transform: 'translateX(110%) skewX(-18deg)', opacity: 0 },
      ],
      11500
    )
    loop(
      halo,
      [
        { opacity: 0.45, transform: 'scale(.94)' },
        { opacity: 0.9, transform: 'scale(1.08)' },
      ],
      6800
    )
    loop(
      mist,
      [
        { transform: 'translateX(-9%) scale(1.05)', opacity: 0.16 },
        { transform: 'translateX(9%) scale(1.12)', opacity: 0.3 },
      ],
      12000
    )
    loop(
      tokenFloat,
      [
        { transform: 'translateY(2px) rotate(-2deg)' },
        { transform: 'translateY(-3px) rotate(2deg)' },
      ],
      4300
    )
    loop(
      tokenAura,
      [
        { opacity: 0.3, transform: 'scale(.92)' },
        { opacity: 0.8, transform: 'scale(1.12)' },
      ],
      3800
    )
    loop(
      monitorSheen,
      [
        { transform: 'translateX(-180%) skewX(-20deg)', opacity: 0.05 },
        { transform: 'translateX(180%) skewX(-20deg)', opacity: 0.22 },
      ],
      13000
    )
    actors.forEach((el, index) =>
      loop(
        el.querySelector('.fd-pose'),
        [{ transform: 'scale(1,1)' }, { transform: 'scale(1.004,1.006)' }],
        6100 + index * 900,
        -index * 1700
      )
    )
    dust.forEach((mote, index) =>
      loop(
        mote,
        [
          { transform: 'translate3d(-5px,14px,0)', opacity: 0.08 },
          { transform: 'translate3d(9px,-25px,0)', opacity: 0.55 },
        ],
        7800 + index * 570,
        -index * 1100
      )
    )
  }
  function cameraPose() {
    const compact = scene.clientHeight < 660
    if (reduced) return { scale: 1, x: 0, y: 0 }
    if (confirmed) {
      return { scale: compact ? 1.055 : stage === 'seal' ? 1.055 : 1.085, x: 0, y: 0 }
    }
    if (stage === 'establish') return { scale: 1.08, x: 0, y: 0 }
    if (stage === 'deliberate') {
      return { scale: compact ? 1.11 : 1.18, x: 0, y: compact ? 0.007 : 0.01 }
    }
    if (stage === 'plea-a' || stage === 'plea-b' || (stage === 'confirm' && compact)) {
      const left = stage === 'plea-a' || (stage === 'confirm' && selected === nominees[0].id)
      return {
        scale: compact ? 1.11 : 1.17,
        x: (left ? 1 : -1) * (compact ? 0.045 : 0.052),
        y: compact ? 0.007 : 0.01,
      }
    }
    return { scale: stage === 'confirm' ? 1.1 : 1.055, x: 0, y: 0 }
  }
  function layoutComposition() {
    const width = scene.clientWidth
    const height = scene.clientHeight
    if (!width || !height) return
    const size = width + 'x' + height
    if (compositionSize && compositionSize !== size) cameraAnimation?.cancel()
    compositionSize = size
    const compact = height < 660
    scene.classList.toggle('fd-compact', compact)
    const nomineeFloor = compact ? 0.82 : 0.79
    const holderFloor = compact ? 0.74 : 0.69
    scene.style.setProperty('--fd-nominee-bottom', height * (1 - nomineeFloor) + 'px')
    scene.style.setProperty('--fd-holder-bottom', height * (1 - holderFloor) + 'px')
    const camera = cameraPose()
    world.style.transform =
      'scale(' + camera.scale + ') translate(' + camera.x * 100 + '%,' + camera.y * 100 + '%)'
    const sceneRect = scene.getBoundingClientRect()
    const monitorBottom = monitor.element.getBoundingClientRect().bottom - sceneRect.top
    // Establish real floor anchors, then size the cast to the usable space.
    // The compact layout reserves enough headroom for the strongest camera shot.
    const nomineeWidth = Math.max(
      80,
      Math.min(width * 0.62, (height * nomineeFloor - monitorBottom - 40) / 1.5)
    )
    const holderWidth = Math.max(
      64,
      Math.min(width * 0.44, (height * holderFloor - monitorBottom - 66) / 1.5)
    )
    scene.style.setProperty('--fd-nominee-width', nomineeWidth + 'px')
    scene.style.setProperty('--fd-holder-width', holderWidth + 'px')
    // Use the destination camera, not an intermediate animation matrix. A late
    // font load or resize must never move the ornament into the monitor/head.
    const worldTop = height * 0.63 * (1 - camera.scale) + height * camera.y * camera.scale
    // Reserve clearance for the entire dolly, not only its current phase. The
    // ornament must remain below the fixed monitor at the closest camera point.
    const dollyScale = reduced ? 1 : 1 + Math.max(...cameraDollyPath.map((pose) => pose.zoom))
    const dollyY = reduced ? 0 : Math.min(...cameraDollyPath.map((pose) => pose.y)) / 100
    const dollyTop = height * 0.63 * (1 - dollyScale) + height * dollyY
    const monitorCameraBottom = (monitorBottom - dollyTop) / dollyScale
    const monitorWorldBottom = (monitorCameraBottom - worldTop) / camera.scale
    if (!confirmed) {
      const headTop = height * holderFloor - holderWidth * 1.5 * 1.006
      const gap = Math.max(0, headTop - monitorWorldBottom - 16)
      const tokenSize = Math.min(width * 0.16, 62, gap)
      token.style.width = Math.max(18, tokenSize) + 'px'
      token.style.height = Math.max(18, tokenSize) + 'px'
      token.style.top = (monitorWorldBottom + headTop) / 2 + 'px'
    }
    const evicteeWidth = Math.max(
      80,
      Math.min(width * 0.82, (height * 0.9 - monitorBottom - 40) / 1.5)
    )
    scene.style.setProperty('--fd-evictee-width', evicteeWidth + 'px')
    scene.style.setProperty('--fd-evictee-left', (width - evicteeWidth) / 2 + 'px')
  }
  function directCamera(from, duration) {
    const target = world.style.transform || window.getComputedStyle(world).transform
    cameraAnimation = animate(world, [{ transform: from }, { transform: target }], {
      duration,
      easing: 'cubic-bezier(.32,.08,.2,1)',
      fill: 'backwards',
    })
  }
  function captureIsolationStart() {
    return [...actors, foreground, token, eliminationLight].map((element) => {
      const style = window.getComputedStyle(element)
      const frame = Object.fromEntries(
        ['left', 'bottom', 'width', 'height', 'opacity', 'transform', 'filter'].map((key) => [
          key,
          style[key],
        ])
      )
      return { element, frame }
    })
  }
  function animateIsolation(start) {
    start.forEach(({ element, frame }) => {
      const isEvictee = element.dataset.playerId === confirmed
      const style = window.getComputedStyle(element)
      const target = Object.fromEntries(Object.keys(frame).map((key) => [key, style[key]]))
      animate(element, [frame, target], {
        duration: isEvictee ? 1600 : 950,
        delay: isEvictee ? 220 : 0,
        easing: 'cubic-bezier(.2,.65,.2,1)',
        fill: 'backwards',
      })
    })
  }
  function syncPausedUI() {
    actions.querySelectorAll('button').forEach((el) => {
      el.disabled = pauses.size > 0
    })
    reviewButton.disabled = pauses.size > 0
    scene.dataset.paused = String(pauses.size > 0)
  }
  function addPause(reason) {
    if (disposed || pauses.has(reason)) return
    const wasPaused = pauses.size > 0
    pauses.add(reason)
    if (!wasPaused) {
      if (timer) {
        window.clearTimeout(timer.id)
        timer.remaining = Math.max(0, timer.remaining - (performance.now() - timer.start))
        timer.id = null
      }
      if (typeof scene.getAnimations === 'function')
        scene.getAnimations({ subtree: true }).forEach((a) => {
          if (a.playState === 'running') {
            if (!ambientAnimations.has(a)) animations.add(a)
            freezeAnimation(a)
          }
        })
      fire('onCue', { cue: 'presentation:pause', sceneId: cfg.sceneId || 'classic-final-decision' })
    }
    syncPausedUI()
  }
  function removePause(reason) {
    if (!pauses.delete(reason) || disposed) return
    if (!pauses.size) {
      new Set([...animations, ...ambientAnimations]).forEach((a) => {
        if (a.playState === 'paused') a.play()
      })
      armTimer()
      fire('onCue', {
        cue: 'presentation:resume',
        sceneId: cfg.sceneId || 'classic-final-decision',
      })
    }
    syncPausedUI()
  }
  function pause(reason) {
    addPause(reason || 'user')
  }
  function resume(reason) {
    removePause(reason || 'user')
  }
  function fitMonitorNames() {
    const contentStyle = window.getComputedStyle(monitor.content)
    const height =
      monitor.content.clientHeight -
      parseFloat(contentStyle.paddingTop) -
      parseFloat(contentStyle.paddingBottom)
    monitor.content.querySelectorAll('.fd-monitor-person').forEach((item) => {
      const name = item.querySelector('strong')
      const status = item.querySelector('span')
      name.style.fontSize = ''
      const itemStyle = window.getComputedStyle(item)
      const available = Math.max(
        16,
        height - status.getBoundingClientRect().height - (parseFloat(itemStyle.gap) || 0)
      )
      let size = parseFloat(window.getComputedStyle(name).fontSize)
      const minimum = item.parentElement.classList.contains('fd-monitor-pair') ? 14 : 18
      while (size > minimum && name.getBoundingClientRect().height > available + 0.25) {
        size = Math.max(minimum, size - 0.5)
        name.style.fontSize = size + 'px'
      }
    })
  }
  function fitBroadcastCaption() {
    const caption = monitor.content.querySelector('.fd-broadcast-caption')
    const speaker = monitor.content.querySelector('.fd-broadcast-speaker')
    if (!caption || !speaker || !monitor.content.clientHeight) return
    // Refit from the designed size after a resize or late font load. A plea is
    // one complete thought, so its layout adapts without changing its words.
    caption.style.fontSize = ''
    caption.style.maxHeight = ''
    caption.style.overflowY = ''
    caption.removeAttribute('tabindex')
    caption.removeAttribute('role')
    caption.removeAttribute('aria-label')
    const style = window.getComputedStyle(monitor.content)
    const available = Math.max(
      0,
      monitor.content.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom) -
        speaker.getBoundingClientRect().height -
        (parseFloat(style.gap) || 0)
    )
    let size = parseFloat(window.getComputedStyle(caption).fontSize)
    while (size > 12 && caption.getBoundingClientRect().height > available + 0.5) {
      size = Math.max(12, size - 0.5)
      caption.style.fontSize = size + 'px'
    }
    // Production pleas fit in full at the readable minimum. Keep unusually
    // long custom/localized copy accessible on the same screen as a transcript.
    const scrollable = caption.getBoundingClientRect().height > available + 0.5
    caption.dataset.scrollable = String(scrollable)
    if (scrollable) {
      caption.style.maxHeight = available + 'px'
      caption.style.overflowY = 'auto'
      caption.tabIndex = 0
      caption.setAttribute('role', 'region')
      caption.setAttribute('aria-label', speaker.textContent + ': full message')
    }
  }
  function showFrame(kind, renderFrame, accessibleText) {
    // Remove the outgoing message before revealing its replacement. There
    // is never a second caption surface or a crossfade of two text frames.
    monitor.setFrame(kind, renderFrame)
    fitMonitorNames()
    fitBroadcastCaption()
    live.textContent = accessibleText || monitor.content.textContent
    if (screenAnimation) screenAnimation.cancel()
    screenAnimation = animate(
      monitor.content,
      [
        { opacity: 0, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 280, easing: 'ease-out', fill: 'backwards' }
    )
  }
  function titleFrame(kind, text) {
    showFrame(kind, (content) => node('h2', 'fd-monitor-title', content, text))
  }
  function personStatus(parent, person, status) {
    const item = node('div', 'fd-monitor-person', parent)
    node('strong', '', item, person.name)
    node('span', '', item, status)
    return item
  }
  function consequenceFrame() {
    const evictee = nominees.find((p) => p.id === (confirmed || selected))
    if (!evictee) return
    const kept = nominees.find((p) => p.id !== evictee.id)
    showFrame(
      'confirmation',
      (content) => {
        const wrapper = node('div', 'fd-monitor-pair', content)
        const leave = personStatus(wrapper, evictee, 'Eliminate')
        leave.dataset.outcome = 'leave'
        const stay = personStatus(wrapper, kept, 'Keep')
        stay.dataset.outcome = 'stay'
      },
      'Confirm your choice: eliminate ' + evictee.name + ' and keep ' + kept.name + '.'
    )
  }
  function announcementScreen() {
    const evictee = nominees.find((p) => p.id === confirmed)
    showFrame(
      'third-place',
      (content) => {
        personStatus(content, evictee, 'Third place')
      },
      automaticDecision && viewerIsNominee && evictee.id === cfg.viewerId
        ? 'You finish in third place.'
        : evictee.name + ' leaves in third place.'
    )
  }
  function automaticVerdictText() {
    const evictee = nominees.find((person) => person.id === confirmed)
    if (!evictee) return ''
    const address =
      evictee.id === cfg.viewerId && evictee.name.trim().toLowerCase() === 'you'
        ? ''
        : evictee.name + ', '
    const reason =
      typeof automaticDecision?.reason === 'string'
        ? automaticDecision.reason.trim().replace(/[.!?]+$/u, '')
        : ''
    return address + "I'm choosing to eliminate you" + (reason ? ' — ' + reason : '') + '.'
  }
  function readingHoldMs(text) {
    const words = String(text).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []
    const readingUnits = Math.max(words.length, Math.ceil(Array.from(String(text)).length / 6))
    return Math.max(4800, 1600 + readingUnits * 280)
  }
  function automaticReadingSuccessor() {
    if (stage === 'plea-a') return 'plea-b'
    if (stage === 'plea-b') return 'deliberate'
    if (stage === 'seal') return 'announcement'
    return null
  }
  function preserveAutomaticReading() {
    if (!automaticDecision || manualReadingStage === stage) return
    const next = automaticReadingSuccessor()
    const caption = monitor.content.querySelector('.fd-broadcast-caption')
    if (!next || caption?.dataset.scrollable !== 'true') return
    // Unusually long or enlarged copy belongs to the reader. Keep the whole
    // transcript in place until Continue or the shared Skip is used.
    manualReadingStage = stage
    cancelTimer()
    mainAction('Continue', () => go(next, true)).setAttribute(
      'aria-label',
      stage === 'seal' ? 'Continue after the verdict' : 'Continue after the full plea'
    )
    syncPausedUI()
  }
  function splitCaption(text) {
    const style = window.getComputedStyle(monitor.content)
    const width = Math.max(
      80,
      monitor.content.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0)
    )
    const probe = node('p', 'fd-broadcast-caption', monitor.content)
    Object.assign(probe.style, {
      position: 'absolute',
      visibility: 'hidden',
      width: width + 'px',
      pointerEvents: 'none',
    })
    const maxHeight = (parseFloat(window.getComputedStyle(probe).lineHeight) || 21.12) * 2
    const fits = (value) => {
      probe.textContent = value
      return probe.scrollHeight <= maxHeight + 0.5 && probe.scrollWidth <= width + 0.5
    }
    const pages = paginateCeremonyCaption(text, fits)
    probe.remove()
    return pages
  }
  function renderPlea() {
    const person = nominees[stage === 'plea-a' ? 0 : 1]
    const caption = person.plea || person.shortPlea || ''
    captionPages = [caption]
    captionPage = 0
    showFrame(
      'broadcast',
      (content) => {
        node(
          'p',
          'fd-broadcast-speaker',
          content,
          automaticDecision && person.id === cfg.viewerId && person.name.toLowerCase() !== 'you'
            ? person.name + ' · You'
            : person.name
        )
        node('p', 'fd-broadcast-caption', content, caption)
      },
      person.name + ': ' + caption
    )
    if (automaticDecision) {
      preserveAutomaticReading()
      return
    }
    mainAction(stage === 'plea-a' ? 'Hear ' + nominees[1].name : 'Make your decision', () =>
      go(stage === 'plea-a' ? 'plea-b' : 'choose', true)
    )
  }
  function focusAction() {
    const first = actions.querySelector('button:not(:disabled)')
    if (first) first.focus({ preventScroll: true })
  }
  function openReview() {
    if (stage !== 'choose' || pauses.size || disposed) return
    reviewIndex = nominees.findIndex((person) => Boolean(person.comparison))
    if (reviewIndex < 0) return
    captionPage = 0
    captionPages = []
    render()
    focusAction()
  }
  function closeReview() {
    reviewIndex = -1
    captionPage = 0
    captionPages = []
    render()
    focusAction()
  }
  function renderReview() {
    const person = nominees[reviewIndex]
    captionPages = splitCaption(person.comparison)
    captionPage = Math.min(captionPage, captionPages.length - 1)
    const caption = captionPages[captionPage]
    showFrame(
      'review',
      (content) => {
        node('p', 'fd-broadcast-speaker', content, person.name)
        node('p', 'fd-broadcast-caption', content, caption)
      },
      'Finalist review. ' + person.name + ': ' + caption
    )
    const nextIndex = nominees.findIndex(
      (candidate, index) => index > reviewIndex && Boolean(candidate.comparison)
    )
    const hasNext = captionPage < captionPages.length - 1 || nextIndex >= 0
    if (captionPage < captionPages.length - 1) {
      mainAction('Next', () => {
        captionPage += 1
        render()
        focusAction()
      }).setAttribute('aria-label', 'Next part of ' + person.name + "'s comparison")
    } else if (nextIndex >= 0) {
      mainAction('Review ' + nominees[nextIndex].name, () => {
        reviewIndex = nextIndex
        captionPage = 0
        render()
        focusAction()
      })
    }
    mainAction('Return to decision', closeReview, hasNext)
  }
  function mainAction(label, fn, quiet) {
    return button(label, 'fd-action' + (quiet ? ' fd-action--quiet' : ''), actions, () => {
      if (pauses.size || disposed) return
      fn()
    })
  }
  function outcome() {
    return {
      sceneId: cfg.sceneId || 'classic-final-decision',
      holderId: holder.id,
      evicteeId: confirmed,
      keptId: nominees.find((p) => p.id !== confirmed).id,
    }
  }
  function go(next, shouldFocus) {
    if (disposed) return
    const isolationStart = next === 'seal' ? captureIsolationStart() : null
    const cameraStart = window.getComputedStyle(world).transform
    cancelTimer()
    stopAnimations()
    manualReadingStage = null
    if (next !== stage && next.startsWith('plea')) {
      captionPage = 0
      captionPages = []
    }
    stage = next
    if (stage !== 'choose') reviewIndex = -1
    if (stage === 'announcement') announcementFrame = 0
    render()
    layoutComposition()
    startAmbientMotion()
    directCamera(
      stage === 'establish' ? 'scale(1.005) translateY(1.8%)' : cameraStart,
      stage === 'establish'
        ? 3400
        : stage === 'announcement'
          ? 3200
          : stage === 'deliberate'
            ? 2800
            : stage === 'seal'
              ? 2200
              : 2000
    )
    fire('onCheckpoint', { ...snapshot(), sceneId: cfg.sceneId || 'classic-final-decision' })
    if (shouldFocus)
      queueMicrotask(() => {
        if (disposed) return
        const first = actions.querySelector('button:not(:disabled)')
        if (first) first.focus({ preventScroll: true })
      })
    if (stage === 'establish') {
      fire('onCue', { cue: 'decision:begin', sceneId: cfg.sceneId || 'classic-final-decision' })
      if (!reduced) {
        actors.forEach((el, index) =>
          animate(
            el,
            [
              { opacity: 0, transform: 'translateY(18px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            {
              duration: 1100,
              delay: index * 180,
              easing: 'cubic-bezier(.2,.65,.2,1)',
              fill: 'backwards',
            }
          )
        )
        animate(light, [{ opacity: 0 }, { opacity: 1 }], { duration: 1600, easing: 'ease-out' })
        animate(
          token,
          [
            { opacity: 0, transform: 'translate(-50%,-30%) scale(.9)' },
            { opacity: 0.92, transform: 'translate(-50%,-50%) scale(1)' },
          ],
          { duration: 1000, delay: 800, fill: 'backwards' }
        )
      }
      schedule(reduced ? 500 : 3400, () => go('plea-a', true))
    } else if (automaticDecision && (stage === 'plea-a' || stage === 'plea-b')) {
      if (manualReadingStage !== stage) {
        const person = nominees[stage === 'plea-a' ? 0 : 1]
        const next = automaticReadingSuccessor()
        schedule(readingHoldMs(person.plea || person.shortPlea || ''), () => go(next, true))
      }
    } else if (stage === 'deliberate') {
      schedule(3600, commitAutomaticDecision)
    } else if (stage === 'seal') {
      animateIsolation(isolationStart)
      fire('onCue', { cue: 'decision:seal', sceneId: cfg.sceneId || 'classic-final-decision' })
      if (manualReadingStage !== stage) {
        schedule(
          automaticDecision ? readingHoldMs(automaticVerdictText()) : reduced ? 550 : 2800,
          () => go('announcement', true)
        )
      }
    } else if (stage === 'announcement') {
      fire('onCue', { cue: 'decision:reveal', sceneId: cfg.sceneId || 'classic-final-decision' })
      animate(
        eliminationLight,
        [{ opacity: 0.65 }, { opacity: 1, offset: 0.36 }, { opacity: 0.86 }],
        {
          duration: 2400,
          easing: 'ease-in-out',
        }
      )
      schedule(reduced ? 600 : 3200, () => go('complete', true))
    } else if (stage === 'complete' && !completed) {
      completed = true
      completionCount += 1
      fire('onComplete', outcome())
    }
  }
  function choose(id) {
    if (automaticDecision) return
    if (stage !== 'choose' || reviewIndex >= 0 || !nominees.some((p) => p.id === id)) return
    selected = id
    go('confirm', true)
  }
  function confirm() {
    if (automaticDecision) return
    if (stage !== 'confirm' || !selected || committed) return
    confirmed = selected
    committed = true
    decisionCount += 1
    fire('onDecision', outcome())
    go('seal', false)
  }
  function commitAutomaticDecision() {
    if (!automaticDecision || disposed || pauses.size || committed) return
    selected = automaticDecision.evicteeId
    confirmed = automaticDecision.evicteeId
    committed = true
    decisionCount += 1
    fire('onDecision', outcome())
    go('seal', false)
  }
  function skip() {
    if (disposed || pauses.size) return
    if (
      automaticDecision &&
      ['welcome', 'establish', 'plea-a', 'plea-b', 'deliberate'].includes(stage)
    ) {
      commitAutomaticDecision()
    } else if (['welcome', 'establish', 'plea-a', 'plea-b'].includes(stage)) go('choose', true)
    else if (stage === 'seal') go('announcement', true)
    else if (stage === 'announcement') go('complete', true)
  }
  function replay() {
    if (disposed) return
    cancelTimer()
    stopAnimations(true)
    pauses.delete('user')
    selected = null
    confirmed = null
    committed = false
    completed = false
    announcementFrame = 0
    captionPage = 0
    captionPages = []
    manualReadingStage = null
    reviewIndex = -1
    decisionCount = 0
    completionCount = 0
    run += 1
    fire('onReplay', { run })
    go('establish', true)
  }

  function render() {
    scene.dataset.stage = stage
    scene.dataset.reviewing = String(reviewIndex >= 0)
    scene.dataset.shot =
      stage === 'plea-a'
        ? 'aria'
        : stage === 'plea-b'
          ? 'dex'
          : stage === 'deliberate'
            ? 'holder'
            : stage === 'confirm'
              ? selected === nominees[0].id
                ? 'aria'
                : 'dex'
              : 'wide'
    const isolated = Boolean(confirmed)
    scene.dataset.isolated = String(isolated)
    scene.dataset.isolatedPlayer = confirmed || ''
    actors.forEach((el) => {
      delete el.dataset.result
    })
    nomineeActors.forEach((actor, index) => {
      actor.dataset.result = isolated ? (nominees[index].id === confirmed ? 'leave' : 'stay') : ''
    })
    actions.replaceChildren()
    actions.className = 'fd-actions' + (stage === 'confirm' ? ' fd-actions--confirm' : '')
    reviewButton.hidden =
      stage !== 'choose' ||
      reviewIndex >= 0 ||
      !nominees.some((person) => Boolean(person.comparison))
    if (stage === 'welcome' || stage === 'establish') {
      if (automaticDecision) {
        showFrame(
          'opening',
          (content) =>
            personStatus(
              content,
              holder,
              viewerIsNominee ? 'Your place is on the line' : 'Final Power holder'
            ),
          holder.name +
            ' holds the final decision.' +
            (viewerIsNominee ? ' Your place is on the line.' : '')
        )
      } else titleFrame('opening', 'One place beside you.')
    } else if (stage === 'plea-a' || stage === 'plea-b') {
      renderPlea()
    } else if (stage === 'deliberate') {
      showFrame(
        'deliberation',
        (content) => {
          node('p', 'fd-broadcast-speaker', content, holder.name)
          node('p', 'fd-broadcast-caption', content, "I've heard you both.")
        },
        holder.name + ": I've heard you both."
      )
    } else if (stage === 'choose') {
      if (reviewIndex >= 0) renderReview()
      else {
        titleFrame('choice', 'Who leaves tonight?')
        nominees.forEach((person) => {
          const btn = mainAction('', () => choose(person.id))
          btn.classList.add('fd-action--choice')
          btn.setAttribute('aria-label', 'Choose to eliminate ' + person.name)
          btn.dataset.longName = String(person.name.length > 16)
          node('span', '', btn, 'Eliminate')
          node('strong', '', btn, person.name)
        })
      }
    } else if (stage === 'confirm') {
      const evictee = nominees.find((p) => p.id === selected)
      consequenceFrame()
      mainAction('Confirm elimination', confirm).setAttribute(
        'aria-label',
        'Confirm: eliminate ' +
          evictee.name +
          ' and keep ' +
          nominees.find((p) => p.id !== selected).name
      )
      mainAction(
        'Change choice',
        () => {
          selected = null
          go('choose', true)
        },
        true
      )
    } else if (stage === 'seal') {
      if (automaticDecision) {
        const text = automaticVerdictText()
        showFrame(
          'verdict',
          (content) => {
            node('p', 'fd-broadcast-speaker', content, holder.name)
            node('p', 'fd-broadcast-caption', content, text)
          },
          holder.name + ': ' + text
        )
        preserveAutomaticReading()
      } else titleFrame('seal', 'The choice is made.')
    } else if (stage === 'announcement') {
      announcementScreen()
    } else {
      if (monitor.element.dataset.frame !== 'third-place') announcementScreen()
      if (isPreview) mainAction('Replay this scene', replay, true)
    }
    syncPausedUI()
  }

  const onVisibility = () => {
    if (document.hidden) addPause('visibility')
    else removePause('visibility')
  }
  document.addEventListener('visibilitychange', onVisibility)
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility))
  const onKey = (event) => {
    if (!root.contains(document.activeElement)) return
    if (event.key === 'Escape' && reviewIndex >= 0 && !pauses.size) {
      event.preventDefault()
      closeReview()
      return
    }
    if (event.key === 'Escape' && stage === 'confirm' && !pauses.size) {
      event.preventDefault()
      selected = null
      go('choose', true)
    }
  }
  root.addEventListener('keydown', onKey)
  cleanups.push(() => root.removeEventListener('keydown', onKey))
  function refreshCaptionLayout() {
    if (disposed) return
    if (reviewIndex < 0) {
      fitMonitorNames()
      fitBroadcastCaption()
      preserveAutomaticReading()
      return
    }
    const cursor = captionPages
      .slice(0, captionPage)
      .reduce((sum, value) => sum + value.length + 1, 0)
    const person = nominees[reviewIndex]
    const repaged = splitCaption(person.comparison)
    let consumed = 0
    let page = 0
    while (page < repaged.length - 1 && consumed + repaged[page].length < cursor) {
      consumed += repaged[page].length + 1
      page += 1
    }
    captionPage = page
    render()
  }
  if (typeof ResizeObserver === 'function') {
    let lastWidth = monitor.screen.clientWidth
    const observer = new ResizeObserver(() => {
      const width = monitor.screen.clientWidth
      if (disposed || width === lastWidth) return
      lastWidth = width
      refreshCaptionLayout()
    })
    observer.observe(monitor.screen)
    cleanups.push(() => observer.disconnect())
    const compositionObserver = new ResizeObserver(layoutComposition)
    compositionObserver.observe(scene)
    cleanups.push(() => compositionObserver.disconnect())
  }
  if (document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (disposed) return
      refreshCaptionLayout()
      layoutComposition()
    })
  }
  const onMotion = (event) => {
    if (cfg.reducedMotion !== undefined) return
    reduced = event.matches
    scene.dataset.noMotion = String(reduced)
    if (reduced) stopAnimations(true)
    else startAmbientMotion()
    layoutComposition()
  }
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', onMotion)
    cleanups.push(() => mq.removeEventListener('change', onMotion))
  }
  function dispose() {
    if (disposed) return
    disposed = true
    cancelTimer()
    stopAnimations(true)
    cleanups.forEach((fn) => fn())
    if (tools) tools.remove()
    scene.replaceChildren()
    fire('onCue', { cue: 'presentation:dispose' })
  }
  const api = { pause, resume, skip, replay, dispose, getState: snapshot }
  go('establish', false)
  return api
}

export { mountFinalDecision, createCeremonyMonitor }

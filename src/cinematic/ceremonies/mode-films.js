import { baseScene } from './mode-routing.mjs'

export const MODE_SCENES = {
  cupidLoh: { label: 'Cupid · shared LOH', duration: 3200 },
  cupidPower: { label: 'Cupid · all the power', duration: 4400 },
  cupidSafety: { label: 'Cupid · shared Safety', duration: 4200 },
  cupidNominations: { label: 'Cupid · nominated pairs', duration: 4800 },
  cupidSave: { label: 'Cupid · pair saved', duration: 4500 },
  cupidExit: { label: 'Cupid · paired departure', duration: 10200 },
  cupidAmbush: { label: 'Cupid · pair ambush', duration: 4800 },
  voxImmunity: { label: 'Vox · immunity and last place', duration: 7900 },
  voxFinal4: { label: 'Vox · Final 4 competition', duration: 4400 },
  voxNominations: { label: 'Vox · secret nominations', duration: 4800 },
  voxResults: { label: 'Vox · public verdict', duration: 10000 },
}
export function modeResources(scene, cast, shared, vfx) {
  const prop = (name) => ({
    src: 'assets/ceremonies/shared/' + name + '.webp',
    ...shared[name + '.webp'],
  })
  const actor = (slot, pose) => ({ ...cast[slot].poses[pose], character: cast[slot].id, pose })
  const resources = {}
  if (scene.startsWith('cupid')) {
    if (['cupidLoh', 'cupidPower'].includes(scene)) {
      resources.pairWinner = actor('b', 'front')
      resources.pairRoyal = actor('b', 'royal-standing')
      if (scene === 'cupidPower') resources.pairSeated = actor('b', 'royal-seated')
      if (scene === 'cupidPower') resources.pairShield = prop('shield')
    }
    if (scene === 'cupidSafety') {
      resources.pairWinner = actor('b', 'front')
      resources.pairKnight = actor('b', 'safety-knight')
    }
    if (scene === 'cupidSave') resources.pairWinner = actor('b', 'front')
    if (scene === 'cupidExit') resources.pairExit = actor('b', 'exit-back')
    if (scene === 'cupidNominations') {
      for (const [key, value] of Object.entries(cast))
        if (value.playerId) resources['pairFront_' + key] = actor(key, 'front')
    }
    if (scene !== 'cupidExit') resources.pairHeart = vfx.shockHeart
  }
  if (['voxResults', 'voxFinal4', 'voxImmunity'].includes(scene)) {
    resources.voxStudio = prop('vox-studio')
    resources.voxMist = vfx.shockMist
    for (const [key, value] of Object.entries(cast))
      if (value.playerId) resources['voxActor_' + key] = actor(key, 'front')
    if (scene === 'voxFinal4') resources.voxToken = prop('decision-token')
    if (scene === 'voxImmunity') resources.voxShield = prop('shield')
  }
  return resources
}
const copy = (images, key, cls) => {
  const image = images[key].cloneNode()
  image.className = cls
  image.alt = ''
  return image
}
const setText = (root, selector, text) => {
  const node = root.querySelector(selector)
  if (node) node.textContent = text
}
function swap(root, selector, images, key) {
  const old = root.querySelector(selector)
  old.replaceWith(copy(images, key, old.className))
}
export function adaptModeFilm(scene, root, images, resources, cast, details, fitCrown) {
  root.dataset.modeScene = scene
  const names = details.names ?? []
  const title = names.join(' & ')
  if (scene === 'voxNominations') {
    setText(root, '.nom-warning', 'SECRET HOUSEMATE BALLOTS · COUNTED')
    setText(root, '.c-caption span', 'VOX POPULI · NOMINATIONS')
    setText(root, '.c-caption strong', 'The Hub has nominated.')
    setText(root, '.c-caption em', 'THE PUBLIC WILL VOTE TO ELIMINATE.')
  }
  if (!scene.startsWith('cupid')) return
  root.classList.add('paired-film')
  if (['cupidLoh', 'cupidPower'].includes(scene)) {
    const figure = root.querySelector('.loh-figure'),
      seated = root.querySelector('.loh-seated')
    figure.classList.add('pair-first')
    if (seated) seated.classList.add('pair-first')
    const other = figure.cloneNode(true)
    other.classList.replace('pair-first', 'pair-second')
    swap(other, '.loh-before .loh-person', images, 'pairWinner')
    swap(other, '.loh-royal .loh-person', images, 'pairRoyal')
    fitCrown(other.querySelector('.loh-before .loh-crown'), resources.pairWinner)
    fitCrown(other.querySelector('.loh-royal .loh-crown'), resources.pairRoyal)
    root.append(other)
    if (seated) {
      const otherSeat = seated.cloneNode(true)
      otherSeat.classList.replace('pair-first', 'pair-second')
      swap(otherSeat, '.loh-seated-image', images, 'pairSeated')
      fitCrown(otherSeat.querySelector('.loh-seated-crown'), resources.pairSeated)
      const t = resources.pairSeated.throne
      otherSeat.querySelector('.loh-seat-throne').style.transform =
        `translate(${t.x * 100}%,${t.y * 100}%) scale(${t.scale})`
      root.append(otherSeat)
    }
    setText(
      root,
      '.loh-kicker',
      scene === 'cupidPower' ? 'ONE PAIR. ALL THE POWER.' : 'CUPID’S ARROW · SHARED LOH'
    )
    setText(root, '.loh-name', title)
    setText(root, '.loh-title', 'TWO CROWNS. ONE REIGN.')
    if (scene === 'cupidPower') root.append(copy(images, 'pairShield', 'pair-power-shield'))
  }
  if (scene === 'cupidSafety') {
    for (const [selector, key] of [
      ['.safety-ordinary', 'pairWinner'],
      ['.safety-knight', 'pairKnight'],
    ]) {
      root.querySelector(selector).classList.add('pair-first')
      const other = copy(
        images,
        key,
        root.querySelector(selector).className.replace('pair-first', 'pair-second')
      )
      root.append(other)
    }
    setText(root, '.c-caption span', 'CUPID’S ARROW · SHARED SAFETY')
    setText(root, '.c-caption strong', title)
    setText(root, '.c-caption em', 'ONE PAIR. ONE POWER OF SAFETY.')
  }
  if (scene === 'cupidSave') {
    const person = root.querySelector('.save-person')
    person.classList.add('pair-first')
    root.append(copy(images, 'pairWinner', person.className.replace('pair-first', 'pair-second')))
    setText(root, '.save-danger-caption strong', 'One pair on the block.')
    setText(root, '.save-safe-caption strong', title)
    setText(root, '.save-safe-caption em', 'BOTH SAVED. BOTH OFF THE BLOCK.')
  }
  if (scene === 'cupidNominations') {
    const keys = Object.keys(images).filter((k) => k.startsWith('pairFront_'))
    const groups = Array.from({ length: keys.length / 2 }, (_, i) => keys.slice(i * 2, i * 2 + 2))
    if (groups.length === 3 && !root.querySelector('.nom-third')) {
      const third = root.querySelector('.nom-second').cloneNode(true)
      third.classList.replace('nom-second', 'nom-third')
      root.append(third)
      root.classList.add('nom-three')
    }
    for (const [index, group] of groups.entries()) {
      const pod = root.querySelector(['.nom-first', '.nom-second', '.nom-third'][index])
      swap(pod, '.nom-person', images, group[0])
      pod.querySelector('.nom-person').classList.add('pair-first')
      pod.append(copy(images, group[1], 'nom-person pair-second'))
      setText(pod, '.nom-label', names.slice(index * 2, index * 2 + 2).join(' & '))
    }
    setText(root, '.nom-warning', 'CUPID’S ARROW · NOMINATED PAIRS')
    setText(root, '.c-caption strong', 'Linked by love. Facing danger.')
    setText(root, '.c-caption em', 'THE PAIRS FACE ELIMINATION TOGETHER.')
  }
  if (scene === 'cupidExit') {
    // Both sprites share the approved opaque doorway path and depth mask.
    for (const container of root.querySelectorAll('.cine-departure')) {
      container.querySelector('.cine-rear').classList.add('pair-first')
      container.append(copy(images, 'pairExit', 'cine-rear pair-second'))
    }
    setText(root, '.exit-caption span', title)
    setText(root, '.exit-caption h3', 'Bound together. Leaving together.')
    return
  }
  root.append(copy(images, 'pairHeart', 'pair-link-heart'))
}

export function makeVoxFilm(scene, images, cast, details) {
  const result = scene === 'voxResults'
  const immunity = scene === 'voxImmunity'
  const root = document.createElement('div')
  root.className = 'c-scene vox-broadcast'
  root.dataset.modeScene = scene
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML =
    '<div class="vox-camera"><div class="vox-set"></div><div class="vox-haze"></div><div class="vox-light"></div><div class="vox-room-dim"></div><div class="vox-danger-tint"></div><div class="vox-contestants"></div></div><div class="vox-cut"></div><div class="vox-reveal-sweep"></div>' +
    (result
      ? ''
      : immunity
        ? '<div class="vox-heading"><span>VOX POPULI · IMMUNITY CHALLENGE</span><h2>Two places. Two fates.</h2><p>FIRST PLACE IS SAFE · LAST PLACE IS NOMINATED</p></div>'
        : '<div class="vox-heading"><span>VOX POPULI · FINAL FOUR</span><h2>Competition won.</h2><p>NO IMMUNITY IS AWARDED.</p></div><div class="vox-verdict"><span>THE FINAL FOUR CONTINUE</span><h3></h3><p>The audience still decides who leaves.</p></div>')
  root.querySelector('.vox-set').append(copy(images, 'voxStudio', 'vox-backdrop'))
  root.querySelector('.vox-haze').append(copy(images, 'voxMist', 'vox-smoke'))
  const entries = result
    ? details.tallies
    : immunity
      ? [
          { id: cast.a.playerId, name: cast.a.name, role: 'IMMUNITY WINNER' },
          { id: cast.b.playerId, name: cast.b.name, role: 'LAST PLACE · NOMINATED' },
        ]
      : [{ id: cast.a.playerId, name: cast.a.name }]
  const field = root.querySelector('.vox-contestants')
  field.style.setProperty('--contestants', entries.length)
  for (const [index, entry] of entries.entries()) {
    const card = document.createElement('div')
    card.className = 'vox-contestant'
    card.dataset.playerId = entry.id
    const art = copy(images, 'voxActor_' + String.fromCharCode(97 + index), 'vox-person')
    const identity = document.createElement('div')
    identity.className = 'vox-identity'
    const name = document.createElement('strong')
    name.textContent = entry.name
    const count = document.createElement('span')
    count.className = result ? 'vox-count vox-percent' : 'vox-count'
    count.textContent = result ? '0.0%' : 'COMPETITION WINNER'
    if (result) count.dataset.finalValue = String(Number(entry.value))
    if (immunity) {
      card.classList.add(index === 0 ? 'vox-immunity-winner' : 'vox-last-place-nominee')
      const light = document.createElement('div')
      light.className = 'vox-immunity-spot'
      const floor = document.createElement('div')
      floor.className = 'vox-immunity-floor'
      card.append(light, floor)
      count.className = 'vox-count vox-role-label'
      count.textContent = entry.role
      if (index === 0) card.append(copy(images, 'voxShield', 'vox-immunity-emblem'))
    }
    identity.append(name)
    if (result) {
      const plate = document.createElement('div')
      plate.className = 'vox-percent-shell'
      plate.innerHTML =
        '<i class="vox-percent-tone"></i><i class="vox-score-sheen"></i><i class="vox-number-bloom"></i>'
      plate.append(count)
      identity.append(plate)
      const pool = document.createElement('div')
      pool.className = 'vox-floor-pool'
      const focus = document.createElement('div')
      focus.className = 'vox-focus-light'
      card.append(pool, focus)
    } else identity.append(count)
    card.append(art, identity)
    if (result && details.kind !== 'tie') {
      card.classList.add(details.ids.includes(entry.id) ? 'vox-departing' : 'vox-safe')
    }
    field.append(card)
  }
  if (result && ['public-tie', 'tie'].includes(details.kind)) {
    const note = document.createElement('div')
    note.className = 'vox-tie-note'
    note.textContent =
      details.kind === 'public-tie'
        ? 'TIED VOTE · APPROVAL TIEBREAK · ' +
          details.approval.map((t) => `${t.name}: ${Number(t.value).toFixed(1)}`).join(' · ')
        : 'THE VOTE IS TIED · TIEBREAK FOLLOWS'
    root.append(note)
  }
  if (!result && !immunity) {
    setText(root, '.vox-verdict h3', cast.a.name)
    root.querySelector('.vox-camera').append(copy(images, 'voxToken', 'vox-token'))
  }
  return root
}
export function animateVoxFilm(scene, root, a, duration, later) {
  const result = scene === 'voxResults'
  const immunity = scene === 'voxImmunity'
  const cards = [...root.querySelectorAll('.vox-contestant')]
  const departing = cards.filter((card) => card.classList.contains('vox-departing'))
  const field = root.querySelector('.vox-contestants')
  const survivorCount = cards.filter((card) => !card.classList.contains('vox-safe')).length
  const settle = 'cubic-bezier(.22,.72,.22,1)'
  const glide = 'cubic-bezier(.16,1,.3,1)'
  a(root, [
    [0, 0],
    [180, 1],
    [duration - 250, 1],
    [duration, 0],
  ])
  a(
    '.vox-camera',
    result
      ? [
          [0, 1, 'scale(1.1) translateY(1%)', glide],
          [1500, 1, 'scale(1) translateY(0)'],
          [5000, 1, 'scale(1.015) translateY(0)', settle],
          [6100, 1, 'scale(1.055) translateY(-.5%)', glide],
          [6700, 1, 'scale(1.025) translateY(0)', settle],
          [duration, 1, 'scale(1.075) translateY(-.8%)'],
        ]
      : [
          [0, 1, 'scale(1.12) translateY(1%)'],
          [1400, 1, 'scale(1.03) translateY(0)'],
          [duration, 1, 'scale(1.065) translateY(-1%)'],
        ]
  )
  a('.vox-haze', [
    [0, 0.22, 'translateX(-8%) scale(1.1)'],
    [duration, 0.28, 'translateX(7%) scale(1.15)'],
  ])
  for (const [i, card] of cards.entries()) {
    const safe = card.classList.contains('vox-safe')
    const outIndex = departing.indexOf(card)
    const focusX =
      outIndex >= 0
        ? field.clientWidth * ((outIndex + 0.5) / Math.max(1, survivorCount)) -
          (card.offsetLeft + card.offsetWidth / 2)
        : 0
    const finalTransform = `translateX(${focusX}px) scale(1.035)`
    a(card, [
      [0, 0, 'translateY(22px)', glide],
      [immunity ? 1450 + i * 2900 : 350 + i * 150, 0, 'translateY(22px)', glide],
      [immunity ? 2150 + i * 2900 : 1100 + i * 150, 1, 'translateY(0)'],
      ...(result && safe
        ? [
            [6400, 1, 'translateX(0)', settle],
            [7150, 0, `translateX(${i < cards.length / 2 ? -32 : 32}px) scale(.97)`],
            [duration, 0],
          ]
        : result && outIndex >= 0
          ? [
              [6800, 1, 'translateX(0) scale(1)', settle],
              [8000, 1, finalTransform],
              [duration, 1, finalTransform],
            ]
          : [[duration, 1]]),
    ])
    const count = card.querySelector('.vox-count')
    if (result) {
      a(card.querySelector('.vox-percent-shell'), [
        [0, 0, 'translateY(16px) scaleX(.82)'],
        [1400, 0, 'translateY(16px) scaleX(.82)', glide],
        [2050, 1, 'translateY(0) scaleX(1)'],
        [duration, 1],
      ])
      a(card.querySelector('.vox-score-sheen'), [
        [0, 0, 'translateX(-170%) skewX(-18deg)'],
        [4250, 0, 'translateX(-170%) skewX(-18deg)'],
        [4470, 0.8, 'translateX(-20%) skewX(-18deg)', glide],
        [4950, 0, 'translateX(210%) skewX(-18deg)'],
        [duration, 0],
      ])
      a(card.querySelector('.vox-number-bloom'), [
        [0, 0],
        [4380, 0],
        [4550, 0.28],
        [5100, 0],
        [duration, 0],
      ])
      a(card.querySelector('.vox-floor-pool'), [
        [0, 0],
        [1200, 0.35],
        [5200, 0.35],
        [5900, 0.12],
        [duration, 0.12],
      ])
      if (outIndex >= 0) {
        a(card.querySelector('.vox-focus-light'), [
          [0, 0],
          [6200, 0],
          [6750, 0.8],
          [duration, 0.65],
        ])
        a(card.querySelector('.vox-percent-tone'), [
          [0, 0],
          [6400, 0],
          [7350, 0.72],
          [duration, 0.72],
        ])
      }
    } else if (immunity) {
      a(count, [
        [0, 0, 'translateY(12px)'],
        [2250 + i * 2850, 0, 'translateY(12px)', glide],
        [2750 + i * 2850, 1, 'translateY(0)'],
        [duration, 1],
      ])
      a(card.querySelector('.vox-immunity-spot'), [
        [0, 0, 'scale(.75)'],
        [1200 + i * 2900, 0, 'scale(.75)'],
        [1900 + i * 2900, 0.88, 'scale(1)'],
        [duration, i === 0 ? 0.48 : 0.72, 'scale(1.04)'],
      ])
      a(card.querySelector('.vox-immunity-floor'), [
        [0, 0, 'scaleX(.55)'],
        [1450 + i * 2900, 0, 'scaleX(.55)'],
        [2150 + i * 2900, 1, 'scaleX(1)'],
        [duration, 0.7, 'scaleX(1)'],
      ])
    } else
      a(count, [
        [0, 0],
        [1100, 0],
        [1600, 1],
        [duration, 1],
      ])
  }
  if (result) {
    // A single clip-owned clock keeps all percentages in sync and stops on Skip.
    const counts = cards.map((card) => card.querySelector('.vox-count'))
    const step = (index) => {
      const progress = index / 50
      const eased = progress * progress * (3 - 2 * progress)
      for (const count of counts)
        count.textContent = `${(Number(count.dataset.finalValue) * eased).toFixed(1)}%`
      if (index < 50) later(() => step(index + 1), 40)
    }
    later(() => step(0), 2400)
    if (departing.length) {
      a('.vox-room-dim', [
        [0, 0],
        [5100, 0],
        [5900, 0.74],
        [6450, 0.74],
        [7600, 0.38],
        [duration, 0.38],
      ])
      a('.vox-danger-tint', [
        [0, 0],
        [6500, 0],
        [7800, 0.65],
        [duration, 0.65],
      ])
      a('.vox-reveal-sweep', [
        [0, 0, 'translateX(-115%)'],
        [6150, 0, 'translateX(-115%)'],
        [6450, 0.7, 'translateX(-35%)', glide],
        [7100, 0, 'translateX(100%)'],
        [duration, 0],
      ])
    }
    if (root.querySelector('.vox-tie-note'))
      a('.vox-tie-note', [
        [0, 0],
        [5900, 0],
        [6500, 1],
        [duration, 1],
      ])
  } else {
    a('.vox-heading', [
      [0, 0, 'translateY(-12px) scale(.985)'],
      [immunity ? 650 : 450, 1, 'translateY(0) scale(1)'],
      [duration, 1],
    ])
    if (immunity)
      a('.vox-immunity-emblem', [
        [0, 0, 'translateY(12px) scale(.72)'],
        [2200, 0, 'translateY(12px) scale(.72)', glide],
        [2750, 1, 'translateY(0) scale(1)'],
        [duration, 1, 'translateY(-2px) scale(1.03)'],
      ])
    else
      a('.vox-verdict', [
        [0, 0, 'translateY(18px)'],
        [1900, 0, 'translateY(18px)'],
        [2450, 1, 'translateY(0)'],
        [duration, 1],
      ])
  }
  if (immunity) {
    a('.vox-room-dim', [
      [0, 0],
      [3400, 0],
      [4250, 0.52],
      [5400, 0.38],
      [duration, 0.3],
    ])
    a('.vox-danger-tint', [
      [0, 0],
      [4500, 0],
      [5550, 0.58],
      [duration, 0.46],
    ])
    a('.vox-reveal-sweep', [
      [0, 0, 'translateX(-110%)'],
      [1570, 0, 'translateX(-110%)'],
      [1820, 0.65, 'translateX(-30%)', glide],
      [2200, 0, 'translateX(100%)'],
      [4300, 0, 'translateX(-110%)'],
      [4730, 0.8, 'translateX(-20%)', glide],
      [5300, 0, 'translateX(100%)'],
      [duration, 0, 'translateX(100%)'],
    ])
  }
  a('.vox-cut', [
    [0, 0],
    [result ? 6150 : immunity ? 3990 : 1700, 0],
    [result ? 6420 : immunity ? 4250 : 1900, result ? 0.22 : 0.45],
    [result ? 6900 : immunity ? 4580 : 2200, 0],
    [duration, 0],
  ])
}
export function animateModeLayers(scene, root, a, duration) {
  if (root.querySelector('.pair-link-heart'))
    a('.pair-link-heart', [
      [0, 0, 'scale(.85)'],
      [1100, 0, 'scale(.85)'],
      [1900, 0.7, 'scale(1)'],
      [duration, 0.55, 'scale(1.04)'],
    ])
  if (scene === 'cupidPower')
    a('.pair-power-shield', [
      [0, 0],
      [2400, 0],
      [2900, 1],
      [duration, 1],
    ])
  if (baseScene(scene) === 'nominations' && root.querySelector('.nom-third')) {
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
}

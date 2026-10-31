import { baseScene } from './mode-routing.mjs'

export const MODE_SCENES = {
  cupidLoh: { label: 'Cupid · shared LOH', duration: 4400 },
  cupidPower: { label: 'Cupid · all the power', duration: 4400 },
  cupidSafety: { label: 'Cupid · shared Safety', duration: 4200 },
  cupidNominations: { label: 'Cupid · nominated pairs', duration: 4800 },
  cupidSave: { label: 'Cupid · pair saved', duration: 4500 },
  cupidExit: { label: 'Cupid · paired departure', duration: 10200 },
  cupidAmbush: { label: 'Cupid · pair ambush', duration: 4800 },
  voxImmunity: { label: 'Vox · immunity', duration: 4200 },
  voxFinal4: { label: 'Vox · Final 4 competition', duration: 4400 },
  voxNominations: { label: 'Vox · secret nominations', duration: 4800 },
  voxResults: { label: 'Vox · public verdict', duration: 7200 },
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
      resources.pairSeated = actor('b', 'royal-seated')
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
  if (['voxResults', 'voxFinal4'].includes(scene)) {
    resources.voxStudio = prop('vox-studio')
    resources.voxMist = vfx.shockMist
    for (const [key, value] of Object.entries(cast))
      if (value.playerId) resources['voxActor_' + key] = actor(key, 'front')
    if (scene === 'voxFinal4') resources.voxToken = prop('decision-token')
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
  if (scene === 'voxImmunity') {
    setText(root, '.c-caption span', 'VOX POPULI · IMMUNITY')
    setText(root, '.c-caption strong', cast.a.name)
    setText(root, '.c-caption em', 'PROTECTED FROM NOMINATION THIS ROUND.')
  }
  if (!scene.startsWith('cupid')) return
  root.classList.add('paired-film')
  if (['cupidLoh', 'cupidPower'].includes(scene)) {
    const figure = root.querySelector('.loh-figure'),
      seated = root.querySelector('.loh-seated')
    figure.classList.add('pair-first')
    seated.classList.add('pair-first')
    const other = figure.cloneNode(true),
      otherSeat = seated.cloneNode(true)
    other.classList.replace('pair-first', 'pair-second')
    otherSeat.classList.replace('pair-first', 'pair-second')
    swap(other, '.loh-before .loh-person', images, 'pairWinner')
    swap(other, '.loh-royal .loh-person', images, 'pairRoyal')
    swap(otherSeat, '.loh-seated-image', images, 'pairSeated')
    fitCrown(other.querySelector('.loh-before .loh-crown'), resources.pairWinner)
    fitCrown(other.querySelector('.loh-royal .loh-crown'), resources.pairRoyal)
    fitCrown(otherSeat.querySelector('.loh-seated-crown'), resources.pairSeated)
    const t = resources.pairSeated.throne
    otherSeat.querySelector('.loh-seat-throne').style.transform =
      `translate(${t.x * 100}%,${t.y * 100}%) scale(${t.scale})`
    root.append(other, otherSeat)
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
  if (scene === 'cupidAmbush') {
    setText(root, '.nom-warning', 'CUPID’S ARROW · THE AMBUSH')
    setText(root, '.nom-first .nom-label', names[0])
    setText(root, '.nom-second .nom-label', names[1])
    setText(root, '.c-caption span', 'THE BLOCK JUST CHANGED')
    setText(root, '.c-caption strong', title)
    setText(root, '.c-caption em', 'THE HIDDEN TARGET AND THEIR PARTNER ARE NOMINATED.')
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
  const root = document.createElement('div')
  root.className = 'c-scene vox-broadcast'
  root.dataset.modeScene = scene
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML =
    '<div class="vox-camera"><div class="vox-set"></div><div class="vox-haze"></div><div class="vox-light"></div><div class="vox-contestants"></div></div><div class="vox-heading"><span></span><h2></h2><p></p></div><div class="vox-verdict"><span></span><h3></h3><p></p></div><div class="vox-cut"></div>'
  root.querySelector('.vox-set').append(copy(images, 'voxStudio', 'vox-backdrop'))
  root.querySelector('.vox-haze').append(copy(images, 'voxMist', 'vox-smoke'))
  const result = scene === 'voxResults'
  const entries = result ? details.tallies : [{ id: cast.a.playerId, name: cast.a.name }]
  const field = root.querySelector('.vox-contestants')
  field.style.setProperty('--contestants', entries.length)
  for (const [index, entry] of entries.entries()) {
    const card = document.createElement('div')
    card.className = 'vox-contestant'
    card.dataset.playerId = entry.id
    const art = copy(images, 'voxActor_' + String.fromCharCode(97 + index), 'vox-person')
    const name = document.createElement('strong')
    name.textContent = entry.name
    const count = document.createElement('span')
    count.className = 'vox-count'
    count.textContent = result ? Number(entry.value).toFixed(1) + '%' : 'COMPETITION WINNER'
    card.append(art, name, count)
    if (result && details.ids.includes(entry.id) && details.kind !== 'tie')
      card.classList.add('vox-departing')
    field.append(card)
  }
  setText(
    root,
    '.vox-heading span',
    result ? 'VOX POPULI · OFFICIAL PUBLIC VOTE' : 'VOX POPULI · FINAL FOUR'
  )
  setText(root, '.vox-heading h2', result ? 'The public has spoken.' : 'Competition won.')
  setText(
    root,
    '.vox-heading p',
    result ? 'VOTES TO ELIMINATE · FINAL RESULTS' : 'NO IMMUNITY IS AWARDED.'
  )
  const outNames = details.tallies
    ?.filter((t) => details.ids.includes(t.id))
    .map((t) => t.name)
    .join(' & ')
  setText(
    root,
    '.vox-verdict span',
    details.kind === 'public-tie'
      ? 'TIED PUBLIC VOTE · APPROVAL TIEBREAK'
      : details.kind === 'tie'
        ? 'THE VOTE IS TIED'
        : result
          ? details.finalists
            ? 'THIRD PLACE · LEAVING THE HUB'
            : 'ELIMINATED BY PUBLIC VOTE'
          : 'THE FINAL FOUR CONTINUE'
  )
  setText(root, '.vox-verdict h3', result ? outNames : cast.a.name)
  setText(
    root,
    '.vox-verdict p',
    details.kind === 'public-tie'
      ? details.approval.map((t) => `${t.name}: ${Number(t.value).toFixed(1)} approval`).join(' · ')
      : details.kind === 'tie'
        ? 'THE TIEBREAK WILL NOW RESOLVE THE RESULT.'
        : result
          ? details.ids.length > 1
            ? 'The highest vote-to-eliminate totals leave.'
            : 'The highest vote to eliminate leaves.'
          : 'The audience still decides who leaves.'
  )
  if (!result) root.querySelector('.vox-camera').append(copy(images, 'voxToken', 'vox-token'))
  return root
}
export function animateVoxFilm(scene, root, a, duration) {
  const result = scene === 'voxResults'
  a(root, [
    [0, 0],
    [180, 1],
    [duration - 250, 1],
    [duration, 0],
  ])
  a('.vox-camera', [
    [0, 1, 'scale(1.12) translateY(1%)'],
    [1400, 1, 'scale(1.03) translateY(0)'],
    [duration, 1, 'scale(1.065) translateY(-1%)'],
  ])
  a('.vox-haze', [
    [0, 0.22, 'translateX(-8%) scale(1.1)'],
    [duration, 0.28, 'translateX(7%) scale(1.15)'],
  ])
  a('.vox-heading', [
    [0, 0, 'translateY(-12px)'],
    [450, 1, 'translateY(0)'],
    [duration, 1],
  ])
  for (const [i, card] of [...root.querySelectorAll('.vox-contestant')].entries()) {
    a(card, [
      [0, 0, 'translateY(22px)'],
      [450 + i * 220, 0, 'translateY(22px)'],
      [1050 + i * 220, 1, 'translateY(0)'],
      [duration, 1],
    ])
    a(card.querySelector('.vox-count'), [
      [0, 0, 'translateY(12px)'],
      [result ? 2300 : 1100, 0, 'translateY(12px)'],
      [result ? 2850 : 1600, 1, 'translateY(0)'],
      [duration, 1],
    ])
    const person = card.querySelector('.vox-person')
    a(person, [
      [0, 1],
      [result ? 3950 : 1800, 1],
      [result ? 4650 : 2100, card.classList.contains('vox-departing') || !result ? 1 : 0.28],
      [duration, card.classList.contains('vox-departing') || !result ? 1 : 0.28],
    ])
  }
  a('.vox-cut', [
    [0, 0],
    [result ? 3820 : 1700, 0],
    [result ? 4000 : 1900, 0.45],
    [result ? 4370 : 2200, 0],
    [duration, 0],
  ])
  a('.vox-verdict', [
    [0, 0, 'translateY(18px)'],
    [result ? 4100 : 1900, 0, 'translateY(18px)'],
    [result ? 4650 : 2450, 1, 'translateY(0)'],
    [duration, 1],
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

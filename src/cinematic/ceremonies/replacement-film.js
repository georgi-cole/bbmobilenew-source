const copy = (images, key, cls) => {
  const image = images[key].cloneNode()
  image.className = cls
  image.alt = ''
  return image
}

const sceneTitles = {
  ordinary: 'THE OPEN SEAT',
  halo: 'HALO EXCHANGE',
  force: 'FORCE MAJEURE',
  mission: 'PICK THE BACKUP',
  coLoh: "THE CO-LEADER'S CHOICE",
  detox: 'DETOX',
  doubleTrouble: 'DOUBLE TROUBLE',
  vox: 'VOX POPULI · THE NEXT NAME',
  cupid: 'CUPID · LINKED BY FATE',
}

function setFootAnchor(element, pose) {
  const feetY = Number.isFinite(pose?.feetY) ? pose.feetY : 0.94762
  element.style.setProperty('--feet-y', `${Math.max(0.9, Math.min(1, feetY)) * 100}%`)
}

export function replacementResources(cast, details, shared) {
  const outcome = details.replacementOutcome
  const background = outcome.variant === 'vox' ? 'vox-studio.webp' : 'hub-chamber.webp'
  const resources = {
    replacementSet: { src: `assets/ceremonies/shared/${background}`, ...shared[background] },
    replacementPlatform: {
      src: 'assets/ceremonies/shared/danger-platform.webp',
      ...shared['danger-platform.webp'],
    },
  }
  for (const [id, actor] of Object.entries(cast)) {
    resources[`replacement-block-${id}`] = {
      ...actor.poses.front,
      character: actor.id,
      pose: 'front',
    }
    if (outcome.chooserId === id) {
      const decisionPose = actor.poses['decision-back'] ?? actor.poses.front
      resources[`replacement-chooser-${id}`] = {
        ...decisionPose,
        character: actor.id,
        pose: actor.poses['decision-back'] ? 'decision-back' : 'front',
      }
    }
  }
  return resources
}

export function makeReplacementFilm(images, cast, outcome) {
  const root = document.createElement('div')
  root.className = `c-scene replacement-film replacement-${outcome.variant}`
  root.setAttribute('aria-hidden', 'true')

  const camera = document.createElement('div')
  camera.className = 'replacement-camera'
  camera.append(copy(images, 'replacementSet', 'replacement-set'))
  const light = document.createElement('div')
  light.className = 'replacement-room-light'
  camera.append(light)

  const block = document.createElement('div')
  block.className = 'replacement-block'
  const ids = [...outcome.continuingNomineeIds, ...outcome.replacementIds]
  block.dataset.count = String(ids.length)
  block.style.setProperty('--positions', String(ids.length))
  for (const id of ids) {
    const slot = document.createElement('div')
    slot.className = 'replacement-slot'
    slot.dataset.incoming = String(outcome.replacementIds.includes(id))

    const figure = document.createElement('div')
    figure.className = 'replacement-figure'
    const body = copy(images, `replacement-block-${id}`, 'replacement-body')
    setFootAnchor(body, cast[id].poses.front)
    figure.append(body)

    const name = document.createElement('span')
    name.className = 'replacement-name'
    name.textContent = cast[id].name
    slot.append(copy(images, 'replacementPlatform', 'replacement-platform'), figure, name)
    block.append(slot)
  }
  camera.append(block)

  if (outcome.chooserId) {
    const chooser = document.createElement('div')
    chooser.className = 'replacement-authority-shot'
    const beam = document.createElement('div')
    beam.className = 'replacement-authority-beam'
    const figure = document.createElement('div')
    figure.className = 'replacement-authority-figure'
    const pose =
      cast[outcome.chooserId].poses['decision-back'] ?? cast[outcome.chooserId].poses.front
    const body = copy(
      images,
      `replacement-chooser-${outcome.chooserId}`,
      'replacement-authority-body'
    )
    setFootAnchor(body, pose)
    figure.append(body)
    const label = document.createElement('div')
    label.className = 'replacement-authority-label'
    const title = document.createElement('span')
    title.textContent = sceneTitles[outcome.variant] ?? 'THE DECISION'
    const name = document.createElement('strong')
    name.textContent = cast[outcome.chooserId].name
    label.append(title, name)
    chooser.append(beam, figure, label)
    camera.append(chooser)
  }

  const caption = document.createElement('div')
  caption.className = 'replacement-caption'
  const title = document.createElement('span')
  title.textContent = sceneTitles[outcome.variant] ?? 'THE BLOCK'
  const outcomeText = document.createElement('strong')
  const names = outcome.replacementIds.map((id) => cast[id].name).join(' & ')
  outcomeText.textContent = `${names} ${outcome.replacementIds.length > 1 ? 'join' : 'joins'} the block.`
  caption.append(title, outcomeText)
  root.append(camera, caption)
  return root
}

export function animateReplacementFilm(root, animate, outcome, duration) {
  const t = (value) => Math.round(value * duration)
  const hasChooser = Boolean(outcome.chooserId)
  const authorityIn = 0.19
  const authorityOut = 0.42
  const revealStart = hasChooser ? 0.48 : 0.12

  animate(root, [
    [0, 0],
    [180, 1],
    [duration - 180, 1],
    [duration, 0],
  ])
  animate('.replacement-camera', [
    [0, 1, 'scale(1.055)'],
    [t(0.26), 1, 'scale(1.025)'],
    [t(0.57), 1, 'scale(1.008)'],
    [duration, 1, 'scale(1.025)'],
  ])
  animate('.replacement-room-light', [
    [0, 0.18],
    [t(0.22), 0.55],
    [t(0.5), 0.38],
    [t(0.74), 0.78],
    [duration, 0.55],
  ])

  const authority = root.querySelector('.replacement-authority-shot')
  const block = root.querySelector('.replacement-block')
  if (authority) {
    animate(authority, [
      [0, 0, 'scale(1.035)'],
      [t(authorityIn), 0, 'scale(1.035)'],
      [t(authorityIn + 0.035), 1, 'scale(1)'],
      [t(authorityOut - 0.025), 1, 'scale(1)'],
      [t(authorityOut), 0, 'scale(1.018)'],
      [duration, 0, 'scale(1.018)'],
    ])
    animate('.replacement-authority-beam', [
      [0, 0.12, 'scaleX(.72)'],
      [t(authorityIn), 0.12, 'scaleX(.72)'],
      [t(authorityIn + 0.05), 1, 'scaleX(1)'],
      [t(authorityOut - 0.03), 0.85, 'scaleX(1)'],
      [t(authorityOut), 0, 'scaleX(1.08)'],
      [duration, 0, 'scaleX(1.08)'],
    ])
    animate(block, [
      [0, 1],
      [t(authorityIn), 1],
      [t(authorityIn + 0.035), 0],
      [t(authorityOut), 0],
      [t(authorityOut + 0.055), 1],
      [duration, 1],
    ])
  }

  let incoming = 0
  for (const slot of root.querySelectorAll('.replacement-slot')) {
    const isNew = slot.dataset.incoming === 'true'
    const at = isNew ? revealStart + incoming++ * (outcome.variant === 'vox' ? 0.12 : 0.13) : 0.04
    animate(slot.querySelector('.replacement-figure'), [
      [0, isNew ? 0 : 1, 'translateY(12px) scale(.97)'],
      [t(at), isNew ? 0 : 1, 'translateY(12px) scale(.97)'],
      [t(at + 0.13), 1, 'translateY(0) scale(1)'],
      [duration, 1],
    ])
    animate(slot.querySelector('.replacement-platform'), [
      [0, isNew ? 0.25 : 0.8],
      [t(at), isNew ? 0.25 : 0.8],
      [t(at + 0.12), 1],
      [duration, 1],
    ])
    animate(slot.querySelector('.replacement-name'), [
      [0, 0],
      [t(at + 0.09), 0],
      [t(at + 0.17), 1],
      [duration, 1],
    ])
  }
  animate('.replacement-caption', [
    [0, 0, 'translateY(8px)'],
    [t(0.76), 0, 'translateY(8px)'],
    [t(0.84), 1, 'translateY(0)'],
    [duration, 1],
  ])
}

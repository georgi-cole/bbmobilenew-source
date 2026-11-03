const TITLES = {
  ordinary: 'REPLACEMENT NOMINATION',
  halo: 'HALO EXCHANGE',
  force: 'FORCE MAJEURE',
  mission: 'THE BACKUP CHOICE',
  coLoh: 'THE CO-LEADER’S CHOICE',
  detox: 'DETOX · THE BLOCK IS RESET',
  doubleTrouble: 'DOUBLE TROUBLE',
  vox: 'VOX POPULI · REPLACEMENT NOMINATION',
  cupid: 'CUPID · LINKED BY FATE',
}

const OPENING_SAVE_VARIANTS = new Set(['force', 'detox', 'doubleTrouble'])
const unique = (values) => [...new Set(values.filter(Boolean))]
const isCupid = (outcome) => outcome.variant === 'cupid' && outcome.pairUnits?.length > 0

export function replacementResources(cast, details, shared) {
  const outcome = details.replacementOutcome
  const background = outcome.variant === 'vox' ? 'vox-studio.webp' : 'danger-chamber.webp'
  const resources = {
    replacementSet: { src: `assets/ceremonies/shared/${background}`, ...shared[background] },
    replacementPlatform: {
      src: 'assets/ceremonies/shared/danger-platform.webp',
      ...shared['danger-platform.webp'],
    },
  }
  if (outcome.variant === 'halo') {
    resources.replacementShield = {
      src: 'assets/ceremonies/shared/safety-shield-reveal.webp',
      ...shared['safety-shield-reveal.webp'],
    }
  }

  const stageIds = unique([
    ...outcome.continuingNomineeIds,
    ...outcome.replacementIds,
    ...(OPENING_SAVE_VARIANTS.has(outcome.variant) ? outcome.openingNomineeIds : []),
    ...(outcome.actionHistory ?? [])
      .filter((action) => action.kind === 'replacement')
      .map((action) => action.playerId),
  ])
  for (const id of stageIds) {
    const actor = cast[id]
    if (!actor?.poses?.front) continue
    resources[`replacement-body-${id}`] = {
      ...actor.poses.front,
      character: actor.id,
      pose: 'front',
    }
  }
  return resources
}

function copy(images, key, className) {
  const image = images[key]?.cloneNode()
  if (!image) throw new Error(`Missing replacement artwork: ${key}`)
  image.className = className
  image.alt = ''
  image.draggable = false
  return image
}

function slotFrame(index, count) {
  if (count <= 1) return { left: 28, width: 44, platformBottom: 33.4 }
  if (count === 2) return { left: index === 0 ? 3 : 53, width: 44, platformBottom: 33.4 }
  if (count === 3) return { left: [1, 34, 67][index] ?? 34, width: 31, platformBottom: 35.3 }
  return { left: [1, 26, 51, 76][index] ?? 1, width: 22, platformBottom: 36.7 }
}

function buildSlots(outcome) {
  if (isCupid(outcome)) {
    const openingPairs = outcome.pairUnits.filter((pair) =>
      pair.memberIds.some((id) => outcome.openingNomineeIds.includes(id))
    )
    const slots = openingPairs.map((pair, index) => ({
      index,
      pair,
      openingIds: pair.memberIds.filter((id) => outcome.openingNomineeIds.includes(id)),
      finalIds: pair.memberIds.filter((id) => outcome.nomineeIds.includes(id)),
    }))
    for (const pair of outcome.pairUnits.filter((pair) =>
      pair.memberIds.some((id) => outcome.replacementIds.includes(id))
    )) {
      let slot = slots.find((candidate) => candidate.pair.id === pair.id)
      slot ??= slots.find((candidate) => !candidate.finalIds.length)
      if (slot) {
        slot.pair = pair
        slot.finalIds = pair.memberIds.filter((id) => outcome.nomineeIds.includes(id))
      } else {
        slots.push({
          index: slots.length,
          pair,
          openingIds: [],
          finalIds: pair.memberIds.filter((id) => outcome.nomineeIds.includes(id)),
        })
      }
    }
    return slots
  }

  const minimum = Math.max(1, outcome.openingNomineeIds.length, outcome.nomineeIds.length)
  const actionSlots = (outcome.actionHistory ?? []).map((action) => action.slotIndex + 1)
  const count = Math.min(3, Math.max(minimum, ...actionSlots))
  const slots = Array.from({ length: count }, (_, index) => ({
    index,
    openingIds: outcome.openingNomineeIds[index] ? [outcome.openingNomineeIds[index]] : [],
    finalIds: [],
  }))
  const occupants = Array(count).fill(null)
  outcome.openingNomineeIds.forEach((id, index) => {
    if (index < count) occupants[index] = id
  })

  for (const action of outcome.actionHistory ?? []) {
    let index = occupants.indexOf(action.playerId)
    if (index < 0)
      index = Number.isInteger(action.slotIndex) ? action.slotIndex : occupants.indexOf(null)
    if (index < 0 || index >= count) index = occupants.indexOf(null)
    if (index < 0) index = Math.max(0, count - 1)
    if (action.kind === 'save') occupants[index] = null
    else occupants[index] = action.playerId
  }

  for (const id of outcome.nomineeIds) {
    if (occupants.includes(id)) continue
    let index = outcome.openingNomineeIds.indexOf(id)
    if (index < 0 || occupants[index]) index = occupants.indexOf(null)
    if (index < 0) index = slots.findIndex((slot) => !slot.finalIds.length)
    if (index >= 0) occupants[index] = id
  }
  occupants.forEach((id, index) => {
    if (id && outcome.nomineeIds.includes(id)) slots[index].finalIds.push(id)
  })
  for (const id of outcome.nomineeIds) {
    if (slots.some((slot) => slot.finalIds.includes(id))) continue
    const slot = slots.find((candidate) => !candidate.finalIds.length)
    if (slot) slot.finalIds.push(id)
  }
  return slots
}

function appendPerson(slot, id, role, images, cast, pairIndex = 0, pairCount = 1, outcome) {
  const actor = cast[id]
  if (!actor || !images[`replacement-body-${id}`]) return
  const person = document.createElement('div')
  person.className = `replacement-person replacement-person-${role}`
  person.dataset.actorId = id
  person.dataset.role = role
  person.dataset.pairIndex = String(pairIndex)
  person.dataset.pairCount = String(pairCount)
  person.style.setProperty('--pair-index', String(pairIndex))
  person.style.setProperty('--pair-count', String(pairCount))
  const frame = slotFrame(Number(slot.dataset.slotIndex), Number(slot.dataset.count))
  person.style.setProperty('--slot-width', `${frame.width}cqw`)
  person.style.aspectRatio = `${actor.poses.front.width} / ${actor.poses.front.height}`
  const body = copy(images, `replacement-body-${id}`, 'replacement-body')
  const feetY = Number.isFinite(actor.poses.front.feetY) ? actor.poses.front.feetY : 0.94762
  body.style.setProperty('--feet-y', `${feetY * 100}%`)
  const name = document.createElement('span')
  name.className = 'replacement-person-name'
  name.textContent = actor.name
  const assignment = outcome?.coLohAssignments?.find((entry) => entry.nomineeId === id)
  if (assignment && cast[assignment.coLohId]) {
    const ownership = document.createElement('small')
    ownership.textContent = `${cast[assignment.coLohId].name}’S NOMINEE`
    name.append(ownership)
  }
  person.append(body, name)
  slot.append(person)
}

function makeSlot(slotData, count, outcome, images, cast, pairIndexById) {
  const slot = document.createElement('div')
  slot.className = `replacement-slot${slotData.pair ? ' replacement-pair-slot' : ''}`
  slot.dataset.slotIndex = String(slotData.index)
  slot.dataset.count = String(count)
  if (slotData.pair) {
    slot.dataset.pairId = slotData.pair.id
    const pairColor = /^#[\da-f]{3,8}$/i.test(slotData.pair.color ?? '')
      ? slotData.pair.color
      : '#d6b96f'
    slot.style.setProperty('--pair-accent', pairColor)
  }
  const frame =
    slotData.pair && count === 2
      ? { left: slotData.index === 0 ? 1 : 51, width: 48 }
      : slotFrame(slotData.index, count)
  slot.style.setProperty('--slot-left', `${frame.left}%`)
  slot.style.setProperty('--slot-width', `${frame.width}cqw`)
  // The reusable 400×220 ledge's usable top surface is at image y=64.
  // Soles, the surface and the shadow share the 60.1% world support line.
  slot.style.setProperty('--platform-surface-offset', `${frame.width * (64 / 400)}cqw`)
  slot.style.setProperty('--platform-rim-offset', `${frame.width * (16 / 400)}cqw`)

  slot.append(copy(images, 'replacementPlatform', 'replacement-platform'))
  const rim = document.createElement('i')
  rim.className = 'replacement-platform-rim'
  rim.setAttribute('aria-hidden', 'true')
  slot.append(rim)
  const contact = document.createElement('i')
  contact.className = 'replacement-contact'
  contact.setAttribute('aria-hidden', 'true')
  slot.append(contact)
  const reveal = document.createElement('i')
  reveal.className = 'replacement-reveal-light'
  reveal.setAttribute('aria-hidden', 'true')
  slot.append(reveal)

  const isOpeningSaveVariant = OPENING_SAVE_VARIANTS.has(outcome.variant)
  const recordedSaves = new Set(
    (outcome.actionHistory ?? [])
      .filter((action) => action.kind === 'save')
      .map((action) => action.playerId)
  )
  const openingIds = slotData.openingIds.filter(
    (id) =>
      outcome.continuingNomineeIds.includes(id) ||
      (isOpeningSaveVariant && (recordedSaves.has(id) || outcome.variant === 'detox'))
  )
  const incomingIds = unique([
    ...(outcome.actionHistory ?? [])
      .filter((action) => action.kind === 'replacement' && action.slotIndex === slotData.index)
      .map((action) => action.playerId),
    ...slotData.finalIds.filter((id) => outcome.replacementIds.includes(id)),
  ])
  const pairCount = slotData.pair?.memberIds.length ?? 1
  openingIds.forEach((id) =>
    appendPerson(slot, id, 'opening', images, cast, pairIndexById.get(id) ?? 0, pairCount, outcome)
  )
  incomingIds.forEach((id) =>
    appendPerson(slot, id, 'incoming', images, cast, pairIndexById.get(id) ?? 0, pairCount, outcome)
  )
  return slot
}

function authorityCopy(outcome) {
  if (outcome.variant === 'vox') return null
  if (outcome.variant === 'halo') return ['POWER OF SAFETY', 'THE HOLDER DECIDES']
  if (outcome.variant === 'force') return ['FORCE MAJEURE', 'SAFETY MUST BE USED']
  if (outcome.variant === 'mission') return ['MISSION POWER', 'BACKUP CHOOSER']
  if (outcome.variant === 'coLoh') return ['CO-LEADER', 'MAKES THE CHOICE']
  if (outcome.variant === 'detox') return ['DETOX', 'THE ORIGINAL BLOCK CLEARS']
  if (outcome.variant === 'doubleTrouble')
    return ['DOUBLE TROUBLE', 'SAFETY CAN CHANGE THE BLOCK TWICE']
  if (outcome.variant === 'cupid') return ['CUPID’S ARROW', 'THE PAIR FACES DANGER TOGETHER']
  return ['LEADER OF THE HUB', 'DECISION IN PROGRESS']
}

function appendAuthority(root, images, cast, outcome) {
  const chooserId = outcome.chooserId
  if (!chooserId || !cast[chooserId]) return
  const authority = document.createElement('div')
  authority.className = `replacement-authority${outcome.variant === 'halo' ? ' is-halo' : ''}`
  authority.dataset.chooserId = chooserId
  const beam = document.createElement('i')
  beam.className = 'replacement-authority-beam'
  authority.append(beam)

  const role = authorityCopy(outcome)
  if (role) {
    const label = document.createElement('div')
    label.className = 'replacement-authority-label'
    const eyebrow = document.createElement('span')
    eyebrow.textContent = role[0]
    const name = document.createElement('strong')
    name.textContent = cast[chooserId].name
    const action = document.createElement('em')
    action.textContent = role[1]
    label.append(eyebrow, name, action)
    authority.append(label)
  }

  if (
    ['force', 'detox', 'doubleTrouble'].includes(outcome.variant) &&
    outcome.powerHolderId &&
    outcome.powerHolderId !== chooserId &&
    cast[outcome.powerHolderId]
  ) {
    const holder = document.createElement('div')
    holder.className = 'replacement-power-holder'
    const holderRole = document.createElement('span')
    holderRole.textContent = outcome.variant === 'force' ? 'SAFETY HOLDER' : 'POWER HOLDER'
    const holderName = document.createElement('strong')
    holderName.textContent = cast[outcome.powerHolderId].name
    holder.append(holderRole, holderName)
    authority.append(holder)
  }
  if (outcome.variant === 'halo' && images.replacementShield) {
    authority.append(copy(images, 'replacementShield', 'replacement-power-insignia'))
  }
  const priorId = outcome.priorAuthorityId
  if (
    ['halo', 'mission'].includes(outcome.variant) &&
    priorId &&
    priorId !== chooserId &&
    cast[priorId]
  ) {
    const prior = document.createElement('div')
    prior.className = 'replacement-prior-authority'
    prior.textContent = `LEADER OF THE HUB · ${cast[priorId].name}`
    authority.append(prior)
  }
  root.append(authority)
}

function copyForOutcome(cast, outcome) {
  const names = outcome.replacementIds.map((id) => cast[id]?.name).filter(Boolean)
  const joined =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  if (outcome.variant === 'detox') return 'The block has been reset.'
  if (
    outcome.variant === 'doubleTrouble' &&
    outcome.actionHistory?.filter((action) => action.kind === 'save').length > 1
  )
    return 'Two saves. A changed block.'
  if (outcome.variant === 'cupid') return 'Nominated together.'
  if (outcome.variant === 'coLoh')
    return `${cast[outcome.chooserId]?.name ?? 'The co-leader'} names ${joined}.`
  if (outcome.variant === 'force')
    return `Safety is used. ${joined} ${names.length === 1 ? 'joins' : 'join'} the block.`
  if (outcome.variant === 'mission') return `The backup is chosen: ${joined}.`
  if (outcome.variant === 'halo')
    return `${joined} ${names.length === 1 ? 'takes' : 'take'} the open place.`
  if (outcome.variant === 'vox')
    return names.length === 1 ? `${joined} joins the block.` : `${joined} join the block.`
  return names.length === 1 ? `${joined} joins the block.` : `${joined} join the block.`
}

export function makeReplacementFilm(images, cast, outcome) {
  const root = document.createElement('div')
  root.className = `c-scene replacement-film replacement-${outcome.variant}`
  root.setAttribute('aria-hidden', 'true')
  root.dataset.variant = outcome.variant
  const camera = document.createElement('div')
  camera.className = 'replacement-camera'
  camera.append(copy(images, 'replacementSet', 'replacement-set'))
  const light = document.createElement('div')
  light.className = 'replacement-room-light'
  camera.append(light)

  const block = document.createElement('div')
  block.className = 'replacement-block'
  const slots = buildSlots(outcome)
  const positionCount = slots.length
  block.dataset.count = String(positionCount)
  const pairIndexById = new Map()
  if (isCupid(outcome)) {
    for (const pair of outcome.pairUnits)
      pair.memberIds.forEach((id, index) => pairIndexById.set(id, index))
  }
  for (const slotData of slots)
    block.append(makeSlot(slotData, positionCount, outcome, images, cast, pairIndexById))
  camera.append(block)
  const sweep = document.createElement('div')
  sweep.className = 'replacement-save-sweep'
  camera.append(sweep)
  const powerAccent = document.createElement('div')
  powerAccent.className = 'replacement-power-accent'
  camera.append(powerAccent)
  const forceAccent = document.createElement('div')
  forceAccent.className = 'replacement-force-accent'
  camera.append(forceAccent)
  appendAuthority(camera, images, cast, outcome)

  const caption = document.createElement('div')
  caption.className = 'replacement-caption'
  const title = document.createElement('span')
  title.textContent = TITLES[outcome.variant] ?? 'THE BLOCK'
  const result = document.createElement('strong')
  result.textContent = copyForOutcome(cast, outcome)
  caption.append(title, result)
  root.append(camera, caption)
  return root
}

const sec = (seconds) => Math.round(seconds * 1000)
const frame = (seconds, duration) => Math.min(sec(seconds), duration - 250)

function actionTimes(outcome) {
  const saves = (outcome.actionHistory ?? []).filter((action) => action.kind === 'save')
  const replacements = (outcome.actionHistory ?? []).filter(
    (action) => action.kind === 'replacement'
  )
  const times = new Map()
  if (outcome.variant === 'cupid') {
    outcome.replacementIds.forEach((id) => times.set(`replacement:${id}`, 1.9))
    return times
  }
  const saveDefaults =
    outcome.variant === 'detox' ? [0.85, 0.85] : saves.length > 1 ? [0.7, 2.5] : [0.85]
  const replacementDefaults =
    outcome.variant === 'detox'
      ? [1.95, 2.8]
      : saves.length > 1
        ? [1.4, 3.3]
        : outcome.variant === 'vox'
          ? [1.2, 1.95]
          : [1.95]
  saves.forEach((action, index) =>
    times.set(`save:${action.playerId}`, saveDefaults[index] ?? 3.5 + index * 0.5)
  )
  if (outcome.variant === 'detox') outcome.savedIds.forEach((id) => times.set(`save:${id}`, 0.85))
  replacements.forEach((action, index) =>
    times.set(`replacement:${action.playerId}`, replacementDefaults[index] ?? 3.2 + index * 0.8)
  )

  // Old restored saves have no transient receipt. The final state still receives a
  // coherent chooser-to-reveal sequence, while new in-session picks use the ledger.
  outcome.replacementIds.forEach((id, index) => {
    if (!times.has(`replacement:${id}`)) {
      const fallback =
        outcome.variant === 'vox'
          ? 1.2 + index * 0.75
          : outcome.variant === 'detox'
            ? 1.95 + index * 0.85
            : saves.length > 1
              ? 1.4 + index * 1.9
              : 1.95 + index * 0.7
      times.set(`replacement:${id}`, fallback)
    }
  })
  return times
}

function captionStart(duration) {
  // 200 ms entrance + 1.2 s reading hold + the host's single 220 ms fade.
  return duration - 1620
}

export function animateReplacementFilm(root, animate, outcome, duration) {
  const isVox = outcome.variant === 'vox'
  const isPowerSequence = ['detox', 'doubleTrouble', 'force'].includes(outcome.variant)
  const times = actionTimes(outcome)
  animate(root, [
    [0, 0],
    [sec(0.24), 1],
    [duration, 1],
  ])
  animate('.replacement-camera', [
    [0, 1, 'scale(1.035)'],
    [sec(0.45), 1, 'scale(1.022)'],
    [duration - 300, 1, 'scale(1)'],
    [duration, 1, 'scale(1)'],
  ])
  animate('.replacement-room-light', [
    [0, 0.3],
    [sec(0.55), 0.46],
    [sec(1.35), isVox ? 0.38 : 0.32],
    [sec(2.1), 0.58],
    [duration - 250, 0.56],
    [duration, 0.56],
  ])

  for (const person of root.querySelectorAll('.replacement-person')) {
    const id = person.dataset.actorId
    const role = person.dataset.role
    const replacementAt = times.get(`replacement:${id}`) ?? 2.45
    const saveAt = times.get(`save:${id}`)
    const showAtStart = role === 'opening' && OPENING_SAVE_VARIANTS.has(outcome.variant)
    const isIncoming = role === 'incoming'
    const start = [[0, showAtStart ? 1 : 0]]
    if (isIncoming) {
      start.push([frame(replacementAt, duration), 0], [frame(replacementAt + 0.32, duration), 1])
    } else if (showAtStart) {
      start.push([sec(0.2), 1])
    } else {
      start.push([sec(0.35), 1])
    }
    if (saveAt != null) {
      start.push([frame(saveAt, duration), 1], [frame(saveAt + 0.3, duration), 0])
    }
    start.push([duration, outcome.nomineeIds.includes(id) && saveAt == null ? 1 : 0])
    animate(person, start)
    const name = person.querySelector('.replacement-person-name')
    const nameAt = isIncoming ? replacementAt + 0.48 : 0.45
    animate(name, [
      [0, 0],
      [frame(nameAt, duration), 0],
      [frame(nameAt + 0.18, duration), 1],
      [duration, 1],
    ])
  }

  const authority = root.querySelector('.replacement-authority')
  if (authority) {
    const entry = outcome.variant === 'vox' ? 0 : 0.88
    const release = outcome.variant === 'vox' ? 0 : 1.94
    animate(authority, [
      [0, 0, 'translateY(8px) scale(.99)'],
      [sec(entry), 0],
      [sec(entry + 0.22), 1, 'translateY(0) scale(1)'],
      [sec(release), 1],
      [sec(release + 0.24), 0, 'translateY(-5px) scale(.99)'],
      [duration, 0],
    ])
    animate('.replacement-authority-beam', [
      [0, 0, 'scaleX(.72)'],
      [sec(entry + 0.1), 0, 'scaleX(.72)'],
      [sec(entry + 0.36), 0.82, 'scaleX(1)'],
      [sec(release), 0.62, 'scaleX(.9)'],
      [sec(release + 0.18), 0, 'scaleX(.8)'],
      [duration, 0],
    ])
    const prior = root.querySelector('.replacement-prior-authority')
    if (prior)
      animate(prior, [
        [0, 1],
        [1000, 1],
        [1350, 0],
        [duration, 0],
      ])
  }

  const saves = (outcome.actionHistory ?? []).filter((action) => action.kind === 'save')
  const sweep = root.querySelector('.replacement-save-sweep')
  if (sweep && saves.length && isPowerSequence) {
    const stops = [[0, 0, 'scaleX(.2)']]
    const pulses = outcome.variant === 'detox' ? saves.slice(0, 1) : saves
    pulses.forEach((save, index) => {
      const at = times.get(`save:${save.playerId}`) ?? (index ? 3.15 : 1.55)
      stops.push(
        [frame(at, duration), 0, 'scaleX(.2)'],
        [frame(at + 0.18, duration), index ? 0.66 : 0.78, 'scaleX(1)'],
        [frame(at + 0.57, duration), 0, 'scaleX(1.08)']
      )
    })
    stops.push([duration, 0])
    animate(sweep, stops)
  }

  for (const slot of root.querySelectorAll('.replacement-slot')) {
    const ids = [...slot.querySelectorAll('.replacement-person-incoming')].map(
      (person) => person.dataset.actorId
    )
    const arrivals = ids.map((id) => times.get(`replacement:${id}`) ?? 2.45)
    const revealAt = arrivals.length ? Math.min(...arrivals) : 0
    const rim = slot.querySelector('.replacement-platform-rim')
    if (rim && revealAt) {
      animate(rim, [
        [0, 0.14],
        [frame(revealAt, duration), 0.14],
        [frame(revealAt + 0.2, duration), 0.86],
        [frame(revealAt + 0.68, duration), 0.34],
        [duration, 0.34],
      ])
    }
    const reveal = slot.querySelector('.replacement-reveal-light')
    if (reveal && arrivals.length) {
      const stops = [[0, 0, 'scale(.88)']]
      for (const at of [...new Set(arrivals)].sort((a, b) => a - b)) {
        stops.push(
          [frame(at - 0.12, duration), 0, 'scale(.88)'],
          [frame(at + 0.12, duration), 0.7, 'scale(1)'],
          [frame(at + 0.6, duration), 0, 'scale(1.1)']
        )
      }
      stops.push([duration, 0])
      animate(reveal, stops)
    }
  }

  const captionAt = captionStart(duration)
  animate('.replacement-caption', [
    [0, 0, 'translateY(8px)'],
    [frame(captionAt / 1000, duration), 0, 'translateY(8px)'],
    [frame(captionAt / 1000 + 0.2, duration), 1, 'translateY(0)'],
    [duration, 1, 'translateY(0)'],
  ])

  // A single quiet directional light accent distinguishes each variant without
  // running particles, blur filters or continuous effects over the whole film.
  if (isPowerSequence) {
    const accent =
      outcome.variant === 'force' ? '.replacement-force-accent' : '.replacement-power-accent'
    const node = root.querySelector(accent)
    if (node) {
      const saveTime = saves.length ? (times.get(`save:${saves[0].playerId}`) ?? 1.55) : 1.4
      animate(node, [
        [0, 0],
        [frame(saveTime, duration), 0],
        [frame(saveTime + 0.24, duration), 0.68],
        [frame(saveTime + 0.7, duration), 0.2],
        [duration, 0.2],
      ])
    }
  }
}

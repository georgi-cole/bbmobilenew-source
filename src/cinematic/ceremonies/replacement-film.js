import { replacementBeats, replacementDuration } from './replacement-timing.js'
import { appendDecisionShots } from './replacement-decisions.js'

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
    ...outcome.openingNomineeIds,
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
  const decisionIds = unique([
    ...(outcome.actionHistory ?? []).map((action) => action.actorId),
    outcome.decision?.actorId,
    ...(!outcome.actionHistory?.length ? [outcome.chooserId] : []),
  ])
  for (const id of decisionIds) {
    const actor = cast[id]
    if (!actor?.poses?.front) continue
    const choices = [
      ...(outcome.actionHistory ?? []).filter((action) => action.actorId === id),
      ...(outcome.decision?.actorId === id ? [outcome.decision] : []),
      ...(!outcome.actionHistory?.length && !outcome.decision ? [{ kind: 'replacement' }] : []),
    ]
    const royal =
      choices.some((choice) => choice.kind === 'replacement') &&
      (id === outcome.priorAuthorityId || outcome.coLohIds?.includes(id))
    const pose = royal && actor.poses['royal-seated'] ? 'royal-seated' : 'front'
    resources[`replacement-authority-${id}`] = { ...actor.poses[pose], character: actor.id, pose }
    if (!royal || choices.some((choice) => choice.kind !== 'replacement'))
      resources[`replacement-holder-${id}`] = {
        ...actor.poses.front,
        character: actor.id,
        pose: 'front',
      }
    if (pose === 'royal-seated') {
      for (const key of ['royal-room.webp', 'throne.webp', 'crown.webp']) {
        if (shared[key]) resources[key] = { src: `assets/ceremonies/shared/${key}`, ...shared[key] }
      }
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
    const count = Math.max(
      1,
      Math.ceil(
        Math.max(
          outcome.slotCount ?? 0,
          outcome.openingNomineeIds.length,
          outcome.nomineeIds.length,
          ...(outcome.actionHistory ?? []).map((action) => action.slotIndex + 1)
        ) / 2
      )
    )
    const slots = Array.from({ length: count }, (_, index) => ({
      index,
      pair: { id: `open-${index}`, memberIds: [], color: '#d6b96f' },
      openingIds: [],
      finalIds: [],
    }))
    for (const pair of outcome.pairUnits) {
      const openingIds = pair.memberIds.filter((id) => outcome.openingNomineeIds.includes(id))
      if (!openingIds.length) continue
      const rawIndex = Math.min(
        ...openingIds.map(
          (id) => outcome.openingSlots?.[id] ?? outcome.openingNomineeIds.indexOf(id)
        )
      )
      const slot = slots[Math.floor(rawIndex / 2)]
      if (!slot) continue
      slot.pair = pair
      slot.openingIds = openingIds
      slot.finalIds = openingIds.filter((id) => outcome.nomineeIds.includes(id))
    }
    for (const pair of outcome.pairUnits.filter((pair) =>
      pair.memberIds.some((id) => outcome.replacementIds.includes(id))
    )) {
      const action = outcome.actionHistory?.find(
        (action) => action.kind === 'replacement' && pair.memberIds.includes(action.playerId)
      )
      let slot = action
        ? slots[Math.floor(action.slotIndex / 2)]
        : slots.find((slot) => !slot.finalIds.length)
      if (slot?.finalIds.length && !slot.finalIds.some((id) => pair.memberIds.includes(id)))
        slot = slots.find((candidate) => !candidate.finalIds.length)
      if (!slot) continue
      slot.pair = pair
      slot.finalIds = pair.memberIds.filter((id) => outcome.nomineeIds.includes(id))
    }
    return slots
  }

  const minimum = Math.max(
    1,
    outcome.slotCount ?? 0,
    outcome.openingNomineeIds.length,
    outcome.nomineeIds.length
  )
  const actionSlots = (outcome.actionHistory ?? []).map((action) => action.slotIndex + 1)
  const count = Math.min(3, Math.max(minimum, ...actionSlots))
  const slots = Array.from({ length: count }, (_, index) => ({
    index,
    openingIds: outcome.openingNomineeIds.filter(
      (id, originalIndex) => (outcome.openingSlots?.[id] ?? originalIndex) === index
    ),
    finalIds: [],
  }))
  const occupants = Array(count).fill(null)
  outcome.openingNomineeIds.forEach((id, index) => {
    const physicalSlot = outcome.openingSlots?.[id] ?? index
    if (physicalSlot < count) occupants[physicalSlot] = id
  })

  for (const action of outcome.actionHistory ?? []) {
    let index = occupants.indexOf(action.playerId)
    if (index < 0)
      index = Number.isInteger(action.slotIndex) ? action.slotIndex : occupants.indexOf(null)
    if (index < 0 || index >= count) index = occupants.indexOf(null)
    if (index < 0) index = Math.max(0, count - 1)
    if (action.kind === 'save') occupants[index] = null
    else if (action.kind === 'replacement') occupants[index] = action.playerId
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

  const isOpeningSaveVariant = Boolean(
    outcome.actionHistory?.some((action) => action.kind === 'save')
  )
  const recordedSaves = new Set(
    (outcome.actionHistory ?? [])
      .filter((action) => action.kind === 'save')
      .map((action) => action.playerId)
  )
  const openingIds = slotData.openingIds.filter(
    (id) =>
      outcome.continuingNomineeIds.includes(id) || (isOpeningSaveVariant && recordedSaves.has(id))
  )
  const incomingIds = unique([
    ...(outcome.actionHistory ?? [])
      .filter(
        (action) =>
          action.kind === 'replacement' &&
          (isCupid(outcome)
            ? Math.floor(action.slotIndex / 2) === slotData.index
            : action.slotIndex === slotData.index)
      )
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

function copyForOutcome(cast, outcome) {
  const names = outcome.replacementIds.map((id) => cast[id]?.name).filter(Boolean)
  const joined =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  if (!names.length) return 'The nominations stand.'
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
  if (outcome.decisionOnly) root.classList.add('replacement-decision-wait')
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

  const caption = document.createElement('div')
  caption.className = 'replacement-caption'
  const title = document.createElement('span')
  title.textContent = TITLES[outcome.variant] ?? 'THE BLOCK'
  const result = document.createElement('strong')
  result.textContent = copyForOutcome(cast, outcome)
  caption.append(title, result)
  root.append(camera, caption)
  appendDecisionShots(root, images, cast, outcome)
  return root
}

export function animateReplacementFilm(root, animate, outcome, duration) {
  const naturalDuration = replacementDuration(outcome)
  const scale = duration / naturalDuration
  const at = (ms) => Math.min(duration, Math.max(0, Math.round(ms * scale)))
  const beats = replacementBeats(outcome)
  animate(root, [
    [0, 0],
    [at(220), 1],
    [duration, 1],
  ])
  animate('.replacement-camera', [
    [0, 1, 'scale(1.025)'],
    [duration, 1, 'scale(1)'],
  ])
  animate('.replacement-room-light', [
    [0, 0.42],
    [duration, 0.5],
  ])
  animate('.replacement-caption', [
    [0, 0],
    [duration, beats.length ? 0 : 1],
  ])
  for (const shot of root.querySelectorAll('.replacement-decision-shot')) {
    const beat = beats[Number(shot.dataset.beatIndex)]
    if (outcome.decisionOnly) {
      animate(shot, [
        [0, 0],
        [350, 1],
        [duration, 1],
      ])
      continue
    }
    animate(shot, [
      [0, 0],
      [at(beat.shotStart), 0],
      [at(beat.shotStart + 180), 1],
      [at(beat.shotEnd), 1],
      [at(beat.shotEnd + 220), 0],
      [duration, 0],
    ])
    const figure = shot.querySelector('.replacement-decision-figure')
    if (figure)
      animate(figure, [
        [0, 1, 'scale(1)'],
        [at(beat.shotEnd), 1, 'scale(1.035)'],
        [duration, 1, 'scale(1.035)'],
      ])
    const caption = root.querySelector(`.replacement-beat-caption[data-beat-index="${beat.index}"]`)
    const last = beat.index === beats.length - 1
    animate(caption, [
      [0, 0],
      [at(beat.revealAt + 180), 0],
      [at(beat.revealAt + 450), 1],
      [last ? duration : at(beat.end), 1],
      ...(!last
        ? [
            [at(beat.end + 150), 0],
            [duration, 0],
          ]
        : []),
    ])
  }
  for (const person of root.querySelectorAll('.replacement-person')) {
    const id = person.dataset.actorId
    const incoming = person.dataset.role === 'incoming'
    const reveal = beats.find(
      (b) => b.kind === 'replacement' && b.actions.some((a) => a.playerId === id)
    )
    const save = beats.find((b) => b.kind === 'save' && b.actions.some((a) => a.playerId === id))
    const stops = [[0, incoming ? 0 : 1]]
    if (incoming && reveal) stops.push([at(reveal.revealAt), 0], [at(reveal.revealAt + 360), 1])
    if (save) stops.push([at(save.revealAt), 1], [at(save.revealAt + 420), 0])
    stops.push([duration, save ? 0 : 1])
    animate(person, stops)
    animate(person.querySelector('.replacement-person-name'), [
      [0, 1],
      [duration, 1],
    ])
  }
  for (const slot of root.querySelectorAll('.replacement-slot')) {
    const arrivals = beats.filter(
      (b) =>
        b.kind === 'replacement' &&
        b.actions.some(
          (a) =>
            (isCupid(outcome) ? Math.floor(a.slotIndex / 2) : a.slotIndex) ===
            Number(slot.dataset.slotIndex)
        )
    )
    const reveal = slot.querySelector('.replacement-reveal-light')
    const rim = slot.querySelector('.replacement-platform-rim')
    const stops = [[0, 0, 'scale(.9)']]
    for (const beat of arrivals)
      stops.push(
        [at(beat.revealAt - 100), 0, 'scale(.9)'],
        [at(beat.revealAt + 160), 0.8, 'scale(1)'],
        [at(beat.revealAt + 850), 0, 'scale(1.08)']
      )
    stops.push([duration, 0])
    animate(reveal, stops)
    animate(rim, [
      [0, 0.18],
      [duration, 0.4],
    ])
  }
  const sweep = root.querySelector('.replacement-save-sweep')
  const stops = [[0, 0, 'scaleX(.2)']]
  for (const beat of beats.filter((b) => b.kind === 'save'))
    stops.push(
      [at(beat.revealAt), 0, 'scaleX(.2)'],
      [at(beat.revealAt + 200), 0.7, 'scaleX(1)'],
      [at(beat.revealAt + 700), 0, 'scaleX(1.08)']
    )
  stops.push([duration, 0])
  animate(sweep, stops)
}

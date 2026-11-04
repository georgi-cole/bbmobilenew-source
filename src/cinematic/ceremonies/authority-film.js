import { authorityIds, isRoyalAuthority } from './replacement-timing.js'

export const copyArt = (images, key, className) => {
  const image = images[key]?.cloneNode()
  if (!image) return null
  image.className = className
  image.alt = ''
  image.draggable = false
  return image
}
const pct = (value) => `${value * 100}%`
export function authorityResources(cast, outcome, shared) {
  const resources = {}
  const ids = new Set([
    ...(outcome.actionHistory ?? []).flatMap((action) => authorityIds(outcome, action.actorId)),
    ...authorityIds(outcome, outcome.decision?.actorId),
  ])
  for (const id of ids) {
    const actor = cast[id]
    if (!actor) continue
    const royal = isRoyalAuthority(outcome, id) && actor.poses['royal-seated']
    const key = royal ? `replacement-authority-${id}` : `replacement-holder-${id}`
    const pose = royal ? 'royal-seated' : actor.poses['decision-back'] ? 'decision-back' : 'front'
    resources[key] = { ...actor.poses[pose], character: actor.id, pose }
    if (royal)
      for (const file of ['royal-room.webp', 'throne.webp', 'crown.webp']) {
        if (shared[file])
          resources[file] = { src: `assets/ceremonies/shared/${file}`, ...shared[file] }
      }
  }
  if (
    [...ids].some((id) => isRoyalAuthority(outcome, id) && outcome.safetyHolderIds?.includes(id))
  ) {
    resources.replacementShield = {
      src: 'assets/ceremonies/shared/safety-shield-reveal.webp',
      ...shared['safety-shield-reveal.webp'],
    }
  }
  return resources
}
export function appendRoyalUnit(shot, images, cast, outcome, actorId) {
  const ids = authorityIds(outcome, actorId).filter((id) => cast[id])
  const figure = document.createElement('div')
  figure.className = `replacement-decision-figure royal-unit${ids.length > 1 ? ' is-paired' : ''}`
  ids.forEach((id, index) => {
    const actor = cast[id],
      pose = actor.poses['royal-seated']
    const member = document.createElement('div')
    member.className = 'royal-member'
    member.dataset.actorId = id
    member.style.setProperty('--royal-index', index)
    const throne = copyArt(images, 'throne.webp', 'replacement-decision-throne')
    if (throne && pose?.throne) {
      throne.style.transform = `translate(${pct(pose.throne.x)},${pct(pose.throne.y)}) scale(${pose.throne.scale})`
      member.append(throne)
    }
    const body = copyArt(images, `replacement-authority-${id}`, 'replacement-decision-person')
    if (body) member.append(body)
    const crown = copyArt(images, 'crown.webp', 'replacement-decision-crown')
    if (crown && pose?.crown) {
      const { x, baseY, width, angle } = pose.crown
      crown.style.cssText = `left:${pct(x - width / 2)};top:${pct(baseY - ((((width * pose.width) / pose.height) * 44) / 144) * 0.88)};width:${pct(width)};transform:rotate(${angle}deg)`
      member.append(crown)
    }
    figure.append(member)
  })
  shot.append(figure)
  if (ids.some((id) => outcome.safetyHolderIds?.includes(id)) && images.replacementShield) {
    const plinth = document.createElement('div')
    plinth.className = `royal-safety-plinth${ids.length > 1 ? ' is-paired' : ''}`
    const halo = document.createElement('i')
    halo.className = 'royal-safety-halo'
    plinth.append(halo, copyArt(images, 'replacementShield', 'royal-safety-shield'))
    shot.append(plinth)
  }
  return ids
}

export function royalPowerOutcome(cast, paired = false) {
  const actors = Object.values(cast)
    .filter(
      (actor, index, list) =>
        list.findIndex((other) => (other.playerId ?? other.id) === (actor.playerId ?? actor.id)) ===
        index
    )
    .slice(0, paired ? 2 : 1)
  const ids = actors.map((actor) => actor.playerId ?? actor.id)
  return {
    owner: 'replacement',
    variant: 'ordinary',
    actionHistory: [],
    decisionOnly: true,
    decision: { actorId: ids[0], kind: 'use' },
    leaderIds: ids,
    safetyHolderIds: ids,
    authorityPairs: ids.length > 1 ? [{ id: 'shared-crown', memberIds: ids }] : [],
    durationMs: 5600,
  }
}
export function byPlayerId(cast) {
  return Object.fromEntries(Object.values(cast).map((actor) => [actor.playerId ?? actor.id, actor]))
}

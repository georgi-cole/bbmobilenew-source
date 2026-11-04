import { replacementBeats } from './replacement-timing.js'

const copy = (images, key, className) => {
  const image = images[key]?.cloneNode()
  if (!image) return null
  image.className = className
  image.alt = ''
  image.draggable = false
  return image
}
const pct = (value) => `${value * 100}%`
export function decisionRole(outcome, id, role) {
  if (role === 'mission') return 'MISSION POWER'
  if (role === 'safety') return 'POWER OF SAFETY'
  if (role === 'coLoh') return 'CO-LEADER OF THE HUB'
  if (outcome.variant === 'mission' && id === outcome.chooserId) return 'MISSION POWER'
  if (outcome.coLohIds?.includes(id)) return 'CO-LEADER OF THE HUB'
  if (id === outcome.priorAuthorityId) return 'LEADER OF THE HUB'
  return 'POWER OF SAFETY'
}
export function appendDecisionShots(root, images, cast, outcome) {
  const beats = outcome.decisionOnly
    ? [{ ...outcome.decision, index: 0, actions: [] }]
    : replacementBeats(outcome)
  for (const beat of beats) {
    const shot = document.createElement('section')
    shot.className = 'replacement-decision-shot'
    shot.dataset.beatIndex = String(beat.index)
    shot.dataset.actorId = beat.actorId ?? ''
    const actor = cast[beat.actorId]
    const royal =
      actor &&
      beat.kind === 'replacement' &&
      images[`replacement-authority-${beat.actorId}`]?.dataset.pose === 'royal-seated'
    const backdrop = copy(
      images,
      royal && images['royal-room.webp'] ? 'royal-room.webp' : 'replacementSet',
      'replacement-decision-backdrop'
    )
    shot.append(backdrop)
    const shade = document.createElement('div')
    shade.className = 'replacement-decision-shade'
    shot.append(shade)
    if (actor) {
      shot.classList.add(royal ? 'is-royal' : 'is-holder')
      const figure = document.createElement('div')
      figure.className = 'replacement-decision-figure'
      const portrait = copy(
        images,
        royal ? `replacement-authority-${beat.actorId}` : `replacement-holder-${beat.actorId}`,
        'replacement-decision-person'
      )
      if (portrait) {
        if (royal) {
          const pose = actor.poses['royal-seated']
          const throne = copy(images, 'throne.webp', 'replacement-decision-throne')
          if (throne && pose.throne) {
            throne.style.transform = `translate(${pct(pose.throne.x)},${pct(pose.throne.y)}) scale(${pose.throne.scale})`
            figure.append(throne)
          }
          figure.append(portrait)
          const crown = copy(images, 'crown.webp', 'replacement-decision-crown')
          if (crown && pose.crown) {
            const { x, baseY, width, angle } = pose.crown
            crown.style.cssText = `left:${pct(x - width / 2)};top:${pct(baseY - ((((width * pose.width) / pose.height) * 44) / 144) * 0.88)};width:${pct(width)};transform:rotate(${angle}deg)`
            figure.append(crown)
          }
        } else figure.append(portrait)
      }
      shot.append(figure)
    }
    const label = document.createElement('div')
    label.className = 'replacement-decision-label'
    const role = document.createElement('span')
    role.textContent =
      beat.kind === 'mission'
        ? 'MISSION POWER'
        : actor
          ? beat.kind === 'replacement'
            ? decisionRole(outcome, beat.actorId, beat.actions[0]?.actorRole)
            : 'POWER OF SAFETY'
          : 'VOX POPULI'
    const safetyBeat = ['save', 'use', 'secondUse', 'decline'].includes(beat.kind)
    const power = outcome.powerType ?? outcome.variant
    if (safetyBeat && ['vip', 'doubleTrouble'].includes(power)) {
      const round =
        beat.kind === 'secondUse'
          ? 2
          : (outcome.safetyUseNumber ??
            replacementBeats(outcome)
              .slice(0, beat.index + 1)
              .filter((step) => step.kind === 'save').length)
      role.textContent =
        beat.kind === 'decline'
          ? 'DOUBLE TROUBLE · POWER NOT USED'
          : `DOUBLE TROUBLE · ${round > 1 ? 'SECOND USE' : 'FIRST USE'}`
    } else if (safetyBeat && ['coup', 'detox'].includes(power))
      role.textContent = 'DETOX · SAFETY HOLDER'
    else if (safetyBeat && ['spotlight', 'force'].includes(power))
      role.textContent = 'FORCE MAJEURE · SAFETY HOLDER'
    else if (['diamond', 'halo'].includes(power)) role.textContent = 'HALO EXCHANGE · SAFETY HOLDER'
    const name = document.createElement('strong')
    name.textContent = actor?.name ?? 'The secret ballots'
    const action = document.createElement('em')
    action.textContent = outcome.decisionOnly
      ? beat.kind === 'replacement'
        ? 'YOUR REPLACEMENT CHOICE'
        : beat.kind === 'secondUse'
          ? 'USE THE POWER AGAIN?'
          : beat.kind === 'mission'
            ? 'YOUR SPECIAL POWER DECISION'
            : 'YOUR SAFETY DECISION'
      : beat.kind === 'decline'
        ? 'LEAVES THE BLOCK UNCHANGED'
        : beat.kind === 'save'
          ? ['coup', 'detox'].includes(power)
            ? 'CLEARS THE BLOCK'
            : 'USES SAFETY'
          : actor
            ? 'NAMES A REPLACEMENT'
            : 'THE NEXT NOMINEE'
    const line = document.createElement('i')
    line.className = 'replacement-decision-line'
    label.append(role, name, action, line)
    shot.append(label)
    root.append(shot)
    if (!outcome.decisionOnly) {
      const caption = document.createElement('div')
      caption.className = 'replacement-beat-caption'
      caption.dataset.beatIndex = String(beat.index)
      const eyebrow = document.createElement('span')
      eyebrow.textContent =
        beat.kind === 'decline'
          ? 'POWER NOT USED'
          : beat.kind === 'save'
            ? 'SAFETY USED'
            : 'REPLACEMENT NOMINATION'
      const text = document.createElement('strong')
      const names = beat.actions.map((a) => cast[a.playerId]?.name ?? 'The nominee').join(' & ')
      text.textContent =
        beat.kind === 'decline'
          ? 'The nominations stand.'
          : beat.kind === 'save'
            ? `${names} ${beat.actions.length > 1 ? 'are' : 'is'} safe.`
            : `${names} ${beat.actions.length > 1 ? 'join' : 'joins'} the block.`
      caption.append(eyebrow, text)
      root.append(caption)
    }
  }
}

import { replacementBeats, authorityIds, isRoyalAuthority } from './replacement-timing.js'
import { copyArt, appendRoyalUnit } from './authority-film.js'

export function decisionRole(outcome, id, role) {
  if (isRoyalAuthority(outcome, id))
    return authorityIds(outcome, id).length > 1 ? 'LEADERS OF THE HUB' : 'LEADER OF THE HUB'
  if (role === 'mission' || outcome.variant === 'mission') return 'MISSION POWER'
  return 'POWER OF SAFETY'
}
export function appendDecisionShots(root, images, cast, outcome) {
  const beats = outcome.decisionOnly
    ? [
        {
          ...outcome.decision,
          index: 0,
          actions: [],
          showAuthority: true,
          royal: isRoyalAuthority(outcome, outcome.decision?.actorId),
        },
      ]
    : replacementBeats(outcome)
  for (const beat of beats) {
    const actor = cast[beat.actorId]
    const royal = actor && isRoyalAuthority(outcome, beat.actorId)
    if (actor && beat.showAuthority) {
      const shot = document.createElement('section')
      shot.className = `replacement-decision-shot ${royal ? 'is-royal' : 'is-over-shoulder'}`
      shot.dataset.beatIndex = String(beat.index)
      shot.dataset.actorId = beat.actorId
      const selfSave = !royal && outcome.openingNomineeIds?.includes(beat.actorId)
      if (selfSave) shot.classList.add('is-self-save')
      let ids = [beat.actorId]
      if (royal) {
        shot.append(
          copyArt(
            images,
            images['royal-room.webp'] ? 'royal-room.webp' : 'replacementSet',
            'replacement-decision-backdrop'
          )
        )
        const shade = document.createElement('div')
        shade.className = 'replacement-decision-shade'
        shot.append(shade)
        ids = appendRoyalUnit(shot, images, cast, outcome, beat.actorId)
      } else if (!selfSave) {
        const figure = document.createElement('div')
        figure.className = 'replacement-holder-foreground'
        figure.append(
          copyArt(images, `replacement-holder-${beat.actorId}`, 'replacement-holder-back')
        )
        const shadow = document.createElement('i')
        shadow.className = 'replacement-holder-shadow'
        shot.append(shadow, figure)
      }
      const label = document.createElement('div')
      label.className = 'replacement-decision-label'
      const role = document.createElement('span')
      role.textContent = decisionRole(outcome, beat.actorId, beat.actions[0]?.actorRole)
      const name = document.createElement('strong')
      name.textContent = ids.map((id) => cast[id]?.name).join(' & ')
      const action = document.createElement('em')
      const power = outcome.powerType ?? outcome.variant
      const round =
        (outcome.safetyUseNumber ?? 0) +
        beats.slice(0, beat.index + 1).filter((b) => b.kind === 'save').length
      action.textContent = outcome.decisionOnly
        ? 'THE CONFESSIONAL AWAITS YOUR DECISION'
        : beat.kind === 'decline'
          ? 'THE NOMINATIONS WILL STAND'
          : beat.kind === 'save'
            ? ['doubleTrouble', 'vip'].includes(power)
              ? `DOUBLE TROUBLE · ${round > 1 ? 'SECOND' : 'FIRST'} USE`
              : ['detox', 'coup'].includes(power)
                ? 'DETOX · THE BLOCK WILL BE RESET'
                : 'A SAFETY DECISION'
            : outcome.initialNomination
              ? `${cast[beat.actorId]?.name} IS MAKING THEIR NOMINATION`
              : 'A PLACE ON THE BLOCK MUST BE FILLED'
      const line = document.createElement('i')
      line.className = 'replacement-decision-line'
      label.append(role, name, action, line)
      shot.append(label)
      root.append(shot)
    }
    const reveals = beat.reveals ?? []
    // A ballot stays in the existing room. Never hide the entire block for a title card.
    for (const [index, reveal] of reveals.entries()) {
      const caption = document.createElement('div')
      caption.className = 'replacement-beat-caption'
      caption.dataset.beatIndex = String(beat.index)
      caption.dataset.revealIndex = String(index)
      const eyebrow = document.createElement('span'),
        text = document.createElement('strong'),
        credit = document.createElement('em')
      const action = reveal.action
      const names =
        beat.kind === 'save' ||
        outcome.pairUnits?.some((pair) =>
          beat.actions.every((a) => pair.memberIds.includes(a.playerId))
        )
          ? beat.actions.map((a) => cast[a.playerId]?.name).join(' & ')
          : cast[action.playerId]?.name
      eyebrow.textContent =
        beat.kind === 'decline'
          ? 'POWER NOT USED'
          : beat.kind === 'save'
            ? 'SAFETY USED'
            : outcome.initialNomination
              ? 'NOMINATION CEREMONY'
              : outcome.variant === 'vox'
                ? 'THE ORIGINAL SECRET BALLOT'
                : 'REPLACEMENT NOMINATION'
      text.textContent =
        beat.kind === 'decline'
          ? 'The nominations stand.'
          : beat.kind === 'save'
            ? `${names} — safe.`
            : `${names} — nominated.`
      credit.textContent =
        outcome.variant === 'vox' && action.kind === 'replacement'
          ? action.ballotRank
            ? `${action.tiedRank ? 'TIED ' : ''}BALLOT RANK #${action.ballotRank} · NEXT ELIGIBLE NOMINEE`
            : 'NEXT ELIGIBLE NOMINEE FROM THE SECRET BALLOT'
          : action.kind === 'replacement' && beat.actorId
            ? `CHOSEN BY ${cast[beat.actorId]?.name}`
            : ''
      caption.append(eyebrow, text, credit)
      root.append(caption)
      if (beat.kind === 'save' || reveals[index + 1]?.at === reveal.at) break
    }
  }
}

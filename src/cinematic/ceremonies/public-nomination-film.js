// Nomination provenance comes from the committed block, never from caption text.
export function publicNominationPlan(scene, game, cast) {
  if (
    scene !== 'nominations' ||
    game.publicModeEnabled !== true ||
    game.doubleEviction?.weekActive === true ||
    game.voxPopuli?.status === 'active'
  )
    return null
  const context = game.nominationContext
  const automatic = context?.autoNomineeId
  const visible = ['a', 'b', 'c'].map((slot) => cast[slot]?.playerId)
  if (!automatic || !visible.includes(automatic) || !game.nomineeIds?.includes(automatic))
    return null
  const choices = [...new Set(context.hohNomineeIds ?? [])].filter(
    (id) => id !== automatic && visible.includes(id) && game.nomineeIds.includes(id)
  )
  if (choices.length !== 2 || new Set(visible).size !== 3) return null
  return { autoNomineeId: automatic, chosenNomineeIds: choices }
}

export const PUBLIC_NOMINATION_DURATION = 9600

export function stagePublicNomination(root, cast, plan) {
  if (!plan || root.classList.contains('paired-film')) return false
  const pods = ['.nom-first', '.nom-second', '.nom-third'].map((selector) =>
    root.querySelector(selector)
  )
  const ids = ['a', 'b', 'c'].map((slot) => cast[slot]?.playerId)
  if (
    pods.some((pod) => !pod) ||
    !ids.includes(plan.autoNomineeId) ||
    plan.chosenNomineeIds.some((id) => !ids.includes(id))
  )
    return false
  root.classList.add('nom-public')
  root.dataset.automaticNomineeId = plan.autoNomineeId
  const camera = document.createElement('div')
  camera.className = 'public-nom-camera'
  for (const child of [...root.children])
    if (!child.classList.contains('nom-decision')) camera.append(child)
  root.prepend(camera)
  for (const [index, pod] of pods.entries()) {
    const automatic = ids[index] === plan.autoNomineeId
    const order = plan.chosenNomineeIds.indexOf(ids[index])
    pod.dataset.playerId = ids[index]
    pod.classList.add(automatic ? 'public-auto' : 'public-choice')
    if (!automatic) pod.dataset.choiceOrder = String(order)
    pod.style.left = automatic ? '34.5%' : order === 0 ? '4%' : '65%'
    pod.style.width = '31%'
    const beam = document.createElement('i')
    beam.className = 'public-nom-beam'
    pod.prepend(beam)
  }
  const caption = root.querySelector('.c-caption')
  caption.querySelector('span').textContent = ''
  caption.querySelector('strong').textContent = 'The block is set.'
  caption.querySelector('em').textContent = ''
  root.querySelector('.nom-warning').textContent = ''
  // The LOH insert uses only their name; the opening podium communicates the
  // automatic nomination without an explanatory card or badge.
  for (const node of root.querySelectorAll(
    '.nom-decision-caption span, .nom-decision-caption em, .nom-decision-progress'
  ))
    node.remove()
  return true
}

export function animatePublicNomination(root, a, duration = PUBLIC_NOMINATION_DURATION) {
  a(root, [
    [0, 0],
    [180, 1],
    [duration, 1],
  ])
  a('.ceremony-backdrop', [
    [0, 0.45],
    [6500, 0.45],
    [7400, 0.62],
    [duration, 0.62],
  ])
  a('.public-nom-camera', [
    [0, 1, 'scale(1.48)'],
    [1400, 1, 'scale(1.42)'],
    [3200, 1, 'scale(1.15)'],
    [3650, 1, 'translateX(17%) scale(1.22)'],
    [4650, 1, 'translateX(17%) scale(1.22)'],
    [5300, 1, 'translateX(-17%) scale(1.22)'],
    [6300, 1, 'translateX(-17%) scale(1.22)'],
    [7400, 1, 'scale(1)'],
    [duration, 1, 'scale(1)'],
  ])
  a('.nom-chasm', [
    [0, 0.3],
    [6500, 0.3],
    [7400, 0.85],
    [duration, 0.85],
  ])
  for (const pod of root.querySelectorAll('.nom-pod')) {
    const automatic = pod.classList.contains('public-auto')
    const enter = 3400 + Number(pod.dataset.choiceOrder ?? 0) * 1700
    a(pod, [
      [0, 1],
      [duration, 1],
    ])
    for (const actor of pod.querySelectorAll('.nom-person'))
      a(
        actor,
        automatic
          ? [
              [0, 0.48],
              [6500, 0.48],
              [7350, 1],
              [duration, 1],
            ]
          : [
              [0, 0],
              [enter, 0],
              [enter + 550, 1],
              [duration, 1],
            ]
      )
    for (const node of pod.querySelectorAll('.nom-platform, .nom-aura, .public-nom-beam'))
      a(
        node,
        automatic
          ? [
              [0, 0.26],
              [6500, 0.26],
              [7350, 0.9],
              [duration, 0.9],
            ]
          : [
              [0, 0.035],
              [enter, 0.035],
              [enter + 650, 0.9],
              [duration, 0.9],
            ]
      )
    const name = pod.querySelector('.nom-label')
    if (name)
      a(
        name,
        automatic
          ? [
              [0, 0.7],
              [1450, 0.7],
              [1700, 0],
              [6600, 0],
              [7350, 1],
              [duration, 1],
            ]
          : [
              [0, 0],
              [enter + 450, 0],
              [enter + 750, 1],
              [duration, 1],
            ]
      )
    const contact = pod.querySelector('.nom-contact')
    if (contact)
      a(
        contact,
        automatic
          ? [
              [0, 0.7],
              [duration, 0.7],
            ]
          : [
              [0, 0],
              [enter, 0],
              [enter + 550, 0.7],
              [duration, 0.7],
            ]
      )
  }
  if (root.querySelector('.nom-decision')) {
    a('.nom-decision', [
      [0, 0],
      [1500, 0],
      [1780, 1],
      [2750, 1],
      [3150, 0],
      [duration, 0],
    ])
    a('.nom-decision-figure', [
      [0, 1, 'scale(1.04)'],
      [1500, 1, 'scale(1.04)'],
      [3100, 1, 'scale(1)'],
      [duration, 1, 'scale(1)'],
    ])
    a('.nom-decision-caption', [
      [0, 0],
      [1850, 0],
      [2100, 1],
      [2700, 1],
      [3100, 0],
      [duration, 0],
    ])
  }
  a('.c-caption', [
    [0, 0],
    [7550, 0],
    [7950, 1],
    [duration, 1],
  ])
}

// Small reusable physical cutouts; only the active shock's resources are prepared.
export function shockMotifKeys(type) {
  if (type === 'cupidArrow' || type === 'cupidBroken') return ['shockHeart']
  if (type === 'diamond') return ['shockHalo']
  if (type === 'vip') return ['cinema_shield']
  if (type === 'twinShock') return ['shockDna']
  if (type === 'democracia') return ['shockBallot']
  if (type === 'coup') return ['shockAntidote']
  if (type === 'spotlight') return ['shockForce', 'cinema_shield']
  return []
}
export function makeShockMotifs(fx, type, images) {
  const group = document.createElement('div')
  group.className = 'shock-fx-motifs'
  const add = (kind, key, x, y, width, index) => {
    const node = document.createElement('div')
    node.className = `shock-motif shock-motif-${kind}`
    node.dataset.kind = kind
    node.dataset.index = index
    Object.assign(node.style, { left: `${x}%`, top: `${y}%`, width: `${width}%` })
    if (key) {
      const img = images[key].cloneNode()
      img.alt = ''
      img.draggable = false
      node.append(img)
    }
    group.append(node)
    return node
  }
  if (type === 'cupidArrow') {
    ;[
      [12, 45, 12],
      [86, 30, 10],
      [78, 88, 7],
      [22, 87, 8],
    ].forEach(([x, y, w], i) => add('heart', 'shockHeart', x, y, w, i))
  } else if (type === 'cupidBroken') {
    add('heart-left', 'shockHeart', 50, 12, 19, 0)
    add('heart-right', 'shockHeart', 50, 12, 19, 1)
  } else if (type === 'diamond') {
    add('halo', 'shockHalo', 22, 16, 29, 0)
    add('halo', 'shockHalo', 78, 85, 24, 1)
  } else if (type === 'vip') {
    add('shield', 'cinema_shield', 12, 40, 11, 0)
    add('shield', 'cinema_shield', 88, 40, 11, 1)
  } else if (type === 'twinShock') {
    add('dna', 'shockDna', 12, 48, 20, 0)
    add('dna', 'shockDna', 88, 53, 18, 1)
  } else if (type === 'democracia') {
    const box = add('ballot', 'shockBallot', 50, 10, 27, 0)
    const paper = document.createElement('div')
    paper.className = 'shock-election-ballot'
    paper.innerHTML =
      '<svg viewBox="0 0 30 40" aria-hidden="true"><path d="M7 12h16M7 17h12M8 27l5 5 10-12" fill="none" stroke="#8a6938" stroke-width="1.4"/></svg>'
    box.prepend(paper)
  } else if (type === 'coup') {
    const vial = add('antidote', 'shockAntidote', 50, 11, 18, 0)
    const aura = document.createElement('div')
    aura.className = 'shock-detox-aura'
    vial.prepend(aura)
  } else if (type === 'spotlight') {
    add('pressure', 'shockForce', 50, 10, 49, 0)
    const shield = add('forced-shield', 'cinema_shield', 50, 10, 16, 1)
    const pulse = document.createElement('div')
    pulse.className = 'shock-force-release'
    shield.prepend(pulse)
  }
  if (group.children.length) fx.append(group)
}
export function animateShockMotifs(root, type, animate, d) {
  if (!root.querySelector('.shock-fx-motifs')) return
  animate('.shock-fx-motifs', [
    [0, 0],
    [3900, 0],
    [4250, 1],
    [d, 1],
  ])
  if (type === 'democracia') {
    animate('.shock-election-ballot', [
      [0, 0],
      [4300, 0, 'translate(-50%,-100%) rotate(-9deg)'],
      [4700, 1, 'translate(-50%,-65%) rotate(-5deg)'],
      [5550, 1, 'translate(-50%,70%) rotate(-2deg)'],
      [5900, 0, 'translate(-50%,100%) rotate(0)'],
      [d, 0],
    ])
  }
  if (type === 'coup')
    animate('.shock-detox-aura', [
      [0, 0],
      [4700, 0, 'scale(.5)'],
      [5300, 0.75, 'scale(1)'],
      [6400, 0.24, 'scale(1.7)'],
      [d, 0, 'scale(2)'],
    ])
  if (type === 'spotlight')
    animate('.shock-force-release', [
      [0, 0],
      [5150, 0, 'scale(.4)'],
      [5400, 0.75, 'scale(1)'],
      [5850, 0, 'scale(2.2)'],
      [d, 0],
    ])
  for (const node of root.querySelectorAll('.shock-motif')) {
    const i = Number(node.dataset.index),
      kind = node.dataset.kind,
      side = i % 2 ? 1 : -1
    if (kind === 'pressure') {
      animate(node, [
        [0, 0],
        [4000, 0, 'translate(-50%,-50%) scale(1.22) rotate(-9deg)'],
        [4800, 0.6, 'translate(-50%,-50%) scale(.88) rotate(-3deg)'],
        [5200, 0.7, 'translate(-50%,-50%) scale(.76) rotate(0)'],
        [5900, 0.3, 'translate(-50%,-50%) scale(1.28) rotate(8deg)'],
        [7000, 0.08, 'translate(-50%,-50%) scale(1.55) rotate(14deg)'],
        [d, 0, 'translate(-50%,-50%) scale(1.7) rotate(17deg)'],
      ])
      continue
    }
    const t = 4000 + (kind === 'heart' ? i * 190 : 0)
    const base = 'translate(-50%,-50%) '
    let enter, peak, leave
    if (kind === 'heart') {
      enter = `translate(${side * 10}%,22%) rotate(${side * 18}deg) scale(.8)`
      peak = `translate(0,0) rotate(${side * 8}deg) scale(1)`
      leave = `translate(${side * 24}%,-65%) rotate(${side * -8}deg) scale(1.04)`
    } else if (kind.startsWith('heart-')) {
      const sign = kind === 'heart-left' ? -1 : 1
      enter = 'translate(0,12%) scale(.9)'
      peak = 'translate(0,0) scale(1)'
      leave = `translate(${sign * 58}%,23%) rotate(${sign * 22}deg) scale(.94)`
    } else if (kind === 'halo') {
      enter = `translate(0,14%) rotate(${side * 8}deg) scale(.88)`
      peak = `translate(${side * -25}%,0) rotate(${side * 3}deg) scale(1)`
      leave = `translate(${side * -175}%,-7%) rotate(${side * -8}deg) scale(${i ? 1.08 : 0.92})`
    } else if (kind === 'dna') {
      enter = `translate(0,16%) rotate(${side * 9}deg) scale(.88)`
      peak = `translate(0,0) rotate(${side * 3}deg) scale(1)`
      leave = `translate(${side * 5}%,-9%) rotate(${side * -4}deg) scale(1.03)`
    } else if (kind === 'ballot') {
      enter = 'translateY(8%) scale(.94)'
      peak = 'translateY(0) scale(1)'
      leave = 'translateY(0) scale(1.02)'
    } else if (kind === 'antidote') {
      enter = 'translateY(13%) rotate(-7deg) scale(.86)'
      peak = 'translateY(0) rotate(-2deg) scale(1)'
      leave = 'translateY(-5%) rotate(3deg) scale(1.02)'
    } else if (kind === 'forced-shield') {
      enter = 'translateY(-28%) rotate(-10deg) scale(.8)'
      peak = 'translateY(0) rotate(0) scale(1.05)'
      leave = 'translateY(1%) rotate(0) scale(1)'
    } else {
      enter = `translate(0,15%) rotate(${side * 8}deg) scale(.85)`
      peak = `translate(0,0) rotate(${side * 3}deg) scale(1)`
      leave = `translate(${side * 12}%,-16%) rotate(${side * -3}deg) scale(1.03)`
    }
    const broken = kind.startsWith('heart-')
    animate(node, [
      [0, 0],
      [t, 0, base + enter],
      [t + 750, 0.82, base + peak, 'cubic-bezier(.4,0,.2,1)'],
      [broken ? 6800 : 7600, broken ? 0 : 0.44, base + leave],
      [d, 0, base + leave],
    ])
  }
}

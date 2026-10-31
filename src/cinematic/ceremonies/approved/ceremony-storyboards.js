import { CINEMA_IDS, makeCinemaScene, animateCinemaScene } from './cinema-scenes.js'
const art = (key, cls) => '<span data-art="' + key + '" class="' + cls + '"></span>'
const caption = (kicker, title, sub, extra = '') =>
  '<div class="c-caption ' +
  extra +
  '"><span>' +
  kicker +
  '</span><strong>' +
  title +
  '</strong><em>' +
  sub +
  '</em></div>'
const pod = (key, number, cls) =>
  '<div class="nom-pod ' +
  cls +
  '"><div class="nom-aura"></div>' +
  art(key, 'nom-person') +
  art('platform', 'nom-platform') +
  '<div class="nom-label"><span>0' +
  number +
  '</span>NOMINATED</div></div>'

export function makeScene(id, images, shockVariant, cast = 0) {
  if (CINEMA_IDS.includes(id)) return makeCinemaScene(id, images, shockVariant, cast)
  const root = document.createElement('div')
  root.className = 'c-scene c-' + id
  root.setAttribute('aria-hidden', 'true')
  if (id === 'safety')
    root.innerHTML =
      '<div class="c-halo safety-halo"></div><div class="safety-arch"></div><div class="c-ground"></div>' +
      art('male', 'safety-ordinary c-hero') +
      art('knight', 'safety-knight c-hero') +
      art('shield', 'safety-flying-shield') +
      '<div class="c-wash"></div>' +
      caption('THE POWER OF SAFETY', 'Knight of Safety', 'THE SHIELD IS YOURS.')
  if (id === 'nominations')
    root.innerHTML =
      '<div class="nom-chasm"></div><div class="nom-warning">THE NOMINATION CEREMONY</div>' +
      pod('male', 1, 'nom-first') +
      pod('female', 2, 'nom-second') +
      caption('ON THE EDGE', 'Two names. One block.', 'THEIR FUTURE HANGS IN THE BALANCE.')
  if (id === 'save')
    root.innerHTML =
      '<div class="c-halo save-danger-halo"></div><div class="c-halo save-safe-halo"></div><div class="c-ground save-ground"></div>' +
      art('shield', 'save-shield') +
      art('platform', 'save-platform') +
      art('female', 'save-person c-hero') +
      '<div class="save-bracket save-bracket-left"></div><div class="save-bracket save-bracket-right"></div><div class="c-wash"></div>' +
      caption('ON THE BLOCK', 'One chance to stay.', 'NOMINATED', 'save-danger-caption') +
      caption(
        'SAVED BY THE POWER OF SAFETY',
        'Off the block.',
        'YOUR STORY ISN’T OVER.',
        'save-safe-caption'
      )
  if (id === 'exit')
    root.innerHTML =
      '<div class="exit-room-light"></div><div class="exit-door-set"><div class="exit-void"></div></div><div class="exit-far-wrap">' +
      art('departing', 'exit-traveler exit-far') +
      '</div><div class="exit-door-set exit-door-front"><div class="exit-leaf"><span class="exit-leaf-emblem">◉</span><i class="exit-handle"></i></div>' +
      art('door', 'exit-frame') +
      '</div>' +
      art('departing', 'exit-traveler exit-near') +
      '<div class="exit-sign">HUB EXIT</div>' +
      caption('THE END OF THIS CHAPTER', 'One last goodbye.', 'YOU LEFT YOUR MARK ON THE HUB.') +
      '<div class="exit-blackout"></div>'
  if (id === 'tiebreak')
    root.innerHTML =
      '<div class="tie-halo"></div><div class="tie-vote-line"></div>' +
      art('scales', 'tie-scales') +
      '<div class="tie-candidate tie-left">' +
      art('male', 'tie-person') +
      '<span>THE NOMINEES</span><strong>01</strong></div><div class="tie-candidate tie-right">' +
      art('female', 'tie-person') +
      '<span>THE NOMINEES</span><strong>02</strong></div><div class="tie-token">LOH<br>VOTE</div>' +
      caption('THE DECIDING VOTE', 'The tie is broken.', 'THE LOH MAKES THE CALL.')
  if (id === 'ambush')
    root.innerHTML =
      '<div class="ambush-curtains">' +
      art('curtain', 'ambush-curtain ambush-curtain-left') +
      art('curtain', 'ambush-curtain ambush-curtain-right') +
      '</div><div class="ambush-beam"></div><div class="ambush-side-nominees">' +
      art('male', 'ambush-small') +
      art('female', 'ambush-small') +
      '<span>THE BLOCK</span></div>' +
      art('platform', 'ambush-platform') +
      art('finalist', 'ambush-target') +
      '<div class="ambush-stamp">AMBUSH<br><b>NOMINATED</b></div>' +
      caption('THE BLOCK JUST CHANGED', 'A new nominee.', 'THE AMBUSH IS REVEALED.')
  if (id === 'allPower')
    root.innerHTML =
      '<div class="power-aura"></div>' +
      art('eyeSeal', 'power-eye') +
      art('seatedKing', 'power-king') +
      art('shield', 'power-shield') +
      '<div class="power-label"><span>LEADER OF THE HUB</span><b>+</b><span>POWER OF SAFETY</span></div>' +
      caption('ONE PLAYER HOLDS IT ALL', 'The sovereign.', 'ALL THE POWER.')
  if (id === 'shock')
    root.innerHTML =
      '<div class="shock-curtains">' +
      art('curtain', 'shock-curtain shock-curtain-left') +
      art('curtain', 'shock-curtain shock-curtain-right') +
      '</div><div class="shock-rays"></div>' +
      art('eyeSeal', 'shock-eye') +
      '<div class="shock-card"><span>THE BIG EYE INTERRUPTS</span><strong class="shock-title"></strong><em class="shock-copy"></em></div>' +
      caption('A TWIST CHANGES EVERYTHING', 'Shock announcement', 'THE HUB WILL NEVER BE THE SAME.')
  if (id === 'final4')
    root.innerHTML =
      '<div class="f4-arch"></div><div class="f4-eligible">THREE ELIGIBLE PLAYERS · LOH ALREADY SAFE</div><div class="f4-row"><div class="f4-player f4-one">' +
      art('male', 'f4-person') +
      '<span>01</span></div><div class="f4-player f4-two">' +
      art('female', 'f4-person') +
      '<span>02</span></div><div class="f4-player f4-three">' +
      art('finalist', 'f4-person') +
      '<span>03</span></div></div><div class="f4-ballot">THE<br>SOLE<br>VOTE</div>' +
      caption(
        'FINAL FOUR · SOLE VOTE',
        'One journey ends.',
        'THREE ELIGIBLE PLAYERS. THE LOH IS SAFE.'
      )
  if (id === 'final3')
    root.innerHTML =
      '<div class="f3-arch"></div><div class="f3-title">THE FINAL THREE</div><div class="f3-player f3-loh">' +
      art('male', 'f3-person') +
      art('crown', 'f3-crown') +
      '<span>LOH</span></div><div class="f3-player f3-left">' +
      art('female', 'f3-person') +
      '<span>FINALIST</span></div><div class="f3-player f3-right">' +
      art('finalist', 'f3-person') +
      '<span>FINALIST</span></div><div class="f3-decree">THE LOH’S<br>DECISION</div>' +
      art('door', 'f3-door') +
      caption('THE FINAL TWO', 'The final invitation.', 'THE LOH CHOSE WHO FINISHED THIRD.') +
      '<div class="f3-blackout"></div>'
  if (['safety', 'nominations', 'save'].includes(id))
    root.insertAdjacentHTML(
      'afterbegin',
      art(id === 'nominations' ? 'cinema_danger' : 'cinema_sanctuary', 'ceremony-backdrop') +
        '<div class="ceremony-backdrop-shade"></div>'
    )
  for (const placeholder of root.querySelectorAll('[data-art]')) {
    const image = images[placeholder.dataset.art].cloneNode()
    image.className = placeholder.className
    image.alt = ''
    image.draggable = false
    placeholder.replaceWith(image)
  }
  if (id === 'shock' && shockVariant) {
    root.dataset.shock = shockVariant.tone
    root.querySelector('.shock-title').textContent = shockVariant.title
    root.querySelector('.shock-copy').textContent = shockVariant.copy
  }
  return root
}

export function animateScene(id, root, a, shockVariant) {
  if (CINEMA_IDS.includes(id)) return animateCinemaScene(id, root, a)
  if (['safety', 'nominations', 'save'].includes(id))
    a('.ceremony-backdrop', [
      [0, 0.45, 'translateY(1%) scale(1.07)'],
      [id === 'safety' ? 4200 : id === 'save' ? 4500 : 4800, 0.6, 'translateY(-1%) scale(1.015)'],
    ])
  if (id === 'safety') {
    a(root, [
      [0, 0],
      [240, 1],
      [3860, 1],
      [4200, 0],
    ])
    a('.c-halo', [
      [0, 0, 'scale(.8)'],
      [600, 0.85, 'scale(1)'],
      [2500, 1, 'scale(1.1)'],
      [4200, 0.75, 'scale(1.15)'],
    ])
    a('.safety-arch', [
      [0, 0],
      [600, 0.65],
      [4200, 0.65],
    ])
    a('.c-ground', [
      [0, 0],
      [600, 1],
      [4200, 1],
    ])
    a('.safety-ordinary', [
      [0, 0, 'translateY(18px) scale(.96)'],
      [550, 1, 'translateY(0) scale(1)'],
      [1550, 1, 'translateY(0) scale(1)', 'steps(1,end)'],
      [1680, 0, 'translateY(0) scale(1)'],
      [4200, 0],
    ])
    a('.safety-flying-shield', [
      [0, 0, 'translateX(-150px) translateY(30px) rotate(-18deg) scale(.6)'],
      [700, 0, 'translateX(-150px) translateY(30px) rotate(-18deg) scale(.6)'],
      [1120, 1, 'translateX(4px) translateY(-3px) rotate(3deg) scale(1.04)'],
      [1350, 1, 'translateX(0) translateY(0) rotate(0) scale(1)', 'steps(1,end)'],
      [1680, 0, 'translateX(0) translateY(0) rotate(0) scale(1)'],
      [4200, 0],
    ])
    a('.c-wash', [
      [0, 0],
      [1530, 0],
      [1630, 1],
      [1740, 1],
      [1960, 0],
      [4200, 0],
    ])
    a('.safety-knight', [
      [0, 0, 'translateY(0) scale(1.025)', 'steps(1,end)'],
      [1680, 1, 'translateY(0) scale(1.025)'],
      [2160, 1, 'translateY(0) scale(1)'],
      [3860, 1, 'translateY(0) scale(1.018)'],
      [4200, 1, 'translateY(0) scale(1.018)'],
    ])
    a('.c-caption', [
      [0, 0, 'translateY(10px)'],
      [1880, 0, 'translateY(10px)'],
      [2280, 1, 'translateY(0)'],
      [4200, 1, 'translateY(0)'],
    ])
  }
  if (id === 'nominations') {
    a(root, [
      [0, 0],
      [250, 1],
      [4430, 1],
      [4800, 0],
    ])
    a('.nom-chasm', [
      [0, 0],
      [600, 0.9],
      [4800, 1],
    ])
    a('.nom-warning', [
      [0, 0],
      [350, 1],
      [4800, 1],
    ])
    a('.nom-first', [
      [0, 0, 'translateX(65px) translateY(20px) scale(1.12)'],
      [350, 0, 'translateX(65px) translateY(20px) scale(1.12)'],
      [900, 1, 'translateX(65px) translateY(0) scale(1.12)'],
      [1350, 1, 'translateX(65px) translateY(0) scale(1.12)'],
      [2050, 1, 'translateX(0) translateY(0) scale(1)'],
      [4800, 1, 'translateX(0) translateY(0) scale(1)'],
    ])
    a('.nom-second', [
      [0, 0, 'translateX(34px) translateY(18px) scale(.96)'],
      [1600, 0, 'translateX(34px) translateY(18px) scale(.96)'],
      [2280, 1, 'translateX(0) translateY(0) scale(1)'],
      [4800, 1, 'translateX(0) translateY(0) scale(1)'],
    ])
    a('.nom-first .nom-aura', [
      [0, 0],
      [650, 0.9],
      [1150, 0.4],
      [2050, 0.7],
      [4800, 0.5],
    ])
    a('.nom-second .nom-aura', [
      [0, 0],
      [1750, 0],
      [2250, 0.9],
      [2850, 0.45],
      [4800, 0.5],
    ])
    a('.c-caption', [
      [0, 0, 'translateY(12px)'],
      [2450, 0, 'translateY(12px)'],
      [2900, 1, 'translateY(0)'],
      [4800, 1, 'translateY(0)'],
    ])
  }
  if (id === 'save') {
    a(root, [
      [0, 0],
      [240, 1],
      [4140, 1],
      [4500, 0],
    ])
    a('.save-danger-halo', [
      [0, 0],
      [550, 0.85],
      [1510, 0.85],
      [1900, 0],
      [4500, 0],
    ])
    a('.save-safe-halo', [
      [0, 0],
      [1670, 0],
      [2150, 1],
      [4500, 0.85],
    ])
    a('.save-ground', [
      [0, 0],
      [1780, 0],
      [2200, 1],
      [4500, 1],
    ])
    a('.save-person', [
      [0, 0, 'translateY(10px) scale(.98)'],
      [450, 1, 'translateY(0) scale(1)'],
      [1550, 1, 'translateY(0) scale(1)'],
      [2050, 1, 'translateY(-12px) scale(1.015)'],
      [2550, 1, 'translateY(-8px) scale(1)'],
      [4500, 1, 'translateY(-8px) scale(1.012)'],
    ])
    a('.save-platform', [
      [0, 0],
      [450, 1],
      [1570, 1, 'translateY(0)'],
      [2040, 0, 'translateY(65px)'],
      [4500, 0, 'translateY(65px)'],
    ])
    a('.save-shield', [
      [0, 0, 'translateX(-150px) translateY(20px) rotate(-15deg) scale(.3)'],
      [1000, 0, 'translateX(-150px) translateY(20px) rotate(-15deg) scale(.3)'],
      [1590, 1, 'translateX(0) translateY(0) rotate(0) scale(1.06)'],
      [2030, 0.9, 'translateX(0) translateY(0) rotate(0) scale(1)'],
      [4500, 0.9, 'translateX(0) translateY(0) rotate(0) scale(1)'],
    ])
    for (const [selector, direction] of [
      ['.save-bracket-left', -1],
      ['.save-bracket-right', 1],
    ])
      a(selector, [
        [0, 0],
        [450, 0.9],
        [1570, 0.9, 'translateX(0) rotate(0)'],
        [2020, 0, 'translateX(' + direction * 65 + 'px) rotate(' + direction * 14 + 'deg)'],
        [4500, 0],
      ])
    a('.c-wash', [
      [0, 0],
      [1530, 0],
      [1640, 0.95],
      [1740, 0.95],
      [1940, 0],
      [4500, 0],
    ])
    a('.save-danger-caption', [
      [0, 0],
      [600, 1],
      [1560, 1],
      [1700, 0],
      [4500, 0],
    ])
    a('.save-safe-caption', [
      [0, 0, 'translateY(10px)'],
      [1950, 0, 'translateY(10px)'],
      [2350, 1, 'translateY(0)'],
      [4500, 1, 'translateY(0)'],
    ])
  }
  if (id === 'exit') {
    a(root, [
      [0, 0],
      [300, 1],
      [5000, 1],
    ])
    a('.exit-room-light', [
      [0, 0],
      [600, 0.7],
      [3300, 0.7],
      [4100, 0.15],
      [5000, 0],
    ])
    a('.exit-door-front', [
      [0, 0],
      [450, 1],
      [5000, 1],
    ])
    a('.exit-near', [
      [0, 0, 'translateX(-45px) translateY(20px) scale(1.02)'],
      [350, 1, 'translateX(-40px) translateY(16px) scale(1)'],
      [950, 1, 'translateX(-18px) translateY(8px) scale(.85)'],
      [2050, 1, 'translateX(20px) translateY(0) scale(.54)', 'steps(1,end)'],
      [2100, 0, 'translateX(20px) translateY(0) scale(.54)'],
      [5000, 0],
    ])
    a('.exit-far', [
      [0, 0, 'translateX(20px) translateY(0) scale(.54)', 'steps(1,end)'],
      [2100, 1, 'translateX(20px) translateY(0) scale(.54)'],
      [2780, 1, 'translateX(22px) translateY(-38px) scale(.36)'],
      [3260, 0, 'translateX(22px) translateY(-60px) scale(.25)'],
      [5000, 0],
    ])
    a('.exit-leaf', [
      [0, 1, 'rotateY(-88deg)'],
      [3210, 1, 'rotateY(-88deg)'],
      [3850, 1, 'rotateY(1deg)'],
      [4000, 1, 'rotateY(0deg)'],
      [5000, 1, 'rotateY(0deg)'],
    ])
    a('.exit-sign', [
      [0, 0],
      [500, 1],
      [3800, 1],
      [4250, 0],
      [5000, 0],
    ])
    a('.c-caption', [
      [0, 0, 'translateY(8px)'],
      [750, 1, 'translateY(0)'],
      [3480, 1, 'translateY(0)'],
      [3990, 0, 'translateY(0)'],
      [5000, 0],
    ])
    a('.exit-blackout', [
      [0, 0],
      [3980, 0],
      [4650, 1],
      [5000, 1],
    ])
  }
  if (id === 'tiebreak') {
    a(root, [
      [0, 0],
      [250, 1],
      [3850, 1],
      [4200, 0],
    ])
    a('.tie-halo', [
      [0, 0],
      [600, 0.8],
      [4200, 0.35],
    ])
    a('.tie-scales', [
      [0, 0, 'translateY(-35px) scale(.9)'],
      [850, 1, 'translateY(0) scale(1)'],
      [2050, 1, 'rotate(0deg)'],
      [2800, 1, 'rotate(8deg)'],
      [4200, 1, 'rotate(8deg)'],
    ])
    a('.tie-candidate', [
      [0, 0, 'translateY(24px) scale(.96)'],
      [700, 1, 'translateY(0) scale(1)'],
      [4200, 1, 'translateY(0) scale(1)'],
    ])
    a('.tie-token', [
      [0, 0, 'translateY(-75px) scale(.7) rotate(-12deg)'],
      [1450, 0, 'translateY(-75px) scale(.7) rotate(-12deg)'],
      [1930, 1, 'translateY(5px) scale(1.12) rotate(0)'],
      [2180, 1, 'translateY(0) scale(1) rotate(0)'],
      [4200, 1, 'translateY(0) scale(1) rotate(0)'],
    ])
    a('.c-caption', [
      [0, 0, 'translateY(10px)'],
      [2550, 0, 'translateY(10px)'],
      [2900, 1, 'translateY(0)'],
      [4200, 1, 'translateY(0)'],
    ])
  }
  if (id === 'ambush') {
    a(root, [
      [0, 0],
      [280, 1],
      [3950, 1],
      [4300, 0],
    ])
    a('.ambush-side-nominees', [
      [0, 0],
      [650, 0.85],
      [4300, 0.45],
    ])
    a('.ambush-curtain-left', [
      [0, 1, 'translateX(0)'],
      [1650, 1, 'translateX(0)'],
      [2350, 1, 'translateX(-115px)'],
      [4300, 1, 'translateX(-115px)'],
    ])
    a('.ambush-curtain-right', [
      [0, 1, 'translateX(0)'],
      [1650, 1, 'translateX(0)'],
      [2350, 1, 'translateX(115px)'],
      [4300, 1, 'translateX(115px)'],
    ])
    a('.ambush-beam', [
      [0, 0, 'scaleY(.3)'],
      [1750, 0, 'scaleY(.3)'],
      [2450, 0.85, 'scaleY(1)'],
      [4300, 0.65, 'scaleY(1)'],
    ])
    a('.ambush-platform', [
      [0, 0, 'translateY(70px) scale(.8)'],
      [2200, 0, 'translateY(70px) scale(.8)'],
      [2580, 1, 'translateY(0) scale(1)'],
      [4300, 1, 'translateY(0) scale(1)'],
    ])
    a('.ambush-target', [
      [0, 0, 'translateY(35px) scale(.92)'],
      [2380, 0, 'translateY(35px) scale(.92)'],
      [2780, 1, 'translateY(0) scale(1)'],
      [4300, 1, 'translateY(0) scale(1)'],
    ])
    a('.ambush-stamp', [
      [0, 0, 'scale(1.35) rotate(-9deg)'],
      [2780, 0, 'scale(1.35) rotate(-9deg)'],
      [3200, 1, 'scale(1) rotate(-4deg)'],
      [4300, 1, 'scale(1) rotate(-4deg)'],
    ])
    a('.c-caption', [
      [0, 0],
      [3100, 0],
      [3500, 1],
      [4300, 1],
    ])
  }
  if (id === 'allPower') {
    a(root, [
      [0, 0],
      [260, 1],
      [3850, 1],
      [4200, 0],
    ])
    a('.power-aura', [
      [0, 0, 'scale(.75)'],
      [750, 0.8, 'scale(1)'],
      [2500, 1, 'scale(1.1)'],
      [4200, 0.5, 'scale(1.15)'],
    ])
    a('.power-eye', [
      [0, 0, 'scale(.65) rotate(-18deg)'],
      [500, 0, 'scale(.65) rotate(-18deg)'],
      [1230, 0.75, 'scale(1) rotate(0)'],
      [4200, 0.65, 'scale(1) rotate(0)'],
    ])
    a('.power-king', [
      [0, 0, 'translateY(40px) scale(.97)'],
      [900, 1, 'translateY(0) scale(1)'],
      [3300, 1, 'translateY(-4px) scale(1.015)'],
      [4200, 1, 'translateY(-4px) scale(1.015)'],
    ])
    a('.power-shield', [
      [0, 0, 'translateX(145px) rotate(16deg) scale(.7)'],
      [1300, 0, 'translateX(145px) rotate(16deg) scale(.7)'],
      [1950, 1, 'translateX(0) rotate(0) scale(1.05)'],
      [2250, 1, 'translateX(0) rotate(0) scale(1)'],
      [4200, 1, 'translateX(0) rotate(0) scale(1)'],
    ])
    a('.power-label', [
      [0, 0, 'translateY(12px)'],
      [2100, 0, 'translateY(12px)'],
      [2500, 1, 'translateY(0)'],
      [4200, 1, 'translateY(0)'],
    ])
    a('.c-caption', [
      [0, 0],
      [2800, 0],
      [3200, 1],
      [4200, 1],
    ])
  }
  if (id === 'shock') {
    a(root, [
      [0, 0],
      [120, 1],
      [3150, 1],
      [3400, 0],
    ])
    a('.shock-curtain-left', [
      [0, 1, 'translateX(0)'],
      [740, 1, 'translateX(0)'],
      [1190, 1, 'translateX(-115px)'],
      [3400, 1, 'translateX(-115px)'],
    ])
    a('.shock-curtain-right', [
      [0, 1, 'translateX(0)'],
      [740, 1, 'translateX(0)'],
      [1190, 1, 'translateX(115px)'],
      [3400, 1, 'translateX(115px)'],
    ])
    a('.shock-rays', [
      [0, 0, 'scale(.65)'],
      [950, 0.25, 'scale(.75)'],
      [1450, 0.85, 'scale(1)'],
      [3400, 0.3, 'scale(1.08)'],
    ])
    a('.shock-eye', [
      [0, 0, 'scale(.62) rotate(-8deg)'],
      [1050, 0, 'scale(.62) rotate(-8deg)'],
      [1500, 1, 'scale(1.04) rotate(0)'],
      [3400, 0.9, 'scale(1) rotate(0)'],
    ])
    a('.shock-card', [
      [0, 0, 'translateY(22px) scale(.96)'],
      [1500, 0, 'translateY(22px) scale(.96)'],
      [1900, 1, 'translateY(0) scale(1)'],
      [3400, 1, 'translateY(0) scale(1)'],
    ])
    a('.c-caption', [
      [0, 0],
      [2350, 0],
      [2750, 1],
      [3400, 1],
    ])
  }
  if (id === 'final4') {
    a(root, [
      [0, 0],
      [250, 1],
      [4050, 1],
      [4400, 0],
    ])
    a('.f4-arch', [
      [0, 0, 'scale(.85)'],
      [600, 0.7, 'scale(1)'],
      [4400, 0.7, 'scale(1)'],
    ])
    a('.f4-player', [
      [0, 0, 'translateY(30px) scale(.94)'],
      [750, 1, 'translateY(0) scale(1)'],
      [4400, 1, 'translateY(0) scale(1)'],
    ])
    a('.f4-ballot', [
      [0, 0, 'translateY(-80px) rotate(-12deg) scale(.7)'],
      [1450, 0, 'translateY(-80px) rotate(-12deg) scale(.7)'],
      [1950, 1, 'translateY(2px) rotate(0) scale(1.08)'],
      [2180, 1, 'translateY(0) rotate(0) scale(1)'],
      [4400, 1, 'translateY(0) rotate(0) scale(1)'],
    ])
    a('.f4-three', [
      [0, 1, 'scale(1)'],
      [2350, 1, 'scale(1)'],
      [2850, 0.22, 'scale(.9)'],
      [4400, 0.22, 'scale(.9)'],
    ])
    a('.c-caption', [
      [0, 0],
      [3100, 0],
      [3500, 1],
      [4400, 1],
    ])
  }
  if (id === 'final3') {
    a(root, [
      [0, 0],
      [250, 1],
      [4700, 1],
      [5000, 0],
    ])
    a('.f3-arch', [
      [0, 0, 'scale(.9)'],
      [650, 0.75, 'scale(1)'],
      [5000, 0.75, 'scale(1)'],
    ])
    a('.f3-player', [
      [0, 0, 'translateY(24px) scale(.96)'],
      [750, 1, 'translateY(0) scale(1)'],
      [5000, 1, 'translateY(0) scale(1)'],
    ])
    a('.f3-crown', [
      [0, 0, 'translateY(-22px) scale(.8)'],
      [850, 0, 'translateY(-22px) scale(.8)'],
      [1250, 1, 'translateY(0) scale(1)'],
      [5000, 1, 'translateY(0) scale(1)'],
    ])
    a('.f3-decree', [
      [0, 0, 'scale(.8) rotate(8deg)'],
      [1900, 0, 'scale(.8) rotate(8deg)'],
      [2420, 1, 'scale(1) rotate(0)'],
      [5000, 1, 'scale(1) rotate(0)'],
    ])
    a('.f3-right', [
      [0, 1, 'translateX(0) scale(1)'],
      [2720, 1, 'translateX(0) scale(1)'],
      [3300, 0, 'translateX(110px) scale(.8)'],
      [5000, 0, 'translateX(110px) scale(.8)'],
    ])
    a('.f3-door', [
      [0, 0, 'translateX(65px) scale(.85)'],
      [2900, 0, 'translateX(65px) scale(.85)'],
      [3450, 1, 'translateX(0) scale(1)'],
      [5000, 1, 'translateX(0) scale(1)'],
    ])
    a('.c-caption', [
      [0, 0],
      [3650, 0],
      [4050, 1],
      [5000, 1],
    ])
    a('.f3-blackout', [
      [0, 0],
      [3150, 0],
      [3700, 0.94],
      [3900, 0.55],
      [5000, 0.55],
    ])
  }
}

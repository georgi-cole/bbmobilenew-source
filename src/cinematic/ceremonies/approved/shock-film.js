// A single continuous chamber shot; the existing Eye artwork supplies the iris.
export const SHOCK_FILM_CONFIG = {
  duration: 8400,
  art: ['cinema_shockRoom', 'cinema_city'],
  description:
    'The Eye crashes into the normal city view with one purple-gold impact and a brief camera recoil. The Hub falls dark, the iris turns, and a smooth pullback becomes the actual Shock announcement. Shared across all shock types.',
  beats: [
    ['00.0', 'A normal moment in the Hub'],
    ['00.2', 'The Eye forces its way in'],
    ['00.6', 'The lights die; the Hub is interrupted'],
    ['01.3', 'The iris turns and the Eye takes control'],
    ['03.5', 'The actual Shock is revealed'],
  ],
  moments: [100, 350, 1150, 2250, 3800, 5600],
}
const art = (images, key, cls, layer) => {
  const img = images[key].cloneNode()
  img.className = cls + ' cine-layer'
  img.dataset.layer = layer
  img.alt = ''
  img.draggable = false
  return img
}
export function makeShockFilm(images, variant) {
  const root = document.createElement('div')
  root.className = 'c-scene cinema-v2 cinema-v3 shock-film film-shock'
  root.dataset.shock = variant.tone
  root.dataset.motif = variant.motif
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML =
    '<div class="shock-chamber"><div class="shock-lens"><div class="shock-city-window"></div><div class="shock-room-plane"></div><div class="shock-iris"></div><div class="shock-chamber-shadow cine-layer" data-layer="light"></div><div class="shock-eye-light cine-layer" data-layer="light"></div><div class="shock-breath cine-layer" data-layer="light"></div></div></div><div class="shock-blackout cine-layer" data-layer="light"></div><div class="shock-hush cine-layer" data-layer="titles">THE HUB FALLS SILENT</div><div class="shock-presence cine-layer" data-layer="titles">THE EYE HAS TAKEN CONTROL.</div><div class="cine-titles cine-layer" data-layer="titles"><span>THE BIG EYE · SHOCK ANNOUNCEMENT</span><h3 class="shock-title"></h3><i class="shock-rule"></i><p class="shock-copy"></p></div><div class="shock-edge-shade"></div><div class="cine-letterbox letterbox-top"></div><div class="cine-letterbox letterbox-bottom"></div><div class="cine-sequence">THE BIG EYE <i></i> CEREMONY FILM</div>'
  const feed = document.createElement('div')
  feed.className = 'shock-interrupted-feed cine-layer'
  feed.dataset.layer = 'set'
  feed.append(art(images, 'cinema_city', 'shock-feed-city', 'set'))
  root.prepend(feed)
  const clash = document.createElement('div')
  clash.className = 'shock-clash-light cine-layer'
  clash.dataset.layer = 'light'
  root.append(clash)
  root.querySelector('.shock-city-window').append(art(images, 'cinema_city', 'shock-city', 'set'))
  root
    .querySelector('.shock-room-plane')
    .append(art(images, 'cinema_shockRoom', 'shock-wall eye-window-room', 'set'))
  root
    .querySelector('.shock-iris')
    .append(art(images, 'cinema_shockRoom', 'shock-iris-texture', 'set'))
  root.querySelector('.shock-title').textContent = variant.title
  root.querySelector('.shock-copy').textContent = variant.copy
  return root
}
export function animateShockFilm(root, a) {
  const d = SHOCK_FILM_CONFIG.duration,
    soft = 'cubic-bezier(.4,0,.2,1)',
    settle = 'cubic-bezier(.16,1,.3,1)'
  const hold = (sel, frames) =>
    a(sel, frames.at(-1)[0] === d ? frames : [...frames, [d, frames.at(-1)[1], frames.at(-1)[2]]])
  a(root, [
    [0, 1],
    [d - 320, 1],
    [d, 0],
  ])
  // The brief loss of light and the continuous pullback share one axis and one timing.
  hold('.shock-interrupted-feed', [
    [0, 1],
    [219, 1, undefined, 'steps(1,end)'],
    [220, 0],
  ])
  hold('.shock-chamber', [
    [0, 0, 'translateY(2%) scale(2.92)', 'steps(1,end)'],
    [220, 1, 'translateY(2%) scale(2.92)', settle],
    [580, 1, 'translateY(2%) scale(2.6)', soft],
    [1400, 1, 'translateY(1%) scale(2.56)', soft],
    [3300, 1, 'translateY(0) scale(1.04)'],
    [d, 1, 'translateY(-.4%) scale(1.075)'],
  ])
  hold('.shock-lens', [
    [0, 1, 'translate(0,0)'],
    [220, 1, 'translate(-6px,4px) rotate(-.35deg)'],
    [280, 1, 'translate(4px,-2px) rotate(.25deg)'],
    [350, 1, 'translate(-3px,1px) rotate(-.15deg)'],
    [440, 1, 'translate(1px,0) rotate(.05deg)'],
    [580, 1, 'translate(0,0) rotate(0)'],
  ])
  hold('.shock-clash-light', [
    [0, 0, 'scale(.98)'],
    [200, 0, 'scale(.98)'],
    [265, 0.62, 'scale(1)'],
    [520, 0, 'scale(1.04)'],
  ])
  hold('.shock-blackout', [
    [0, 0],
    [200, 0],
    [380, 0.68],
    [820, 0.91],
    [1080, 0.91],
    [1900, 0.16],
    [2850, 0],
  ])
  hold('.shock-chamber-shadow', [
    [0, 0.14],
    [450, 0.14],
    [950, 0.7],
    [3300, 0.73],
  ])
  hold('.shock-city', [
    [0, 0.9, 'translateY(0) scale(1.03)'],
    [580, 0.9, 'translateY(0) scale(1.03)'],
    [1150, 0.06, 'translateY(0) scale(1.03)'],
    [d, 0.025, 'translateY(-1%) scale(1.05)'],
  ])
  hold('.shock-iris', [
    [0, 1, 'rotate(0deg)'],
    [900, 1, 'rotate(0deg)', soft],
    [3000, 1, 'rotate(34deg)'],
    [d, 1, 'rotate(39deg)'],
  ])
  hold('.shock-eye-light', [
    [0, 0],
    [1050, 0],
    [1850, 0.65],
    [2850, 0.29],
    [3800, 0.42],
    [6000, 0.23],
  ])
  hold('.shock-breath', [
    [0, 0, 'translateX(-3%)'],
    [1450, 0, 'translateX(-3%)'],
    [3100, 0.17, 'translateX(0)'],
    [6500, 0.23, 'translateX(3%)'],
  ])
  hold('.shock-hush', [
    [0, 0, 'translateY(3px)'],
    [670, 0, 'translateY(3px)'],
    [1040, 0.85, 'translateY(0)'],
    [1500, 0.85],
    [2050, 0],
  ])
  hold('.shock-presence', [
    [0, 0, 'translateY(7px)'],
    [1900, 0, 'translateY(7px)', settle],
    [2600, 0.9, 'translateY(0)'],
    [3150, 0.9],
    [3500, 0, 'translateY(-3px)'],
  ])
  hold('.cine-titles', [
    [0, 0, 'translateY(14px) scale(.985)'],
    [3450, 0, 'translateY(14px) scale(.985)', settle],
    [4200, 1, 'translateY(0) scale(1)'],
  ])
  hold('.shock-title', [
    [0, 1, 'translateY(9px)'],
    [3450, 1, 'translateY(9px)', settle],
    [4400, 1, 'translateY(0)'],
  ])
  hold('.shock-rule', [
    [0, 0, 'scaleX(0)'],
    [3880, 0, 'scaleX(0)'],
    [4580, 0.75, 'scaleX(1)'],
  ])
  hold('.shock-copy', [
    [0, 0, 'translateY(5px)'],
    [4100, 0, 'translateY(5px)'],
    [4650, 1, 'translateY(0)'],
  ])
}

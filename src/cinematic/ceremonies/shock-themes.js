import { makeShockMotifs, animateShockMotifs } from './shock-motifs.js'
// Announcement-only optical layers. One shared WebP, no icons or frame loop.
const themes = {
  cupidArrow: { accent: '#efb0cf', color: '#c74b8b', flow: 'entwine' },
  cupidBroken: { accent: '#d3aec8', color: '#8a467c', flow: 'shatter' },
  depressionShock: { accent: '#a5bbda', color: '#36567e', flow: 'fall' },
  democracia: { accent: '#baded0', color: '#3d937e', flow: 'converge' },
  doubleEviction: { accent: '#e8b2a2', color: '#aa3049', flow: 'rupture' },
  voxDouble: { accent: '#cbb2e3', color: '#873ca3', flow: 'rupture' },
  battleBack: { accent: '#c3e4cd', color: '#388d73', flow: 'rise' },
  battleBackRules: { accent: '#c3e4cd', color: '#388d73', flow: 'rise' },
  battleBackChallenge: { accent: '#ded3aa', color: '#708752', flow: 'rise' },
  vip: { accent: '#e2c7e9', color: '#925a9f', flow: 'entwine' },
  diamond: { accent: '#cce8e7', color: '#469da5', flow: 'prism' },
  coup: { accent: '#c6e5cb', color: '#568b7b', flow: 'cleanse' },
  spotlight: { accent: '#ecdec2', color: '#b09a60', flow: 'converge' },
  twinShock: { accent: '#d8bfe7', color: '#8860a7', flow: 'entwine' },
  dayStartShock: { accent: '#e8b2a2', color: '#aa3049', flow: 'rupture' },
  generic: { accent: '#ded0b2', color: '#85638e', flow: 'rise' },
}
function dustSvg(theme, back) {
  // Fixed positions keep every replay deterministic; each whole depth plane animates once.
  const points = [
    [24, 201, 1.2],
    [63, 85, 0.7],
    [111, 230, 1.5],
    [149, 60, 0.8],
    [202, 242, 0.6],
    [237, 89, 1],
    [302, 246, 0.8],
    [354, 67, 1.4],
    [401, 230, 0.7],
    [449, 98, 0.9],
    [503, 197, 1.2],
    [561, 65, 0.7],
  ]
  return `<svg viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true">${points
    .map(
      ([x, y, r], i) =>
        `<g transform="translate(${back ? 600 - x : x} ${back ? 300 - y : y})" opacity="${0.25 + (i % 4) * 0.16}">
      <circle r="${r * 4}" fill="${theme.color}" opacity=".13"/>
      <circle r="${r}" fill="${i % 3 ? theme.accent : '#f1dbac'}"/>
      ${i % 4 === 0 ? `<path d="M-5 0H5M0-3V3" stroke="${theme.accent}" stroke-width=".45" opacity=".65"/>` : ''}
    </g>`
    )
    .join('')}</svg>`
}
export function decorateShock(root, type, images) {
  const theme = themes[type] ?? themes.generic
  root.dataset.shockKind = type
  root.dataset.shockFlow = theme.flow
  root.style.setProperty('--shock-theme-accent', theme.accent)
  root.style.setProperty('--shock-theme-color', theme.color)
  const fx = document.createElement('div')
  fx.className = 'shock-title-fx'
  fx.setAttribute('aria-hidden', 'true')
  fx.innerHTML = `<div class="shock-fx-veil"></div>
    <div class="shock-fx-mist shock-fx-mist-a"></div>
    <div class="shock-fx-mist shock-fx-mist-b"></div>
    <div class="shock-fx-optical"></div>
    <div class="shock-fx-dust shock-fx-dust-back">${dustSvg(theme, true)}</div>
    <div class="shock-fx-dust shock-fx-dust-front">${dustSvg(theme, false)}</div>
    <div class="shock-fx-horizon"></div><div class="shock-fx-glint"></div>`
  for (const layer of fx.querySelectorAll('.shock-fx-mist')) {
    const texture = images.shockMist.cloneNode()
    texture.alt = ''
    texture.draggable = false
    layer.append(texture)
  }
  const optical = images.shockAtmosphere.cloneNode()
  optical.alt = ''
  optical.draggable = false
  fx.querySelector('.shock-fx-optical').append(optical)
  makeShockMotifs(fx, type, images)
  root.querySelector('.cine-titles').append(fx)
  if (type === 'depressionShock') {
    for (const name of ['grade', 'weight']) {
      const layer = document.createElement('div')
      layer.className = `shock-depression-${name}`
      root.append(layer)
    }
  }
}
export function animateShockTheme(root, type, animate, duration) {
  const theme = themes[type] ?? themes.generic
  if (type === 'depressionShock') {
    // Opacity crossfade into a neutral colour blend: no duplicate world or blur pass.
    animate('.shock-depression-grade', [
      [0, 0],
      [4200, 0],
      [6800, 0.97],
      [duration, 0.97],
    ])
    animate('.shock-depression-weight', [
      [0, 0],
      [4400, 0],
      [7000, 0.32],
      [duration, 0.32],
    ])
  }
  const d = duration,
    start = 3800,
    settle = 'cubic-bezier(.16,1,.3,1)'
  animate('.shock-fx-veil', [
    [0, 0],
    [start, 0, 'scale(.68)'],
    [4800, 0.78, 'scale(1)', settle],
    [6500, 0.48, 'scale(1.08)'],
    [d, 0, 'scale(1.14)'],
  ])
  // Both full mist fields drift continuously. Never split or freeze the smoke plate.
  for (const [i, selector] of ['.shock-fx-mist-a', '.shock-fx-mist-b'].entries()) {
    const sign = i ? 1 : -1,
      dy = theme.flow === 'fall' ? 1 : -1
    const mirror = i ? 'scaleX(-1) ' : ''
    animate(selector, [
      [0, 0],
      [start + i * 100, 0, `${mirror}translate(${sign * -5}%,${dy * -5}%) scale(1.02)`],
      [4800 + i * 150, i ? 0.2 : 0.32, `${mirror}translate(${sign * -2}%,${dy * -2}%) scale(1.05)`],
      [6500, i ? 0.16 : 0.25, `${mirror}translate(${sign * 1}%,${dy * 2}%) scale(1.09)`],
      [d, 0, `${mirror}translate(${sign * 5}%,${dy * 7}%) scale(1.14)`],
    ])
  }
  animate('.shock-fx-optical', [
    [0, 0],
    [3900, 0, 'scale(.98)'],
    [4700, 0.2, 'scale(1.01)'],
    [6500, 0.1, 'scale(1.05)'],
    [d, 0, 'scale(1.08)'],
  ])
  animateShockMotifs(root, type, animate, d)
  animate('.shock-fx-horizon', [
    [0, 0],
    [3900, 0, 'scaleX(.08)'],
    [4450, 0.9, 'scaleX(1)', settle],
    [5200, 0.32, 'scaleX(1.07)'],
    [d, 0, 'scaleX(1.12)'],
  ])
  animate('.shock-fx-glint', [
    [0, 0],
    [4050, 0, 'translateX(-28%) scaleX(.15)'],
    [4450, 0.85, 'translateX(-6%) scaleX(.8)'],
    [5050, 0, 'translateX(27%) scaleX(.35)'],
    [d, 0],
  ])
  for (const [i, selector] of ['.shock-fx-dust-back', '.shock-fx-dust-front'].entries()) {
    const down = theme.flow === 'fall',
      split = theme.flow === 'shatter'
    animate(selector, [
      [0, 0],
      [4100 + i * 170, 0, 'translateY(9%) scale(.92)'],
      [5000 + i * 180, i ? 0.85 : 0.5, 'translateY(0) scale(1)'],
      [
        d - 350,
        0,
        `translate(${split ? (i ? 13 : -13) : 0}%,${down ? 21 : -17}%) scale(${i ? 1.15 : 1.05})`,
      ],
      [d, 0],
    ])
  }
}

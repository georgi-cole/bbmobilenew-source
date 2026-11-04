import { authorityResources, byPlayerId, royalPowerOutcome } from './authority-film.js'
import { appendDecisionShots } from './replacement-decisions.js'

export function royalPowerResources(cast, shared, paired = false) {
  const outcome = royalPowerOutcome(cast, paired)
  return {
    ...authorityResources(byPlayerId(cast), outcome, shared),
    replacementSet: {
      src: 'assets/ceremonies/shared/royal-room.webp',
      ...shared['royal-room.webp'],
    },
  }
}
export function makeRoyalPowerFilm(images, cast, paired = false) {
  const root = document.createElement('div')
  root.className = 'c-scene replacement-film royal-power-film'
  root.setAttribute('aria-hidden', 'true')
  const outcome = royalPowerOutcome(cast, paired)
  appendDecisionShots(root, images, byPlayerId(cast), outcome)
  const label = root.querySelector('.replacement-decision-label')
  label.querySelector('span').textContent = 'ALL THE POWER'
  label.querySelector('em').textContent = paired
    ? 'THE CROWN AND SAFETY BELONG TO YOUR PAIR.'
    : 'THE CROWN. THE SHIELD. THE POWER IS YOURS.'
  return root
}
export function animateRoyalPowerFilm(root, a, duration) {
  a(root, [
    [0, 0],
    [350, 1],
    [duration, 1],
  ])
  a('.replacement-decision-shot', [
    [0, 1],
    [duration, 1],
  ])
  a('.replacement-decision-backdrop', [
    [0, 0.72, 'scale(1.09) translateY(1%)'],
    [duration, 0.94, 'scale(1.015) translateY(-.5%)'],
  ])
  a('.replacement-decision-figure', [
    [0, 1, 'scale(1.06)'],
    [1600, 1, 'scale(1.025)'],
    [duration, 1, 'scale(1)'],
  ])
  a('.replacement-decision-label', [
    [0, 0, 'translateY(12px)'],
    [2100, 0, 'translateY(12px)'],
    [2600, 1, 'translateY(0)'],
    [duration, 1, 'translateY(0)'],
  ])
  a('.royal-safety-plinth', [
    [0, 0, 'translateY(18px) scale(.86)'],
    [1400, 0, 'translateY(18px) scale(.86)'],
    [2300, 1, 'translateY(0) scale(1)', 'cubic-bezier(.16,.8,.24,1)'],
    [duration, 1, 'translateY(0) scale(1)'],
  ])
  a('.royal-safety-halo', [
    [0, 0],
    [1700, 0],
    [2150, 0.9],
    [3200, 0.35],
    [duration, 0.3],
  ])
}

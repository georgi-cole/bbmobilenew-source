import {
  CINEMA_IDS as OLD_IDS,
  CINEMA_CONFIG as OLD_CONFIG,
  makeCinemaScene as makePrevious,
  animateCinemaScene as animatePrevious,
} from './cinema-scenes-v3.js'
import {
  DECISION_IDS,
  DECISION_CONFIG,
  makeDecisionScene,
  animateDecisionScene,
} from './decision-exit.js'
import { SHOCK_FILM_CONFIG, makeShockFilm, animateShockFilm } from './shock-film.js'
export const CINEMA_IDS = [...new Set([...OLD_IDS, ...DECISION_IDS])]
export const CINEMA_CONFIG = { ...OLD_CONFIG, ...DECISION_CONFIG, shock: SHOCK_FILM_CONFIG }
export function makeCinemaScene(id, images, variant, cast = 0) {
  if (DECISION_IDS.includes(id)) return makeDecisionScene(id, images, cast)
  if (id === 'shock') return makeShockFilm(images, variant)
  return makePrevious(id, images, variant, cast)
}
export function animateCinemaScene(id, root, a) {
  if (DECISION_IDS.includes(id)) return animateDecisionScene(id, root, a)
  if (id === 'shock') return animateShockFilm(root, a)
  animatePrevious(id, root, a)
}

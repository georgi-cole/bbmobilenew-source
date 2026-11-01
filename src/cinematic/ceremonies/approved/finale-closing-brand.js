/** The approved final-day ident, shared by departures and competition broadcasts. */
export const FINAL_EXIT_BRAND_RESOURCE = {
  src: 'assets/ceremonies/final-decision/token.webp',
  width: 384,
  height: 384,
  bytes: 39350,
}

export function makeFinaleClosingBrandMarkup(art) {
  return (
    '<div class="exit-brand cine-layer" data-layer="titles"><div class="exit-brand-lockup"><div class="exit-brand-emblem"><div class="exit-brand-glow"></div><div class="exit-brand-reflection">' +
    art('cinema_closingEye', 'exit-brand-reflection-image') +
    '</div><div class="exit-brand-turn">' +
    art('cinema_closingEye', 'exit-brand-face') +
    art('cinema_closingEye', 'exit-brand-face exit-brand-back') +
    '</div><div class="exit-brand-shine"><i></i></div></div><div class="exit-brand-title">THE BIG EYE</div><i class="exit-brand-rule"></i></div></div>'
  )
}

/** Supply the host's animator so ownership, active time and disposal stay with its scene. */
export function animateFinaleClosingBrand(
  hold,
  { startAt = 0, holdUntil = startAt + 2460, fadeOut = true } = {}
) {
  const smooth = 'cubic-bezier(.16,1,.3,1)'
  hold('.exit-brand', [
    [0, 0],
    [startAt, 0],
    [startAt + 380, 1],
    [holdUntil, 1],
    ...(fadeOut ? [[holdUntil + 300, 0]] : []),
  ])
  hold('.exit-brand-lockup', [
    [0, 1, 'translateY(8px) scale(.92)'],
    [startAt, 1, 'translateY(8px) scale(.92)', smooth],
    [startAt + 700, 1, 'translateY(0) scale(.98)', 'linear'],
    [holdUntil, 1, 'translateY(-2px) scale(1.035)'],
  ])
  hold('.exit-brand-turn', [
    [0, 1, 'rotateY(-58deg) rotateZ(-5deg)'],
    [startAt, 1, 'rotateY(-58deg) rotateZ(-5deg)', 'cubic-bezier(.32,.1,.27,1)'],
    [startAt + 1650, 1, 'rotateY(342deg) rotateZ(-1deg)', smooth],
    [startAt + 2200, 1, 'rotateY(360deg) rotateZ(0deg)'],
  ])
  hold('.exit-brand-glow', [
    [0, 0, 'scale(.7)'],
    [startAt, 0, 'scale(.7)'],
    [startAt + 450, 0.7, 'scale(.98)'],
    [startAt + 1300, 0.95, 'scale(1.06)'],
    [holdUntil, 0.7, 'scale(1.12)'],
  ])
  hold('.exit-brand-reflection', [
    [0, 0, 'scaleX(.55)'],
    [startAt + 1500, 0, 'scaleX(.55)'],
    [startAt + 2150, 0.16, 'scaleX(1)'],
  ])
  hold('.exit-brand-shine', [
    [0, 0],
    [startAt + 1500, 0],
    [startAt + 1700, 0.45],
    [startAt + 2200, 0],
  ])
  hold('.exit-brand-shine i', [
    [0, 1, 'translateX(-200%) rotate(-24deg)'],
    [startAt + 1500, 1, 'translateX(-200%) rotate(-24deg)'],
    [startAt + 2200, 1, 'translateX(220%) rotate(-24deg)'],
  ])
  hold('.exit-brand-title', [
    [0, 0, 'translateY(12px)'],
    [startAt + 300, 0, 'translateY(12px)', smooth],
    [startAt + 780, 1, 'translateY(0)'],
  ])
  hold('.exit-brand-rule', [
    [0, 0, 'scaleX(.15)'],
    [startAt + 500, 0, 'scaleX(.15)', smooth],
    [startAt + 1150, 0.7, 'scaleX(1)'],
  ])
}

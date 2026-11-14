import { describe, expect, it, vi } from 'vitest'
import {
  publicNominationPlan,
  stagePublicNomination,
  animatePublicNomination,
  PUBLIC_NOMINATION_DURATION,
} from './public-nomination-film.js'
const cast = {
  a: { playerId: 'chosen-a' },
  b: { playerId: 'automatic' },
  c: { playerId: 'chosen-b' },
}
const game = {
  publicModeEnabled: true,
  nomineeIds: ['chosen-a', 'chosen-b', 'automatic'],
  nominationContext: { autoNomineeId: 'automatic', hohNomineeIds: ['chosen-a', 'chosen-b'] },
}
function fixture() {
  const root = document.createElement('div')
  root.innerHTML =
    '<img class="ceremony-backdrop"><i class="nom-chasm"></i><div class="nom-warning"></div>' +
    ['first', 'second', 'third']
      .map(
        (id) =>
          `<div class="nom-pod nom-${id}"><img class="nom-person"><img class="nom-platform"><i class="nom-aura"></i><div class="nom-label">Name</div></div>`
      )
      .join('') +
    '<div class="nom-decision"><div class="nom-decision-figure"></div><div class="nom-decision-caption"><span>LOH</span><strong>Dex</strong><em>Decision in progress</em></div></div><div class="c-caption"><span></span><strong></strong><em></em></div>'
  return root
}
describe('public nomination staging', () => {
  it('uses committed nomination ownership regardless of nominee order', () => {
    const plan = publicNominationPlan('nominations', game, cast)!
    expect(plan.chosenNomineeIds).toEqual(['chosen-a', 'chosen-b'])
    const root = fixture()
    expect(stagePublicNomination(root, cast, plan)).toBe(true)
    expect(root.querySelector('.public-auto')?.classList.contains('nom-second')).toBe(true)
    expect(root.querySelectorAll('.public-choice')).toHaveLength(2)
    expect(root.querySelector('.nom-decision')?.parentElement).toBe(root)
    expect(root.querySelector('.public-nom-camera .public-auto')).not.toBeNull()
    expect(root.textContent).not.toMatch(/automatic|last place|decision in progress/i)
  })
  it('does not infer an automatic nomination for Classic, Vox, missing or stale context', () => {
    expect(
      publicNominationPlan('nominations', { ...game, publicModeEnabled: false }, cast)
    ).toBeNull()
    expect(
      publicNominationPlan('nominations', { ...game, doubleEviction: { weekActive: true } }, cast)
    ).toBeNull()
    expect(publicNominationPlan('nominations', { nomineeIds: game.nomineeIds }, cast)).toBeNull()
    expect(publicNominationPlan('voxNominations', game, cast)).toBeNull()
    expect(
      publicNominationPlan('nominations', { ...game, voxPopuli: { status: 'active' } }, cast)
    ).toBeNull()
    expect(
      publicNominationPlan('nominations', { ...game, nomineeIds: ['chosen-a', 'chosen-b'] }, cast)
    ).toBeNull()
    expect(
      publicNominationPlan('nominations', game, { ...cast, b: { playerId: 'other' } })
    ).toBeNull()
  })
  it('establishes the automatic nominee before the LOH insert and lights only the choices afterwards', () => {
    const root = fixture()
    stagePublicNomination(root, cast, publicNominationPlan('nominations', game, cast))
    const animate = vi.fn<(target: string | Element, stops: [number, number, string?][]) => void>()
    animatePublicNomination(root, animate)
    const automatic = root.querySelector('.public-auto .nom-person')!
    const autoFrames = animate.mock.calls.find(([node]) => node === automatic)![1]
    expect(autoFrames[0]).toEqual([0, 0.48])
    for (const actor of root.querySelectorAll('.public-choice .nom-person')) {
      const frames = animate.mock.calls.find(([node]) => node === actor)![1]
      expect(frames[0]).toEqual([0, 0])
      expect(frames.find(([, opacity]) => opacity > 0)![0]).toBeGreaterThan(3150)
    }
    for (const [, frames] of animate.mock.calls) {
      expect(frames.at(-1)![0]).toBe(PUBLIC_NOMINATION_DURATION)
      expect(frames.every(([at], i) => at >= 0 && (i === 0 || at >= frames[i - 1][0]))).toBe(true)
    }
  })
})

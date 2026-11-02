import { describe, expect, it } from 'vitest'
import { animateBackupNomination, makeBackupNomination } from './renderer.js'
import { makeScene } from './approved/ceremony-storyboards.js'

const imageSet = () =>
  Object.fromEntries(
    ['male', 'female', 'platform', 'cinema_danger', 'cinema_decisionC'].map((key) => {
      const image = document.createElement('img')
      image.dataset.resourceKey = key
      return [key, image]
    })
  )

describe('VIP backup nomination film', () => {
  it('reuses the nomination platforms and presents the selector before the incoming nominee', () => {
    const images = imageSet()
    const root = makeScene('nominations', images, 'generic')
    const cast = {
      a: { name: 'Nova' },
      b: { name: 'Rune' },
      c: { name: 'Ash' },
    }
    const details = {
      chooserName: 'Ash',
      chooserRole: 'HALO EXCHANGE HOLDER',
      nomineeName: 'Rune',
      hasContinuingNominee: true,
    }

    makeBackupNomination(root, images, cast, details)

    expect(root.classList.contains('backup-nomination-film')).toBe(true)
    expect(root.querySelectorAll('.nom-pod')).toHaveLength(2)
    expect(root.querySelector('.nom-second .nom-label').textContent).toContain('OPEN SLOT')
    expect(root.querySelector('.nom-second .nom-person').style.opacity).toBe('0')
    expect(root.querySelector('.backup-chooser-person')).not.toBeNull()
    expect(root.querySelector('.backup-chooser-caption').textContent).toContain('Ash')
    expect(root.querySelector('.backup-chooser-caption').textContent).toContain(
      'HALO EXCHANGE HOLDER'
    )

    const selectors = []
    const delayed = []
    animateBackupNomination(
      root,
      (selector) => selectors.push(typeof selector === 'string' ? selector : 'root'),
      7600,
      (callback, delay) => delayed.push({ callback, delay }),
      details
    )
    expect(selectors).toContain('.backup-chooser')
    expect(selectors).toContain('.nom-second .nom-person')
    expect(delayed.map(({ delay }) => delay)).toContain(5480)
  })

  it('supports an empty opening block when both original nominees were saved', () => {
    const images = imageSet()
    const root = makeScene('nominations', images, 'generic')
    makeBackupNomination(
      root,
      images,
      { a: { name: 'Rune' }, b: { name: 'Rune' }, c: { name: 'Ash' } },
      { chooserName: 'Ash', chooserRole: 'DETOX HOLDER', hasContinuingNominee: false }
    )

    expect(root.querySelector('.nom-first .nom-person').style.opacity).toBe('0')
    expect(root.querySelector('.nom-first .nom-label').textContent).toContain('OPEN')
    expect(root.querySelector('.backup-chooser-caption').textContent).toContain('DETOX HOLDER')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { animateVoxFilm, makeVoxFilm } from './mode-films.js'

describe('Vox immunity competition film', () => {
  it.each([
    { values: [61.432198, 38.567802], labels: ['61.4%', '38.6%'] },
    { values: [50.004, 49.996], labels: ['50.004%', '49.996%'] },
    { values: [50, 50], labels: ['50.0%', '50.0%'] },
  ])('uses readable cinematic percentages for $values', ({ values, labels }) => {
    vi.useFakeTimers()
    try {
      const images = Object.fromEntries(
        ['voxStudio', 'voxMist', 'voxActor_a', 'voxActor_b'].map((key) => [
          key,
          document.createElement('img'),
        ])
      )
      const root = makeVoxFilm(
        'voxResults',
        images,
        {},
        {
          kind: 'result',
          ids: ['a'],
          tallies: [
            { id: 'a', name: 'Aria', value: values[0] },
            { id: 'b', name: 'Ash', value: values[1] },
          ],
        }
      )
      animateVoxFilm('voxResults', root, vi.fn(), 8500, (fn, delay) => setTimeout(fn, delay))
      vi.advanceTimersByTime(4500)
      expect([...root.querySelectorAll('.vox-percent')].map((node) => node.textContent)).toEqual(
        labels
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the immunity winner and last-place nominee with distinct labels', () => {
    const images = Object.fromEntries(
      ['voxStudio', 'voxMist', 'voxActor_a', 'voxActor_b', 'voxShield'].map((key) => {
        const image = document.createElement('img')
        return [key, image]
      })
    )
    const cast = {
      a: { playerId: 'winner', name: 'Aria' },
      b: { playerId: 'last-place', name: 'Ash' },
    }

    const root = makeVoxFilm('voxImmunity', images, cast, {})

    expect(root.querySelectorAll('.vox-contestant')).toHaveLength(2)
    expect(root.textContent).toContain('Aria')
    expect(root.textContent).toContain('IMMUNITY WINNER')
    expect(root.textContent).toContain('Ash')
    expect(root.textContent).toContain('LAST PLACE · NOMINATED')
    expect(root.querySelector('.vox-immunity-emblem')).not.toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { makeVoxFilm } from './mode-films.js'

describe('Vox immunity competition film', () => {
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

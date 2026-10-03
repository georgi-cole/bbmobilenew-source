import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim()
}

describe('Final Faceoff vote portrait styles', () => {
  it('clips current-vote portraits to a square circle and fills it with the image', () => {
    const css = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/FinalFaceoff/FinalFaceoff.css'),
        'utf8'
      )
    )

    expect(css).toContain(
      '.fo-current-vote__avatar.pa { display: block; width: clamp(4.5rem, 15vw, 7.25rem); height: clamp(4.5rem, 15vw, 7.25rem);'
    )
    expect(css).toContain('aspect-ratio: 1; overflow: hidden;')
    expect(css).toContain(
      '.fo-current-vote__avatar.pa .pa__img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover;'
    )
    expect(css).toContain('object-position: center 18%; border-radius: inherit;')
  })
})

import { describe, expect, it } from 'vitest'
import { groundedCutoutStyle } from '../cutoutGrounding'

describe('deployment-safe cutout grounding', () => {
  it('uses the same measured feet for raw and deployment-relative encoded URLs', () => {
    const raw = 'assets/player_characters/character 21/casual.webp'
    expect(
      groundedCutoutStyle(`https://qa.example/game/${raw.replaceAll(' ', '%20')}?v=2`)
    ).toEqual(groundedCutoutStyle(raw))
    expect(groundedCutoutStyle(raw).position).toBe('absolute')
  })
  it('leaves uploaded photos, unsupported artwork and malformed URLs on their existing fallback', () => {
    for (const src of [
      'data:image/png;base64,portrait',
      'assets/new-art.webp',
      'assets/%not-a-url',
    ])
      expect(groundedCutoutStyle(src)).toEqual({})
  })
})

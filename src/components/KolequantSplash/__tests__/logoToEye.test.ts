import { describe, expect, it } from 'vitest'
import skinRegistry from '../../../data/skinRegistry.json'
import { getEyeArtwork } from '../logoToEye'

describe('splash eye artwork', () => {
  it.each(Object.values(skinRegistry).map(({ canonicalFile }) => canonicalFile))(
    'recognizes the built-in background %s',
    (file) => {
      expect(getEyeArtwork(`./assets/skins/${file}`)).not.toBeNull()
    }
  )

  it('aligns the rainy WebP morph with the night eye', () => {
    const rainyNight = getEyeArtwork('./assets/skins/themes/weather-rain-night.webp?v=2')
    expect(rainyNight).toEqual(getEyeArtwork('./assets/skins/themes/weather-rain-night.jpg'))
    expect(rainyNight).toEqual(getEyeArtwork('./assets/skins/bg-night.jpg'))
    expect(rainyNight?.centerY).not.toBe(
      getEyeArtwork('./assets/skins/themes/weather-rain-day.webp')?.centerY
    )
  })

  it('keeps the fade for backgrounds without eye artwork', () => {
    expect(getEyeArtwork('https://example.com/custom-hub.webp')).toBeNull()
    expect(getEyeArtwork('./assets/skins/custom-hub.webp')).toBeNull()
  })
})

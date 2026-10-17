import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const gameScreenImages = [
  {
    screen: 'required Confessional decision',
    original: 'src/assets/source-originals/diary-room/confessional-painting.png',
    webp: 'public/assets/diary-room/confessional-painting.webp',
  },
  {
    screen: 'Confessional entry animation',
    original: 'src/assets/source-originals/diary-room/confessional-locked-door.png',
    webp: 'public/assets/diary-room/confessional-locked-door.webp',
  },
  {
    screen: 'finale Tribunal stream',
    original: 'src/assets/source-originals/diary-room/tribunal-sequester.png',
    webp: 'public/assets/diary-room/tribunal-sequester.webp',
  },
  {
    screen: 'eviction reveal',
    original: 'src/assets/finale/elimination-living-room.png',
    webp: 'src/assets/finale/elimination-living-room.webp',
  },
  {
    screen: 'Final Power Battle intro',
    original: 'src/assets/finale/final-power-battle-backyard.png',
    webp: 'src/assets/finale/final-power-battle-backyard.webp',
  },
  {
    screen: 'Final Power Battle setup',
    original: 'src/assets/finale/final-power-battle-duel.png',
    webp: 'src/assets/finale/final-power-battle-duel.webp',
  },
  {
    screen: 'Final Power Battle spectator sequence',
    original: 'src/assets/finale/final-power-battle-spectator.png',
    webp: 'src/assets/finale/final-power-battle-spectator.webp',
  },
  {
    screen: 'Final Two reveal',
    original: 'src/assets/source-originals/finale-stage/final-two-hub-living-room.png',
    webp: 'public/assets/finale_stage/final-two-hub-living-room.webp',
  },
  ...[
    'athletics-studio',
    'cinematic-harbor',
    'design-studio',
    'fashion-atelier',
    'film-suite',
    'illusion-theatre',
    'music-archive',
    'outback-camp',
    'strategy-room',
    'technology-lab',
  ].map((backdrop) => ({
    screen: `Meet the Hubmates: ${backdrop}`,
    original: `src/assets/source-originals/housemate-bio-backgrounds/${backdrop}.png`,
    webp: `public/assets/housemate-bio-backgrounds/${backdrop}.webp`,
  })),
]

describe('game screen image size budgets', () => {
  it.each(gameScreenImages)(
    '$screen uses a substantially smaller WebP option',
    ({ original, webp }) => {
      const originalBytes = statSync(resolve(process.cwd(), original)).size
      const webpBytes = statSync(resolve(process.cwd(), webp)).size

      expect(webpBytes).toBeLessThan(originalBytes * 0.25)
    }
  )
})

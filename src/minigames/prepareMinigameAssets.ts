import crystalPathBackground from '../components/GlassBridgeComp/assets/crystal-abyss.webp'
import infinityBackground from './crystalPathShattered/infinity-black-hole-bg.webp'
import { preloadImages } from '../utils/preloadImages'

/** Warm only the artwork belonging to the selected presentation while its rules are visible. */
export function prepareMinigameAssets(componentKey: string, premiumPresentation: boolean): void {
  if (componentKey === 'GlassBridge') preloadImages([crystalPathBackground])
  if (componentKey === 'CrystalPathShattered' && premiumPresentation)
    preloadImages([infinityBackground])
  if (componentKey === 'CastleRescueRemastered' || componentKey === 'CastleRescue2Remastered') {
    const part = componentKey === 'CastleRescueRemastered' ? 'part1' : 'part2'
    const background = part === 'part1' ? 'moonlit-park-v2.webp' : 'lost-again-castle.webp'
    const base = `${import.meta.env.BASE_URL}minigames/twin-remastered/`
    preloadImages([
      `${base}${part}/assets/${background}`,
      `${base}shared/benny-approved-alpha.webp`,
    ])
  }
}

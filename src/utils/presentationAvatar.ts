/**
 * Resolve the light, neutral presentation portrait for secondary avatar views.
 *
 * The main roster intentionally keeps its black/gold artwork.  Presentation
 * moments (mini-games and cinematic reveals) use the quieter grey-backed set
 * so portraits remain legible against dark overlays.
 */
import { appearanceFromAssetUrl, getAppearanceAsset } from '../appearance/catalog'

export function resolvePresentationAvatarCandidates(source: string | null | undefined): string[] {
  if (!source) return source ? [source] : []

  const selection = appearanceFromAssetUrl(source)
  if (selection) {
    const grey = getAppearanceAsset(selection, 'grey')
    if (grey)
      return [
        source.replace(/(?:casual|main|grey|formal|sad|paparazzi)\.webp(?:[?#].*)?$/i, 'grey.webp'),
        source,
      ]
  }

  const marker = 'assets/skins/'
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) return [source]

  const assetName = source.slice(markerIndex + marker.length)
  if (
    assetName.startsWith('backup-grey-lux/') ||
    !/^[^/?]+_avatar\.webp(?=[?#]|$)/i.test(assetName)
  ) {
    return [source]
  }

  const prefix = `${source.slice(0, markerIndex)}${marker}backup-grey-lux/`
  return [`${prefix}${assetName}`, source]
}

/** Resolves the preferred grey presentation asset. The caller may advance to
 * the next candidate after a load error. */
export function resolvePresentationAvatar(source: string | null | undefined): string {
  return resolvePresentationAvatarCandidates(source)[0] ?? ''
}

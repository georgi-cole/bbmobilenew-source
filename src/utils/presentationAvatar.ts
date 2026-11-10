import { appearanceFromAssetUrl, getAppearanceAsset } from '../appearance/catalog'

export function greyLuxAvatarAssetPath(filename: string): string {
  return filename.toLowerCase() === 'bella_avatar.webp'
    ? 'assets/skins/Bella_avatar.webp'
    : `assets/skins/backup-grey-lux/${filename}`
}

/**
 * Resolve the light, neutral presentation portrait for secondary avatar views.
 *
 * The main roster intentionally keeps its black/gold artwork.  Presentation
 * moments (mini-games and cinematic reveals) use the quieter grey-backed set
 * so portraits remain legible against dark overlays.
 */
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
  const bella = /^(?:backup-grey-lux\/)?Bella_avatar\.webp([?#].*)?$/i.exec(assetName)
  if (bella) {
    return [
      `${source.slice(0, markerIndex)}${greyLuxAvatarAssetPath('Bella_avatar.webp')}${bella[1] ?? ''}`,
    ]
  }
  if (
    assetName.startsWith('backup-grey-lux/') ||
    !/^[^/?]+_avatar\.webp(?=[?#]|$)/i.test(assetName)
  ) {
    return [source]
  }

  const prefix = `${source.slice(0, markerIndex)}${marker}backup-grey-lux/`
  const suffix = source.slice(source.indexOf(assetName) + assetName.length)
  const stem = assetName.slice(0, -'.webp'.length)
  return [`${prefix}${stem}.webp${suffix}`, `${prefix}${stem}.png${suffix}`]
}

/** Resolves the preferred grey presentation asset. The caller may advance to
 * the next candidate after a load error. */
export function resolvePresentationAvatar(source: string | null | undefined): string {
  return resolvePresentationAvatarCandidates(source)[0] ?? ''
}

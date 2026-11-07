function isSafeCharacterAssetPath(assetPath) {
  if (
    !assetPath.startsWith('assets/characters/') ||
    assetPath.includes('\\') ||
    /[%?#:]/.test(assetPath)
  ) {
    return false
  }

  return assetPath
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/** Resolve a catalog-relative public asset path for web and Capacitor base URLs. */
export function resolveCharacterAssetUrl(assetPath, baseUrl) {
  if (typeof assetPath !== 'string' || !isSafeCharacterAssetPath(assetPath)) {
    throw new TypeError(`Unsafe character asset path: ${assetPath}`)
  }

  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new TypeError('A non-empty application base URL is required.')
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${normalizedBase}${assetPath}`
}

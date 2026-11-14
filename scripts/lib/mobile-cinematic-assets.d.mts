interface MobileCinematicManifest {
  totalBytes: number
  files: readonly { path: string; bytes: number; sha256: string }[]
}

interface MobileMediaAudit {
  excludedFiles: number
  excludedBytes: number
  retainedFiles: number
}
export function excludeMobileCinematicAssets(
  root: string,
  outputDirectory: string,
  manifest: MobileCinematicManifest
): Promise<MobileMediaAudit>
export function verifyMobileCinematicAssets(
  root: string,
  outputDirectory: string,
  manifest: MobileCinematicManifest
): Promise<MobileMediaAudit>

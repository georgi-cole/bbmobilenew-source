interface MobileCinematicManifest {
  totalBytes: number
  files: readonly { path: string; bytes: number; sha256: string }[]
}

interface MobileMediaAudit {
  retainedFiles: number
  skippedPublicBytes: number
  totalBytes: number
}
export const MOBILE_WEB_BUDGET_BYTES: number
export function stageMobilePublicAssets(
  root: string,
  outputDirectory: string,
  manifest: MobileCinematicManifest
): Promise<MobileMediaAudit>

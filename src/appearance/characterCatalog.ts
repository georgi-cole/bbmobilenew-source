import catalogDataJson from './characterCatalog.data.json'
import assetPolicy from './characterAssetPolicy.json'
export { resolveCharacterAssetUrl } from './characterAssetPaths.mjs'
import type { CharacterPreset } from './types'

// JSON imports widen literal strings; the build-time catalog validator checks
// the paths and trait enums before release bundles are built.
const catalogData = catalogDataJson as unknown as readonly CharacterPreset[]

/** Only released artwork belongs here; unreviewed or partial content stays out. */
export const CHARACTER_PRESETS: readonly CharacterPreset[] = catalogData

/** Published retired revisions remain renderable, but are hidden from new selections. */
export const SELECTABLE_CHARACTER_PRESETS = CHARACTER_PRESETS.filter((preset) => preset.selectable)

export const CHARACTER_ASSET_POLICY = assetPolicy

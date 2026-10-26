import { preloadImage, type ImagePreloadResult } from '../utils/preload'
import { joinPublicAssetPath } from '../utils/avatar'
import { getAppearanceAsset, type AppearanceRole, type AppearanceSelection } from './catalog'

const pending = new Map<string, Promise<ImagePreloadResult>>()

function warm(url: string): Promise<ImagePreloadResult> {
  const cached = pending.get(url)
  if (cached) return cached
  const task = preloadImage(url).then((result) => {
    if (result.status !== 'loaded') pending.delete(url)
    return result
  })
  pending.set(url, task)
  return task
}

export function warmAppearanceRole(
  selection: AppearanceSelection | null | undefined,
  role: AppearanceRole
): Promise<ImagePreloadResult> | null {
  const asset = getAppearanceAsset(selection, role)
  return asset ? warm(joinPublicAssetPath(asset)) : null
}

/** Warm only the selected pack's remaining roles, two requests at a time. */
export async function warmSelectedAppearance(
  selection: AppearanceSelection
): Promise<ImagePreloadResult[]> {
  const roles: AppearanceRole[] = ['main', 'grey', 'formal', 'sad', 'paparazzi']
  const results: ImagePreloadResult[] = []
  for (let index = 0; index < roles.length; index += 2) {
    const pair = roles.slice(index, index + 2)
    results.push(
      ...(await Promise.all(pair.map((role) => warmAppearanceRole(selection, role)))).filter(
        (result): result is ImagePreloadResult => result !== null
      )
    )
  }
  return results
}

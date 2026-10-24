const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

const BUTTON_VARIANTS = [
  'primary_large',
  'secondary_medium',
  'secondary_wide',
  'secondary_small',
] as const

type ButtonState = 'normal' | 'hover' | 'pressed' | 'disabled'
const DEFERRED_BUTTON_STATES: readonly ButtonState[] = ['hover', 'pressed', 'disabled']

type IntroHubShellState = 'normal' | 'hover' | 'pressed' | 'disabled'
const DEFERRED_INTRO_HUB_SHELL_STATES: readonly IntroHubShellState[] = [
  'hover',
  'pressed',
  'disabled',
]

const INTRO_HUB_ICONS = [
  'housemates',
  'hall_of_fame',
  'music',
  'sound',
  'settings',
  'share',
  'feedback',
  'news',
  'achievements',
  'social',
  'shop',
] as const

const HOME_HUB_BUTTON_ICONS = [
  'play',
  'rules',
  'profile',
  'market',
  'hall_of_fame',
  'credits',
  'campaign',
  'survival',
  'housemates',
  'back',
] as const

function assetUrl(path: string): string {
  return `${BASE}${path}`
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function buttonUrls(states: readonly ButtonState[]): string[] {
  const urls: string[] = []

  BUTTON_VARIANTS.forEach((variant) => {
    states.forEach((state) => {
      urls.push(assetUrl(`/assets/buttons/${variant}_${state}.svg`))
    })
  })

  return urls
}

function introHubShellUrls(states: readonly IntroHubShellState[]): string[] {
  return states.map((state) =>
    assetUrl(`/assets/side_utilities_button/side_utility_shell_${state}.svg`)
  )
}

function introHubIconUrls(): string[] {
  const urls: string[] = []

  INTRO_HUB_ICONS.forEach((icon) => {
    urls.push(assetUrl(`/assets/side_utilities_button/${icon}_v2.svg`))
  })

  return urls
}

function homeHubIconUrls(icons: readonly (typeof HOME_HUB_BUTTON_ICONS)[number][]): string[] {
  return icons.map((icon) => assetUrl(`/assets/intro_hub_icons/${icon}.svg`))
}

/** Assets needed to paint the first Home Hub frame. */
export function getHomeHubCriticalAssetUrls(effectiveBgUrl: string | null): string[] {
  const urls: string[] = []

  if (effectiveBgUrl) {
    urls.push(effectiveBgUrl)
  }

  urls.push(...buttonUrls(['normal']))
  urls.push(...introHubShellUrls(['normal']))
  urls.push(assetUrl('/assets/side_utilities_button/badge_alert_red.svg'))
  urls.push(...introHubIconUrls())
  urls.push(...homeHubIconUrls(HOME_HUB_BUTTON_ICONS))

  return unique(urls)
}

/** Interaction and secondary menu art can be fetched after the first frame. */
export function getHomeHubDeferredAssetUrls(): string[] {
  const urls = buttonUrls(DEFERRED_BUTTON_STATES)
  urls.push(...introHubShellUrls(DEFERRED_INTRO_HUB_SHELL_STATES))

  return unique(urls)
}

/** Complete asset list, retained for callers that need the full bundle. */
export function getHomeHubAssetUrls(effectiveBgUrl: string | null): string[] {
  const urls = getHomeHubCriticalAssetUrls(effectiveBgUrl)
  urls.push(...getHomeHubDeferredAssetUrls())

  return unique(urls)
}

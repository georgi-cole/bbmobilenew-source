export type DeviceAnalyticsContext = {
  device_type: 'mobile' | 'tablet' | 'desktop' | 'unknown'
  device_family: string
  operating_system: string
  browser: string
  device_model?: string
}

type UserAgentHint = 'model' | 'formFactors'

type UserAgentData = {
  brands?: readonly { brand: string; version: string }[]
  mobile?: boolean
  platform?: string
  getHighEntropyValues?: (hints: UserAgentHint[]) => Promise<{
    model?: string
    formFactors?: readonly string[]
  }>
}

export type DeviceNavigator = {
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
  userAgentData?: UserAgentData
}

const UNKNOWN = 'unknown'

function getBrowser(brands: readonly { brand: string }[] | undefined, userAgent: string): string {
  const brand = brands?.map((entry) => entry.brand).join(' ') ?? ''
  const browserSource = `${brand} ${userAgent}`
  if (/microsoft edge|\bedg\//i.test(browserSource)) return 'Edge'
  if (/samsungbrowser/i.test(browserSource)) return 'Samsung Internet'
  if (/opera|\bopr\//i.test(browserSource)) return 'Opera'
  if (/firefox|fxios/i.test(browserSource)) return 'Firefox'
  if (/google chrome|chromium|\bchrome|crios/i.test(browserSource)) return 'Chrome'
  if (/safari/i.test(browserSource)) return 'Safari'
  return UNKNOWN
}

function getOperatingSystem(platform: string, userAgent: string, isIPad: boolean): string {
  const source = `${platform} ${userAgent}`
  if (isIPad) return 'iPadOS'
  if (/iphone|ipad|ipod|ios/i.test(source)) return 'iOS'
  if (/android/i.test(source)) return 'Android'
  if (/windows/i.test(source)) return 'Windows'
  if (/chrome\s?os|cros/i.test(source)) return 'ChromeOS'
  if (/macintosh|mac os|macos/i.test(source)) return 'macOS'
  if (/linux/i.test(source)) return 'Linux'
  return UNKNOWN
}

function getDeviceType(
  userAgent: string,
  mobileHint: boolean | undefined,
  formFactors: readonly string[],
  isIPad: boolean
): DeviceAnalyticsContext['device_type'] {
  const factors = formFactors.map((factor) => factor.toLowerCase())
  if (factors.includes('tablet') || isIPad || /ipad|tablet|kindle|silk/i.test(userAgent))
    return 'tablet'
  if (
    factors.includes('mobile') ||
    mobileHint ||
    /iphone|ipod|android.*mobile|windows phone/i.test(userAgent)
  )
    return 'mobile'
  if (/android/i.test(userAgent)) return 'tablet'
  return userAgent || mobileHint !== undefined ? 'desktop' : 'unknown'
}

function getDeviceFamily(userAgent: string, operatingSystem: string, isIPad: boolean): string {
  if (isIPad || /ipad/i.test(userAgent)) return 'iPad'
  if (/iphone/i.test(userAgent)) return 'iPhone'
  if (/ipod/i.test(userAgent)) return 'iPod'
  if (/android/i.test(userAgent)) return 'Android device'
  if (operatingSystem === 'Windows') return 'Windows PC'
  if (operatingSystem === 'ChromeOS') return 'Chromebook'
  if (operatingSystem === 'macOS') return 'Mac'
  if (operatingSystem === 'Linux') return 'Linux PC'
  return UNKNOWN
}

function normalizeModel(value: string | undefined): string | undefined {
  const model = value?.replace(/\s+/g, ' ').trim()
  if (!model || model.length > 80 || !/^[a-zA-Z0-9 _./#-]+$/.test(model)) return undefined
  return model
}

/** Read coarse browser/device details and the model only when the browser exposes it. */
export async function readDeviceAnalyticsContext(
  deviceNavigator: DeviceNavigator | null = typeof navigator === 'undefined'
    ? null
    : (navigator as DeviceNavigator)
): Promise<DeviceAnalyticsContext> {
  if (!deviceNavigator)
    return {
      device_type: 'unknown',
      device_family: UNKNOWN,
      operating_system: UNKNOWN,
      browser: UNKNOWN,
    }

  const userAgent = deviceNavigator.userAgent ?? ''
  const uaData = deviceNavigator.userAgentData
  let model: string | undefined
  let formFactors: readonly string[] = []

  try {
    const hints = await uaData?.getHighEntropyValues?.(['model', 'formFactors'])
    model = normalizeModel(hints?.model)
    formFactors = hints?.formFactors ?? []
  } catch {
    // Keep coarse values when a browser withholds high-entropy hints.
  }

  const platform = uaData?.platform ?? deviceNavigator.platform ?? ''
  const isIPad =
    /ipad/i.test(userAgent) ||
    (deviceNavigator.maxTouchPoints !== undefined &&
      deviceNavigator.maxTouchPoints > 1 &&
      /mac/i.test(platform))
  const operatingSystem = getOperatingSystem(platform, userAgent, isIPad)

  return {
    device_type: getDeviceType(userAgent, uaData?.mobile, formFactors, isIPad),
    device_family: getDeviceFamily(userAgent, operatingSystem, isIPad),
    operating_system: operatingSystem,
    browser: getBrowser(uaData?.brands, userAgent),
    ...(model ? { device_model: model } : {}),
  }
}

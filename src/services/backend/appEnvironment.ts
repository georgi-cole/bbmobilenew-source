export type AppEnvironment = 'qa' | 'development' | 'production'

export function resolveAppEnvironment(
  configured: string | undefined,
  isDevelopmentBuild: boolean,
  buildTarget: string | undefined
): AppEnvironment {
  const value = configured?.trim().toLowerCase()
  if (value === 'qa' || value === 'development' || value === 'production') return value
  if (isDevelopmentBuild) return 'development'
  return buildTarget === 'admin' ? 'qa' : 'production'
}

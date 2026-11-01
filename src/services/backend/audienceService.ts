import { getBackendConfig } from './config'
import { getBackendClient } from './supabaseTransport'

export const AUDIENCE_GROUPS = [
  'new',
  'returning',
  'completed',
  'inactive',
  'tribunal',
  'subscribed',
] as const
export type AudienceGroup = (typeof AUDIENCE_GROUPS)[number]

export type AudiencePlayer = {
  id: string
  profileId: string | null
  displayName: string
  isGuest: boolean
  verifiedEmail: boolean
  email: string | null
  updatesOptIn: boolean
  lastActiveAt: string | null
  firstSeenAt: string
  seasonsStarted: number
  seasonsCompleted: number
  groups: AudienceGroup[]
}

export type PlayerAudience = {
  generatedAt: string
  coverageStart: string | null
  totalPlayers: number
  truncated: boolean
  groupCounts: Record<AudienceGroup, number>
  players: AudiencePlayer[]
}

export class AudienceAccessError extends Error {
  readonly reason: 'disabled' | 'access' | 'setup' | 'unavailable'

  constructor(reason: 'disabled' | 'access' | 'setup' | 'unavailable', message: string) {
    super(message)
    this.name = 'AudienceAccessError'
    this.reason = reason
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isPlayer(value: unknown): value is AudiencePlayer {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    (value.profileId === null || typeof value.profileId === 'string') &&
    typeof value.displayName === 'string' &&
    typeof value.isGuest === 'boolean' &&
    typeof value.verifiedEmail === 'boolean' &&
    (value.email === null || typeof value.email === 'string') &&
    typeof value.updatesOptIn === 'boolean' &&
    (value.lastActiveAt === null || isDate(value.lastActiveAt)) &&
    isDate(value.firstSeenAt) &&
    isCount(value.seasonsStarted) &&
    isCount(value.seasonsCompleted) &&
    Array.isArray(value.groups) &&
    value.groups.every((group) => AUDIENCE_GROUPS.includes(group))
  )
}

function parseAudience(value: unknown): PlayerAudience {
  const groupCounts = isRecord(value) ? value.groupCounts : null
  if (
    !isRecord(value) ||
    !isDate(value.generatedAt) ||
    !(value.coverageStart === null || isDate(value.coverageStart)) ||
    !isCount(value.totalPlayers) ||
    typeof value.truncated !== 'boolean' ||
    !isRecord(groupCounts) ||
    !AUDIENCE_GROUPS.every((group) => isCount(groupCounts[group])) ||
    !Array.isArray(value.players) ||
    !value.players.every(isPlayer)
  )
    throw new AudienceAccessError(
      'unavailable',
      'The player audience could not be loaded. Try again.'
    )
  return value as PlayerAudience
}

/** Authorization is enforced again by the RPC, using a server-managed admin role. */
export async function loadPlayerAudience(signal?: AbortSignal): Promise<PlayerAudience> {
  if (!getBackendConfig() || import.meta.env.VITE_PLAYER_ACCOUNTS_ENABLED !== 'true')
    throw new AudienceAccessError('disabled', 'Player audience is not enabled in this build.')
  try {
    const client = await getBackendClient('audience_admin')
    const current = await client.auth.getSession()
    if (current.error) throw current.error
    if (!current.data.session || current.data.session.user.is_anonymous === true)
      throw new AudienceAccessError(
        'access',
        'Sign in with an approved admin account to view players.'
      )
    let request = client.rpc('get_player_audience')
    if (signal) request = request.abortSignal(signal)
    const { data, error } = await request
    if (error) {
      if (error.code === '42501' || error.code === 'PGRST301')
        throw new AudienceAccessError(
          'access',
          'This account does not have player audience access.'
        )
      if (error.code === 'PGRST202' || error.code === '42883')
        throw new AudienceAccessError('setup', 'Player audience is waiting for the backend update.')
      throw error
    }
    return parseAudience(data)
  } catch (error) {
    if (error instanceof AudienceAccessError) throw error
    throw new AudienceAccessError(
      'unavailable',
      'The player audience could not be loaded. Try again.'
    )
  }
}

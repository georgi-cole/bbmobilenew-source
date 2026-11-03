import type { GameState, Player } from '../types'

/** Public inputs only. Never pass social graphs, ballots or audience profiles here. */
export type StrategicGameRead = Readonly<
  Pick<GameState, 'mode' | 'status' | 'phase' | 'week' | 'lohId' | 'posWinnerId'> & {
    players: readonly Readonly<Pick<Player, 'id' | 'status'>>[]
    nomineeIds: readonly string[]
    coLohIds?: readonly string[] | null
    publicModeEnabled?: boolean
    voxPopuli?: Readonly<
      Pick<NonNullable<GameState['voxPopuli']>, 'status' | 'immunityWinnerId' | 'autoNomineeId'>
    >
    cupidArrow?: Readonly<Pick<NonNullable<GameState['cupidArrow']>, 'status'>> & {
      pairs?: readonly { memberIds: readonly string[] }[]
    }
    specialVeto?: Readonly<
      Pick<NonNullable<GameState['specialVeto']>, 'activeType' | 'activatedWeek'>
    >
    doubleEviction?: Readonly<Pick<NonNullable<GameState['doubleEviction']>, 'weekActive'>>
    povProtectedIds?: readonly string[]
    publicSavedNomineeId?: string | null
    nominationContext?: Readonly<{ autoNomineeId: string | null }> | null
    weekendInterlude?: Readonly<{ active: true }> | null
  }
>

type Authority =
  | 'loh'
  | 'house_secret_ballots'
  | 'house_vote'
  | 'audience'
  | 'safety_holder'
  | 'final_loh'
  | 'tribunal'
  | 'none'

/** Format capabilities, not permission to execute an action. The shared execution
 * guard still owns actor/target legality, phase gates, costs and cooldowns. */
export interface StrategicModeContext {
  format: 'classic' | 'vox' | 'cupid' | 'survival'
  expansionStatus: {
    vox: NonNullable<GameState['voxPopuli']>['status']
    cupid: NonNullable<GameState['cupidArrow']>['status']
  }
  phase: GameState['phase']
  week: number
  stage: 'weekly' | 'final_four' | 'final_three' | 'finale' | 'terminal'
  doubleEviction: boolean
  authority: {
    nominations: Authority
    replacement: Authority
    eviction: Authority
    winner: Authority
  }
  powers: {
    lohIds: string[]
    immunityWinnerId: string | null
    safetyHolderId: string | null
    safetyCoholderIds: string[]
  }
  nomineeIds: string[]
  automaticNomineeId: string | null
  publicMeterVisible: boolean
  capabilities: {
    nominationLobbying: boolean
    lohProtection: boolean
    replacementLobbying: boolean
    safetyRequests: boolean
    houseVoteCoordination: boolean
    audienceSensitiveChoices: boolean
  }
}

/** Pure diagnostic projection: no RNG, time, state writes, middleware or policy tuning. */
export function resolveStrategicModeContext(game: StrategicGameRead): StrategicModeContext {
  const survival = game.mode === 'survival'
  const cupid = !survival && game.cupidArrow?.status === 'active'
  const vox = !survival && !cupid && game.voxPopuli?.status === 'active'
  const format = survival ? 'survival' : cupid ? 'cupid' : vox ? 'vox' : 'classic'
  const alive = new Set(
    game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury').map((p) => p.id)
  )
  const terminal = game.status === 'completed' || game.status === 'failed'
  const finale = game.phase.startsWith('jury')
  const finalThree = game.phase.startsWith('final3')
  const finalFour = game.phase === 'final4_eviction'
  const stage = terminal
    ? 'terminal'
    : finale
      ? 'finale'
      : finalThree
        ? 'final_three'
        : finalFour || (!survival && alive.size === 4)
          ? 'final_four'
          : 'weekly'
  const weekly = !terminal && !finale && !finalThree && !finalFour
  const activeId = (id: string | null | undefined) => (id && alive.has(id) ? id : null)
  const expandRoles = (ids: readonly string[]) => {
    const expanded = new Set(ids)
    if (cupid)
      for (const pair of game.cupidArrow?.pairs ?? []) {
        if (pair.memberIds.some((id) => ids.includes(id)))
          pair.memberIds.forEach((id) => expanded.add(id))
      }
    return [...expanded].filter((id) => alive.has(id))
  }
  const lohIds = vox
    ? []
    : expandRoles(game.coLohIds?.length ? game.coLohIds : game.lohId ? [game.lohId] : [])
  const safetyHolderId = activeId(game.posWinnerId)
  const eviction: Authority =
    terminal || finale
      ? 'none'
      : vox
        ? 'audience'
        : finalFour
          ? 'safety_holder'
          : finalThree
            ? 'final_loh'
            : 'house_vote'
  const socialWindow = weekly && !game.weekendInterlude?.active
  return {
    format,
    expansionStatus: {
      vox: game.voxPopuli?.status ?? 'inactive',
      cupid: game.cupidArrow?.status ?? 'inactive',
    },
    phase: game.phase,
    week: game.week,
    stage,
    doubleEviction: game.doubleEviction?.weekActive === true,
    authority: {
      nominations: weekly ? (vox ? 'house_secret_ballots' : 'loh') : 'none',
      replacement: !weekly
        ? 'none'
        : vox
          ? 'house_secret_ballots'
          : game.specialVeto?.activatedWeek === game.week &&
              ['diamond', 'coup'].includes(game.specialVeto.activeType ?? '')
            ? 'safety_holder'
            : 'loh',
      eviction,
      winner: survival ? 'none' : vox ? 'audience' : 'tribunal',
    },
    powers: {
      lohIds: terminal || finale ? [] : lohIds,
      immunityWinnerId:
        vox && !terminal && !finale ? activeId(game.voxPopuli?.immunityWinnerId) : null,
      safetyHolderId: terminal || finale || finalThree ? null : safetyHolderId,
      safetyCoholderIds:
        terminal || finale || finalThree || !safetyHolderId
          ? []
          : expandRoles([safetyHolderId]).filter((id) => id !== safetyHolderId),
    },
    nomineeIds: [...new Set(game.nomineeIds)].filter((id) => alive.has(id)),
    automaticNomineeId: activeId(
      vox ? game.voxPopuli?.autoNomineeId : game.nominationContext?.autoNomineeId
    ),
    publicMeterVisible: !survival && game.publicModeEnabled === true,
    capabilities: {
      nominationLobbying: socialWindow && !vox,
      lohProtection: socialWindow && !vox && lohIds.length > 0,
      replacementLobbying: socialWindow && !vox,
      safetyRequests: socialWindow && safetyHolderId !== null,
      houseVoteCoordination: socialWindow && eviction === 'house_vote',
      audienceSensitiveChoices: !terminal && !survival && (vox || game.publicModeEnabled === true),
    },
  }
}

/** Deliberately narrow actor read. Unknown audience sentiment stays unknown even
 * with the Public Meter enabled. Later adapters must filter evidence by observer
 * before adding social facts; alliance membership never implies protection. */
export function resolveActorStrategicRead(game: StrategicGameRead, actorId: string) {
  const rules = resolveStrategicModeContext(game)
  const actor = game.players.find((p) => p.id === actorId)
  const inHouse = Boolean(actor && actor.status !== 'evicted' && actor.status !== 'jury')
  return {
    actorId,
    inHouse,
    nominated: inHouse && rules.nomineeIds.includes(actorId),
    automaticNominee: inHouse && rules.automaticNomineeId === actorId,
    holdsLoh: inHouse && rules.powers.lohIds.includes(actorId),
    holdsImmunity: inHouse && rules.powers.immunityWinnerId === actorId,
    holdsSafety:
      inHouse &&
      (rules.powers.safetyHolderId === actorId || rules.powers.safetyCoholderIds.includes(actorId)),
    publiclySaved: inHouse && game.publicSavedNomineeId === actorId,
    safetyProtected: inHouse && (game.povProtectedIds?.includes(actorId) ?? false),
    allianceProtection: 'unknown' as const,
    audiencePerception: 'unknown' as const,
    // Phase is authoritative; there is no reliable numeric countdown in saves.
    decisionTiming: { phase: game.phase, remainingSteps: 'unknown' as const },
  }
}

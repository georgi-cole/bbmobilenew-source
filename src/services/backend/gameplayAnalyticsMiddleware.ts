import { isAction, type Middleware } from '@reduxjs/toolkit'
import { getAppearanceLook } from '../../appearance/catalog'
import type { SeasonRuleset } from '../../modes/seasonRulesets'
import { getSeasonLaunchIntent } from '../../modes/seasonLaunchIntent'
import type { RootState } from '../../store/store'
import { getAnalyticsGameMode, getAnalyticsGameModeForRuleset } from './analyticsGameMode'
import { trackProductEvent } from '../liveOps/productTelemetry'

type AnalyticsContext = {
  game_mode: string
  game_mode_label: string
  week: number
  day: number
  phase: string
  season_index: number
  game_id: string
}

type MinigameSession = {
  profileId: string | null
  minigameId: string
  gameKey: string
  source: 'challenge' | 'native'
  elapsedMilliseconds: number
  activeSince: number | null
  navigationExitRecorded: boolean
  context: AnalyticsContext
}

let currentAnalyticsScreen = 'home'
let syncMinigameTimers: (() => void) | null = null
let recordMinigameNavigationExit: (() => void) | null = null

/** Only count resets explicitly initiated as a new season launch. */
export function shouldTrackSeasonReset(launchIntent: SeasonRuleset | null, hasPlayers: boolean) {
  return launchIntent !== null && hasPlayers
}

/** Keep minigame clocks active only while the game screen is visible. */
export function setAnalyticsRouteScreen(screenId: string) {
  const wasGameScreen = currentAnalyticsScreen === 'game'
  currentAnalyticsScreen = screenId
  if (wasGameScreen && screenId !== 'game') recordMinigameNavigationExit?.()
  syncMinigameTimers?.()
}

function makeSessionId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `module-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isOut(player: { status: string } | undefined) {
  return player?.status === 'evicted' || player?.status === 'jury'
}

const USER_ACTION_IDS: Record<string, string> = {
  'game/submitCoLohNomination': 'nomination_submitted',
  'game/submitHumanVote': 'eviction_vote_cast',
  'game/submitPovDecision': 'power_decision_made',
  'game/submitDiamondReplacement': 'replacement_selected',
  'game/submitCoupReplacement': 'replacement_selected',
  'game/submitDemocraciaVote': 'public_vote_cast',
  'game/submitVoxFinalThreeAppeal': 'final_appeal_selected',
  'game/submitVipSecondUseDecision': 'power_decision_made',
}

/** Record coarse gameplay actions; no chat text, player names, or free-form content is sent. */
export const gameplayAnalyticsMiddleware: Middleware = (api) => {
  let socialSession: {
    profileId: string | null
    id: string
    elapsedMilliseconds: number
    visibleSince: number | null
    context: AnalyticsContext
  } | null = null
  const minigameSessions = new Map<string, MinigameSession>()

  const syncTimers = () => {
    const shouldRun =
      currentAnalyticsScreen === 'game' &&
      (typeof document === 'undefined' || document.visibilityState === 'visible')
    const now = Date.now()
    for (const session of minigameSessions.values()) {
      if (shouldRun && session.activeSince == null) session.activeSince = now
      else if (!shouldRun && session.activeSince != null) {
        session.elapsedMilliseconds += Math.max(0, now - session.activeSince)
        session.activeSince = null
      }
    }
  }
  syncMinigameTimers = syncTimers

  const flushSocialTime = (pause = false) => {
    if (!socialSession || socialSession.visibleSince == null) return
    socialSession.elapsedMilliseconds += Math.max(0, Date.now() - socialSession.visibleSince)
    const durationSeconds = Math.floor(socialSession.elapsedMilliseconds / 1000)
    if (durationSeconds > 0) {
      trackProductEvent(
        'social_module_time',
        {
          ...socialSession.context,
          module_session_id: socialSession.id,
          duration_seconds: durationSeconds,
        },
        socialSession.profileId
      )
      socialSession.elapsedMilliseconds -= durationSeconds * 1000
    }
    socialSession.visibleSince = pause ? null : Date.now()
  }

  const closeSocialSession = (reason: string) => {
    if (!socialSession) return
    flushSocialTime(true)
    trackProductEvent(
      'social_module_closed',
      { ...socialSession.context, module_session_id: socialSession.id, close_reason: reason },
      socialSession.profileId
    )
    socialSession = null
  }

  const startMinigame = (
    key: string,
    profileId: string | null,
    minigameId: string,
    gameKey: string,
    source: MinigameSession['source'],
    context: AnalyticsContext
  ) => {
    if (minigameSessions.has(key)) return
    minigameSessions.set(key, {
      profileId,
      minigameId,
      gameKey,
      source,
      elapsedMilliseconds: 0,
      activeSince:
        currentAnalyticsScreen === 'game' &&
        (typeof document === 'undefined' || document.visibilityState === 'visible')
          ? Date.now()
          : null,
      navigationExitRecorded: false,
      context,
    })
    trackProductEvent(
      'minigame_started',
      { ...context, game_key: gameKey, source, minigame_id: minigameId },
      profileId
    )
  }

  const endMinigame = (
    key: string,
    outcome: 'completed' | 'exited',
    properties: Record<string, string | number | boolean | undefined>
  ) => {
    const session = minigameSessions.get(key)
    if (!session) return
    syncTimers()
    if (outcome === 'exited' && session.navigationExitRecorded) {
      minigameSessions.delete(key)
      return
    }
    minigameSessions.delete(key)
    const durationSeconds = Math.max(
      0,
      Math.floor(
        (session.elapsedMilliseconds +
          (session.activeSince == null ? 0 : Date.now() - session.activeSince)) /
          1000
      )
    )
    trackProductEvent(
      outcome === 'completed' ? 'minigame_completed' : 'minigame_exited',
      {
        ...session.context,
        game_key: session.gameKey,
        source: session.source,
        minigame_id: session.minigameId,
        duration_seconds: durationSeconds,
        ...properties,
      },
      session.profileId
    )
  }

  recordMinigameNavigationExit = () => {
    syncTimers()
    for (const session of minigameSessions.values()) {
      if (session.navigationExitRecorded) continue
      session.navigationExitRecorded = true
      const durationSeconds = Math.max(
        0,
        Math.floor(
          (session.elapsedMilliseconds +
            (session.activeSince == null ? 0 : Date.now() - session.activeSince)) /
            1000
        )
      )
      trackProductEvent(
        'minigame_exited',
        {
          ...session.context,
          game_key: session.gameKey,
          source: session.source,
          minigame_id: session.minigameId,
          duration_seconds: durationSeconds,
          exit_reason: 'navigation',
        },
        session.profileId
      )
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSocialTime(true)
      else if (socialSession && socialSession.visibleSince == null)
        socialSession.visibleSince = Date.now()
      syncTimers()
    })
    window.addEventListener('pagehide', () => {
      flushSocialTime(true)
      for (const key of [...minigameSessions.keys()])
        endMinigame(key, 'exited', { exit_reason: 'app_closed' })
    })
  }

  return (next) => (action) => {
    if (!isAction(action)) return next(action)
    const before = api.getState() as RootState
    const result = next(action)
    const after = api.getState() as RootState
    const profileId = after.profiles.isGuest ? null : after.profiles.activeProfileId
    const launchIntent = action.type === 'game/resetGame' ? getSeasonLaunchIntent() : null
    const selectedGameMode = launchIntent
      ? getAnalyticsGameModeForRuleset(launchIntent)
      : getAnalyticsGameMode(after.game.mode, after.game.expansionMode)
    const context: AnalyticsContext = {
      week: after.game.week,
      day: after.game.week,
      ...selectedGameMode,
      phase: after.game.phase,
      season_index: after.game.season,
      game_id: after.game.gameId,
    }

    if (socialSession && socialSession.profileId !== profileId)
      closeSocialSession(profileId ? 'profile_changed' : 'guest_mode')
    if (socialSession && !after.social.panelOpen) closeSocialSession('closed')
    if (!socialSession && after.social.panelOpen) {
      socialSession = {
        profileId,
        id: makeSessionId(),
        elapsedMilliseconds: 0,
        visibleSince:
          typeof document === 'undefined' || document.visibilityState === 'visible'
            ? Date.now()
            : null,
        context,
      }
      trackProductEvent(
        'social_module_opened',
        { ...context, module_session_id: socialSession.id },
        profileId
      )
    }

    const previousChallenge = before.challenge.pending
    const currentChallenge = after.challenge.pending
    if (
      currentChallenge &&
      !minigameSessions.has(`challenge:${currentChallenge.id}`) &&
      after.game.players.some(
        (player) => player.isUser && currentChallenge.participants.includes(player.id)
      )
    )
      startMinigame(
        `challenge:${currentChallenge.id}`,
        profileId,
        currentChallenge.id,
        currentChallenge.game.key,
        'challenge',
        context
      )

    if (
      action.type === 'challenge/recordRun' &&
      after.challenge.history[0] !== before.challenge.history[0]
    ) {
      const run = after.challenge.history[0]
      const human = after.game.players.find((player) => player.isUser)
      if (human && run.participants.includes(human.id)) {
        const ranking = run.ranking ?? []
        const placementIndex = ranking.indexOf(human.id)
        const minigameKey = `challenge:${run.id}`
        const outcome = {
          partial: run.partial === true,
          won: run.winnerId === human.id,
          score: run.canonicalScores[human.id],
          placement: placementIndex >= 0 ? placementIndex + 1 : undefined,
          participant_count: run.participants.length,
          last_place: ranking.length > 0 ? ranking.at(-1) === human.id : undefined,
        }
        endMinigame(
          minigameKey,
          run.partial ? 'exited' : 'completed',
          run.partial ? { ...outcome, exit_reason: 'partial_result' } : outcome
        )
      }
    }

    if (
      previousChallenge &&
      !currentChallenge &&
      action.type !== 'challenge/recordRun' &&
      action.type !== 'game/resetGame'
    )
      endMinigame(`challenge:${previousChallenge.id}`, 'exited', { exit_reason: 'dismissed' })
    if (previousChallenge && !currentChallenge && action.type === 'game/resetGame')
      endMinigame(`challenge:${previousChallenge.id}`, 'exited', { exit_reason: 'season_reset' })

    const previousNative = before.game.pendingMinigame
    const currentNative = after.game.pendingMinigame
    const human = after.game.players.find((player) => player.isUser)
    const nativeKey = (session: NonNullable<typeof previousNative>) =>
      `native:${session.key}:${session.seed}`
    if (
      currentNative &&
      !minigameSessions.has(nativeKey(currentNative)) &&
      human &&
      currentNative.participants.includes(human.id)
    )
      startMinigame(
        nativeKey(currentNative),
        profileId,
        `${currentNative.key}-${currentNative.seed}`,
        currentNative.key,
        'native',
        context
      )

    if (
      action.type === 'game/completeMinigame' &&
      previousNative &&
      human &&
      previousNative.participants.includes(human.id)
    ) {
      const resolution = after.game.lastCompetitionResolution
      const placements = resolution?.placements ?? []
      const placementIndex = placements.indexOf(human.id)
      endMinigame(nativeKey(previousNative), 'completed', {
        won: resolution?.winnerId === human.id,
        score: resolution?.humanScore,
        placement: placementIndex >= 0 ? placementIndex + 1 : undefined,
        participant_count: previousNative.participants.length,
        last_place: resolution?.lastPlaceId === human.id,
        partial: false,
      })
    } else if (action.type === 'game/skipMinigame' && previousNative) {
      endMinigame(nativeKey(previousNative), 'exited', { exit_reason: 'skipped' })
    } else if (previousNative && !currentNative) {
      endMinigame(nativeKey(previousNative), 'exited', { exit_reason: 'interrupted' })
    }

    if (profileId) {
      const profile = after.profiles.profiles.find((entry) => entry.id === profileId)
      const previousProfile = before.profiles.profiles.find((entry) => entry.id === profileId)
      const characterId =
        profile?.appearanceSelection?.kind === 'catalog'
          ? profile.appearanceSelection.lookId
          : 'legacy'
      const characterLabel =
        profile?.appearanceSelection?.kind === 'catalog'
          ? (getAppearanceLook(
              profile.appearanceSelection.lookId,
              profile.appearanceSelection.revision
            )?.label ?? 'Unknown look')
          : 'Legacy look'

      if (
        action.type === 'profiles/createProfile' &&
        after.profiles.profiles.length > before.profiles.profiles.length
      )
        trackProductEvent('profile_created', {}, profileId)
      if (
        action.type === 'profiles/selectActiveProfile' &&
        after.profiles.activeProfileId !== before.profiles.activeProfileId
      )
        trackProductEvent('profile_selected', {}, profileId)
      if (
        profile &&
        (action.type === 'profiles/createProfile' ||
          action.type === 'profiles/selectActiveProfile' ||
          (action.type === 'profiles/updateProfile' &&
            JSON.stringify(profile.appearanceSelection) !==
              JSON.stringify(previousProfile?.appearanceSelection)))
      )
        trackProductEvent(
          'character_selected',
          { character_id: characterId, character_label: characterLabel },
          profileId
        )
    }

    if (
      action.type === 'game/resetGame' &&
      shouldTrackSeasonReset(launchIntent, after.game.players.length > 0)
    ) {
      if (before.game.status === 'active' && before.game.players.length)
        trackProductEvent(
          'season_abandoned',
          {
            week: before.game.week,
            day: before.game.week,
            season_index: before.game.season,
            game_id: before.game.gameId,
            ...getAnalyticsGameMode(before.game.mode, before.game.expansionMode),
          },
          profileId
        )
      if (after.game.players.length) {
        trackProductEvent('game_mode_selected', selectedGameMode, profileId)
        trackProductEvent(
          'season_started',
          { ...context, season_index: after.game.season },
          profileId
        )
      }
    }

    const gameActionId = USER_ACTION_IDS[action.type]
    if (gameActionId)
      trackProductEvent('game_action', { ...context, action_id: gameActionId }, profileId)

    if (before.game.week > 0 && after.game.week > before.game.week && after.game.players.length > 0)
      trackProductEvent('season_day_reached', context, profileId)

    const beforeHuman = before.game.players.find((player) => player.isUser)
    const afterHuman = after.game.players.find((player) => player.isUser)
    const eliminationContext: AnalyticsContext = {
      ...getAnalyticsGameMode(before.game.mode, before.game.expansionMode),
      week: before.game.week,
      day: before.game.week,
      phase: before.game.phase,
      season_index: before.game.season,
      game_id: before.game.gameId,
    }
    if (!isOut(beforeHuman) && isOut(afterHuman))
      trackProductEvent(
        'player_eliminated',
        {
          ...eliminationContext,
          placement: afterHuman?.finalRank ?? afterHuman?.seasonPlacement,
          player_status: afterHuman?.status,
          elimination_type: action.type === 'game/selfEvict' ? 'self_eviction' : 'game_elimination',
        },
        profileId
      )
    if (action.type === 'game/selfEvict' && afterHuman?.status === 'evicted')
      trackProductEvent(
        'self_eviction',
        {
          ...eliminationContext,
          placement: afterHuman.finalRank ?? afterHuman.seasonPlacement,
        },
        profileId
      )

    if (
      action.type === 'game/archiveSeason' &&
      after.game.seasonArchives !== before.game.seasonArchives
    ) {
      const previousSeasonIds = new Set(
        (before.game.seasonArchives ?? []).map((archive) => archive.seasonId)
      )
      const archive = (after.game.seasonArchives ?? []).find(
        (entry) => !previousSeasonIds.has(entry.seasonId)
      )
      const humanSummary = archive?.playerSummaries.find(
        (summary) => summary.playerId === afterHuman?.id
      )
      if (archive && humanSummary && archive.seasonIndex === after.game.season)
        trackProductEvent(
          'season_completed',
          {
            ...context,
            season_index: archive.seasonIndex,
            placement: humanSummary.finalPlacement,
            total_players: archive.playerSummaries.length,
            days_alive: humanSummary.daysAlive,
            made_jury: humanSummary.madeJury,
            was_evicted: humanSummary.isEvicted,
          },
          profileId
        )
    }

    // Only accepted human choices count as Tribunal engagement; background
    // progression, AI ballots, invalid votes, and repeated acknowledgements do not.
    if (import.meta.env.VITE_PLAYER_ACCOUNTS_ENABLED === 'true' && beforeHuman?.status === 'jury') {
      const joinedTribunal =
        action.type === 'game/chooseTribunalInvitation' &&
        !before.game.tribunalInvitationAcknowledged &&
        after.game.tribunalInvitationAcknowledged &&
        after.game.tribunalInvitationTransition === 'sequester'
      const voted =
        action.type === 'finale/castVote' &&
        before.finale.awaitingHumanJurorId === beforeHuman.id &&
        !before.finale.votes[beforeHuman.id] &&
        Boolean(after.finale.votes[beforeHuman.id])
      if (joinedTribunal || voted)
        trackProductEvent(
          'tribunal_action',
          { ...context, action_id: voted ? 'finale_vote_cast' : 'invitation_accepted' },
          profileId
        )
    }

    if (
      action.type === 'social/recordSocialAction' &&
      after.social.actionHistory !== before.social.actionHistory
    ) {
      const entry = after.social.actionHistory?.at(-1)
      const userPlayer = after.game.players.find((player) => player.isUser)
      if (entry && userPlayer && entry.actorId === userPlayer.id)
        trackProductEvent('social_action', { ...context, action_id: entry.actionId }, profileId)
    }

    return result
  }
}

import {
  allianceProposalPrice,
  executeAllianceManagementCommand,
} from '../../social/allianceManagementActions'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'react-redux'
import { useNavigate } from 'react-router'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type { RootState } from '../../store/store'
import {
  clearSessionLogs,
  closeSocialPanel,
  selectDramaNetwork,
  selectEnergyBank,
  selectInfluenceBank,
  selectInfoBank,
  selectPersistentSocialHistory,
  selectSocialCommitments,
  selectSessionLogs,
  selectSocialPanelOpen,
  selectWeekStartRelSnapshot,
  openIncomingInbox,
} from '../../social/socialSlice'
import { addTvEvent, setHumanPregnancyRole } from '../../store/gameSlice'
import { SocialManeuvers, type ExecuteActionResult } from '../../social/SocialManeuvers'
import { normalizeActionCosts } from '../../social/smExecNormalize'
import { getSocialNarrative } from './socialNarratives'
import {
  getSocialModuleAvailability,
  logBlockedSocialModuleOpen,
} from '../../social/socialModuleAvailability'
import ActionGrid from './ActionGrid'
import GameBackButton from '../ui/GameBackButton/GameBackButton'
import PlayerList from './PlayerList'
import RecentActivity from './RecentActivity'
import HousePulse from '../HousePulse/HousePulse'
import { resolveWeatherDay } from '../../weather/weatherEngine'
import RealityLedger from '../RealityLedger/RealityLedger'
import AllianceRead from './AllianceRead'
import {
  allianceEventText,
  canReadAllianceEvent,
  isFormerAllianceMember,
} from '../../social/reality/allianceHistory'
import { formatPlayerFacingPhase } from '../../social/reality/presentation'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import type { Player } from '../../types'
import { resolveActionTargetMode } from '../../social/socialActions'
import type { SocialActionDefinition, SubjectPool } from '../../social/socialActions'
import { buildEffectiveSocialActions } from '../../social/socialActionManager'
import { getEffectiveSocialMode } from '../../social/socialMode'
import { validateSocialExecution } from '../../social/socialExecutionGuard'
import { getSocialActionPresentation } from '../../social/socialRuntimeConfig'
import { executeHumanRealityAction } from '../../social/reality/humanFlow'
import { getCupidPartnerId, isCupidArrowActive } from '../../features/twists/cupidArrow'
import { getPulseChronicleTheme } from '../../social/pulseChronicleTheme'
import {
  ALLIANCE_LIMITS,
  allianceDisplayLabel,
  allianceKind,
  currentAllianceCounts,
  getCurrentAlliancesBetween,
  getCurrentPact,
  isCurrentAlliance,
} from '../../social/reality/allianceIdentity'
import {
  allianceRequestDecisionActors,
  canSeeAllianceRequest,
  isPendingAllianceRequest,
  type AllianceManagementCommand,
} from '../../social/reality/allianceManagement'
import type { PublicDirection } from '../../publicOpinion/types'
import { getPublicRequestProgressStage } from '../../publicOpinion/publicRequestProgress'
import { getRealityRelationshipLabel, getRelationshipLabel } from './relationshipUtils'
import { selectCanonicalRelationshipView } from '../../social/relationshipSemantics'
import { projectRealityAffinity } from '../../social/reality/relationships'
import RealitySocialTutorialTour, {
  RealitySocialTutorialPrompt,
} from '../../onboarding/RealitySocialTutorialTour'
import ContextualGuidePrompt from '../../onboarding/ContextualGuidePrompt'
import {
  hasSeenContextualGuide,
  markContextualGuideSeen,
} from '../../onboarding/contextualGuidePreference'
import {
  armRealityUpgradeTutorial,
  markSocialTutorialHandled,
  resolveSocialTutorialVariant,
  subscribeTutorialPreferenceChanges,
  type SocialTutorialVariant,
} from '../../onboarding/tutorialGuidePreference'
import './SocialPanelV2.css'

const EXECUTE_REENTRY_GUARD_MS = 250
const EMPTY_PUBLIC_DIRECTIONS: PublicDirection[] = []
const MOVE_FILTERS = [
  { id: 'all', label: 'All moves' },
  { id: 'connect', label: 'Connect' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'drama', label: 'Drama' },
  { id: 'alliances', label: 'Alliances' },
] as const
const REUNION_ACTION_IDS = ['compliment', 'apologize'] as const
const REUNION_ACTION_COSTS = { energy: 0, influence: 0, info: 0 }

interface AllianceQuickAction {
  action: SocialActionDefinition
  executeLabel: string
  allowWithoutTarget?: boolean
  namePrompt?: { label: string; initialValue?: string; hint: string }
  buildCommand: (targetIds: string[]) => AllianceManagementCommand
}

function allianceAction(
  id: string,
  title: string,
  description: string,
  icon: string,
  targetMode: 'none' | 'primary' | 'multi' = 'none',
  minTargets?: number,
  energyCost = 0,
  influenceCost = 0
): SocialActionDefinition {
  return {
    id,
    title,
    description,
    icon,
    category: 'alliance',
    kind: 'rapport',
    baseCost: { energy: energyCost, influence: influenceCost },
    targetMode,
    minTargets,
    maxTargets: targetMode === 'multi' ? ALLIANCE_LIMITS.groupMembers - 1 : undefined,
    realityExclusive: true,
  }
}
const RELATIONSHIP_TAG_LABELS: Record<string, string> = {
  alliance: 'Alliance',
  romance: 'Romance',
  bromance: 'Ride-or-die',
  cupid_partner: 'Cupid pair',
  rivalry: 'Rivalry',
  target: 'Targeted',
  betrayal: 'Betrayed',
  broken_promise: 'Broken promise',
  broken_alliance: 'Broken alliance',
  strained_alliance: 'Strained alliance',
  new_alliance: 'New alliance',
  ex: 'Exes',
  broken_romance: 'Broken romance',
}

function formatPlayerNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'the Hub'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function formatPlayerStatus(status: Player['status']): string {
  return status
    .split('+')
    .map((part) => {
      if (part === 'loh') return 'LOH'
      if (part === 'pos') return 'Safety'
      if (part === 'nominated') return 'Nominated'
      if (part === 'active') return 'Active'
      if (part === 'jury') return 'Tribunal'
      if (part === 'evicted') return 'Eliminated'
      return part[0]?.toUpperCase() + part.slice(1)
    })
    .join(' + ')
}

function getSubjectCandidates(
  pool: SubjectPool,
  primaryTargetId: string,
  players: Player[],
  nomineeIds: readonly string[],
  actorId: string,
  relationships: Record<string, Record<string, { affinity: number; tags?: string[] }>> | undefined,
  allowActorAsSubject = false
): Player[] {
  const eligible = players.filter(
    (player) =>
      player.id !== primaryTargetId &&
      (allowActorAsSubject || player.id !== actorId) &&
      player.status !== 'evicted' &&
      player.status !== 'jury'
  )
  const isNominee = (player: Player) => nomineeIds.includes(player.id)
  switch (pool) {
    case 'nominees':
      return eligible.filter(isNominee)
    case 'non_nominees':
      return eligible.filter((player) => !isNominee(player))
    case 'allies':
      return eligible.filter((player) => {
        const outward = relationships?.[actorId]?.[player.id]
        const inward = relationships?.[player.id]?.[actorId]
        const tags = new Set([...(outward?.tags ?? []), ...(inward?.tags ?? [])])
        return (
          tags.has('alliance') ||
          tags.has('romance') ||
          tags.has('bromance') ||
          (outward?.affinity ?? 0) > 0
        )
      })
    case 'voters':
      return eligible.filter(
        (player) => !isNominee(player) && player.status !== 'loh' && player.status !== 'loh+pos'
      )
    case 'houseguests':
    default:
      return eligible
  }
}

export default function SocialPanelV2() {
  const dispatch = useAppDispatch()
  const appStore = useStore<RootState>()
  const navigate = useNavigate()
  const socialPanelOpenForUpdates = useAppSelector(selectSocialPanelOpen)
  const comparePanelState = useCallback(
    (previous: unknown, next: unknown) => !socialPanelOpenForUpdates || previous === next,
    [socialPanelOpenForUpdates]
  )
  // Keep the component's local selection and tutorial state alive while closed,
  // but stop Redux changes to the season and social world from rerendering it.
  // Opening the panel reselects the latest slices before rendering its content.
  const game = useAppSelector((state) => state.game, comparePanelState)
  const settings = useAppSelector((state) => state.settings, comparePanelState)
  const vip = useAppSelector((state) => state.vip, comparePanelState)
  const socialState = useAppSelector((state) => state.social, comparePanelState)
  const activeProfileId = useAppSelector(
    (state) => state.profiles?.activeProfileId ?? null,
    comparePanelState
  )
  const isGuest = useAppSelector((state) => state.profiles?.isGuest ?? false, comparePanelState)
  const energyBank = useAppSelector(selectEnergyBank, comparePanelState)
  const influenceBank = useAppSelector(selectInfluenceBank, comparePanelState)
  const infoBank = useAppSelector(selectInfoBank, comparePanelState)
  const socialPanelOpen = useAppSelector(selectSocialPanelOpen)
  const sessionLogs = useAppSelector(selectSessionLogs, comparePanelState)
  const actionHistory = useAppSelector(selectPersistentSocialHistory, comparePanelState)
  const socialCommitments = useAppSelector(selectSocialCommitments, comparePanelState)
  const relationships = socialState?.relationships
  const weekStartRelSnapshot = useAppSelector(selectWeekStartRelSnapshot, comparePanelState)
  const dramaNetwork = useAppSelector(selectDramaNetwork, comparePanelState)
  // Public Mode is intentionally optional for lightweight social/test stores.
  const publicDirections = useAppSelector(
    (state) => state.publicOpinion?.directions ?? EMPTY_PUBLIC_DIRECTIONS,
    comparePanelState
  )
  const dramaMode = getEffectiveSocialMode({ game, settings, vip }) === 'drama'
  const socialActions = useMemo(
    () => buildEffectiveSocialActions(settings?.social?.actionOverrides ?? {}),
    [settings?.social?.actionOverrides]
  )
  const reunionActionCards = useMemo(
    () =>
      REUNION_ACTION_IDS.flatMap((actionId) => {
        const action = socialActions.find((candidate) => candidate.id === actionId)
        return action
          ? [{ action, costs: REUNION_ACTION_COSTS, disabled: action.enabled === false }]
          : []
      }),
    [socialActions]
  )

  const humanPlayer = game.players.find((player) => player.isUser)
  const pulseWeather = useMemo(
    () => resolveWeatherDay(game.gameId, game.week).condition,
    [game.gameId, game.week]
  )
  const pulseTheme = useMemo(() => getPulseChronicleTheme(game, game.week), [game])
  const weekendActive = game.weekendInterlude?.active === true
  const finaleReunionSocialOpen =
    weekendActive &&
    game.weekendInterlude?.finaleWeekend === true &&
    game.weekendInterlude.weekendDay === 2 &&
    game.weekendInterlude.stage === 'finale_reunion_social' &&
    game.weekendInterlude.reunionDepartureActive !== true &&
    game.weekendInterlude.reunionDeparted !== true
  const reunionGuestIds = useMemo(
    () =>
      new Set(
        finaleReunionSocialOpen
          ? game.players
              .filter(
                (player) =>
                  !player.isUser && (player.status === 'evicted' || player.status === 'jury')
              )
              .map((player) => player.id)
          : []
      ),
    [finaleReunionSocialOpen, game.players]
  )
  const consultationAlliances = useMemo(() => {
    if (!humanPlayer) return []
    const activePlayerIds = new Set(
      game.players
        .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
        .map((player) => player.id)
    )
    return Object.values(socialState.reality.alliances)
      .filter(
        (alliance) =>
          isCurrentAlliance(alliance) &&
          allianceKind(alliance) === 'GROUP' &&
          alliance.memberIds.includes(humanPlayer.id) &&
          alliance.memberIds.some(
            (memberId) => memberId !== humanPlayer.id && activePlayerIds.has(memberId)
          )
      )
      .sort(
        (left, right) =>
          (left.name ?? left.purpose).localeCompare(right.name ?? right.purpose) ||
          left.id.localeCompare(right.id)
      )
  }, [game.players, humanPlayer, socialState.reality.alliances])
  const memberAllianceExists = useMemo(() => {
    if (!dramaMode || !humanPlayer) return false
    return Object.values(socialState.reality.alliances).some(
      (alliance) => alliance.memberIds.includes(humanPlayer.id) && alliance.status !== 'DISSOLVED'
    )
  }, [dramaMode, humanPlayer, socialState.reality.alliances])
  const activePublicDirection = useMemo(
    () =>
      game.publicModeEnabled && !weekendActive && humanPlayer
        ? publicDirections.find(
            (direction) => direction.playerId === humanPlayer.id && direction.status === 'active'
          )
        : undefined,
    [game.publicModeEnabled, humanPlayer, publicDirections, weekendActive]
  )
  const cupidPartners = useMemo(() => {
    if (!isCupidArrowActive(game) || !humanPlayer) return {}
    return Object.fromEntries(
      game.players.flatMap((player) => {
        const partnerId = getCupidPartnerId(game, player.id)
        const partner = game.players.find((candidate) => candidate.id === partnerId)
        const pair = game.cupidArrow?.pairs.find((candidate) =>
          candidate.memberIds.includes(player.id)
        )
        if (!partner || !pair) return []
        return [
          [
            player.id,
            {
              name: partner.name,
              color: pair.color,
              isYourPartner: partner.id === humanPlayer.id,
            },
          ],
        ]
      })
    ) as Record<string, { name: string; color: string; isYourPartner: boolean }>
  }, [game, humanPlayer])
  const socialModuleAvailability = useMemo(() => getSocialModuleAvailability(game), [game])
  const open = socialModuleAvailability.canOpen && socialPanelOpen

  useEffect(() => {
    if (!socialPanelOpen || socialModuleAvailability.canOpen) return
    logBlockedSocialModuleOpen(
      'Outgoing social module',
      socialModuleAvailability,
      'SocialPanelV2 visibility guard'
    )
    dispatch(closeSocialPanel())
  }, [dispatch, socialPanelOpen, socialModuleAvailability])

  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set())
  const [primaryTargetId, setPrimaryTargetId] = useState<string | null>(null)
  const selectedReunionGuestId =
    finaleReunionSocialOpen && primaryTargetId && reunionGuestIds.has(primaryTargetId)
      ? primaryTargetId
      : null
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [allianceNameDraft, setAllianceNameDraft] = useState('')
  const [initialAllianceNameDraftState, setInitialAllianceNameDraftState] = useState<{
    allianceId: string | null
    value: string
  }>({ allianceId: null, value: '' })
  const [allianceSelectionPulse, setAllianceSelectionPulse] = useState(false)
  const [multiSelectActive, setMultiSelectActive] = useState(false)
  const [selectedAllianceId, setSelectedAllianceId] = useState<string | null>(null)
  const [selectedAllianceHistoryEventId, setSelectedAllianceHistoryEventId] = useState<
    string | null
  >(null)
  const [selectedPactHistoryEventId, setSelectedPactHistoryEventId] = useState<string | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null)
  const [pregnancyCelebration, setPregnancyCelebration] = useState(false)
  const [successPulse, setSuccessPulse] = useState(false)
  const [relationshipPulseDeltas, setRelationshipPulseDeltas] = useState<
    ReadonlyMap<string, number>
  >(new Map())
  const [moveFilter, setMoveFilter] = useState<(typeof MOVE_FILTERS)[number]['id']>('all')
  const selectedAllianceRecord = selectedAllianceId
    ? socialState.reality.alliances[selectedAllianceId]
    : undefined
  const selectedAlliance =
    selectedAllianceRecord && allianceKind(selectedAllianceRecord) === 'GROUP'
      ? selectedAllianceRecord
      : undefined
  const activeGroups = useMemo(
    () =>
      Object.values(socialState.reality.alliances).filter(
        (alliance) =>
          humanPlayer &&
          allianceKind(alliance) === 'GROUP' &&
          isCurrentAlliance(alliance) &&
          alliance.memberIds.includes(humanPlayer.id)
      ),
    [humanPlayer, socialState.reality.alliances]
  )
  const pendingAllianceNaming = activeGroups
    .filter(
      (alliance) => alliance.initialNamePending === true && alliance.leaderId === humanPlayer?.id
    )
    .sort(
      (left, right) =>
        (left.createdAt?.day ?? 0) - (right.createdAt?.day ?? 0) || left.id.localeCompare(right.id)
    )[0]
  const initialAllianceNameDraft =
    initialAllianceNameDraftState.allianceId === pendingAllianceNaming?.id
      ? initialAllianceNameDraftState.value
      : ''
  const formerGroups = useMemo(
    () =>
      Object.values(socialState.reality.alliances).filter(
        (alliance) =>
          humanPlayer &&
          allianceKind(alliance) === 'GROUP' &&
          !activeGroups.includes(alliance) &&
          isFormerAllianceMember(alliance, humanPlayer.id) &&
          alliance.provenance !== 'SOURCE'
      ),
    [activeGroups, humanPlayer, socialState.reality.alliances]
  )
  const invitationGroups = useMemo(
    () =>
      !primaryTargetId ||
      !humanPlayer ||
      !game.players.some(
        (player) =>
          player.id === primaryTargetId && player.status !== 'evicted' && player.status !== 'jury'
      )
        ? []
        : activeGroups.filter(
            (alliance) =>
              !alliance.memberIds.includes(primaryTargetId) &&
              alliance.memberIds.length < ALLIANCE_LIMITS.groupMembers &&
              !Object.values(socialState.reality.allianceManagement.requests).some(
                (request) =>
                  request.kind === 'ADMIT' &&
                  request.allianceId === alliance.id &&
                  (isPendingAllianceRequest(request) ||
                    (request.candidateId === primaryTargetId &&
                      ['DECLINED', 'EXPIRED'].includes(request.status) &&
                      request.settledAt?.day === game.week))
              )
          ),
    [activeGroups, primaryTargetId, humanPlayer, socialState.reality, game.players, game.week]
  )

  useEffect(() => {
    const openAllianceActions = () => setMoveFilter('alliances')
    window.addEventListener('reality-social-tutorial:open-alliances', openAllianceActions)
    return () =>
      window.removeEventListener('reality-social-tutorial:open-alliances', openAllianceActions)
  }, [])
  const [executing, setExecuting] = useState(false)
  const [pregnancyRolePromptOpen, setPregnancyRolePromptOpen] = useState(false)
  const [socialTutorialVariant, setSocialTutorialVariant] = useState<SocialTutorialVariant | null>(
    () =>
      socialPanelOpen ? resolveSocialTutorialVariant(activeProfileId, isGuest, dramaMode) : null
  )
  const [socialTutorialTourOpen, setSocialTutorialTourOpen] = useState(false)
  const [, refreshContextualGuides] = useState(0)

  useEffect(() => {
    if (!socialPanelOpen) {
      // Resetting the local tour session here intentionally follows the external panel state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSocialTutorialVariant(null)
      setSocialTutorialTourOpen(false)
      return
    }
    if (dramaMode) armRealityUpgradeTutorial(activeProfileId, isGuest)
    setSocialTutorialVariant(resolveSocialTutorialVariant(activeProfileId, isGuest, dramaMode))
    setSocialTutorialTourOpen(false)
  }, [activeProfileId, dramaMode, isGuest, socialPanelOpen])

  useEffect(
    () =>
      subscribeTutorialPreferenceChanges(() => {
        if (!socialPanelOpen) return
        setSocialTutorialVariant(resolveSocialTutorialVariant(activeProfileId, isGuest, dramaMode))
      }),
    [activeProfileId, dramaMode, isGuest, socialPanelOpen]
  )

  const publicFocus = useMemo(() => {
    if (!activePublicDirection || !humanPlayer) return null
    const relatedId = activePublicDirection.relatedPlayerId
    if (!relatedId) return null

    // A "target this player" directive is not fulfilled by talking to the
    // target. Before nominations, the actionable social route is to pitch that
    // target to the current LOH. If the human is LOH, the real next action is
    // the ceremony itself, so deliberately offer no misleading Social shortcut.
    if (activePublicDirection.type === 'target_player') {
      if (!game.lohId || game.lohId === humanPlayer.id) return null
      if (!['loh_results', 'social_1', 'nominations'].includes(game.phase)) return null
      if (!socialActions.some((action) => action.id === 'pitch_target')) return null
      return { actionId: 'pitch_target', primaryTargetId: game.lohId, subjectId: relatedId }
    }

    const actionByType: Partial<Record<typeof activePublicDirection.type, string>> = {
      align_with: 'proposeAlliance',
      break_alliance: dramaMode ? 'break_alliance' : 'betray',
      reinforce_alliance: 'ally',
      repair_relationship: 'apologize',
      apologize: 'apologize',
      get_closer: 'compliment',
      protect_player: 'protect',
      show_loyalty: 'ally',
      expose_player: 'rumor',
      start_drama: 'startFight',
      confront_player: 'confront',
    }
    const actionId = actionByType[activePublicDirection.type]
    return actionId ? { actionId, primaryTargetId: relatedId, subjectId: null } : null
  }, [activePublicDirection, dramaMode, game.lohId, game.phase, humanPlayer, socialActions])
  const handleRealityUpgrade = useCallback(() => {
    dispatch(closeSocialPanel())
    navigate('/store')
  }, [dispatch, navigate])
  const successPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const allianceSelectionPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const executeGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isExecutingRef = useRef(false)
  const socialBodyRef = useRef<HTMLDivElement | null>(null)
  const focusPublicRequest = useCallback(() => {
    if (!publicFocus) return
    setPrimaryTargetId(publicFocus.primaryTargetId)
    setSelectedTargets(new Set([publicFocus.primaryTargetId]))
    setSelectedActionId(
      (activePublicDirection?.progressPercent ?? 0) <= 0 ? publicFocus.actionId : null
    )
    setSelectedSubjectId(publicFocus.subjectId)
  }, [activePublicDirection, publicFocus])
  const publicRequestProgress = activePublicDirection
    ? getPublicRequestProgressStage(activePublicDirection)
    : null
  useEffect(
    () => () => {
      if (successPulseTimerRef.current !== null) {
        clearTimeout(successPulseTimerRef.current)
      }
      if (executeGuardTimerRef.current !== null) {
        clearTimeout(executeGuardTimerRef.current)
      }
      if (allianceSelectionPulseTimerRef.current !== null) {
        clearTimeout(allianceSelectionPulseTimerRef.current)
      }
    },
    []
  )

  function resetPanelSelection() {
    setSelectedTargets(new Set())
    setPrimaryTargetId(null)
    setSelectedActionId(null)
    setSelectedSubjectId(null)
    setFeedbackMsg(null)
    setActiveReceiptId(null)
    setMultiSelectActive(false)
    setSelectedAllianceId(null)
    setSelectedAllianceHistoryEventId(null)
    setSelectedPactHistoryEventId(null)
    setAllianceSelectionPulse(false)
    if (allianceSelectionPulseTimerRef.current !== null) {
      clearTimeout(allianceSelectionPulseTimerRef.current)
      allianceSelectionPulseTimerRef.current = null
    }
  }

  const clearCurrentOutcome = useCallback(() => {
    setFeedbackMsg(null)
    setActiveReceiptId(null)
  }, [])

  function selectAlliance(id: string | null) {
    setAllianceSelectionPulse(false)
    if (allianceSelectionPulseTimerRef.current !== null) {
      clearTimeout(allianceSelectionPulseTimerRef.current)
      allianceSelectionPulseTimerRef.current = null
    }
    setSelectedAllianceId(id)
    setSelectedAllianceHistoryEventId(null)
    setSelectedPactHistoryEventId(null)
    if (
      selectedActionId !== 'consult_alliance' &&
      !selectedActionId?.startsWith('alliance:invite:')
    ) {
      setSelectedActionId(null)
      setSelectedTargets(primaryTargetId ? new Set([primaryTargetId]) : new Set())
    }
    setSelectedSubjectId(null)
    setAllianceNameDraft('')
    setMultiSelectActive(false)
    clearCurrentOutcome()
  }

  const allianceQuickActions = useMemo<AllianceQuickAction[]>(() => {
    if (!dramaMode || !humanPlayer) return []

    const reality = socialState.reality
    const humanId = humanPlayer.id
    const targetId = primaryTargetId
    const playerName = (id: string) =>
      game.players.find((player) => player.id === id)?.name ?? 'Hubmate'
    const currentCommitments = Object.values(reality.alliances).filter(
      (alliance) => isCurrentAlliance(alliance) && alliance.memberIds.includes(humanId)
    )
    const groups = currentCommitments.filter((alliance) => allianceKind(alliance) === 'GROUP')
    const counts = currentAllianceCounts(reality, humanId)
    const actions: AllianceQuickAction[] = []

    if (!selectedAllianceId && counts.groups < ALLIANCE_LIMITS.groupsPerMember) {
      actions.push({
        action: allianceAction(
          'alliance:found',
          'Found an alliance',
          'Choose at least two hubmates. Everyone must agree before the group becomes active.',
          '✦',
          'multi',
          2,
          3,
          0.5
        ),
        executeLabel: 'Propose group',
        allowWithoutTarget: true,
        buildCommand: (targetIds) => {
          const memberIds = [...new Set([humanId, ...targetIds])]
          return {
            type: 'PROPOSE',
            kind: 'FOUND',
            actorId: humanId,
            memberIds,
            leaderId: humanId,
          }
        },
      })
    }

    for (const request of Object.values(reality.allianceManagement?.requests ?? {})) {
      if ((request.allianceId ?? null) !== selectedAllianceId) continue
      if (
        !isPendingAllianceRequest(request) ||
        !canSeeAllianceRequest(request, humanId) ||
        request.proposerId !== humanId
      )
        continue
      const canAnswer = allianceRequestDecisionActors(request).includes(humanId)
      const groupName = request.allianceId
        ? (reality.alliances[request.allianceId]?.name ?? request.name ?? 'the alliance')
        : (request.name ?? 'the alliance')
      const requestLabel =
        request.kind === 'PACT'
          ? `personal pact with ${playerName(request.memberIds.find((id) => id !== humanId) ?? '')}`
          : request.kind === 'FOUND'
            ? `founding roster for ${groupName}`
            : request.kind === 'ADMIT'
              ? `invitation to ${groupName}`
              : request.kind === 'APPOINT'
                ? `co-leader offer for ${groupName}`
                : request.kind === 'TRANSFER'
                  ? `leadership offer for ${groupName}`
                  : request.kind === 'RENAME_SUGGESTION'
                    ? `rename suggestion for ${groupName}`
                    : `removal suggestion for ${groupName}`

      if (canAnswer) {
        actions.push(
          {
            action: allianceAction(
              `alliance:accept:${request.id}`,
              request.status === 'VOTING' ? 'Approve request' : 'Accept request',
              `Approve the ${requestLabel}.`,
              '✓'
            ),
            executeLabel: request.status === 'VOTING' ? 'Approve' : 'Accept',
            allowWithoutTarget: true,
            buildCommand: () => ({
              type: 'RESPOND',
              requestId: request.id,
              actorId: humanId,
              accept: true,
            }),
          },
          {
            action: allianceAction(
              `alliance:decline:${request.id}`,
              request.status === 'VOTING' ? 'Vote no' : 'Decline request',
              `Reject the ${requestLabel}.`,
              '×'
            ),
            executeLabel: request.status === 'VOTING' ? 'Vote no' : 'Decline',
            allowWithoutTarget: true,
            buildCommand: () => ({
              type: 'RESPOND',
              requestId: request.id,
              actorId: humanId,
              accept: false,
            }),
          }
        )
      }

      if (request.proposerId === humanId) {
        actions.push({
          action: allianceAction(
            `alliance:withdraw:${request.id}`,
            'Withdraw request',
            `Cancel the pending ${requestLabel}. Recorded decisions will no longer apply.`,
            '↩'
          ),
          executeLabel: 'Withdraw',
          allowWithoutTarget: true,
          buildCommand: () => ({ type: 'WITHDRAW', requestId: request.id, actorId: humanId }),
        })
      }
    }

    for (const group of groups.filter((entry) => entry.id === selectedAllianceId)) {
      const groupName = group.name ?? 'alliance group'
      const leader = group.leaderId === humanId
      actions.push({
        action: allianceAction(
          `alliance:leave:${group.id}`,
          `Leave ${groupName}`,
          'End your membership in this group. Other pacts and group memberships stay intact.',
          '↗'
        ),
        executeLabel: 'Leave group',
        allowWithoutTarget: true,
        buildCommand: () => ({ type: 'LEAVE', allianceId: group.id, actorId: humanId }),
      })
      actions.push({
        action: allianceAction(
          `alliance:${leader ? 'rename' : 'suggest-rename'}:${group.id}`,
          leader ? `Rename ${groupName}` : `Suggest a new name for ${groupName}`,
          leader
            ? 'Choose the name for this group.'
            : 'Send a name idea to the group leader for approval.',
          '✎'
        ),
        executeLabel: leader ? 'Rename alliance' : 'Suggest name',
        allowWithoutTarget: true,
        namePrompt: {
          label: leader ? 'New alliance name' : 'Suggested alliance name',
          initialValue: leader ? groupName : '',
          hint: leader
            ? 'The new name is visible to the group.'
            : 'The leader decides whether to use it.',
        },
        buildCommand: () =>
          leader
            ? { type: 'RENAME', allianceId: group.id, actorId: humanId, name: allianceNameDraft }
            : {
                type: 'SUGGEST_RENAME',
                allianceId: group.id,
                actorId: humanId,
                name: allianceNameDraft,
              },
      })
      if (leader) {
        if (group.coLeaderId) {
          actions.push({
            action: allianceAction(
              `alliance:clear-coleader:${group.id}`,
              `Clear ${groupName} co-leader`,
              `${playerName(group.coLeaderId)} returns to regular member status.`,
              '◇'
            ),
            executeLabel: 'Clear role',
            allowWithoutTarget: true,
            buildCommand: () => ({
              type: 'CLEAR_COLEADER',
              allianceId: group.id,
              actorId: humanId,
            }),
          })
        }
        actions.push({
          action: allianceAction(
            `alliance:dissolve:${group.id}`,
            `Dissolve ${groupName}`,
            'End this group for every member. Independent personal pacts remain active.',
            '⊘'
          ),
          executeLabel: 'Dissolve group',
          allowWithoutTarget: true,
          buildCommand: () => ({ type: 'DISSOLVE', allianceId: group.id, actorId: humanId }),
        })
      }

      if (!targetId || targetId === humanId) continue
      const targetIsMember = group.memberIds.includes(targetId)
      if (!targetIsMember) continue

      if (targetId !== group.leaderId && (leader || targetId !== group.coLeaderId)) {
        const officer = group.leaderIds.includes(humanId)
        actions.push({
          action: allianceAction(
            `alliance:${officer ? 'remove' : 'suggest-remove'}:${group.id}:${targetId}`,
            officer ? `Remove ${playerName(targetId)}` : `Suggest removing ${playerName(targetId)}`,
            officer
              ? `End ${playerName(targetId)}'s membership in ${groupName}. Their other commitments remain.`
              : `Ask ${groupName}'s officers to remove ${playerName(targetId)}.`,
            '−',
            'primary'
          ),
          executeLabel: officer ? 'Remove member' : 'Send suggestion',
          buildCommand: () =>
            officer
              ? { type: 'REMOVE', allianceId: group.id, actorId: humanId, targetId }
              : {
                  type: 'PROPOSE',
                  kind: 'REMOVE_SUGGESTION',
                  allianceId: group.id,
                  actorId: humanId,
                  candidateId: targetId,
                },
        })
      }
      if (leader && targetId !== humanId) {
        if (group.coLeaderId !== targetId) {
          actions.push({
            action: allianceAction(
              `alliance:appoint:${group.id}:${targetId}`,
              `Offer co-leader to ${playerName(targetId)}`,
              `${playerName(targetId)} must accept before the role changes.`,
              '♢',
              'primary'
            ),
            executeLabel: 'Offer role',
            buildCommand: () => ({
              type: 'PROPOSE',
              kind: 'APPOINT',
              allianceId: group.id,
              actorId: humanId,
              candidateId: targetId,
            }),
          })
        }
        actions.push({
          action: allianceAction(
            `alliance:transfer:${group.id}:${targetId}`,
            `Offer leadership to ${playerName(targetId)}`,
            `${playerName(targetId)} must accept. You become a regular member afterward.`,
            '♛',
            'primary'
          ),
          executeLabel: 'Offer leadership',
          buildCommand: () => ({
            type: 'PROPOSE',
            kind: 'TRANSFER',
            allianceId: group.id,
            actorId: humanId,
            candidateId: targetId,
          }),
        })
      }
    }

    if (
      targetId &&
      targetId !== humanId &&
      invitationGroups.length > 0 &&
      (!selectedAllianceId || invitationGroups.some((group) => group.id === selectedAllianceId))
    ) {
      actions.push({
        action: allianceAction(
          `alliance:invite:${targetId}`,
          `Invite ${playerName(targetId)} to an alliance`,
          'Choose a group to vote on admitting this hubmate. An invitation follows approval.',
          '＋',
          'primary',
          undefined,
          1,
          0.5
        ),
        executeLabel: 'Start vote',
        buildCommand: () => ({
          type: 'PROPOSE',
          kind: 'ADMIT',
          allianceId: selectedAllianceId ?? '',
          actorId: humanId,
          candidateId: targetId,
        }),
      })
    }

    if (!selectedAllianceId && targetId && targetId !== humanId) {
      const pact = getCurrentPact(reality, humanId, targetId)
      if (pact) {
        if (pact.provenance === 'UNRESOLVED') {
          actions.push({
            action: allianceAction(
              `alliance:renew:${pact.id}`,
              `Renew pact with ${playerName(targetId)}`,
              'Ask both sides to confirm this older pact under the current rules.',
              '⟳',
              'primary',
              undefined,
              1
            ),
            executeLabel: 'Request renewal',
            buildCommand: () => ({
              type: 'PROPOSE',
              kind: 'PACT',
              actorId: humanId,
              candidateId: targetId,
              basePactId: pact.id,
            }),
          })
        }
        actions.push({
          action: allianceAction(
            `alliance:end-pact:${pact.id}`,
            `End pact with ${playerName(targetId)}`,
            'End only this personal pact. Shared groups and private promises remain.',
            '⨯',
            'primary'
          ),
          executeLabel: 'End pact',
          buildCommand: () => ({ type: 'LEAVE', allianceId: pact.id, actorId: humanId }),
        })
      }
    }

    return actions
  }, [
    allianceNameDraft,
    selectedAllianceId,
    invitationGroups,
    dramaMode,
    game.players,
    humanPlayer,
    primaryTargetId,
    socialState.reality,
  ])

  const pendingAllianceDecisionCount = useMemo(() => {
    if (!humanPlayer) return 0
    return Object.values(socialState.reality.allianceManagement?.requests ?? {}).filter(
      (request) =>
        isPendingAllianceRequest(request) &&
        canSeeAllianceRequest(request, humanPlayer.id) &&
        allianceRequestDecisionActors(request).includes(humanPlayer.id)
    ).length
  }, [humanPlayer, socialState.reality.allianceManagement?.requests])

  function handleClose() {
    if (!humanPlayer) {
      dispatch(closeSocialPanel())
      return
    }
    // The action-level receipts already appear in Hub Wire. A second session
    // tally is redundant in the permanent game log.
    if (sessionLogs.length > 0) dispatch(clearSessionLogs())
    resetPanelSelection()
    dispatch(closeSocialPanel())
  }

  const selectedAllianceAction = selectedActionId
    ? (allianceQuickActions.find((entry) => entry.action.id === selectedActionId) ?? null)
    : null
  const selectedAction = selectedActionId
    ? (SocialManeuvers.getActionById(selectedActionId) ?? selectedAllianceAction?.action ?? null)
    : null
  const targetMode = selectedAction ? resolveActionTargetMode(selectedAction, dramaMode) : 'primary'
  const isBatchCompatible =
    targetMode === 'primary' &&
    !selectedAction?.requiredTargetStatus &&
    selectedActionId !== 'proposeAlliance' &&
    selectedActionId !== 'consult_alliance'
  const isAllianceConsultation = selectedActionId === 'consult_alliance'
  const isAllianceInvitation = selectedActionId?.startsWith('alliance:invite:') === true
  const showAlliancePicker =
    dramaMode && (moveFilter === 'alliances' || isAllianceInvitation || isAllianceConsultation)
  const consultationTargetCandidates = [
    ...(primaryTargetId && (selectedTargets.size === 0 || selectedTargets.has(primaryTargetId))
      ? [primaryTargetId]
      : []),
    ...selectedTargets,
  ]
  const selectedAllianceConsultationTargets = selectedAlliance
    ? selectedAlliance.memberIds.filter(
        (memberId) =>
          memberId !== humanPlayer?.id &&
          game.players.some(
            (player) =>
              player.id === memberId && player.status !== 'evicted' && player.status !== 'jury'
          )
      )
    : null
  const selectedConsultationMemberId = selectedAllianceConsultationTargets
    ? (consultationTargetCandidates.find((id) =>
        selectedAllianceConsultationTargets.includes(id)
      ) ??
      selectedAllianceConsultationTargets[0] ??
      null)
    : (consultationTargetCandidates[0] ?? null)
  const eligibleConsultationAlliances = useMemo(() => {
    if (selectedAlliance && !isCurrentAlliance(selectedAlliance)) return []
    if (!selectedConsultationMemberId) return consultationAlliances
    return consultationAlliances.filter((alliance) =>
      alliance.memberIds.includes(selectedConsultationMemberId)
    )
  }, [consultationAlliances, selectedAlliance, selectedConsultationMemberId])
  const displayedGroups = isAllianceInvitation
    ? invitationGroups
    : isAllianceConsultation
      ? eligibleConsultationAlliances
      : activeGroups
  // Keep the full roster available while a group is selected: members can be
  // targeted for group controls, while non-members can be selected for invites.
  // A consultation is the one alliance action that intentionally clears the
  // person selection and uses the chosen group's representative instead.
  const showPlayerRoster = !isAllianceConsultation
  const selectedConsultationAlliance =
    eligibleConsultationAlliances.find((alliance) => alliance.id === selectedAllianceId) ?? null
  const consultationRepresentativeId = selectedConsultationAlliance
    ? selectedConsultationMemberId &&
      selectedConsultationAlliance.memberIds.includes(selectedConsultationMemberId)
      ? selectedConsultationMemberId
      : selectedConsultationAlliance.memberIds.find(
          (memberId) =>
            memberId !== humanPlayer?.id &&
            game.players.some(
              (player) =>
                player.id === memberId && player.status !== 'evicted' && player.status !== 'jury'
            )
        )
    : null
  const consultationEligibilityTargetId =
    (selectedConsultationMemberId &&
    eligibleConsultationAlliances.some((alliance) =>
      alliance.memberIds.includes(selectedConsultationMemberId)
    )
      ? selectedConsultationMemberId
      : null) ??
    (selectedConsultationAlliance ? consultationRepresentativeId : null) ??
    eligibleConsultationAlliances[0]?.memberIds.find(
      (memberId) =>
        memberId !== humanPlayer?.id &&
        game.players.some(
          (player) =>
            player.id === memberId && player.status !== 'evicted' && player.status !== 'jury'
        )
    ) ??
    null
  const usesMultipleTargets = targetMode === 'multi' || (multiSelectActive && isBatchCompatible)
  // A social visit always starts with the roster unselected. Contextual calls
  // can highlight an action, but never choose a housemate on the player's behalf.
  const effectivePrimaryTargetId = isAllianceConsultation
    ? (consultationRepresentativeId ?? null)
    : targetMode === 'none'
      ? null
      : primaryTargetId
  const selectedPlayerIds = useMemo(
    () =>
      selectedTargets.size > 0
        ? selectedTargets
        : effectivePrimaryTargetId
          ? new Set([effectivePrimaryTargetId])
          : selectedTargets,
    [effectivePrimaryTargetId, selectedTargets]
  )
  const selectedTargetCount = selectedTargets.size
  const minimumTargetCount = Math.max(1, selectedAction?.minTargets ?? 2)
  const needsTarget = targetMode !== 'none'
  const needsSubject = targetMode === 'primaryPlusSubject'
  const hasRequiredTargets =
    targetMode === 'multi'
      ? selectedTargetCount >= minimumTargetCount
      : usesMultipleTargets
        ? selectedTargetCount >= 1
        : !needsTarget || effectivePrimaryTargetId !== null
  const targetCount = usesMultipleTargets ? selectedTargetCount : 1

  const totalCosts = useMemo(() => {
    const baseCosts = selectedAction
      ? selectedAllianceAction
        ? normalizeActionCosts(selectedAction, selectedTargetCount, dramaMode)
        : SocialManeuvers.computeActionCosts(
            humanPlayer?.id ?? '',
            selectedAction,
            effectivePrimaryTargetId ?? humanPlayer?.id ?? '',
            undefined,
            isAllianceConsultation ? 1 : selectedTargetCount,
            dramaMode,
            selectedSubjectId ?? undefined
          )
      : null
    if (!baseCosts) return null
    if (selectedAllianceAction) {
      const command = selectedAllianceAction.buildCommand([...selectedTargets])
      const proposalPrice = allianceProposalPrice(command)
      if (proposalPrice) return proposalPrice
    }
    if (selectedActionId === 'group_chat') {
      return { ...baseCosts, energy: Math.max(2, selectedTargetCount) }
    }
    if (usesMultipleTargets && !isAllianceConsultation) {
      return {
        energy: baseCosts.energy * targetCount,
        influence: baseCosts.influence * targetCount,
        info: baseCosts.info * targetCount,
      }
    }
    return baseCosts
  }, [
    dramaMode,
    effectivePrimaryTargetId,
    humanPlayer?.id,
    selectedAction,
    selectedAllianceAction,
    selectedActionId,
    selectedTargets,
    selectedTargetCount,
    targetCount,
    isAllianceConsultation,
    usesMultipleTargets,
    selectedSubjectId,
  ])

  const energy = weekendActive
    ? (game.weekendInterlude?.wallet.energy ?? 0)
    : (energyBank?.[humanPlayer?.id ?? ''] ?? 0)
  const influence = weekendActive
    ? (game.weekendInterlude?.wallet.influence ?? 0)
    : (influenceBank?.[humanPlayer?.id ?? ''] ?? 0)
  const info = weekendActive
    ? (game.weekendInterlude?.wallet.info ?? 0)
    : (infoBank?.[humanPlayer?.id ?? ''] ?? 0)
  const hasExecutableSelection =
    Boolean(selectedActionId) &&
    Boolean(selectedAction) &&
    hasRequiredTargets &&
    (!needsSubject || selectedSubjectId !== null) &&
    (!isAllianceInvitation || invitationGroups.some((group) => group.id === selectedAllianceId)) &&
    (!selectedAllianceAction?.namePrompt || allianceNameDraft.trim().length >= 2)

  const executionEligibility = useMemo(() => {
    const eligibilityGame = weekendActive ? { ...game, phase: 'social_2' as const } : game
    if (!selectedAction || !humanPlayer) {
      return { eligible: false, reason: '' }
    }
    if (selectedAllianceAction) {
      if (
        isAllianceInvitation &&
        !invitationGroups.some((group) => group.id === selectedAllianceId)
      )
        return { eligible: false, reason: 'Choose an alliance for this invitation.' }
      if (targetMode === 'multi' && selectedTargetCount < minimumTargetCount) {
        return {
          eligible: false,
          reason: `Choose at least ${minimumTargetCount} hubmates for the founding roster.`,
        }
      }
      if (targetMode === 'primary' && !effectivePrimaryTargetId) {
        return { eligible: false, reason: 'Choose a hubmate first.' }
      }
      if (
        totalCosts &&
        (totalCosts.energy > energy || totalCosts.influence > influence || totalCosts.info > info)
      ) {
        const needed = [
          totalCosts.energy > energy ? `⚡${totalCosts.energy}` : null,
          totalCosts.influence > influence ? `🤝${totalCosts.influence}` : null,
          totalCosts.info > info ? `💡${totalCosts.info}` : null,
        ]
          .filter(Boolean)
          .join(', ')
        return {
          eligible: false,
          reason: `Insufficient resources — need ${needed}. Nothing will be spent.`,
        }
      }
      return { eligible: true, reason: '' }
    }
    if (!hasExecutableSelection) return { eligible: false, reason: '' }
    const targetIds =
      targetMode === 'none'
        ? []
        : usesMultipleTargets
          ? Array.from(selectedTargets)
          : effectivePrimaryTargetId
            ? [effectivePrimaryTargetId]
            : []

    if (isAllianceConsultation) {
      const hasCommonAlliance = Boolean(
        selectedConsultationAlliance &&
        selectedConsultationAlliance.memberIds.includes(humanPlayer.id) &&
        targetIds.every((targetId) => selectedConsultationAlliance.memberIds.includes(targetId))
      )
      if (!hasCommonAlliance) {
        return {
          eligible: false,
          reason: 'Choose one or more members of the selected alliance.',
        }
      }
    }

    if (usesMultipleTargets && targetMode !== 'multi') {
      for (const targetId of targetIds) {
        const result = validateSocialExecution(
          { game: eligibilityGame, settings, vip, social: socialState },
          {
            action: selectedAction,
            actorId: humanPlayer.id,
            targetIds: [targetId],
            subjectId: selectedSubjectId ?? undefined,
            requireCompleteSelection: true,
          }
        )
        if (!result.eligible) return result
      }
      return { eligible: true, reason: '' }
    }

    return validateSocialExecution(
      { game: eligibilityGame, settings, vip, social: socialState },
      {
        action: selectedAction,
        actorId: humanPlayer.id,
        targetIds,
        subjectId: selectedSubjectId ?? undefined,
        requireCompleteSelection: true,
      }
    )
  }, [
    effectivePrimaryTargetId,
    game,
    hasExecutableSelection,
    humanPlayer,
    isAllianceConsultation,
    isAllianceInvitation,
    invitationGroups,
    selectedAllianceId,
    minimumTargetCount,
    selectedAction,
    selectedAllianceAction,
    selectedSubjectId,
    selectedConsultationAlliance,
    selectedTargets,
    settings,
    socialState,
    targetMode,
    selectedTargetCount,
    usesMultipleTargets,
    totalCosts,
    energy,
    influence,
    info,
    vip,
    weekendActive,
  ])

  const canExecute = selectedReunionGuestId
    ? REUNION_ACTION_IDS.includes(selectedActionId as (typeof REUNION_ACTION_IDS)[number])
    : hasExecutableSelection && (executionEligibility.eligible || !executionEligibility.reason)

  const hiddenContextualActionIds = useMemo(() => {
    const hidden = new Set<string>()
    const isVoxPopuli = game.voxPopuli?.status === 'active'
    const beforeNominations = game.phase === 'social_1' && game.nomineeIds.length === 0
    const safetyDecisionOpen =
      ['pos_results', 'pos_ceremony'].includes(game.phase) &&
      Boolean(game.posWinnerId) &&
      !game.povSavedId
    const humanIsLoh = game.lohId === humanPlayer?.id
    const humanIsNominated = game.nomineeIds.includes(humanPlayer?.id ?? '')
    const disclosedDangerTargetId =
      game.lohSocialPlan?.week === game.week && game.lohSocialPlan.lohId === game.lohId
        ? game.lohSocialPlan.disclosedTargetByPlayerId?.[humanPlayer?.id ?? '']
        : undefined
    const alreadyWarnedDangerTarget = actionHistory.some(
      (entry) =>
        entry.actorId === humanPlayer?.id &&
        entry.targetId === disclosedDangerTargetId &&
        entry.actionId === 'warn_about_danger' &&
        entry.week === game.week
    )
    const lohPlanOpen = [
      'loh_results',
      'social_1',
      'nominations',
      'nomination_results',
      'pre_veto_public_save',
      'pos_comp_announcement',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
      'pos_ceremony_results',
      'social_2',
    ].includes(game.phase)
    if (isVoxPopuli) {
      socialActions
        .filter((action) => action.unavailableInVox)
        .forEach((action) => hidden.add(action.id))
    } else {
      socialActions.filter((action) => action.voxOnly).forEach((action) => hidden.add(action.id))
    }
    if (!beforeNominations) hidden.add('pitch_target')
    if (!lohPlanOpen || !game.lohId) hidden.add('ask_loh_target')
    if (!humanIsNominated || !game.lohId) hidden.add('ask_why_nominated')
    if (
      !disclosedDangerTargetId ||
      primaryTargetId !== disclosedDangerTargetId ||
      alreadyWarnedDangerTarget
    ) {
      hidden.add('warn_about_danger')
    }
    if (!safetyDecisionOpen) {
      hidden.add('ask_use_safety')
      hidden.add('ask_safety_plan')
      hidden.add('ask_hold_safety')
      hidden.add('suggest_replacement')
    } else if (!humanIsLoh) {
      hidden.add('ask_hold_safety')
    }
    if (weekendActive) {
      ;[
        'pitch_target',
        'suggest_replacement',
        'ask_use_safety',
        'ask_safety_plan',
        'ask_hold_safety',
        'ask_loh_target',
        'rally_votes_against',
        'vote_rally',
        'nominate',
        'try_for_baby',
        'pregnancy_test',
        'pregnancy_test_self',
        'paternity_test_self',
      ].forEach((actionId) => hidden.add(actionId))
    }
    return hidden
  }, [
    game.lohId,
    game.nomineeIds,
    game.phase,
    game.posWinnerId,
    game.povSavedId,
    game.lohSocialPlan,
    game.week,
    game.voxPopuli?.status,
    humanPlayer?.id,
    primaryTargetId,
    actionHistory,
    socialActions,
    weekendActive,
  ])

  const handleActionClick = useCallback(
    (actionId: string) => {
      if (selectedActionId === actionId) {
        setSelectedActionId(null)
        setSelectedSubjectId(null)
        setAllianceNameDraft('')
        setMultiSelectActive(false)
        clearCurrentOutcome()
        return
      }

      const nextAction =
        SocialManeuvers.getActionById(actionId) ??
        allianceQuickActions.find((entry) => entry.action.id === actionId)?.action
      const nextAllianceAction = allianceQuickActions.find((entry) => entry.action.id === actionId)
      const nextMode = nextAction ? resolveActionTargetMode(nextAction, dramaMode) : 'primary'
      const nextBatchCompatible =
        nextMode === 'primary' &&
        !nextAction?.requiredTargetStatus &&
        actionId !== 'proposeAlliance' &&
        actionId !== 'consult_alliance'
      const needsAllianceChoice =
        (actionId === 'consult_alliance' &&
          eligibleConsultationAlliances.length > 1 &&
          !eligibleConsultationAlliances.some((alliance) => alliance.id === selectedAllianceId)) ||
        (actionId.startsWith('alliance:invite:') &&
          invitationGroups.length > 0 &&
          !invitationGroups.some((alliance) => alliance.id === selectedAllianceId))
      if (needsAllianceChoice) {
        setAllianceSelectionPulse(true)
        if (allianceSelectionPulseTimerRef.current !== null) {
          clearTimeout(allianceSelectionPulseTimerRef.current)
        }
        allianceSelectionPulseTimerRef.current = setTimeout(() => {
          setAllianceSelectionPulse(false)
          allianceSelectionPulseTimerRef.current = null
        }, 1750)
      }
      if (nextMode === 'multi') {
        setMultiSelectActive(true)
      } else if (!nextBatchCompatible && primaryTargetId) {
        setSelectedTargets(new Set([primaryTargetId]))
        setMultiSelectActive(false)
      }
      if (actionId === 'consult_alliance' || actionId.startsWith('alliance:invite:')) {
        setMoveFilter('alliances')
        if (actionId === 'consult_alliance') {
          const currentAllianceIsEligible = eligibleConsultationAlliances.some(
            (alliance) => alliance.id === selectedAllianceId
          )
          setSelectedAllianceId(
            currentAllianceIsEligible
              ? selectedAllianceId
              : eligibleConsultationAlliances.length === 1
                ? eligibleConsultationAlliances[0].id
                : null
          )
        } else {
          setSelectedTargets(primaryTargetId ? new Set([primaryTargetId]) : new Set())
        }
        setMultiSelectActive(false)
      }
      setSelectedActionId(actionId)
      setAllianceNameDraft(nextAllianceAction?.namePrompt?.initialValue ?? '')
      setSelectedSubjectId(null)
      clearCurrentOutcome()
    },
    [
      allianceQuickActions,
      dramaMode,
      invitationGroups,
      primaryTargetId,
      selectedActionId,
      selectedAllianceId,
      eligibleConsultationAlliances,
      clearCurrentOutcome,
    ]
  )

  const handleSelectionChange = useCallback(
    (ids: Set<string>, details: { primaryTargetId: string | null }) => {
      const selectedReunionGuest = finaleReunionSocialOpen
        ? Array.from(ids).find((id) => reunionGuestIds.has(id))
        : undefined
      if (selectedReunionGuest) {
        setSelectedTargets(new Set([selectedReunionGuest]))
        setPrimaryTargetId(selectedReunionGuest)
        setSelectedActionId(null)
        setSelectedSubjectId(null)
        setSelectedPactHistoryEventId(null)
        setMultiSelectActive(false)
        clearCurrentOutcome()
        return
      }

      if (usesMultipleTargets) {
        setSelectedTargets(new Set(ids))
        setPrimaryTargetId(details.primaryTargetId)
      } else {
        const nextPrimaryTargetId = details.primaryTargetId
        setSelectedTargets(nextPrimaryTargetId ? new Set([nextPrimaryTargetId]) : new Set())
        setPrimaryTargetId(nextPrimaryTargetId)
      }
      setSelectedSubjectId(null)
      setSelectedPactHistoryEventId(null)
      clearCurrentOutcome()

      if (
        ids.size === 0 &&
        selectedAction &&
        resolveActionTargetMode(selectedAction, dramaMode) !== 'none'
      ) {
        setSelectedActionId(null)
        setMultiSelectActive(false)
        return
      }

      if (selectedAction?.requiredTargetStatus) {
        const nextTargetStatus = details.primaryTargetId
          ? game.players.find((player) => player.id === details.primaryTargetId)?.status
          : null
        if (!nextTargetStatus || !selectedAction.requiredTargetStatus.includes(nextTargetStatus)) {
          setSelectedActionId(null)
        }
      }
    },
    [
      dramaMode,
      finaleReunionSocialOpen,
      game.players,
      reunionGuestIds,
      selectedAction,
      usesMultipleTargets,
      clearCurrentOutcome,
    ]
  )

  const finishInitialAllianceNaming = useCallback(
    (keepSuggestedName: boolean) => {
      if (!pendingAllianceNaming || !humanPlayer) return
      clearCurrentOutcome()
      const result = keepSuggestedName
        ? dispatch(
            executeAllianceManagementCommand({
              type: 'KEEP_INITIAL_NAME',
              allianceId: pendingAllianceNaming.id,
              actorId: humanPlayer.id,
            })
          )
        : dispatch(
            executeAllianceManagementCommand({
              type: 'RENAME',
              allianceId: pendingAllianceNaming.id,
              actorId: humanPlayer.id,
              name: initialAllianceNameDraft.trim(),
            })
          )
      setFeedbackMsg(result.reason)
      if (result.status === 'REJECTED') return
      setSelectedAllianceId(pendingAllianceNaming.id)
      setMoveFilter('alliances')
      setInitialAllianceNameDraftState({ allianceId: null, value: '' })
    },
    [dispatch, humanPlayer, initialAllianceNameDraft, pendingAllianceNaming, clearCurrentOutcome]
  )

  const handleExecute = useCallback(() => {
    if (
      selectedReunionGuestId &&
      REUNION_ACTION_IDS.includes(selectedActionId as (typeof REUNION_ACTION_IDS)[number])
    ) {
      clearCurrentOutcome()
      const targetName =
        game.players.find((player) => player.id === selectedReunionGuestId)?.name ??
        'Your former Hubmate'
      setFeedbackMsg(
        selectedActionId === 'apologize'
          ? `${targetName} appreciates your apology. Some of the old tension finally lifts.`
          : `${targetName} smiles at the kind words. It feels good to end the night warmly.`
      )
      setSelectedActionId(null)
      return
    }

    if (
      !hasExecutableSelection ||
      !humanPlayer ||
      !selectedAction ||
      !selectedActionId ||
      isExecutingRef.current
    ) {
      return
    }

    if (
      selectedActionId === 'try_for_baby' &&
      !humanPlayer.sex &&
      game.pregnancyStory?.humanRoleChoice === undefined
    ) {
      setPregnancyRolePromptOpen(true)
      clearCurrentOutcome()
      return
    }

    isExecutingRef.current = true
    setExecuting(true)
    clearCurrentOutcome()
    setPregnancyCelebration(false)

    const targetIds =
      targetMode === 'none'
        ? [humanPlayer.id]
        : usesMultipleTargets
          ? Array.from(selectedTargets)
          : effectivePrimaryTargetId
            ? [effectivePrimaryTargetId]
            : []

    const releaseGuard = () => {
      isExecutingRef.current = false
      setExecuting(false)
    }

    try {
      if (targetIds.length === 0) {
        setFeedbackMsg('Select a player to continue.')
        releaseGuard()
        return
      }
      if (targetMode === 'multi' && targetIds.length < minimumTargetCount) {
        setFeedbackMsg(
          minimumTargetCount === 1
            ? 'Select at least one hubmate.'
            : `Select at least ${minimumTargetCount} hubmates for this group action.`
        )
        releaseGuard()
        return
      }
      if (!executionEligibility.eligible) {
        setFeedbackMsg(executionEligibility.reason || 'This action is not available now.')
        releaseGuard()
        return
      }
      if (selectedAllianceAction) {
        const previousLogIds = new Set(
          appStore.getState().social.sessionLogs.map((entry) => entry.id)
        )
        const managed = dispatch(
          executeAllianceManagementCommand(
            selectedAllianceAction.buildCommand(targetIds),
            totalCosts ?? undefined
          )
        )
        setFeedbackMsg(managed.receiptRecorded ? '' : managed.reason)
        const newReceipt = appStore
          .getState()
          .social.sessionLogs.filter(
            (entry) => entry.id && !previousLogIds.has(entry.id) && entry.source === 'manual'
          )
          .at(-1)
        setActiveReceiptId(
          managed.receiptRecorded ? (newReceipt?.receipt?.groupId ?? newReceipt?.id ?? null) : null
        )
        if (managed.status !== 'REJECTED') {
          setSelectedActionId(null)
          setAllianceNameDraft('')
          setSuccessPulse(true)
          if (selectedAllianceAction.action.id === 'alliance:found') {
            setSelectedTargets(new Set())
            setPrimaryTargetId(null)
            setMultiSelectActive(false)
          }
          if (successPulseTimerRef.current !== null) clearTimeout(successPulseTimerRef.current)
          successPulseTimerRef.current = setTimeout(() => {
            setSuccessPulse(false)
            successPulseTimerRef.current = null
          }, 850)
        }
        if (executeGuardTimerRef.current !== null) clearTimeout(executeGuardTimerRef.current)
        executeGuardTimerRef.current = setTimeout(() => {
          releaseGuard()
          executeGuardTimerRef.current = null
        }, EXECUTE_REENTRY_GUARD_MS)
        return
      }
      if (!totalCosts || !SocialManeuvers.canAfford(humanPlayer.id, totalCosts)) {
        const needs = [
          totalCosts && totalCosts.energy > energy ? `⚡${totalCosts.energy}` : null,
          totalCosts && totalCosts.influence > influence ? `🤝${totalCosts.influence}` : null,
          totalCosts && totalCosts.info > info ? `💡${totalCosts.info}` : null,
        ]
          .filter(Boolean)
          .join(', ')
        const onlyEnergyShort =
          Boolean(totalCosts) &&
          totalCosts!.energy > energy &&
          totalCosts!.influence <= influence &&
          totalCosts!.info <= info
        setFeedbackMsg(
          `Insufficient resources${
            onlyEnergyShort ? ': insufficient energy' : ''
          }${needs ? ` — need ${needs}` : ''}. Nothing was spent.`
        )
        releaseGuard()
        return
      }
      if (
        targetIds.some((targetId) => {
          const target = game.players.find((player) => player.id === targetId)
          return !target || target.status === 'evicted' || target.status === 'jury'
        })
      ) {
        setFeedbackMsg('Cannot target an eliminated or Tribunal player.')
        releaseGuard()
        return
      }

      const consultationOptions =
        selectedActionId === 'consult_alliance'
          ? {
              consultationScope: 'alliance' as const,
              consultationAllianceId: selectedConsultationAlliance?.id,
            }
          : {}
      const previousLogIds = new Set(
        appStore.getState().social.sessionLogs.map((entry) => entry.id)
      )
      const results: ExecuteActionResult[] =
        targetMode === 'multi'
          ? [
              dispatch(
                executeHumanRealityAction({
                  actorId: humanPlayer.id,
                  targetId: targetIds[0],
                  targetIds,
                  actionId: selectedActionId,
                  ...consultationOptions,
                  subjectId: selectedSubjectId ?? undefined,
                  costOverride: totalCosts,
                })
              ),
            ]
          : targetMode !== 'none' && targetIds.length === 1 && !usesMultipleTargets
            ? [
                dispatch(
                  executeHumanRealityAction({
                    actorId: humanPlayer.id,
                    targetId: targetIds[0],
                    actionId: selectedActionId,
                    ...consultationOptions,
                    subjectId: selectedSubjectId ?? undefined,
                    costOverride: totalCosts,
                  })
                ),
              ]
            : targetMode === 'none'
              ? [
                  dispatch(
                    executeHumanRealityAction({
                      actorId: humanPlayer.id,
                      targetId: humanPlayer.id,
                      targetIds: [],
                      actionId: selectedActionId,
                      ...consultationOptions,
                      costOverride: totalCosts,
                    })
                  ),
                ]
              : [
                  dispatch(
                    executeHumanRealityAction({
                      actorId: humanPlayer.id,
                      targetId: targetIds[0],
                      targetIds,
                      actionId: selectedActionId,
                      ...consultationOptions,
                      subjectId: selectedSubjectId ?? undefined,
                      costOverride: totalCosts,
                    })
                  ),
                ]

      const successfulResults = results.filter((result) => result.success)
      const firstResult = results[0]
      setPregnancyCelebration(firstResult.label === 'Positive')
      // An empty string keeps the saved result visible even if spending the
      // last resource makes the selected action unavailable for another try.
      setFeedbackMsg(firstResult.receiptRecorded ? '' : firstResult.summary)
      const newReceipt = appStore
        .getState()
        .social.sessionLogs.filter((entry) => entry.id && !previousLogIds.has(entry.id))
        .at(-1)
      setActiveReceiptId(
        firstResult.receiptId ?? newReceipt?.receipt?.groupId ?? newReceipt?.id ?? null
      )

      if (successfulResults.length > 0) {
        const targetNames = targetIds.map(
          (targetId) => game.players.find((player) => player.id === targetId)?.name ?? targetId
        )
        const subjectName = selectedSubjectId
          ? (game.players.find((player) => player.id === selectedSubjectId)?.name ??
            selectedSubjectId)
          : null
        const actionTitle = getSocialActionPresentation(selectedAction).title
        const persistentText =
          selectedActionId === 'group_chat'
            ? `You hosted a group chat with ${formatPlayerNames(targetNames)}.`
            : selectedActionId === 'ask_loh_target' ||
                selectedActionId === 'ask_nomination_advice' ||
                selectedActionId === 'ask_player_opinion' ||
                selectedActionId === 'share_pregnancy_news' ||
                selectedActionId === 'pregnancy_test_self' ||
                selectedActionId === 'paternity_test_self'
              ? firstResult.summary
              : subjectName
                ? `You used ${actionTitle} with ${targetNames[0]} about ${subjectName}.`
                : getSocialNarrative(selectedActionId, formatPlayerNames(targetNames), Date.now())
        dispatch(
          addTvEvent({
            text: persistentText,
            type: 'social',
            source: 'manual',
            channels: ['mainLog'],
            // Player-action receipts belong in the activity strip, not on the
            // broadcast.  The Faux TV is reserved for house-wide consequences.
            meta: { suppressTv: true },
          })
        )
        setSuccessPulse(true)
        if (successPulseTimerRef.current !== null) {
          clearTimeout(successPulseTimerRef.current)
        }
        successPulseTimerRef.current = setTimeout(() => {
          setSuccessPulse(false)
          setRelationshipPulseDeltas(new Map())
          successPulseTimerRef.current = null
        }, 850)

        const immediateDeltas = new Map<string, number>()
        for (const result of successfulResults) {
          for (const [targetId, delta] of Object.entries(result.targetDeltas ?? {})) {
            if (delta !== 0) immediateDeltas.set(targetId, delta)
          }
        }
        setRelationshipPulseDeltas(immediateDeltas)
      }

      if (executeGuardTimerRef.current !== null) {
        clearTimeout(executeGuardTimerRef.current)
      }
      executeGuardTimerRef.current = setTimeout(() => {
        releaseGuard()
        executeGuardTimerRef.current = null
      }, EXECUTE_REENTRY_GUARD_MS)
    } catch (error) {
      console.error('Social action execution failed:', error)
      setFeedbackMsg(
        'That move was interrupted. Check your activity and resources before retrying.'
      )
      setSelectedActionId(null)
      setMultiSelectActive(false)
      if (executeGuardTimerRef.current !== null) {
        clearTimeout(executeGuardTimerRef.current)
        executeGuardTimerRef.current = null
      }
      releaseGuard()
    }
  }, [
    dispatch,
    appStore,
    clearCurrentOutcome,
    effectivePrimaryTargetId,
    energy,
    executionEligibility,
    game.players,
    game.pregnancyStory,
    hasExecutableSelection,
    humanPlayer,
    info,
    influence,
    selectedAction,
    selectedActionId,
    selectedAllianceAction,
    selectedReunionGuestId,
    minimumTargetCount,
    selectedConsultationAlliance,
    selectedSubjectId,
    selectedTargets,
    targetMode,
    totalCosts,
    usesMultipleTargets,
  ])

  const hasSocialHumanPlayer = Boolean(humanPlayer)
  useEffect(() => {
    const body = socialBodyRef.current
    const focus = body?.querySelector<HTMLElement>('.sp2-focus--active')
    if (!body) return

    if (!focus || !body.classList.contains('sp2-body--focused-target')) {
      body.style.removeProperty('--sp2-focused-row-offset')
      return
    }

    const measureStickyOffset = () =>
      body.style.setProperty(
        '--sp2-focused-row-offset',
        `${Math.max(0, focus.getBoundingClientRect().height - 4)}px`
      )

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureStickyOffset)
    resizeObserver?.observe(focus)
    measureStickyOffset()

    return () => {
      resizeObserver?.disconnect()
      body.style.removeProperty('--sp2-focused-row-offset')
    }
  }, [
    open,
    hasSocialHumanPlayer,
    primaryTargetId,
    selectedTargets.size,
    multiSelectActive,
    selectedAllianceId,
    selectedActionId,
  ])

  if (!open || !humanPlayer) return null

  const allNonUser = game.players.filter((player) => !player.isUser && player.status !== 'evicted')
  const activePlayers = allNonUser.filter((player) => player.status !== 'jury')
  const juryPlayers = allNonUser.filter((player) => player.status === 'jury')
  // Daily immunity in Vox Populi is not a leadership office. Adapt only the
  // Social panel's display copy; the stored role remains untouched for rules.
  const orderedPlayers = (
    game.voxPopuli?.status === 'active'
      ? [...activePlayers, ...juryPlayers].map((player) => {
          if (player.id !== game.lohId) return player
          if (player.status === 'loh') return { ...player, status: 'active' as const }
          if (player.status === 'loh+pos') return { ...player, status: 'pos' as const }
          return player
        })
      : [...activePlayers, ...juryPlayers]
  ) as Player[]
  const reunionGuests = finaleReunionSocialOpen
    ? game.players.filter((player) => player.status === 'evicted' && reunionGuestIds.has(player.id))
    : []
  const rosterPlayers = finaleReunionSocialOpen
    ? [...orderedPlayers, ...reunionGuests]
    : orderedPlayers
  const disabledPlayerIds = finaleReunionSocialOpen ? [] : juryPlayers.map((player) => player.id)

  const deltasByTargetId = new Map<string, number>()
  const currentRels = relationships?.[humanPlayer.id] ?? {}
  const snapshotRels = weekStartRelSnapshot[humanPlayer.id] ?? {}
  for (const [targetId, relationship] of Object.entries(currentRels)) {
    const weeklyDelta = relationship.affinity - (snapshotRels[targetId] ?? 0)
    if (weeklyDelta !== 0) deltasByTargetId.set(targetId, weeklyDelta)
  }

  const subjectCandidates =
    needsSubject && effectivePrimaryTargetId && selectedAction?.subjectPool
      ? getSubjectCandidates(
          selectedAction.subjectPool,
          effectivePrimaryTargetId,
          selectedAction.allowActorAsSubject ? [...orderedPlayers, humanPlayer] : orderedPlayers,
          game.nomineeIds,
          humanPlayer.id,
          relationships,
          selectedAction.allowActorAsSubject
        )
      : []

  // Keep the player's chosen hubmate in the read panel while they browse
  // moves. Some moves do not require a target to execute, but selecting one
  // should not erase the context the player just chose.
  const focusedTargetId = primaryTargetId
  const focusedPlayer = focusedTargetId
    ? (rosterPlayers.find((player) => player.id === focusedTargetId) ?? null)
    : null
  const collapseRosterForFocusedPlayer =
    Boolean(focusedPlayer) && !usesMultipleTargets && !showAlliancePicker && !selectedAlliance
  const selectedReunionGuest = selectedReunionGuestId
    ? (rosterPlayers.find((player) => player.id === selectedReunionGuestId) ?? null)
    : null
  const focusedOutward = focusedPlayer
    ? relationships?.[humanPlayer.id]?.[focusedPlayer.id]
    : undefined
  const focusedInward = focusedPlayer
    ? relationships?.[focusedPlayer.id]?.[humanPlayer.id]
    : undefined
  const focusedCanonical = focusedPlayer
    ? selectCanonicalRelationshipView({
        relationships,
        reality: socialState.reality,
        actorId: humanPlayer.id,
        targetId: focusedPlayer.id,
      })
    : null
  const focusedRealityEdge = focusedPlayer
    ? socialState.reality.relationships[humanPlayer.id]?.[focusedPlayer.id]
    : undefined
  const focusedHasRelationshipEvidence =
    focusedRealityEdge &&
    (focusedRealityEdge.perceivedLabel !== 'UNKNOWN' ||
      focusedRealityEdge.familiarity > 0 ||
      focusedRealityEdge.lastMeaningfulInteraction !== undefined)
  const focusedAffinity = dramaMode
    ? focusedHasRelationshipEvidence
      ? projectRealityAffinity(focusedRealityEdge)
      : undefined
    : focusedOutward?.affinity !== undefined || focusedInward?.affinity !== undefined
      ? Math.round(((focusedOutward?.affinity ?? 0) + (focusedInward?.affinity ?? 0)) / 2)
      : undefined
  const focusedRelationshipPulseDelta = focusedPlayer
    ? relationshipPulseDeltas.get(focusedPlayer.id)
    : undefined
  const focusedMeterPulseClass =
    focusedRelationshipPulseDelta === undefined || focusedRelationshipPulseDelta === 0
      ? ''
      : focusedRelationshipPulseDelta > 0
        ? 'sp2-focus__meter--pulse-up'
        : 'sp2-focus__meter--pulse-down'
  const focusedRelationship = !focusedPlayer
    ? null
    : dramaMode
      ? getRealityRelationshipLabel(
          focusedRealityEdge,
          focusedCanonical?.alliance?.operational,
          game.week,
          focusedCanonical?.isNemesis
        )
      : focusedAffinity === undefined
        ? null
        : getRelationshipLabel(focusedAffinity)
  const focusedTags = focusedPlayer
    ? (dramaMode
        ? [...(focusedCanonical?.visibleTags ?? [])]
        : Array.from(new Set([...(focusedOutward?.tags ?? []), ...(focusedInward?.tags ?? [])]))
      ).filter((tag) => tag in RELATIONSHIP_TAG_LABELS)
    : []
  const focusedAlliances = focusedPlayer
    ? getCurrentAlliancesBetween(socialState.reality, humanPlayer.id, focusedPlayer.id)
    : []
  const focusedDisplayLabels = [
    ...(focusedAlliances.length > 0
      ? focusedTags.filter(
          (tag) => !['alliance', 'new_alliance', 'strained_alliance'].includes(tag)
        )
      : focusedTags
    ).map((tag) => RELATIONSHIP_TAG_LABELS[tag]),
    ...focusedAlliances.map(allianceDisplayLabel),
  ].filter((label, index, labels) => labels.indexOf(label) === index)
  const focusedCommitments = focusedPlayer
    ? focusedAlliances.map((alliance) =>
        allianceKind(alliance) === 'PACT'
          ? `Personal pact · ${focusedPlayer.name}`
          : (alliance.name ?? 'Alliance group')
      )
    : []
  const selectedPactHistoryEvent = selectedPactHistoryEventId
    ? socialState.reality.events.find((event) => event.id === selectedPactHistoryEventId)
    : undefined
  const canShowSelectedPactEvent = Boolean(
    selectedPactHistoryEvent &&
    canReadAllianceEvent(selectedPactHistoryEvent, humanPlayer.id) &&
    (selectedPactHistoryEvent.allianceSnapshot?.kind === 'PACT' ||
      (selectedPactHistoryEvent.allianceId &&
        socialState.reality.alliances[selectedPactHistoryEvent.allianceId] &&
        allianceKind(socialState.reality.alliances[selectedPactHistoryEvent.allianceId]) ===
          'PACT'))
  )

  const hasSeenAllianceGuide = hasSeenContextualGuide('alliance', activeProfileId, isGuest)
  const hasSeenAllianceConsultGuide = hasSeenContextualGuide(
    'alliance-consult',
    activeProfileId,
    isGuest
  )

  const dismissContextualGuide = (guide: 'alliance' | 'alliance-consult') => {
    markContextualGuideSeen(guide, activeProfileId, isGuest)
    refreshContextualGuides((revision) => revision + 1)
  }

  const executeCopy = selectedAllianceAction?.executeLabel ?? 'Execute'
  const footerFeedback =
    feedbackMsg ??
    (selectedActionId && !selectedReunionGuestId ? executionEligibility.reason : null)
  const showSocialTutorialPrompt =
    socialTutorialVariant !== null && socialPanelOpen && !socialTutorialTourOpen
  const showSocialTutorialTour =
    socialTutorialVariant !== null && socialPanelOpen && socialTutorialTourOpen
  const showAllianceContextGuide =
    dramaMode &&
    socialPanelOpen &&
    socialTutorialVariant === null &&
    !socialTutorialTourOpen &&
    memberAllianceExists &&
    !hasSeenAllianceGuide
  const showAllianceConsultGuide =
    dramaMode &&
    socialPanelOpen &&
    socialTutorialVariant === null &&
    !socialTutorialTourOpen &&
    !showAllianceContextGuide &&
    selectedActionId === 'consult_alliance' &&
    !hasSeenAllianceConsultGuide

  const clearRealityTutorialTarget = () => {
    resetPanelSelection()
    setMoveFilter('all')
  }

  const ensureRealityTutorialTarget = () => {
    if (primaryTargetId || selectedTargets.size > 0) return
    const sample = orderedPlayers.find((player) => !disabledPlayerIds.includes(player.id))
    if (!sample) return
    setPrimaryTargetId(sample.id)
    setSelectedTargets(new Set([sample.id]))
    setSelectedActionId(null)
    setSelectedSubjectId(null)
    clearCurrentOutcome()
  }

  const completeSocialTutorial = () => {
    if (!socialTutorialVariant) return
    markSocialTutorialHandled(activeProfileId, isGuest, socialTutorialVariant)
    setSocialTutorialVariant(null)
    setSocialTutorialTourOpen(false)
  }

  return (
    <div
      className={`sp2-backdrop${weekendActive ? ' sp2-backdrop--weekend' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={weekendActive ? 'Weekend Social' : 'Social Phase'}
    >
      <a className="sp2-skip-link" href="#sp2-body">
        Skip to actions
      </a>
      <div
        className={`sp2-modal${dramaMode ? ' sp2-modal--drama' : ' sp2-modal--normal'}${weekendActive ? ' sp2-modal--weekend' : ''}`}
      >
        <header className="sp2-header" data-reality-tutorial="social-header">
          <span className="sp2-header__identity">
            <span className="sp2-header__title">
              {weekendActive ? 'Weekend Social' : dramaMode ? 'Reality Mode' : 'Social Phase'}
            </span>
            {!weekendActive && <span className="sp2-header__subtitle">Hub relationships</span>}
          </span>
          <div
            className={`sp2-header__resources${dramaMode ? '' : ' sp2-header__resources--normal'}${weekendActive ? ' sp2-header__resources--weekend' : ''}`}
            data-reality-tutorial="resources"
          >
            <span className="sp2-energy-chip" aria-live="polite" aria-label={`Energy: ${energy}`}>
              ⚡ {energy}
            </span>
            <button
              type="button"
              className="sp2-resource-chip sp2-resource-chip--influence"
              aria-live="polite"
              aria-label={`Influence: ${influence}`}
              title="Influence"
            >
              🤝 {influence}
            </button>
            <button
              type="button"
              className="sp2-resource-chip sp2-resource-chip--info"
              aria-live="polite"
              aria-label={`Info: ${info}`}
              title="Information"
            >
              💡 {info}
            </button>
          </div>
          <GameBackButton
            className="sp2-header__close"
            label="Close social panel"
            onClick={handleClose}
          />
        </header>

        <div className="sp2-briefing">
          {activePublicDirection && (
            <section className="sp2-public-request" aria-label="Active public request">
              <div className="sp2-public-request__eyebrow">Audience directive</div>
              <strong>{activePublicDirection.description}</strong>
              {publicRequestProgress && <span>{publicRequestProgress.guidance}</span>}
              <div
                className="sp2-public-request__progress"
                role="progressbar"
                aria-label="Audience directive progress"
                aria-valuenow={activePublicDirection.progressPercent ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <i style={{ width: `${activePublicDirection.progressPercent ?? 0}%` }} />
              </div>
              <div className="sp2-public-request__footer">
                <span>{publicRequestProgress?.label ?? 'Waiting for a first beat'}</span>
                {publicFocus && (
                  <button type="button" onClick={focusPublicRequest}>
                    {(activePublicDirection.progressPercent ?? 0) <= 0
                      ? 'Focus first move'
                      : 'Follow thread'}
                  </button>
                )}
              </div>
            </section>
          )}

          {dramaMode && (
            <HousePulse
              network={dramaNetwork}
              players={game.players}
              humanId={humanPlayer.id}
              actionHistory={actionHistory}
              relationships={relationships ?? {}}
              weekStartRelSnapshot={weekStartRelSnapshot}
              currentWeek={game.week}
              season={game.season}
              gameId={game.gameId}
              gamePhase={game.phase}
              pulseChronicles={game.pulseChronicles}
              weekendInterlude={game.weekendInterlude}
              weatherCondition={pulseWeather}
              pulseTheme={pulseTheme}
              reality={socialState.reality}
              socialCommitments={socialCommitments}
              pendingActionCount={pendingAllianceDecisionCount}
              onOpenIncoming={() => {
                handleClose()
                dispatch(openIncomingInbox())
              }}
              onOpenAlliances={(allianceId, eventId) => {
                const linkedAlliance = allianceId
                  ? socialState.reality.alliances[allianceId]
                  : undefined
                const linkedEvent = eventId
                  ? socialState.reality.events.find((event) => event.id === eventId)
                  : undefined
                const isPactLink = Boolean(
                  linkedAlliance
                    ? allianceKind(linkedAlliance) === 'PACT'
                    : linkedEvent?.allianceSnapshot?.kind === 'PACT'
                )
                clearCurrentOutcome()
                setMoveFilter('alliances')
                if (isPactLink) {
                  const counterpartId =
                    linkedAlliance?.memberIds.find((id) => id !== humanPlayer.id) ??
                    linkedEvent?.participantIds.find((id) => id !== humanPlayer.id)
                  setSelectedAllianceId(null)
                  setSelectedAllianceHistoryEventId(null)
                  setSelectedPactHistoryEventId(eventId ?? null)
                  if (counterpartId) {
                    setPrimaryTargetId(counterpartId)
                    setSelectedTargets(new Set([counterpartId]))
                  }
                  setSelectedActionId(null)
                  setSelectedSubjectId(null)
                  setMultiSelectActive(false)
                  requestAnimationFrame(() => {
                    document
                      .querySelector('.sp2-focus__full-read')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                  })
                  return
                }
                setSelectedPactHistoryEventId(null)
                selectAlliance(allianceId ?? null)
                setSelectedAllianceHistoryEventId(eventId ?? null)
                setSelectedActionId(null)
                requestAnimationFrame(() => {
                  document
                    .getElementById('sp2-alliance-actions')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
              }}
            />
          )}
        </div>

        <div
          id="sp2-body"
          ref={socialBodyRef}
          className={`sp2-body${selectedAlliance ? ' sp2-body--alliance' : ''}${collapseRosterForFocusedPlayer ? ' sp2-body--focused-target' : ''}`}
        >
          <section
            className="sp2-hubmates"
            aria-label={showPlayerRoster ? 'Player roster' : 'Choose an alliance'}
            data-reality-tutorial="hubmates"
            hidden={collapseRosterForFocusedPlayer}
          >
            <div className="sp2-section-heading">
              <span>
                <span className="sp2-section-heading__eyebrow">Private lounge</span>
                <span className="sp2-section-heading__title">
                  {showPlayerRoster ? 'Choose a hubmate' : 'Choose an alliance'}
                </span>
                {showPlayerRoster && finaleReunionSocialOpen && reunionGuestIds.size > 0 && (
                  <span className="sp2-reunion-roster-note">
                    Former Hubmates are back for one last conversation.
                  </span>
                )}
              </span>
              {showPlayerRoster && !usesMultipleTargets && (
                <span
                  className="sp2-relationship-legend"
                  aria-label="Avatar rings: Nemesis, Still forming, Ally"
                >
                  <span>
                    <i className="is-nemesis" />
                    Nemesis
                  </span>
                  <span>
                    <i className="is-neutral" />
                    Still forming
                  </span>
                  <span>
                    <i className="is-ally" />
                    Ally
                  </span>
                </span>
              )}
              {showAlliancePicker && selectedAlliance && (
                <button
                  type="button"
                  className="sp2-alliance-clear"
                  onClick={() => selectAlliance(null)}
                >
                  All alliance actions
                </button>
              )}
              {usesMultipleTargets && (
                <span className="sp2-multi-hint" role="status">
                  Group: {selectedTargets.size} selected ·{' '}
                  {targetMode === 'multi'
                    ? `tap ${minimumTargetCount === 1 ? '1+' : `${minimumTargetCount}+`} players`
                    : 'applies to everyone selected'}
                </span>
              )}
            </div>
            {showAlliancePicker && (
              <div
                className={`sp2-consult-alliance-picker${allianceSelectionPulse ? ' is-attention' : ''}`}
                role="group"
                aria-label="Official alliances"
              >
                {displayedGroups.length > 0 ? (
                  <div className="sp2-consult-alliance-picker__chips">
                    {displayedGroups.map((alliance) => {
                      const allianceName = alliance.name ?? alliance.purpose
                      const isSelected = selectedAllianceId === alliance.id
                      return (
                        <button
                          key={alliance.id}
                          type="button"
                          title={allianceName}
                          aria-label={allianceName}
                          aria-pressed={isSelected}
                          className={`sp2-consult-alliance-chip${isSelected ? ' is-active' : ''}`}
                          onClick={() => selectAlliance(isSelected ? null : alliance.id)}
                        >
                          <span className="sp2-consult-alliance-chip__name">{allianceName}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <span className="sp2-consult-alliance-picker__empty">
                    {isAllianceInvitation
                      ? 'No eligible alliances for this invitation.'
                      : 'No active alliances yet.'}
                  </span>
                )}
              </div>
            )}

            {showAlliancePicker &&
              !isAllianceInvitation &&
              !isAllianceConsultation &&
              formerGroups.length > 0 && (
                <details className="sp2-former-alliances">
                  <summary>Former alliances</summary>
                  <div
                    className="sp2-consult-alliance-picker__chips"
                    role="group"
                    aria-label="Former alliances"
                  >
                    {formerGroups.map((alliance) => (
                      <button
                        key={alliance.id}
                        type="button"
                        className={`sp2-consult-alliance-chip${selectedAllianceId === alliance.id ? ' is-active' : ''}`}
                        aria-pressed={selectedAllianceId === alliance.id}
                        onClick={() =>
                          selectAlliance(selectedAllianceId === alliance.id ? null : alliance.id)
                        }
                      >
                        <span className="sp2-consult-alliance-chip__name">
                          {alliance.rosterKnowledgeByActor?.[humanPlayer.id]?.name ??
                            alliance.name ??
                            'Alliance'}
                        </span>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            {showPlayerRoster && (
              <PlayerList
                players={rosterPlayers}
                humanPlayerId={humanPlayer.id}
                relationships={relationships}
                disabledIds={disabledPlayerIds}
                selectedIds={selectedPlayerIds}
                onSelectionChange={handleSelectionChange}
                multiSelectEnabled={targetMode === 'multi'}
                deltasByTargetId={deltasByTargetId}
                relationshipPulseDeltas={relationshipPulseDeltas}
                multiSelect={usesMultipleTargets}
                cupidPartners={cupidPartners}
                playerLimitedRead={dramaMode}
                reality={socialState.reality}
                currentDay={game.week}
                onOpenBetrayalEvent={(eventId) =>
                  window.dispatchEvent(
                    new CustomEvent('reality-social:open-intel-event', { detail: eventId })
                  )
                }
              />
            )}
          </section>

          {selectedAlliance ? (
            <AllianceRead
              alliance={selectedAlliance}
              reality={socialState.reality}
              humanId={humanPlayer.id}
              players={game.players}
              selectedMemberId={primaryTargetId}
              focusEventId={selectedAllianceHistoryEventId ?? undefined}
              onSelectMember={(id) => {
                setPrimaryTargetId(id)
                setSelectedTargets(new Set([id]))
                setSelectedActionId(null)
                setSelectedPactHistoryEventId(null)
                clearCurrentOutcome()
              }}
            />
          ) : (
            <section
              className={`sp2-focus${focusedPlayer ? ' sp2-focus--active' : ''}`}
              data-reality-tutorial="relationship-read"
            >
              {focusedPlayer ? (
                <>
                  <button
                    className="sp2-focus__clear"
                    type="button"
                    aria-label={`Deselect ${focusedPlayer.name} and show roster`}
                    title="Deselect hubmate"
                    onClick={() => handleSelectionChange(new Set(), { primaryTargetId: null })}
                  >
                    ×
                  </button>
                  <div className="sp2-focus__portrait">
                    <PlayerAvatar
                      player={focusedPlayer}
                      size="lg"
                      affinity={focusedAffinity}
                      relationshipScale="signed"
                      relationshipTags={focusedTags}
                    />
                  </div>
                  <div className="sp2-focus__copy sp2-focus__copy--clearable">
                    <span className="sp2-focus__eyebrow">Your read on</span>
                    <h2>{focusedPlayer.name}</h2>
                    <div className="sp2-focus__status-line">
                      {focusedRelationship && !selectedReunionGuest && (
                        <span
                          className={`sp2-focus__relationship sp2-focus__relationship--${focusedRelationship.key}`}
                        >
                          {focusedRelationship.label}
                        </span>
                      )}
                      <span className="sp2-focus__status">
                        {formatPlayerStatus(focusedPlayer.status)}
                      </span>
                    </div>
                    {focusedDisplayLabels.length > 0 && (
                      <div className="sp2-focus__tags">
                        {focusedDisplayLabels.slice(0, 3).map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                    )}
                    {focusedCommitments.length > 0 && (
                      <div className="sp2-focus__commitments" aria-label="Shared commitments">
                        {focusedCommitments.slice(0, 2).map((commitment) => (
                          <span key={commitment}>✦ {commitment}</span>
                        ))}
                      </div>
                    )}
                    {focusedAffinity !== undefined && (
                      <div
                        className={['sp2-focus__meter', focusedMeterPulseClass]
                          .filter(Boolean)
                          .join(' ')}
                        aria-label={`${focusedRelationship?.label ?? 'Relationship'} relationship`}
                      >
                        <span
                          style={{
                            width: `${Math.max(6, Math.min(94, (focusedAffinity + 100) / 2))}%`,
                          }}
                        />
                      </div>
                    )}
                    {dramaMode && focusedPlayer && (
                      <details
                        className="sp2-focus__full-read"
                        open={Boolean(selectedPactHistoryEventId)}
                      >
                        <summary>Open full relationship read</summary>
                        {canShowSelectedPactEvent && selectedPactHistoryEvent && (
                          <div className="sp2-pact-history-event" role="status">
                            <small>
                              Day {selectedPactHistoryEvent.day} ·{' '}
                              {formatPlayerFacingPhase(selectedPactHistoryEvent.phase)}
                            </small>
                            <span>
                              {allianceEventText(
                                socialState.reality,
                                selectedPactHistoryEvent,
                                humanPlayer.id,
                                (id) => game.players.find((player) => player.id === id)?.name ?? id
                              )}
                            </span>
                          </div>
                        )}
                        <RealityLedger
                          reality={socialState.reality}
                          players={game.players}
                          humanId={humanPlayer.id}
                          relationships={relationships ?? {}}
                          focusPlayerId={focusedPlayer.id}
                          currentDay={game.week}
                          section="relationships"
                          compact
                        />
                      </details>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <span className="sp2-focus__empty-mark" aria-hidden="true" />
                  <div className="sp2-focus__copy">
                    <span className="sp2-focus__eyebrow">The room is listening</span>
                    <h2>Who do you want to approach?</h2>
                    <p>
                      Pick a hubmate to see your relationship and the moves that could shift it.
                    </p>
                  </div>
                </>
              )}
            </section>
          )}

          <section
            className="sp2-moves"
            aria-label="Social actions"
            id="sp2-alliance-actions"
            data-reality-tutorial="actions"
          >
            <div className="sp2-moves__top">
              <div className="sp2-moves__heading">
                <div>
                  <span className="sp2-section-heading__eyebrow">Your move</span>
                  <span className="sp2-section-heading__title">
                    {selectedReunionGuest ? 'Choose your response' : 'Set the tone'}
                  </span>
                </div>
                <button
                  className={`sp2-execute sp2-moves__execute${successPulse ? ' sp2-execute--pulse' : ''}`}
                  type="button"
                  disabled={!canExecute}
                  aria-label={executeCopy}
                  aria-busy={executing}
                  onClick={handleExecute}
                >
                  {executeCopy}
                </button>
              </div>
              {!selectedReunionGuest && (
                <div className="sp2-move-filters" role="tablist" aria-label="Action categories">
                  {MOVE_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      role="tab"
                      aria-selected={moveFilter === filter.id}
                      className={moveFilter === filter.id ? 'is-active' : ''}
                      data-reality-tutorial={
                        filter.id === 'alliances' ? 'alliance-actions' : undefined
                      }
                      onClick={() => {
                        clearCurrentOutcome()
                        setMoveFilter(filter.id)
                        if (filter.id !== 'alliances') {
                          setSelectedAllianceId(null)
                          setSelectedAllianceHistoryEventId(null)
                        }
                        setMultiSelectActive(false)
                        setSelectedTargets(primaryTargetId ? new Set([primaryTargetId]) : new Set())
                        setSelectedActionId(null)
                        setSelectedSubjectId(null)
                      }}
                    >
                      {filter.label}
                      {filter.id === 'alliances' && pendingAllianceDecisionCount > 0 && (
                        <span
                          className="sp2-move-filters__badge"
                          aria-label="Pending alliance decisions"
                        >
                          {pendingAllianceDecisionCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ActionGrid
              selectedId={selectedActionId}
              onActionClick={handleActionClick}
              onPremiumLockedClick={handleRealityUpgrade}
              selectedTargetIds={selectedPlayerIds}
              consultationTargetIds={
                eligibleConsultationAlliances.length > 0 && consultationEligibilityTargetId
                  ? new Set([consultationEligibilityTargetId])
                  : new Set()
              }
              players={orderedPlayers}
              actorId={humanPlayer.id}
              actorEnergy={energy}
              actorInfluence={influence}
              actorInfo={info}
              relationships={relationships}
              primaryTargetStatus={
                effectivePrimaryTargetId
                  ? (game.players.find((player) => player.id === effectivePrimaryTargetId)
                      ?.status ?? null)
                  : null
              }
              dramaMode={dramaMode}
              currentPhase={weekendActive ? 'social_2' : game.phase}
              dramaNetwork={dramaNetwork}
              hiddenActionIds={
                selectedReunionGuest
                  ? new Set(socialActions.map((action) => action.id))
                  : hiddenContextualActionIds
              }
              allianceContext={Boolean(selectedAlliance)}
              energyCostOverrides={
                selectedActionId && totalCosts
                  ? { [selectedActionId]: totalCosts.energy }
                  : undefined
              }
              categoryFilter={selectedReunionGuest ? 'connect' : moveFilter}
              supplementalActions={
                selectedReunionGuest
                  ? reunionActionCards
                  : moveFilter === 'alliances' || moveFilter === 'all'
                    ? allianceQuickActions
                        .filter(
                          (entry) =>
                            moveFilter === 'alliances' ||
                            entry.action.id.startsWith('alliance:invite:')
                        )
                        .map(({ action, allowWithoutTarget, buildCommand }) => {
                          const command = buildCommand([...selectedTargets])
                          const costs =
                            allianceProposalPrice(command) ??
                            normalizeActionCosts(action, selectedTargetCount, dramaMode)
                          if (command.type !== 'PROPOSE' || command.kind !== 'FOUND') {
                            return { action, allowWithoutTarget, costs }
                          }

                          const proposedRoster = [...new Set(command.memberIds ?? [])].sort()
                          const rosterKey = proposedRoster.join('~')
                          const existingGroups = Object.values(
                            socialState.reality.alliances
                          ).filter(
                            (alliance) =>
                              isCurrentAlliance(alliance) && allianceKind(alliance) === 'GROUP'
                          )
                          const exactMatch = existingGroups.find(
                            (alliance) => [...alliance.memberIds].sort().join('~') === rosterKey
                          )
                          if (exactMatch) {
                            return {
                              action,
                              allowWithoutTarget,
                              costs,
                              disabled: true,
                              availabilityReason: `An alliance with these hubmates already exists: ${exactMatch.name ?? 'the existing alliance'}.`,
                            }
                          }

                          const nestedMatch = existingGroups.find(
                            (alliance) =>
                              alliance.memberIds.length < proposedRoster.length &&
                              alliance.memberIds.every((id) => proposedRoster.includes(id))
                          )
                          return {
                            action,
                            allowWithoutTarget,
                            costs,
                            ...(nestedMatch
                              ? {
                                  availabilityReason: `You already have ${nestedMatch.name ?? 'an alliance'} with some of this group. You can invite the additional hubmate into it, or form this separate alliance.`,
                                }
                              : {}),
                          }
                        })
                    : undefined
              }
            />
            {!selectedReunionGuest && selectedAllianceAction?.namePrompt && (
              <div className="sp2-alliance-name-field">
                <label htmlFor="sp2-alliance-name-input">
                  {selectedAllianceAction.namePrompt.label}
                </label>
                <input
                  id="sp2-alliance-name-input"
                  type="text"
                  value={allianceNameDraft}
                  maxLength={28}
                  minLength={2}
                  autoComplete="off"
                  onChange={(event) => setAllianceNameDraft(event.target.value)}
                  aria-describedby="sp2-alliance-name-hint"
                />
                <span id="sp2-alliance-name-hint">{selectedAllianceAction.namePrompt.hint}</span>
              </div>
            )}
            {needsSubject && effectivePrimaryTargetId && (
              <div className="sp2-subject-picker" aria-label="Choose subject">
                <span className="sp2-subject-picker__label">Talking about:</span>
                {subjectCandidates.length === 0 ? (
                  <span className="sp2-subject-picker__empty">No eligible targets</span>
                ) : (
                  <div
                    className="sp2-subject-picker__chips"
                    role="group"
                    aria-label="Subject candidates"
                  >
                    {subjectCandidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        className={`sp2-subject-chip${
                          selectedSubjectId === candidate.id ? ' sp2-subject-chip--selected' : ''
                        }`}
                        aria-pressed={selectedSubjectId === candidate.id}
                        onClick={() => {
                          setSelectedSubjectId((previous) =>
                            previous === candidate.id ? null : candidate.id
                          )
                          clearCurrentOutcome()
                        }}
                      >
                        <PlayerAvatar
                          player={candidate}
                          size="sm"
                          showRelationshipOutline={false}
                        />
                        <span className="sp2-subject-chip__name">{candidate.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <footer className="sp2-footer sp2-footer--unified" data-reality-tutorial="footer">
          {pregnancyCelebration && (
            <span className="sp2-pregnancy-burst" aria-hidden="true">
              🤰 ✨ 🍼 💜 ✨
            </span>
          )}
          <div className="sp2-recent sp2-recent--unified" aria-label="Recent Activity log">
            <RecentActivity
              players={game.players}
              compact
              activeReceiptId={activeReceiptId}
              feedback={footerFeedback}
              onDismissResult={clearCurrentOutcome}
            />
          </div>
        </footer>
      </div>
      {pregnancyRolePromptOpen && (
        <div className="sp2-story-role-overlay" role="presentation">
          <section
            className="sp2-story-role-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sp2-story-role-title"
          >
            <span className="sp2-story-role-eyebrow">Pregnancy storyline</span>
            <h2 id="sp2-story-role-title">How should this storyline apply to you?</h2>
            <p>
              This one-time choice is stored only for the current season. It does not change your
              public profile.
            </p>
            <div className="sp2-story-role-actions">
              <button
                type="button"
                onClick={() => {
                  dispatch(setHumanPregnancyRole('Male'))
                  setPregnancyRolePromptOpen(false)
                  setFeedbackMsg('Story role set for this season. Tap Execute again.')
                }}
              >
                Male
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatch(setHumanPregnancyRole('Female'))
                  setPregnancyRolePromptOpen(false)
                  setFeedbackMsg('Story role set for this season. Tap Execute again.')
                }}
              >
                Female
              </button>
              <button
                type="button"
                className="sp2-story-role-actions__secondary"
                onClick={() => {
                  dispatch(setHumanPregnancyRole('disabled'))
                  setPregnancyRolePromptOpen(false)
                  setSelectedActionId(null)
                  setFeedbackMsg('Pregnancy storyline disabled for this season.')
                }}
              >
                Don&apos;t use this storyline
              </button>
            </div>
            <button
              type="button"
              className="sp2-story-role-cancel"
              onClick={() => setPregnancyRolePromptOpen(false)}
            >
              Not now
            </button>
          </section>
        </div>
      )}
      {pendingAllianceNaming && (
        <div className="sp2-alliance-naming-overlay" role="presentation">
          <section
            className="sp2-alliance-naming-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sp2-alliance-naming-title"
            aria-describedby="sp2-alliance-naming-description"
          >
            <span className="sp2-alliance-naming-eyebrow">ALLIANCE APPROVED</span>
            <h2 id="sp2-alliance-naming-title">Give your group a name</h2>
            <p id="sp2-alliance-naming-description">
              Your founders agreed and the alliance is formed. Choose its name, or keep the
              suggested name, <strong>{pendingAllianceNaming.name ?? 'The Winners'}</strong>.
            </p>
            <form
              className="sp2-alliance-naming-form"
              onSubmit={(event) => {
                event.preventDefault()
                finishInitialAllianceNaming(false)
              }}
            >
              <label htmlFor="sp2-initial-alliance-name">Alliance name</label>
              <input
                id="sp2-initial-alliance-name"
                type="text"
                value={initialAllianceNameDraft}
                minLength={2}
                maxLength={28}
                autoComplete="off"
                autoFocus
                placeholder="For example, The Winners"
                onChange={(event) =>
                  setInitialAllianceNameDraftState({
                    allianceId: pendingAllianceNaming.id,
                    value: event.target.value,
                  })
                }
              />
              <div className="sp2-alliance-naming-actions">
                <button type="submit" disabled={initialAllianceNameDraft.trim().length < 2}>
                  Name alliance
                </button>
                <button
                  type="button"
                  className="sp2-alliance-naming-actions__secondary"
                  onClick={() => finishInitialAllianceNaming(true)}
                >
                  Keep {pendingAllianceNaming.name ?? 'suggested name'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showSocialTutorialPrompt && socialTutorialVariant && (
        <RealitySocialTutorialPrompt
          variant={socialTutorialVariant}
          onStart={() => setSocialTutorialTourOpen(true)}
          onSkip={completeSocialTutorial}
        />
      )}
      {showSocialTutorialTour && socialTutorialVariant && (
        <RealitySocialTutorialTour
          variant={socialTutorialVariant}
          onClearTarget={clearRealityTutorialTarget}
          onEnsureTarget={ensureRealityTutorialTarget}
          onComplete={completeSocialTutorial}
        />
      )}
      {showAllianceContextGuide && (
        <ContextualGuidePrompt
          eyebrow="ALLIANCE"
          title="You're in an alliance"
          body="Alliances have their own cohesion and secrecy. Open the Alliances category to review your groups, roles and available actions."
          onComplete={() => dismissContextualGuide('alliance')}
        />
      )}
      {showAllianceConsultGuide && (
        <ContextualGuidePrompt
          eyebrow="ALLIANCE MOVE"
          title="Consult the alliance"
          body="Ask your allies what they think before a major move. If most of the alliance agrees, that choice becomes the group's plan. Following or deliberately breaking it can affect the alliance."
          onComplete={() => dismissContextualGuide('alliance-consult')}
        />
      )}
    </div>
  )
}

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from 'vitest'

import { competitionIdentityMultiplier } from '../src/ai/aiGameIdentity'
import {
  getCompetitionSeasonModifiers,
  getDefaultCompetitionSeasonState,
} from '../src/ai/competition'
import { finalizeFinale, startFinale } from '../src/store/finaleSlice'
import { SocialEngine } from '../src/social/SocialEngine'
import { socialAIDriver } from '../src/social/socialAIDriver'
import {
  advance,
  applyMinigameWinner,
  finalizeGame,
  resetGame,
  setLive,
  setWeekendsEnabledForSeason,
  simulateImmediateEliminationCycle,
} from '../src/store/gameSlice'
import { mulberry32 } from '../src/store/rng'
import { store } from '../src/store/store'
import type { GameState, Player } from '../src/types'
import { seedsForRepeat } from '../e2e/playwright/season-sim/seeds'
import type {
  SimulationReport,
  SimulationRunConfig,
  SimulationSeeds,
  SimulationSeasonOutcome,
  TimelineEntry,
} from '../e2e/playwright/season-sim/types'

const HUMAN_COMPETITION_SKILL = {
  competent: 0.72,
  mediocre: 0.52,
  thrower: 0.3,
} as const

function readSeed(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 0)
  if (!Number.isFinite(parsed))
    throw new Error(`${name} must be an integer seed; received '${raw}'.`)
  return parsed >>> 0
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer; received '${raw}'.`)
  }
  return parsed
}

function seededCompetitionScores(
  game: GameState,
  participants: Player[],
  seeds: SimulationSeeds,
  skill: keyof typeof HUMAN_COMPETITION_SKILL
): Record<string, number> {
  const competitionSeed = (game.seed ^ seeds.actor ^ Math.imul(game.week, 0x9e3779b9)) >>> 0
  return Object.fromEntries(
    participants.map((player, index) => {
      const playerSeed =
        (competitionSeed ^ Math.imul(index + 1, 0x85ebca6b) ^ hashId(player.id)) >>> 0
      const rng = mulberry32(playerSeed)
      const identityMultiplier = player.isUser
        ? 1
        : competitionIdentityMultiplier(
            player.aiGameIdentity,
            'classic',
            competitionSeed,
            player.id
          )
      const baseSkill = player.isUser
        ? HUMAN_COMPETITION_SKILL[skill]
        : (player.aiGameIdentity?.competitionDrive ?? 0.5)
      const seasonState =
        game.competitionSeasonStateByPlayerId?.[player.id] ?? getDefaultCompetitionSeasonState()
      const seasonAdjustment = getCompetitionSeasonModifiers(seasonState).totalAdjustment
      const seededVariation = (rng() + rng() - 1) * 0.2
      const normalizedScore = Math.max(
        0.01,
        Math.min(0.99, baseSkill * identityMultiplier + seasonAdjustment + seededVariation)
      )
      return [player.id, Math.round(normalizedScore * 100)]
    })
  )
}

function hashId(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function aiSocialMetrics(
  state: ReturnType<typeof store.getState>,
  humanId: string,
  aiSocialActions: number
): Pick<
  SimulationSeasonOutcome,
  | 'aiSocialActions'
  | 'aiOnlyFactionCount'
  | 'aiOnlyPactCount'
  | 'aiStrategyMeetings'
  | 'aiCoordinatedTargetMoves'
  | 'aiAllianceDefections'
  | 'aiAllianceLeaks'
  | 'aiRomances'
> {
  const reality = state.social.reality
  const alliances = Object.values(reality.alliances)
  const requests = Object.values(reality.allianceManagement.requests)
  const events = [
    ...reality.events,
    ...alliances.flatMap((alliance) => alliance.history ?? []),
    ...requests.flatMap((request) => request.history ?? []),
  ]
  const uniqueEvents = [...new Map(events.map((event) => [event.id, event])).values()]
  const aiOnly = (participantIds: string[]) =>
    participantIds.length > 0 && participantIds.every((id) => id !== humanId)

  return {
    aiSocialActions,
    aiOnlyFactionCount: alliances.filter(
      (alliance) =>
        (alliance.kind ?? 'GROUP') !== 'PACT' &&
        alliance.status !== 'DISSOLVED' &&
        alliance.memberIds.length >= 2 &&
        aiOnly(alliance.memberIds)
    ).length,
    aiOnlyPactCount: alliances.filter(
      (alliance) =>
        alliance.kind === 'PACT' &&
        alliance.status !== 'DISSOLVED' &&
        alliance.memberIds.length >= 2 &&
        aiOnly(alliance.memberIds)
    ).length,
    aiStrategyMeetings: uniqueEvents.filter(
      (event) => event.type === 'ALLIANCE_STRATEGY_MEETING' && aiOnly(event.participantIds)
    ).length,
    aiCoordinatedTargetMoves: uniqueEvents.filter(
      (event) => event.type === 'ALLIANCE_TARGET_COORDINATED' && aiOnly(event.participantIds)
    ).length,
    aiAllianceDefections: uniqueEvents.filter(
      (event) =>
        (event.type === 'ALLIANCE_PLAN_DEFIED' || event.type === 'ALLIANCE_BETRAYAL') &&
        aiOnly(event.participantIds)
    ).length,
    aiAllianceLeaks: uniqueEvents.filter(
      (event) => event.type === 'ALLIANCE_LEAKED' && aiOnly(event.participantIds)
    ).length,
    aiRomances: Object.values(reality.romances).filter(
      (romance) => romance.status !== 'ENDED' && aiOnly(romance.participantIds)
    ).length,
  }
}

function startSeededSeason(seeds: SimulationSeeds): void {
  window.__E2E__ = true
  window.__bbE2ENewSeason = { rosterSeed: seeds.roster, seasonSeed: seeds.season }
  SocialEngine.init(store)
  store.dispatch(resetGame([]))
  store.dispatch(setLive(true))
  // Weekends, confessionals, and minigame animations are presentation or
  // optional-play systems. This run measures the season's strategic decisions.
  store.dispatch(setWeekendsEnabledForSeason(false))
  store.dispatch(advance())
}

function runSeededLohCompetition(
  seeds: SimulationSeeds,
  skill: keyof typeof HUMAN_COMPETITION_SKILL
): string {
  let game = store.getState().game
  if (game.phase !== 'week_start') {
    throw new Error(
      `Expected week_start before LOH competition; found ${game.phase} on day ${game.week}.`
    )
  }

  store.dispatch(advance())
  store.dispatch(advance())
  game = store.getState().game
  if (game.phase !== 'loh_comp') {
    throw new Error(`Expected LOH competition phase; found ${game.phase} on day ${game.week}.`)
  }

  const participants = game.players.filter(
    (player) =>
      player.status !== 'evicted' && player.status !== 'jury' && player.id !== game.prevHohId
  )
  if (participants.length < 2) {
    throw new Error(`Only ${participants.length} contestants can compete on day ${game.week}.`)
  }
  const scores = seededCompetitionScores(game, participants, seeds, skill)
  const placements = [...participants]
    .sort((left, right) => scores[right.id]! - scores[left.id]! || left.id.localeCompare(right.id))
    .map((player) => player.id)
  const winnerId = placements[0]
  const lastPlaceId = placements.at(-1)
  if (!winnerId) throw new Error(`No LOH winner was selected on day ${game.week}.`)

  store.dispatch(
    applyMinigameWinner({
      winnerId,
      participants: participants.map((player) => player.id),
      scores,
      placements,
      includePlacementBonuses: true,
      lastPlaceId,
      lastPlaceType: 'scored',
      runId: `headless:${seeds.season}:${game.week}:loh`,
      gameKey: 'headless-seeded-loh',
    })
  )
  store.dispatch(advance())
  store.dispatch(advance())
  return winnerId
}

function resolveFinale(): void {
  const state = store.getState()
  const finalists = state.game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  if (finalists.length !== 2) {
    throw new Error(`The Tribunal opened with ${finalists.length} finalists instead of two.`)
  }
  const jurorIds = state.game.players
    .filter((player) => player.status === 'jury' && player.tribunalEligible !== false)
    .map((player) => player.id)
  const hasPublicProfiles = Object.keys(state.publicOpinion.profiles).length > 0

  store.dispatch(
    startFinale({
      finalistIds: finalists.map((player) => player.id),
      jurorIds,
      // Every juror uses the same seeded decision model in this headless run.
      humanPlayerIds: [],
      seed: state.game.seed,
      cfg: {
        publicFinalVoteEnabled:
          state.game.cfg?.publicFinalVoteEnabled ?? state.game.cfg?.americasVoteEnabled,
      },
      publicApprovalProfiles: hasPublicProfiles ? state.publicOpinion.profiles : undefined,
      reality: state.social.reality,
    })
  )
  store.dispatch(finalizeFinale({ seed: state.game.seed }))
  const finale = store.getState().finale
  if (!finale.winnerId || !finale.runnerUpId) {
    throw new Error('The seeded Tribunal could not resolve a winner and runner-up.')
  }
  store.dispatch(finalizeGame({ winnerId: finale.winnerId, runnerUpId: finale.runnerUpId }))
}

function buildOutcome(terminal: string, aiSocialActions: number): SimulationSeasonOutcome {
  const state = store.getState()
  const { game } = state
  const human = game.players.find((player) => player.isUser)
  const humanId = human?.id ?? ''
  const winner = game.players.find((player) => player.isWinner || player.finalRank === 1)
  const activePlayerCount = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  ).length
  const humanPlacement = human?.finalRank ?? human?.seasonPlacement ?? null

  return {
    resolved: Boolean(
      winner || (human && ['evicted', 'jury'].includes(human.status) && humanPlacement)
    ),
    terminal,
    humanId: human?.id ?? null,
    humanName: human?.name ?? null,
    humanStatus: human?.status ?? null,
    humanPlacement,
    humanWon: Boolean(human && (human.isWinner || human.finalRank === 1)),
    humanMadeJury: human?.status === 'jury',
    humanReachedFinalThree:
      humanPlacement !== null && humanPlacement <= 3
        ? true
        : Boolean(
            human && human.status !== 'evicted' && human.status !== 'jury' && activePlayerCount <= 3
          ),
    winnerId: winner?.id ?? null,
    winnerName: winner?.name ?? null,
    humanLohWins: human?.stats?.lohWins ?? 0,
    humanPosWins: human?.stats?.posWins ?? 0,
    humanNominations: human?.stats?.timesNominated ?? 0,
    ...aiSocialMetrics(state, humanId, aiSocialActions),
    activePlayerCount,
    week: game.week,
  }
}

function makeReport(
  runIndex: number,
  batchId: string,
  batchRuns: number,
  seeds: SimulationSeeds,
  skill: keyof typeof HUMAN_COMPETITION_SKILL,
  startedAt: Date,
  durationMs: number,
  timeline: TimelineEntry[],
  aiSocialActions: number
): SimulationReport {
  const terminal = store.getState().game.phase === 'jury' ? 'tribunal-complete' : 'season-complete'
  const config: SimulationRunConfig = {
    id: `classic-headless-${batchId}-run-${String(runIndex).padStart(3, '0')}`,
    batchId,
    runIndex,
    batchRuns,
    mode: 'classic',
    entitlement: 'normal',
    personaId: 'headless-threat-targeting',
    seeds,
    viewport: 'compact-mobile',
    objectives: [],
    maxActions: 0,
    maxDays: 40,
    competitionSkill: skill,
    skipCompetitions: true,
    skipOptionalConfessionals: true,
    captureFinalScreenshot: false,
    compactEconomyReport: true,
  }
  const outcome = buildOutcome(terminal, aiSocialActions)
  const game = store.getState().game

  return {
    schemaVersion: 1,
    config,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs,
    actionCount: timeline.length,
    terminal,
    outcome,
    timeline,
    findings: [
      {
        category: 'observation',
        severity: 'observation',
        message:
          'Headless mode runs production AI social turns with seeded background social events, skill-weighted LOH results, and automatic strategic choices. It skips visible minigame play, optional confessionals, and discretionary human social-resource spending or inbox replies.',
        phase: game.phase,
        day: game.week,
      },
    ],
  }
}

async function runOneSeason(
  runIndex: number,
  batchId: string,
  batchRuns: number,
  seeds: SimulationSeeds,
  skill: keyof typeof HUMAN_COMPETITION_SKILL
): Promise<SimulationReport> {
  const originalRandom = Math.random
  const originalDateNow = Date.now
  const random = mulberry32(seeds.actor)
  let clock = 1_800_000_000_000 + (seeds.actor % 1_000_000)
  const startedAt = new Date()
  const startedAtMs = performance.now()
  const timeline: TimelineEntry[] = []
  let aiSocialActions = 0
  Math.random = random
  Date.now = () => clock++

  try {
    startSeededSeason(seeds)
    const initialState = store.getState().game
    if (initialState.phase !== 'week_start') {
      throw new Error(`Could not start the seeded season; found ${initialState.phase}.`)
    }

    let resolved = false
    for (let cycle = 0; cycle < 24; cycle += 1) {
      const before = store.getState().game
      if (before.phase === 'jury') {
        resolveFinale()
        resolved = true
        break
      }
      if (before.seasonFinale?.phase === 'seasonComplete') {
        resolved = true
        break
      }
      if (before.phase !== 'week_start') {
        throw new Error(
          `Headless cycle began at unexpected phase '${before.phase}' on day ${before.week}.`
        )
      }

      const lohWinnerId = runSeededLohCompetition(seeds, skill)
      const lohWinner = store.getState().game.players.find((player) => player.id === lohWinnerId)
      if (!lohWinner)
        throw new Error(`The seeded LOH winner ${lohWinnerId} left the cast unexpectedly.`)
      const afterCompetition = store.getState().game
      store.dispatch(
        simulateImmediateEliminationCycle(() => {
          const currentPhase = store.getState().game.phase
          if (currentPhase === 'social_1' || currentPhase === 'social_2') {
            SocialEngine.startPhase(currentPhase)
          }
          aiSocialActions += socialAIDriver.runCurrentPhaseSynchronously()
        })
      )
      const after = store.getState().game
      timeline.push({
        atMs: Math.round(performance.now() - startedAtMs),
        action: `seeded LOH result: ${lohWinner.name}; ${before.week} to ${after.week}`,
        module: 'competition and strategy',
        phase: after.phase,
        day: after.week,
        note: `${after.players.filter((player) => player.status === 'evicted' || player.status === 'jury').length} contestants have exited.`,
      })

      if (after.phase === 'jury') {
        resolveFinale()
        resolved = true
        break
      }
      if (after.seasonFinale?.phase === 'seasonComplete') {
        resolved = true
        break
      }
      if (after.phase !== 'week_start' || after.week <= before.week) {
        const blockers = {
          pendingEviction: after.pendingEviction,
          voteResults: after.voteResults != null,
          evictionSplashId: after.evictionSplashId,
          evictionOverlayPlayerId: after.evictionOverlayPlayerId,
          awaitingHumanVote: after.awaitingHumanVote,
          awaitingTieBreak: after.awaitingTieBreak,
          weekendInterlude: after.weekendInterlude?.active,
          twinShock: after.twinShock,
          seasonFinale: after.seasonFinale?.phase,
        }
        throw new Error(
          `Seeded season stalled on day ${after.week} at '${after.phase}' after LOH winner ${lohWinner.name}; last LOH phase was '${afterCompetition.phase}'. Blockers: ${JSON.stringify(blockers)}`
        )
      }
    }

    if (!resolved) {
      const stalled = store.getState().game
      throw new Error(
        `Seeded season exceeded 24 cycles at day ${stalled.week}, phase '${stalled.phase}'.`
      )
    }

    const report = makeReport(
      runIndex,
      batchId,
      batchRuns,
      seeds,
      skill,
      startedAt,
      Math.round(performance.now() - startedAtMs),
      timeline,
      aiSocialActions
    )
    if (!report.outcome?.resolved) {
      throw new Error(`Seed ${seeds.season} ended without a resolved human outcome.`)
    }
    return report
  } finally {
    Math.random = originalRandom
    Date.now = originalDateNow
  }
}

function requiredHeadlessMode(): void {
  const requestedMode = process.env.SEASON_SIM_MODE
  if (requestedMode && requestedMode !== 'classic') {
    throw new Error(
      `Headless seeded seasons currently support only Classic mode; received '${requestedMode}'.`
    )
  }
}

test(
  'runs seeded Classic seasons with production AI social turns',
  async () => {
    requiredHeadlessMode()
    const runs = readPositiveInt('SEASON_SIM_RUNS', 1)
    const batchId = process.env.SEASON_SIM_BATCH_ID ?? `headless-${Date.now().toString(36)}`
    const skill =
      (process.env.SEASON_SIM_COMPETITION_SKILL as
        | keyof typeof HUMAN_COMPETITION_SKILL
        | undefined) ?? 'competent'
    if (!(skill in HUMAN_COMPETITION_SKILL)) {
      throw new Error(`Unsupported SEASON_SIM_COMPETITION_SKILL '${skill}'.`)
    }
    const baseSeeds = {
      roster: readSeed('SEASON_SIM_ROSTER_SEED', 0x4f1bbcdc),
      season: readSeed('SEASON_SIM_SEASON_SEED', 0x6d2b79f5),
      actor: readSeed('SEASON_SIM_ACTOR_SEED', 0x7a11ce42),
    }
    const outputDirectory = path.join('test-results', 'season-sim-headless', batchId)
    await mkdir(outputDirectory, { recursive: true })
    const summaries: string[] = []
    const originalConsoleLog = console.log
    const originalConsoleInfo = console.info
    const originalConsoleDebug = console.debug
    const originalConsoleTable = console.table
    const originalConsoleGroupCollapsed = console.groupCollapsed
    const originalConsoleGroupEnd = console.groupEnd
    console.log = (...args: unknown[]) => {
      const message = String(args[0] ?? '')
      if (
        message.startsWith('[SoundManager]') ||
        message.startsWith('[ads]') ||
        message.startsWith('[applyMinigameWinner]') ||
        message.startsWith('[applyLohWinner]') ||
        message.startsWith('[gameSlice]')
      ) {
        return
      }
      originalConsoleLog(...args)
    }
    console.info = () => undefined
    console.debug = () => undefined
    console.table = () => undefined
    console.groupCollapsed = () => undefined
    console.groupEnd = () => undefined

    try {
      for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
        const seeds = seedsForRepeat(baseSeeds, runIndex - 1)
        const report = await runOneSeason(runIndex, batchId, runs, seeds, skill)
        const reportPath = path.join(
          outputDirectory,
          `run-${String(runIndex).padStart(3, '0')}.json`
        )
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
        const outcome = report.outcome!
        expect(outcome.aiSocialActions).toBeGreaterThan(0)
        summaries.push(
          `HEADLESS_SEASON ${runIndex}/${runs}: seed ${seeds.season} → ${outcome.humanWon ? 'human win' : `place ${outcome.humanPlacement ?? 'unknown'}`} in ${report.durationMs}ms`
        )
        if (runIndex % 10 === 0) originalConsoleLog(`Completed ${runIndex}/${runs} seeded seasons.`)
      }
    } finally {
      console.log = originalConsoleLog
      console.info = originalConsoleInfo
      console.debug = originalConsoleDebug
      console.table = originalConsoleTable
      console.groupCollapsed = originalConsoleGroupCollapsed
      console.groupEnd = originalConsoleGroupEnd
    }

    console.log(summaries.join('\n'))
    expect(summaries).toHaveLength(runs)
  },
  60 * 60_000
)

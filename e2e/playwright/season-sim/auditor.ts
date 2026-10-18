import { expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

import { readAppState } from '../support/test'
import type { CoverageLedger } from './coverage'
import { buildSimulationEyeoleanSample } from './economyCalibration'
import type {
  SeasonPerformanceCheckpoint,
  SimulationContext,
  SimulationFinding,
  SimulationSeasonOutcome,
  TimelineEntry,
} from './types'

const activeStatus = new Set(['active', 'jury'])
type StateSnapshot = Awaited<ReturnType<typeof readAppState>>

function gameDay(game: Awaited<ReturnType<typeof readAppState>>['game']): number {
  return game.modeSpecific?.kind === 'survival' ? game.modeSpecific.currentDay : game.week
}

function seasonOutcome(state: StateSnapshot, terminal: string): SimulationSeasonOutcome {
  const { game } = state
  const human = game.players.find((player) => player.isUser)
  const humanId = human?.id ?? null
  const winner = game.players.find((player) => player.isWinner || player.finalRank === 1)
  const reality = state.social.reality
  const alliances = Object.values(reality.alliances)
  const requests = Object.values(reality.allianceManagement.requests)
  const socialEvents = [
    ...reality.events,
    ...alliances.flatMap((alliance) => alliance.history ?? []),
    ...requests.flatMap((request) => request.history ?? []),
  ]
  const uniqueSocialEvents = [...new Map(socialEvents.map((event) => [event.id, event])).values()]
  const aiOnlyParticipants = (participantIds: string[]) =>
    humanId !== null && participantIds.length > 0 && participantIds.every((id) => id !== humanId)
  const aiOnlyEvents = uniqueSocialEvents.filter((event) =>
    aiOnlyParticipants(event.participantIds)
  )
  const hasAiOnlyAlliance = (alliance: (typeof alliances)[number]) =>
    alliance.status !== 'DISSOLVED' &&
    alliance.memberIds.length >= 2 &&
    aiOnlyParticipants(alliance.memberIds)
  const activePlayerCount = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  ).length
  const humanPlacement = human?.finalRank ?? human?.seasonPlacement ?? null
  const humanWon = Boolean(human && (human.isWinner || human.finalRank === 1))
  const humanIsActive = Boolean(human && human.status !== 'evicted' && human.status !== 'jury')
  const seasonComplete = game.seasonFinale?.phase === 'seasonComplete' || game.status !== 'active'
  const humanExited = human?.status === 'evicted' || human?.status === 'jury'

  return {
    resolved: humanWon || seasonComplete || Boolean(humanExited && humanPlacement !== null),
    terminal,
    humanId: human?.id ?? null,
    humanName: human?.name ?? null,
    humanStatus: human?.status ?? null,
    humanPlacement,
    humanWon,
    humanMadeJury: human?.status === 'jury',
    humanReachedFinalThree:
      humanPlacement !== null && humanPlacement <= 3
        ? true
        : humanIsActive && activePlayerCount <= 3,
    winnerId: winner?.id ?? null,
    winnerName: winner?.name ?? null,
    humanLohWins: human?.stats?.lohWins ?? 0,
    humanPosWins: human?.stats?.posWins ?? 0,
    humanNominations: human?.stats?.timesNominated ?? 0,
    aiOnlyFactionCount: alliances.filter(
      (alliance) => (alliance.kind ?? 'GROUP') !== 'PACT' && hasAiOnlyAlliance(alliance)
    ).length,
    aiOnlyPactCount: alliances.filter(
      (alliance) => alliance.kind === 'PACT' && hasAiOnlyAlliance(alliance)
    ).length,
    aiStrategyMeetings: aiOnlyEvents.filter((event) => event.type === 'ALLIANCE_STRATEGY_MEETING')
      .length,
    aiCoordinatedTargetMoves: aiOnlyEvents.filter(
      (event) => event.type === 'ALLIANCE_TARGET_COORDINATED'
    ).length,
    aiAllianceDefections: aiOnlyEvents.filter(
      (event) => event.type === 'ALLIANCE_PLAN_DEFIED' || event.type === 'ALLIANCE_BETRAYAL'
    ).length,
    aiAllianceLeaks: aiOnlyEvents.filter((event) => event.type === 'ALLIANCE_LEAKED').length,
    aiRomances: Object.values(reality.romances).filter(
      (romance) => romance.status !== 'ENDED' && aiOnlyParticipants(romance.participantIds)
    ).length,
    activePlayerCount,
    week: game.week,
  }
}

export class SeasonAuditor {
  readonly findings: SimulationFinding[] = []
  readonly timeline: TimelineEntry[] = []
  readonly checkpoints: Array<{ name: string; phase: string; day: number }> = []
  readonly performanceCheckpoints: SeasonPerformanceCheckpoint[] = []
  private lastPhase: string | null = null
  private lastWeek = 0
  private readonly announced = new Set<string>()

  constructor(
    private readonly context: SimulationContext,
    private readonly coverage: CoverageLedger
  ) {}

  async checkpoint(name: string, state?: StateSnapshot): Promise<void> {
    const observed = state ?? (await readAppState(this.context.page))
    const { game } = observed
    const day = gameDay(game)
    this.checkpoints.push({ name, phase: game.phase, day })
    this.auditState(name, observed)
    await this.auditLayout(name)
    await this.writeProgress(observed, `checkpoint:${name}`)
  }

  async record(
    action: string,
    module: string,
    note?: string,
    state?: StateSnapshot
  ): Promise<void> {
    const { game } = state ?? (await readAppState(this.context.page))
    this.timeline.push({
      atMs: Date.now() - this.context.startedAtMs,
      action,
      module,
      phase: game.phase,
      day: gameDay(game),
      ...(note ? { note } : {}),
    })
    await this.writeProgress(state ?? (await readAppState(this.context.page)), action)
  }

  recordPerformanceCheckpoint(checkpoint: SeasonPerformanceCheckpoint): void {
    this.performanceCheckpoints.push(checkpoint)
  }

  /** Persist the currently executing UI step so long runs remain diagnosable. */
  async markProgress(lastAction: string, state?: StateSnapshot): Promise<void> {
    await this.writeProgress(state ?? (await readAppState(this.context.page)), lastAction)
  }

  private async writeProgress(state: StateSnapshot, lastAction: string): Promise<void> {
    const game = state.game
    const payload = {
      updatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - this.context.startedAtMs,
      mode: this.context.config.mode,
      persona: this.context.config.personaId,
      batchId: this.context.config.batchId,
      runIndex: this.context.config.runIndex,
      seed: this.context.config.seeds,
      day: gameDay(game),
      phase: game.phase,
      lastAction,
      actions: this.timeline.length,
      findings: this.findings.length,
      objectivesVerified: this.coverage.values().filter((item) => item.status === 'verified')
        .length,
      objectivesTotal: this.coverage.values().length,
    }
    await writeFile(
      this.context.testInfo.outputPath('season-simulation-progress.json'),
      JSON.stringify(payload, null, 2),
      'utf8'
    )
  }

  async attachReport(name: string, terminal: string): Promise<void> {
    const state = await readAppState(this.context.page)
    const economySample = buildSimulationEyeoleanSample(state.game)
    const outcome = seasonOutcome(state, terminal)
    const compactEconomyReport = this.context.config.compactEconomyReport === true
    const report = {
      schemaVersion: 1,
      config: this.context.config,
      startedAt: new Date(this.context.startedAtMs).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - this.context.startedAtMs,
      actionCount: this.timeline.length,
      terminal,
      outcome,
      findings: this.findings,
      ...(economySample ? { economySample } : {}),
      ...(this.performanceCheckpoints.length > 0
        ? { performanceCheckpoints: this.performanceCheckpoints }
        : {}),
      ...(compactEconomyReport
        ? {}
        : {
            timeline: this.timeline,
            objectives: this.coverage.values(),
            checkpoints: this.checkpoints,
            finalState: {
              game: state.game,
              challenge: state.challenge,
              social: state.social,
              vip: state.vip,
            },
          }),
    }
    const reportJson = JSON.stringify(report, null, 2)
    await this.context.testInfo.attach(`${name}.json`, {
      body: reportJson,
      contentType: 'application/json',
    })
    const summary = [
      `# Season simulation: ${this.context.config.id}`,
      '',
      `Terminal: ${terminal}`,
      `Human result: ${outcome.humanWon ? 'won' : outcome.resolved ? 'lost' : 'unresolved'}${outcome.humanPlacement !== null ? ` · ${outcome.humanPlacement}${outcome.humanPlacement === 1 ? 'st' : outcome.humanPlacement === 2 ? 'nd' : outcome.humanPlacement === 3 ? 'rd' : 'th'} place` : ''}`,
      ...(outcome.winnerName ? [`Winner: ${outcome.winnerName}`] : []),
      `Seed: roster=${this.context.config.seeds.roster}, season=${this.context.config.seeds.season}, actor=${this.context.config.seeds.actor}`,
      ...(economySample
        ? [
            '',
            '## Eyeolean economy',
            `- payout: ${economySample.total.toLocaleString('en-US')}`,
            `- source: ${economySample.source}`,
          ]
        : []),
      ...(this.performanceCheckpoints.length > 0
        ? [
            '',
            '## Progression performance',
            ...this.performanceCheckpoints.map(
              (checkpoint) =>
                `- ${checkpoint.name} (day ${checkpoint.day}): input p95 ${checkpoint.metrics.inputResponseP95Ms ?? 'n/a'} ms; Redux p95 ${checkpoint.metrics.reduxActionP95Ms ?? 'n/a'} ms; frame-gap p95 ${checkpoint.metrics.frameGapP95Ms ?? 'n/a'} ms; ${checkpoint.frameGapsOver100Ms} frame gaps over 100 ms; state history/feed ${checkpoint.historyCount}/${checkpoint.tvFeedCount}.`
            ),
          ]
        : []),
      '',
      '## Objectives',
      ...this.coverage
        .values()
        .map(
          (objective) =>
            `- ${objective.status}: ${objective.id}${objective.evidence ? ` — ${objective.evidence}` : ''}`
        ),
      '',
      '## Findings',
      ...(this.findings.length
        ? this.findings.map(
            (finding) => `- ${finding.severity}/${finding.category}: ${finding.message}`
          )
        : ['- none']),
    ].join('\n')
    await writeFile(this.context.testInfo.outputPath(`${name}.json`), reportJson, 'utf8')
    await writeFile(this.context.testInfo.outputPath(`${name}.md`), summary, 'utf8')
    await this.context.testInfo.attach(`${name}.md`, {
      body: summary,
      contentType: 'text/markdown',
    })
  }

  async assertNoErrorsAtEnd(): Promise<void> {
    const errors = this.findings.filter((finding) => finding.severity === 'error')
    expect(errors, 'season-simulation auditor findings').toEqual([])
  }

  private finding(
    severity: SimulationFinding['severity'],
    category: SimulationFinding['category'],
    message: string,
    details?: Record<string, unknown>
  ): void {
    const last = this.checkpoints[this.checkpoints.length - 1]
    this.findings.push({
      severity,
      category,
      message,
      phase: last?.phase ?? 'unknown',
      day: last?.day ?? 0,
      ...(details ? { details } : {}),
    })
  }

  private auditState(checkpoint: string, state: StateSnapshot): void {
    const { game, challenge } = state
    const day = gameDay(game)
    if (!Number.isFinite(day) || day < 1)
      this.finding('error', 'logic', 'Season day is invalid.', { checkpoint, day })
    if (game.mode !== 'survival' && day < this.lastWeek)
      this.finding('error', 'logic', 'Finite-season day moved backwards.', {
        checkpoint,
        previous: this.lastWeek,
        day,
      })
    this.lastWeek = Math.max(this.lastWeek, day)
    if (
      this.lastPhase === game.phase &&
      this.timeline.length > this.context.config.maxActions &&
      challenge.pending == null
    ) {
      this.finding(
        'warning',
        'technical',
        'Phase did not change before the action budget was exhausted.',
        { checkpoint, phase: game.phase }
      )
    }
    this.lastPhase = game.phase

    const activePlayers = game.players.filter((player) => activeStatus.has(player.status))
    const knownIds = new Set(game.players.map((player) => player.id))
    const nomineeIds = game.nomineeIds ?? []
    if (
      new Set(nomineeIds).size !== nomineeIds.length ||
      nomineeIds.some((id) => !knownIds.has(id))
    ) {
      this.finding('error', 'logic', 'Nominee IDs are duplicate or unknown.', { nomineeIds })
    }
    if (game.lohId && !knownIds.has(game.lohId))
      this.finding('error', 'logic', 'LOH references an unknown player.', { lohId: game.lohId })
    if (game.posWinnerId && !knownIds.has(game.posWinnerId))
      this.finding('error', 'logic', 'Safety holder references an unknown player.', {
        posWinnerId: game.posWinnerId,
      })
    if (activePlayers.length === 0 && game.status === 'active')
      this.finding('error', 'logic', 'Active game has no active players.', { checkpoint })
    if (challenge.pending && challenge.pending.participants.some((id) => !knownIds.has(id))) {
      this.finding('error', 'logic', 'Competition includes an unknown participant.', {
        participants: challenge.pending.participants,
      })
    }

    const feedKeys = new Set<string>()
    for (const event of game.tvFeed) {
      const key = `${event.id}:${event.meta?.phase ?? ''}`
      if (feedKeys.has(key))
        this.finding('warning', 'ui', 'Duplicate announcement identity found in TV feed.', {
          event: key,
        })
      feedKeys.add(key)
      this.announced.add(key)
    }
  }

  private async auditLayout(checkpoint: string): Promise<void> {
    const page = this.context.page
    let layout:
      | {
          scrollWidth: number
          clientWidth: number
          buttons: Array<{
            label: string
            left: number
            top: number
            right: number
            bottom: number
            width: number
            height: number
          }>
          width: number
          height: number
        }
      | undefined
    for (let attempt = 0; attempt < 3 && !layout; attempt += 1) {
      try {
        layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          buttons: [...document.querySelectorAll('button:not([disabled])')]
            .slice(0, 120)
            .map((element) => {
              const rect = element.getBoundingClientRect()
              return {
                label:
                  element.getAttribute('aria-label') || element.textContent?.trim() || 'unnamed',
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              }
            }),
          width: window.innerWidth,
          height: window.innerHeight,
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const pageIsTransitioning =
          /execution context was destroyed|cannot find context with specified id|most likely because of a navigation/i.test(
            message
          )
        if (!pageIsTransitioning) throw error
        if (attempt === 2) return
        await page.waitForLoadState('domcontentloaded', { timeout: 3_000 }).catch(() => undefined)
        await page.waitForTimeout(100)
      }
    }
    if (!layout) return
    if (layout.scrollWidth > layout.clientWidth + 1) {
      this.finding('error', 'ui', 'Document has horizontal overflow.', { checkpoint, ...layout })
    }
    const offscreen = layout.buttons.find(
      (button) =>
        button.width > 0 &&
        button.height > 0 &&
        (button.right < 0 ||
          button.left > layout.width ||
          button.bottom < 0 ||
          button.top > layout.height)
    )
    if (offscreen)
      this.finding('warning', 'accessibility', 'An enabled button is outside the viewport.', {
        checkpoint,
        button: offscreen,
      })
  }
}

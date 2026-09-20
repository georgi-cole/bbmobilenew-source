import { expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

import { readAppState } from '../support/test'
import type { CoverageLedger } from './coverage'
import type { SimulationContext, SimulationFinding, TimelineEntry } from './types'

const activeStatus = new Set(['active', 'jury'])
type StateSnapshot = Awaited<ReturnType<typeof readAppState>>

function gameDay(game: Awaited<ReturnType<typeof readAppState>>['game']): number {
  return game.modeSpecific?.kind === 'survival' ? game.modeSpecific.currentDay : game.week
}

export class SeasonAuditor {
  readonly findings: SimulationFinding[] = []
  readonly timeline: TimelineEntry[] = []
  readonly checkpoints: Array<{ name: string; phase: string; day: number }> = []
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
  }

  async attachReport(name: string, terminal: string): Promise<void> {
    const state = await readAppState(this.context.page)
    const report = {
      schemaVersion: 1,
      config: this.context.config,
      startedAt: new Date(this.context.startedAtMs).toISOString(),
      finishedAt: new Date().toISOString(),
      terminal,
      timeline: this.timeline,
      findings: this.findings,
      objectives: this.coverage.values(),
      checkpoints: this.checkpoints,
      finalState: {
        game: state.game,
        challenge: state.challenge,
        social: state.social,
        vip: state.vip,
      },
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
      `Seed: roster=${this.context.config.seeds.roster}, season=${this.context.config.seeds.season}, actor=${this.context.config.seeds.actor}`,
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
    const layout = await this.context.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      buttons: [...document.querySelectorAll('button:not([disabled])')]
        .slice(0, 120)
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            label: element.getAttribute('aria-label') || element.textContent?.trim() || 'unnamed',
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

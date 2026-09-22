import { getAllGames } from '../../../src/minigames/registry'

import type { ObjectiveResult, ScenarioObjective, SeasonSimulationMode } from './types'

export const CORE_OBJECTIVES: readonly ScenarioObjective[] = [
  {
    id: 'fresh-day-one',
    description: 'A new profile starts Day 1 through visible controls.',
    modules: ['home', 'profile', 'season-start'],
  },
  {
    id: 'social-action',
    description: 'A social action changes its visible resource balance once.',
    modules: ['social', 'resources'],
    appliesTo: ['classic', 'voxPopuli', 'cupidArrow'],
  },
  {
    id: 'incoming-social',
    description: 'An incoming interaction is opened and resolved once.',
    modules: ['incoming-social'],
    appliesTo: ['classic', 'voxPopuli', 'cupidArrow'],
  },
  {
    id: 'loh-and-nomination',
    description: 'LOH and nomination flow reaches a valid visible decision.',
    modules: ['competition', 'nomination'],
    appliesTo: ['classic', 'voxPopuli', 'cupidArrow'],
  },
  {
    id: 'safety-and-vote',
    description: 'Safety and eviction vote flow accepts a legal player decision.',
    modules: ['competition', 'safety', 'vote'],
    appliesTo: ['classic', 'voxPopuli', 'cupidArrow'],
  },
  {
    id: 'reload-resume',
    description: 'A saved run reloads into the same phase without duplicate progression.',
    modules: ['persistence', 'navigation'],
  },
  {
    id: 'normal-to-vip',
    description: 'A mid-run entitlement refresh exposes the correct first-use state.',
    modules: ['store', 'entitlements'],
    requiresVip: true,
    assistedOnly: true,
  },
  {
    id: 'public-visibility',
    description: 'Public-facing information appears only after its reveal point.',
    modules: ['public-mode', 'hidden-information'],
    appliesTo: ['classic', 'voxPopuli'],
  },
  {
    id: 'cupid-pairs',
    description: 'Cupid pair restrictions and romance presentation remain consistent.',
    modules: ['cupid', 'relationships'],
    appliesTo: ['cupidArrow'],
  },
  {
    id: 'surveyeval-replacement',
    description:
      'Surveyeval replaces an eliminated Robo contestant while social stays unavailable.',
    modules: ['surveyeval', 'replacement', 'social'],
    appliesTo: ['survival'],
  },
  {
    id: 'finale-path',
    description: 'Final three, final decision, jury, recap, and archive remain single-commit.',
    modules: ['finale', 'archive'],
    appliesTo: ['classic', 'voxPopuli', 'cupidArrow'],
    assistedOnly: true,
  },
] as const

export const MINIGAME_OBJECTIVE_PREFIX = 'minigame:'

export function minigameObjectives(): ScenarioObjective[] {
  return getAllGames()
    .filter((game) => !game.retired || game.vipOnly)
    .map((game) => ({
      id: `${MINIGAME_OBJECTIVE_PREFIX}${game.key}`,
      description: `${game.title} receives real primary input and produces one result.`,
      modules: ['minigame', game.key],
      ...(game.vipOnly ? { requiresVip: true } : {}),
    }))
}

export function objectivesForMode(mode: SeasonSimulationMode): ScenarioObjective[] {
  return CORE_OBJECTIVES.filter(
    (objective) => !objective.appliesTo || objective.appliesTo.includes(mode)
  )
}

export class CoverageLedger {
  private readonly results = new Map<string, ObjectiveResult>()

  constructor(objectives: readonly ScenarioObjective[], mode: SeasonSimulationMode, vip: boolean) {
    for (const objective of objectives) {
      const status =
        (objective.appliesTo && !objective.appliesTo.includes(mode)) ||
        (objective.requiresVip && !vip)
          ? 'invalid'
          : objective.assistedOnly
            ? 'not-attempted'
            : 'not-attempted'
      this.results.set(objective.id, {
        id: objective.id,
        description: objective.description,
        status,
      })
    }
  }

  verify(id: string, evidence: string): void {
    const result = this.results.get(id)
    if (result && result.status !== 'invalid')
      this.results.set(id, { ...result, status: 'verified', evidence })
  }

  assisted(id: string, evidence: string): void {
    const result = this.results.get(id)
    if (result && result.status !== 'invalid')
      this.results.set(id, { ...result, status: 'assisted', evidence })
  }

  miss(id: string, evidence: string): void {
    const result = this.results.get(id)
    if (result && result.status === 'not-attempted')
      this.results.set(id, { ...result, status: 'missed', evidence })
  }

  values(): ObjectiveResult[] {
    return [...this.results.values()]
  }
}

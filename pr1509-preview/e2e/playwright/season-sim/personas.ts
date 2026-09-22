import { SeededRandom } from './seededRandom'
import type { PersonaDefinition, SimulationAction } from './types'

const tendencies = (values: PersonaDefinition['tendencies']): PersonaDefinition['tendencies'] =>
  values

export const PERSONAS: readonly PersonaDefinition[] = [
  {
    id: 'strategic-operator',
    label: 'Strategic Operator',
    description: 'Builds a compact power structure and targets visible threats.',
    tendencies: tendencies({
      sociability: 55,
      loyalty: 65,
      betrayal: 35,
      risk: 60,
      competitionEffort: 70,
      resourceSpending: 55,
      romance: 15,
      conflict: 30,
      informationSeeking: 90,
    }),
  },
  {
    id: 'social-butterfly',
    label: 'Social Butterfly',
    description: 'Prioritizes broad, repeated relationship building.',
    tendencies: tendencies({
      sociability: 100,
      loyalty: 60,
      betrayal: 15,
      risk: 45,
      competitionEffort: 50,
      resourceSpending: 75,
      romance: 45,
      conflict: 20,
      informationSeeking: 65,
    }),
  },
  {
    id: 'loyalist',
    label: 'Loyalist',
    description: 'Prefers commitments and avoids betraying allies.',
    tendencies: tendencies({
      sociability: 70,
      loyalty: 100,
      betrayal: 0,
      risk: 30,
      competitionEffort: 55,
      resourceSpending: 45,
      romance: 35,
      conflict: 15,
      informationSeeking: 50,
    }),
  },
  {
    id: 'betrayer-snake',
    label: 'Betrayer / Snake',
    description: 'Builds leverage, then defects when it improves position.',
    tendencies: tendencies({
      sociability: 75,
      loyalty: 10,
      betrayal: 100,
      risk: 70,
      competitionEffort: 55,
      resourceSpending: 60,
      romance: 30,
      conflict: 55,
      informationSeeking: 85,
    }),
  },
  {
    id: 'lone-wolf',
    label: 'Lone Wolf',
    description: 'Avoids commitments and relies on personal survival.',
    tendencies: tendencies({
      sociability: 10,
      loyalty: 20,
      betrayal: 30,
      risk: 50,
      competitionEffort: 85,
      resourceSpending: 20,
      romance: 0,
      conflict: 30,
      informationSeeking: 35,
    }),
  },
  {
    id: 'competition-beast',
    label: 'Competition Beast',
    description: 'Treats every challenge as a high-effort opportunity.',
    tendencies: tendencies({
      sociability: 35,
      loyalty: 45,
      betrayal: 30,
      risk: 55,
      competitionEffort: 100,
      resourceSpending: 45,
      romance: 10,
      conflict: 35,
      informationSeeking: 45,
    }),
  },
  {
    id: 'competition-thrower',
    label: 'Competition Thrower',
    description: 'Sometimes gives a plausible weak performance to hide threat level.',
    tendencies: tendencies({
      sociability: 50,
      loyalty: 40,
      betrayal: 50,
      risk: 65,
      competitionEffort: 5,
      resourceSpending: 35,
      romance: 15,
      conflict: 30,
      informationSeeking: 70,
    }),
  },
  {
    id: 'floater',
    label: 'Floater',
    description: 'Keeps options open and adapts to visible house momentum.',
    tendencies: tendencies({
      sociability: 60,
      loyalty: 35,
      betrayal: 45,
      risk: 35,
      competitionEffort: 40,
      resourceSpending: 35,
      romance: 20,
      conflict: 15,
      informationSeeking: 75,
    }),
  },
  {
    id: 'chaos-agent',
    label: 'Chaos Agent',
    description: 'Selects unusual but legal choices to expose edge paths.',
    tendencies: tendencies({
      sociability: 75,
      loyalty: 20,
      betrayal: 70,
      risk: 100,
      competitionEffort: 55,
      resourceSpending: 80,
      romance: 35,
      conflict: 100,
      informationSeeking: 60,
    }),
  },
  {
    id: 'risk-averse',
    label: 'Risk-Averse',
    description: 'Avoids volatile choices and preserves safe options.',
    tendencies: tendencies({
      sociability: 45,
      loyalty: 70,
      betrayal: 5,
      risk: 0,
      competitionEffort: 55,
      resourceSpending: 20,
      romance: 15,
      conflict: 5,
      informationSeeking: 70,
    }),
  },
  {
    id: 'resource-hoarder',
    label: 'Resource Hoarder',
    description: 'Conserves energy, influence, and information.',
    tendencies: tendencies({
      sociability: 30,
      loyalty: 55,
      betrayal: 25,
      risk: 25,
      competitionEffort: 50,
      resourceSpending: 0,
      romance: 10,
      conflict: 20,
      informationSeeking: 90,
    }),
  },
  {
    id: 'resource-spender',
    label: 'Resource Spender',
    description: 'Uses available social resources early and often.',
    tendencies: tendencies({
      sociability: 85,
      loyalty: 50,
      betrayal: 35,
      risk: 70,
      competitionEffort: 50,
      resourceSpending: 100,
      romance: 35,
      conflict: 45,
      informationSeeking: 75,
    }),
  },
  {
    id: 'romantic',
    label: 'Romantic',
    description: 'Looks for mutual relationship and Cupid paths.',
    tendencies: tendencies({
      sociability: 90,
      loyalty: 75,
      betrayal: 20,
      risk: 50,
      competitionEffort: 40,
      resourceSpending: 65,
      romance: 100,
      conflict: 15,
      informationSeeking: 55,
    }),
  },
  {
    id: 'villain',
    label: 'Villain',
    description: 'Creates visible conflict and accepts social consequences.',
    tendencies: tendencies({
      sociability: 65,
      loyalty: 15,
      betrayal: 70,
      risk: 85,
      competitionEffort: 60,
      resourceSpending: 75,
      romance: 15,
      conflict: 100,
      informationSeeking: 60,
    }),
  },
  {
    id: 'exploit-breaker',
    label: 'Exploit / Breaker',
    description: 'Uses legal rapid and interrupted inputs to seek duplicate effects.',
    tendencies: tendencies({
      sociability: 35,
      loyalty: 25,
      betrayal: 50,
      risk: 100,
      competitionEffort: 65,
      resourceSpending: 60,
      romance: 10,
      conflict: 50,
      informationSeeking: 100,
    }),
  },
] as const

export function getPersona(id: string): PersonaDefinition {
  const persona = PERSONAS.find((candidate) => candidate.id === id)
  if (!persona) throw new Error(`Unknown season-simulation persona '${id}'.`)
  return persona
}

/**
 * Scores actions with an explicit module signal plus a small seeded tie-break.
 * Actions never expose hidden game state to this policy.
 */
export function choosePersonaAction(
  persona: PersonaDefinition,
  actions: readonly SimulationAction[],
  random: SeededRandom
): SimulationAction {
  const preference = (action: SimulationAction): number => {
    const label = `${action.module} ${action.label}`.toLowerCase()
    let score = 20
    if (/social|alliance|relationship|incoming/.test(label)) score += persona.tendencies.sociability
    if (/risk|bet|steal|betray|conflict/.test(label))
      score += persona.tendencies.risk + persona.tendencies.betrayal
    if (/resource|energy|influence|spend/.test(label)) score += persona.tendencies.resourceSpending
    if (/romance|cupid/.test(label)) score += persona.tendencies.romance
    if (/competition|minigame/.test(label)) score += persona.tendencies.competitionEffort
    if (/reload|double|back/.test(label)) score += persona.id === 'exploit-breaker' ? 150 : 0
    return score + random.next() * 0.99
  }
  return actions
    .map((action) => ({ action, weight: preference(action) }))
    .sort((a, b) => b.weight - a.weight)[0]!.action
}

import { describe, expect, it } from 'vitest'
import {
  getMinigameTargetPriority,
  orderMinigameTargets,
  type MinigameStrategicContext,
} from '../../src/ai/competition/allianceMinigameStrategy'
import {
  buildAiVoteRecords,
  createChainOfGreedPlayers,
} from '../../src/components/ChainOfGreed/chainOfGreedLogic'
import { aiPickFighters } from '../../src/features/blackjackTournament/blackjackTournamentSlice'
import {
  precomputeAiEliminationChoice,
  precomputeAiNextPair,
} from '../../src/features/wildcardWestern/wildcardWesternAi'
import {
  pickSurvivorJuryVoteForAi,
  pickVictimForAi,
  pickVoteForAi,
} from '../../src/features/silentSaboteur/helpers'
import {
  chooseChamberAiAction,
  createChamberState,
} from '../../src/components/GridOfLuck/chamberGame'
import type { StrategicAllianceSnapshot } from '../../src/types'

const alliance: StrategicAllianceSnapshot = {
  id: 'pact-alpha',
  memberIds: ['actor', 'ally'],
  leaderIds: ['ally'],
  status: 'ACTIVE',
  cohesion: 0.96,
  fractureRisk: 0.04,
  currentTargetIds: [],
  fallbackTargetIds: [],
  memberCommitment: { actor: 0.98, ally: 0.99 },
  memberPerceivedStatus: { actor: 'CORE', ally: 'CORE' },
  memberPlanBeliefs: {},
  infiltratorIds: [],
}

const strategicContext: MinigameStrategicContext = {
  alliances: [alliance],
  relationships: {
    actor: {
      enemy: { affinity: -60, tags: ['rivalry'] },
      friend: { affinity: 70, tags: ['friend'] },
    },
  },
}

describe('shared minigame targeting strategy', () => {
  it('orders active enemies before neutrals, friends, and committed pact members', () => {
    const ranked = orderMinigameTargets(
      ['ally', 'friend', 'neutral', 'enemy'].map((id) => ({ id })),
      'actor',
      strategicContext
    )

    expect(ranked.map(({ id }) => id)).toEqual(['enemy', 'neutral', 'friend', 'ally'])
  })

  it('lets fractured, low-commitment alliances be targeted more readily', () => {
    const fracturedContext: MinigameStrategicContext = {
      alliances: [
        {
          ...alliance,
          status: 'FRACTURED',
          cohesion: 0.2,
          fractureRisk: 0.92,
          memberCommitment: { actor: 0.18, ally: 0.25 },
        },
      ],
    }

    expect(getMinigameTargetPriority(fracturedContext, 'actor', 'ally')).toBeGreaterThan(
      getMinigameTargetPriority(strategicContext, 'actor', 'ally')
    )
  })

  it('votes out an enemy in Chain of Greed even when the ally performed worse', () => {
    const players = createChainOfGreedPlayers(
      [
        { id: 'actor', name: 'Actor', avatar: '', isHuman: false, precomputedScore: 70 },
        { id: 'ally', name: 'Ally', avatar: '', isHuman: false, precomputedScore: 50 },
        { id: 'enemy', name: 'Enemy', avatar: '', isHuman: false, precomputedScore: 80 },
      ],
      () => 0.5
    )
    const ally = players.find((player) => player.id === 'ally')!
    ally.roundWrongGuesses = 10
    ally.roundBusts = 5
    ally.roundContribution = 0

    const actorVote = buildAiVoteRecords({
      activePlayers: players,
      roundNumber: 1,
      seed: 55,
      strategicContext,
    }).find((vote) => vote.voterId === 'actor')

    expect(actorVote?.targetId).toBe('enemy')
  })

  it('sends enemies into elimination duels before pact members in Blackjack and Wildcard Western', () => {
    const blackjackPair = aiPickFighters(
      91,
      0,
      'actor',
      ['actor', 'ally', 'enemy', 'neutral'],
      strategicContext
    )
    const westernPair = precomputeAiNextPair(
      'actor',
      ['actor', 'ally', 'enemy', 'neutral'],
      91,
      0,
      strategicContext
    )
    const westernElimination = precomputeAiEliminationChoice(
      'actor',
      ['actor', 'ally', 'enemy', 'neutral'],
      91,
      0,
      strategicContext
    )

    expect(blackjackPair).not.toBeNull()
    expect([blackjackPair!.fighterAId, blackjackPair!.fighterBId]).toContain('enemy')
    expect([blackjackPair!.fighterAId, blackjackPair!.fighterBId]).not.toContain('ally')
    expect(westernPair).toContain('enemy')
    expect(westernPair).not.toContain('ally')
    expect(westernElimination).toBe('enemy')
  })

  it('selects enemies as Silent Saboteur victims and Mystic Chamber attack targets', () => {
    expect(
      pickVictimForAi(7, 1, 'actor', ['actor', 'ally', 'enemy', 'neutral'], strategicContext)
    ).toBe('enemy')

    const chamberState = createChamberState(
      [
        { id: 'actor', name: 'Actor', isHuman: false },
        { id: 'ally', name: 'Ally', isHuman: false },
        { id: 'enemy', name: 'Enemy', isHuman: false },
      ],
      7
    )
    chamberState.offers = ['siphon']
    const attack = chooseChamberAiAction(
      chamberState,
      strategicContext.relationships,
      () => 0,
      strategicContext.alliances
    )

    expect(attack.action).toBe('siphon')
    expect(attack.targetId).toBe('enemy')
  })

  it('keeps strong Silent Saboteur evidence ahead of alliance preference', () => {
    const evidence = {
      ally: { score: 88, observations: [] },
      enemy: { score: 36, observations: [] },
    }
    let evidenceVotesForAlly = 0
    let defaultVotesForAlly = 0

    for (let seed = 1; seed <= 64; seed++) {
      const candidates = ['actor', 'ally', 'enemy']
      if (
        pickVoteForAi(seed, 1, 'actor', candidates, null, undefined, strategicContext) === 'ally'
      ) {
        defaultVotesForAlly += 1
      }
      if (
        pickVoteForAi(seed, 1, 'actor', candidates, null, evidence, strategicContext) === 'ally'
      ) {
        evidenceVotesForAlly += 1
      }
    }

    expect(evidenceVotesForAlly).toBeGreaterThan(32)
    expect(evidenceVotesForAlly).toBeGreaterThan(defaultVotesForAlly)
  })

  it('favors a committed pact member in a Silent Saboteur survivor jury', () => {
    let pactVotes = 0
    let enemyVotes = 0

    for (let seed = 1; seed <= 48; seed++) {
      const winner = pickSurvivorJuryVoteForAi(seed, 'actor', ['ally', 'enemy'], strategicContext)
      if (winner === 'ally') pactVotes += 1
      else enemyVotes += 1
    }

    expect(pactVotes).toBeGreaterThan(enemyVotes)
  })
})

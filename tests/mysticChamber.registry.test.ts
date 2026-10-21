import { describe, expect, it } from 'vitest'
import { CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS } from '../src/ai/competition/bracketTemplate'
import { minigameAiRegistry } from '../src/ai/competition/minigameAiRegistry'
import {
  CHAMBER_FORBIDDEN_OPENINGS,
  CHAMBER_ROUNDS,
  chooseChamberExecutionTarget,
  createChamberState,
  resolveChamberAction,
} from '../src/components/GridOfLuck/chamberGame'
import reactComponents from '../src/minigames/reactComponents'
import { getPoolByFilter } from '../src/minigames/registry'
import type { RelationshipsMap } from '../src/social/types'

describe('Mystic Chamber activation', () => {
  it('registers Mystic Chamber in active game and campaign pools', () => {
    const chamber = getPoolByFilter({ retired: false }).find((game) => game.key === 'mysticChamber')

    expect(chamber?.title).toBe('Mystic Chamber')
    expect(chamber?.retired).toBe(false)
    expect(chamber?.reactComponentKey).toBe('MysticChamber')
    expect(reactComponents.MysticChamber).toBeDefined()
    expect(getPoolByFilter({ retired: false }).map((game) => game.key)).toContain('mysticChamber')
    expect(CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS).toContain('mysticChamber')
    expect(minigameAiRegistry.mysticChamber).toBeDefined()
  })

  it('keeps the match at six rounds and allows three Forbidden Box openings', () => {
    expect(CHAMBER_ROUNDS).toBe(6)
    expect(CHAMBER_FORBIDDEN_OPENINGS).toBe(3)

    let state = createChamberState(
      [
        { id: 'human', name: 'You', isHuman: true },
        { id: 'ai', name: 'AI', isHuman: false },
      ],
      424242
    )
    for (let opening = 0; opening < CHAMBER_FORBIDDEN_OPENINGS; opening += 1) {
      state = resolveChamberAction(state, 'forbidden', undefined, () => 0)
      if (opening < CHAMBER_FORBIDDEN_OPENINGS - 1) {
        state = resolveChamberAction(state, 'surge', undefined, () => 0)
      }
    }
    const fourthOpening = resolveChamberAction(state, 'forbidden', undefined, () => 0)
    expect(fourthOpening.forbiddenOpeningsUsed).toBe(CHAMBER_FORBIDDEN_OPENINGS)
    expect(fourthOpening).toBe(state)
  })

  it('uses rival relationships to choose a hostile Forbidden Box target', () => {
    const state = createChamberState(
      [
        { id: 'actor', name: 'You', isHuman: true },
        { id: 'ally', name: 'Ally', isHuman: false },
        { id: 'rival', name: 'Rival', isHuman: false },
      ],
      7
    )
    const relationships: RelationshipsMap = {
      actor: {
        ally: { affinity: 50, tags: ['alliance'] },
        rival: { affinity: -40, tags: ['rivalry'] },
      },
    }
    const stateWithPendingExecution = {
      ...state,
      pendingBox: { actorId: 'actor', effect: 'execution' as const },
    }

    expect(chooseChamberExecutionTarget(stateWithPendingExecution, relationships)?.id).toBe('rival')
  })
})

import { describe, expect, it } from 'vitest'

import {
  CHAMBER_ACTIONS,
  CHAMBER_FORBIDDEN_OPENINGS,
  CHAMBER_ROUNDS,
  createChamberState,
  getChamberActionNeedsTarget,
  getChamberActor,
  getChamberTargetPlayers,
  isChamberFinished,
  resolveChamberAction,
  resolveChamberBoxTarget,
  skipEliminatedTurn,
  type ChamberAction,
  type ChamberParticipant,
  type ChamberState,
} from '../src/components/GridOfLuck/chamberGame'
import { mulberry32 } from '../src/store/rng'

function participants(count: number): ChamberParticipant[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: 'player-' + (index + 1),
    name: index === 0 ? 'You' : 'AI ' + index,
    isHuman: index === 0,
  }))
}

function scriptedRandom(...values: number[]): () => number {
  let index = 0
  return () => values[index++] ?? 0
}

function assertStateInvariants(state: ChamberState, roster: readonly ChamberParticipant[]): void {
  const expectedIds = roster.map((player) => player.id)
  const actualIds = state.players.map((player) => player.id)
  if (state.players.length !== roster.length || new Set(actualIds).size !== roster.length) {
    throw new Error('The player roster was lost or duplicated.')
  }
  if (expectedIds.some((id) => !actualIds.includes(id))) {
    throw new Error('The game introduced or lost a participant.')
  }
  if (
    state.players.some(
      (player) =>
        !Number.isFinite(player.power) ||
        player.power < 0 ||
        (player.eliminated && player.power !== 0)
    )
  ) {
    throw new Error('A player has invalid Power or an inconsistent elimination state.')
  }
  if (
    state.completedTurns < 0 ||
    state.completedTurns > roster.length * CHAMBER_ROUNDS ||
    state.forbiddenOpeningsUsed < 0 ||
    state.forbiddenOpeningsUsed > CHAMBER_FORBIDDEN_OPENINGS
  ) {
    throw new Error('The game exceeded a turn or Forbidden Box boundary.')
  }
  for (const event of state.events) {
    if (!expectedIds.includes(event.actorId)) throw new Error('An event named an unknown actor.')
    if (event.targetId && !expectedIds.includes(event.targetId)) {
      throw new Error('An event named an unknown target.')
    }
    if (
      event.changes.some(
        (change) =>
          !expectedIds.includes(change.playerId) ||
          !Number.isFinite(change.before) ||
          !Number.isFinite(change.after) ||
          change.before < 0 ||
          change.after < 0
      )
    ) {
      throw new Error('An event contains an invalid score change.')
    }
  }
}

function runSeededMatch(
  seed: number,
  playerCount: number
): {
  state: ChamberState
  actions: ChamberAction[]
} {
  const roster = participants(playerCount)
  const random = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  let state = createChamberState(roster, seed)
  const actions: ChamberAction[] = []

  for (let step = 0; step < playerCount * CHAMBER_ROUNDS + playerCount; step += 1) {
    if (isChamberFinished(state)) break
    const turnsBefore = state.completedTurns
    const actor = getChamberActor(state)

    if (actor.eliminated) {
      state = skipEliminatedTurn(state, random)
    } else {
      const offers = state.offers
        .filter(
          (action) =>
            action !== 'forbidden' || state.forbiddenOpeningsUsed < CHAMBER_FORBIDDEN_OPENINGS
        )
        .filter(
          (action) =>
            !getChamberActionNeedsTarget(action, state) ||
            getChamberTargetPlayers(state, action).length > 0
        )
      if (offers.length === 0) throw new Error('The active player has no legal offered action.')

      const action = offers[Math.floor(random() * offers.length)]
      if (!action) throw new Error('The seeded player could not choose an offered action.')
      actions.push(action)
      const targets = getChamberTargetPlayers(state, action)
      const target = targets[Math.floor(random() * targets.length)]
      let next = resolveChamberAction(state, action, target?.id, random)

      if (next.pendingBox) {
        const boxActorId = next.pendingBox.actorId
        const boxTargets = next.players.filter(
          (player) => !player.eliminated && player.id !== boxActorId
        )
        if (boxTargets.length === 0) {
          throw new Error('The Forbidden Box requested a target when no rival was alive.')
        }
        const boxTarget = boxTargets[Math.floor(random() * boxTargets.length)]
        if (!boxTarget) throw new Error('The Forbidden Box could not select a living target.')
        next = resolveChamberBoxTarget(next, boxTarget.id, random)
      }

      state = next
    }

    assertStateInvariants(state, roster)
    if (!isChamberFinished(state) && state.completedTurns <= turnsBefore) {
      throw new Error('A valid turn did not advance the match.')
    }
  }

  if (!isChamberFinished(state))
    throw new Error('The match did not reach its scheduled final turn.')
  if (!state.winnerId || !roster.some((player) => player.id === state.winnerId)) {
    throw new Error('The finished match did not name a participant as its winner.')
  }
  return { state, actions }
}

function roundFiveState(): ChamberState {
  const initial = createChamberState(participants(4), 514)
  return {
    ...initial,
    completedTurns: 16,
    offers: ['forbidden'],
    events: [],
    lastEvent: null,
    forbiddenOpeningsUsed: 0,
  }
}

function resolveBoxRoll(roll: number, followup: number): ChamberState {
  let state = resolveChamberAction(
    roundFiveState(),
    'forbidden',
    undefined,
    scriptedRandom(roll, followup, 0, 0, 0)
  )
  if (state.pendingBox) {
    state = resolveChamberBoxTarget(state, 'player-2', () => 0)
  }
  return state
}

describe('Mystic Chamber seeded gameplay', () => {
  it('offers and resolves every power through the same turn and result contract', () => {
    const actions: ChamberAction[] = [...CHAMBER_ACTIONS, 'forbidden']

    for (const action of actions) {
      let state = createChamberState(participants(3), 77)
      state = { ...state, offers: [action] }
      const targets = getChamberTargetPlayers(state, action)
      const target = getChamberActionNeedsTarget(action, state) ? targets[0] : undefined
      expect(
        getChamberActionNeedsTarget(action, state) ? target : true,
        action + ' has an available target'
      ).toBeTruthy()

      let next = resolveChamberAction(state, action, target?.id, () => 0)
      if (next.pendingBox) next = resolveChamberBoxTarget(next, 'player-2', () => 0)

      expect(next.completedTurns, action + ' advances exactly one scheduled turn').toBe(1)
      expect(next.events, action + ' produces one visible result').toHaveLength(1)
      expect(next.events[0]?.action).toBe(action)
      expect(() => assertStateInvariants(next, participants(3))).not.toThrow()
    }
  })

  it('replays the same seed to exactly the same match and outcome', () => {
    expect(runSeededMatch(424242, 4)).toEqual(runSeededMatch(424242, 4))
  })

  it('completes reproducibly with minimum, maximum, and intermediate participant counts', () => {
    for (const count of [2, 3, 4, 5]) {
      for (const seed of [0, 1, 7, 42, 424242, 999983, 0xffffffff]) {
        const result = runSeededMatch(seed, count)
        expect(isChamberFinished(result.state), count + ' players seed ' + seed).toBe(true)
        expect(result.state.winnerId).toBeTruthy()
      }
    }
  })

  it('covers every Forbidden Box result branch with reproducible rolls', () => {
    const cases: Array<{ name: string; roll: number; followup: number; expected: string }> = [
      { name: 'boon', roll: 0.1, followup: 0.1, expected: 'boon' },
      { name: 'twist', roll: 0.4, followup: 0.1, expected: 'twist' },
      { name: 'setback', roll: 0.75, followup: 0, expected: 'setback' },
      { name: 'wipe', roll: 0.85, followup: 0, expected: 'wipe' },
      { name: 'execution', roll: 0.95, followup: 0.1, expected: 'execution' },
      { name: 'backfire', roll: 0.95, followup: 0.9, expected: 'backfire' },
    ]

    for (const scenario of cases) {
      const state = resolveBoxRoll(scenario.roll, scenario.followup)
      expect(state.lastEvent?.boxOutcome, scenario.name).toBe(scenario.expected)
      expect(state.forbiddenOpeningsUsed).toBe(1)
      expect(() => assertStateInvariants(state, participants(4))).not.toThrow()
    }
  })

  it('keeps each Forbidden Box twist distinct and resolves its target', () => {
    for (const [twistRoll, effect] of [
      [0.05, 'steal'],
      [0.4, 'swap'],
      [0.8, 'hex'],
    ] as const) {
      const initial = roundFiveState()
      const pending = resolveChamberAction(
        initial,
        'forbidden',
        undefined,
        scriptedRandom(0.4, twistRoll, 0, 0)
      )
      expect(pending.pendingBox?.effect).toBe(effect)
      const resolved = resolveChamberBoxTarget(pending, 'player-2', () => 0)
      expect(resolved.lastEvent?.boxOutcome).toBe('twist')
      expect(resolved.lastEvent?.targetId).toBe('player-2')
      expect(resolved.pendingBox).toBeNull()
      expect(resolved.completedTurns).toBeGreaterThan(initial.completedTurns)
    }
  })

  it('blocks a hostile effect with a Ward, then consumes the Ward once', () => {
    const initial = createChamberState(participants(3), 8)
    const state = {
      ...initial,
      offers: ['siphon'] as ChamberAction[],
      players: initial.players.map((player) =>
        player.id === 'player-2' ? { ...player, ward: true } : player
      ),
    }
    const after = resolveChamberAction(state, 'siphon', 'player-2', () => 0)
    expect(after.players.find((player) => player.id === 'player-2')?.power).toBe(500)
    expect(after.players.find((player) => player.id === 'player-2')?.ward).toBe(false)
    expect(after.players.find((player) => player.id === 'player-1')?.power).toBe(500)
  })

  it('keeps immunity for the protected target when a rival attacks', () => {
    const initial = createChamberState(participants(3), 9)
    const state = {
      ...initial,
      offers: ['siphon'] as ChamberAction[],
      players: initial.players.map((player) =>
        player.id === 'player-2' ? { ...player, immune: true } : player
      ),
    }
    const after = resolveChamberAction(state, 'siphon', 'player-2', () => 0)
    expect(after.players.find((player) => player.id === 'player-2')?.power).toBe(500)
    expect(after.players.find((player) => player.id === 'player-2')?.immune).toBe(true)
  })

  it('applies the doubled Power gain once and consumes its preparation', () => {
    const initial = createChamberState(participants(2), 10)
    const state = {
      ...initial,
      offers: ['surge'] as ChamberAction[],
      players: initial.players.map((player) =>
        player.id === 'player-1' ? { ...player, doubleGain: true } : player
      ),
    }
    const after = resolveChamberAction(state, 'surge', undefined, () => 0)
    expect(after.players.find((player) => player.id === 'player-1')?.power).toBe(760)
    expect(after.players.find((player) => player.id === 'player-1')?.doubleGain).toBe(false)
  })

  it('doubles a cursed target loss once and then clears the curse', () => {
    const initial = createChamberState(participants(3), 11)
    const state = {
      ...initial,
      offers: ['siphon'] as ChamberAction[],
      players: initial.players.map((player) =>
        player.id === 'player-2' ? { ...player, doubleLoss: true } : player
      ),
    }
    const after = resolveChamberAction(state, 'siphon', 'player-2', () => 0)
    expect(after.players.find((player) => player.id === 'player-2')?.power).toBe(340)
    expect(after.players.find((player) => player.id === 'player-2')?.doubleLoss).toBe(false)
    expect(after.players.find((player) => player.id === 'player-1')?.power).toBe(660)
  })

  it('breaks a tied final Power score using Round 6 gain, then unique seeded sigils', () => {
    const roster = participants(4)
    const base = createChamberState(roster, 21)
    const roundGainState: ChamberState = {
      ...base,
      completedTurns: 23,
      offers: ['ward'],
      players: base.players.map((player) => ({
        ...player,
        power: player.id === 'player-3' ? 900 : player.id === 'player-4' ? 800 : 1000,
      })),
      events: [
        {
          round: 6,
          actorId: 'player-2',
          action: 'surge',
          message: 'Prior round gain for tie-break fixture.',
          changes: [{ playerId: 'player-2', before: 500, after: 550 }],
        },
      ],
    }
    const roundGain = resolveChamberAction(roundGainState, 'ward', 'player-1', () => 0.25)
    expect(roundGain.winnerId).toBe('player-2')
    expect(roundGain.tieBreak?.method).toBe('round-gain')

    const sigilState: ChamberState = {
      ...base,
      completedTurns: 23,
      offers: ['ward'],
      players: base.players.map((player) => ({ ...player, power: 1000 })),
      events: [],
    }
    const sigil = resolveChamberAction(sigilState, 'ward', 'player-1', () => 0.25)
    expect(sigil.tieBreak?.method).toBe('sigil')
    expect(sigil.tieBreak?.sigils).toHaveLength(4)
    expect(new Set(sigil.tieBreak?.sigils?.map((entry) => entry.playerId)).size).toBe(4)
    expect(sigil.tieBreak?.sigils?.some((entry) => entry.playerId === sigil.winnerId)).toBe(true)
  })
})

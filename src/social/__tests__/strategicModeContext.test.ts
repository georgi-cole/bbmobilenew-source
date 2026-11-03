import { describe, expect, it, vi } from 'vitest'
import {
  resolveActorStrategicRead,
  resolveStrategicModeContext,
  type StrategicGameRead,
} from '../strategicModeContext'
import { withStrategicPlanningContext } from '../strategicPlanningContext'
import { chooseActionFor } from '../SocialPolicy'
import gameReducer, { createInitialGameState, advance } from '../../store/gameSlice'

function fixture(overrides: Partial<StrategicGameRead> = {}): StrategicGameRead {
  return {
    phase: 'social_1',
    week: 2,
    lohId: 'a',
    posWinnerId: 'b',
    players: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, status: 'active' as const })),
    nomineeIds: ['c', 'd'],
    ...overrides,
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

describe('strategic mode diagnostic context', () => {
  it.each([false, true])(
    'separates Vox authority from Public Meter visibility (%s)',
    (publicModeEnabled) => {
      const game = fixture({
        publicModeEnabled,
        voxPopuli: { status: 'active', immunityWinnerId: 'a', autoNomineeId: 'c' },
      })
      const read = resolveStrategicModeContext(game)
      expect(read.format).toBe('vox')
      expect(read.authority).toEqual({
        nominations: 'house_secret_ballots',
        replacement: 'house_secret_ballots',
        eviction: 'audience',
        winner: 'audience',
      })
      expect(read.powers).toEqual({
        lohIds: [],
        immunityWinnerId: 'a',
        safetyHolderId: 'b',
        safetyCoholderIds: [],
      })
      expect(read.publicMeterVisible).toBe(publicModeEnabled)
      expect(read.capabilities).toEqual({
        nominationLobbying: false,
        lohProtection: false,
        replacementLobbying: false,
        safetyRequests: true,
        houseVoteCoordination: false,
        audienceSensitiveChoices: true,
      })
      expect(resolveActorStrategicRead(game, 'a')).toMatchObject({
        holdsLoh: false,
        holdsImmunity: true,
        audiencePerception: 'unknown',
      })
      expect(resolveActorStrategicRead(game, 'c')).toMatchObject({
        nominated: true,
        automaticNominee: true,
      })
    }
  )

  it.each(['inactive', 'scheduled', 'complete'] as const)('does not activate %s Vox', (status) => {
    const read = resolveStrategicModeContext(
      fixture({ voxPopuli: { status, immunityWinnerId: 'a', autoNomineeId: 'c' } })
    )
    expect(read.format).toBe('classic')
    expect(read.expansionStatus.vox).toBe(status)
    expect(read.authority).toEqual({
      nominations: 'loh',
      replacement: 'loh',
      eviction: 'house_vote',
      winner: 'tribunal',
    })
    expect(read.powers.immunityWinnerId).toBeNull()
  })

  it.each([false, true])('retains Classic powers with Public Mode %s', (publicModeEnabled) => {
    const read = resolveStrategicModeContext(
      fixture({
        publicModeEnabled,
        coLohIds: ['a', 'b', 'a'],
        doubleEviction: { weekActive: true },
      })
    )
    expect(read.powers.lohIds).toEqual(['a', 'b'])
    expect(read.doubleEviction).toBe(true)
    expect(read.authority.eviction).toBe('house_vote')
    expect(read.capabilities.audienceSensitiveChoices).toBe(publicModeEnabled)
  })

  it('isolates Cupid and Survival even with stale active Vox fields', () => {
    const game = fixture({
      voxPopuli: { status: 'active', immunityWinnerId: 'a', autoNomineeId: 'c' },
      cupidArrow: { status: 'active' },
    })
    expect(resolveStrategicModeContext(game).format).toBe('cupid')
    const survival = resolveStrategicModeContext({
      ...game,
      mode: 'survival',
      publicModeEnabled: true,
    })
    expect(survival.format).toBe('survival')
    expect(survival.authority).toEqual({
      nominations: 'loh',
      replacement: 'loh',
      eviction: 'house_vote',
      winner: 'none',
    })
    expect(survival.capabilities.audienceSensitiveChoices).toBe(false)
    expect(survival.publicMeterVisible).toBe(false)
    expect(resolveStrategicModeContext(fixture({ cupidArrow: { status: 'broken' } })).format).toBe(
      'classic'
    )
  })

  it.each([
    ['final4_eviction', 'safety_holder'],
    ['final3_comp1', 'final_loh'],
    ['final3_decision', 'final_loh'],
    ['jury', 'none'],
  ] as const)('describes %s without offering weekly campaigns', (phase, eviction) => {
    const read = resolveStrategicModeContext(fixture({ phase }))
    expect(read.authority.eviction).toBe(eviction)
    expect(read.authority.nominations).toBe('none')
    expect(read.capabilities.houseVoteCoordination).toBe(false)
    expect(read.capabilities.lohProtection).toBe(false)
    const vox = resolveStrategicModeContext(
      fixture({
        phase,
        voxPopuli: { status: 'active', immunityWinnerId: 'a', autoNomineeId: null },
      })
    )
    expect(vox.authority.eviction).toBe(phase === 'jury' ? 'none' : 'audience')
    expect(vox.authority.winner).toBe('audience')
  })

  it('projects shared Cupid roles and special Safety replacement authority', () => {
    const game = fixture({
      cupidArrow: {
        status: 'active',
        pairs: [{ memberIds: ['a', 'c'] }, { memberIds: ['b', 'd'] }],
      },
      specialVeto: { activatedWeek: 2, activeType: 'diamond' },
    })
    expect(resolveStrategicModeContext(game).powers.lohIds).toEqual(['a', 'c'])
    expect(resolveActorStrategicRead(game, 'd').holdsSafety).toBe(true)
    expect(resolveStrategicModeContext(game).authority.replacement).toBe('safety_holder')
    expect(resolveStrategicModeContext({ ...game, week: 3 }).authority.replacement).toBe('loh')
  })

  it('reports current protection separately from nomination and unknown alliance support', () => {
    const game = fixture({ povProtectedIds: ['c'], publicSavedNomineeId: 'd' })
    expect(resolveActorStrategicRead(game, 'c')).toMatchObject({
      nominated: true,
      safetyProtected: true,
      allianceProtection: 'unknown',
    })
    expect(resolveActorStrategicRead(game, 'd').publiclySaved).toBe(true)
    expect(resolveActorStrategicRead(game, 'missing').inHouse).toBe(false)
    expect(
      resolveStrategicModeContext(fixture({ posWinnerId: null })).capabilities.safetyRequests
    ).toBe(false)
    expect(
      resolveStrategicModeContext(fixture({ weekendInterlude: { active: true } })).capabilities
        .lohProtection
    ).toBe(false)
    expect(resolveStrategicModeContext(fixture({ status: 'completed' })).authority.eviction).toBe(
      'none'
    )
  })

  it('is deterministic, detached from input arrays, and reads no RNG or clock', () => {
    const game = freeze(fixture())
    const before = JSON.stringify(game)
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw Error('RNG read')
    })
    const time = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw Error('clock read')
    })
    try {
      const first = resolveStrategicModeContext(game)
      expect(first).toEqual(resolveStrategicModeContext(game))
      first.nomineeIds.push('fake')
      first.powers.lohIds.push('fake')
      expect(JSON.stringify(game)).toBe(before)
      expect(resolveActorStrategicRead(game, 'a')).toEqual(resolveActorStrategicRead(game, 'a'))
    } finally {
      random.mockRestore()
      time.mockRestore()
    }
  })

  it('ignores hidden data rather than copying extra state into a perceived read', () => {
    const game = {
      ...fixture(),
      nominationBallots: { a: ['b'] },
      publicVotePercentages: { b: 97 },
      winnerId: 'b',
      strategicRelationships: { hidden: 'secret' },
    }
    const first = resolveActorStrategicRead(game, 'a')
    const changedSecrets = { ...game, nominationBallots: { a: ['c'] }, winnerId: 'd' }
    expect(first).toEqual(resolveActorStrategicRead(changedSecrets, 'a'))
    expect(JSON.stringify(first)).not.toMatch(/secret|97|winnerId|Ballots/)
  })

  it.each(['classic', 'vox'] as const)(
    'does not change fixed-seed %s policy, reducer results or save serialization',
    (format) => {
      const game = createInitialGameState({ seed: 12345 })
      if (format === 'vox' && game.voxPopuli) game.voxPopuli.status = 'active'
      const before = JSON.stringify(game)
      const policy = { players: game.players, relationships: {}, seed: 12345, week: game.week }
      const actorId = game.players[1].id
      const expected = chooseActionFor(actorId, policy)
      const expectedNext = gameReducer(game, advance())
      const diagnostic = withStrategicPlanningContext(policy, game, actorId)
      expect(chooseActionFor(actorId, diagnostic)).toBe(expected)
      // Broadcast IDs/timestamps use a pre-existing process counter and wall clock.
      // Compare event content/order and every other state field, including RNG.
      const comparable = (state: typeof game) => ({
        ...state,
        broadcastQueue: state.broadcastQueue?.map((id) =>
          state.tvFeed.findIndex((event) => event.id === id)
        ),
        tvFeed: state.tvFeed.map(({ id: _id, timestamp: _timestamp, ...event }) => event),
      })
      expect(comparable(gameReducer(game, advance()))).toEqual(comparable(expectedNext))
      expect(JSON.stringify(game)).toBe(before)
      expect(diagnostic.strategicContext.actor.audiencePerception).toBe('unknown')
    }
  )
})

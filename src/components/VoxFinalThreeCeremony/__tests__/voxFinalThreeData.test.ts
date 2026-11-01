import { describe, expect, it } from 'vitest'
import gameReducer, {
  commitVoxAudienceVote,
  createInitialGameState,
} from '../../../store/gameSlice'
import {
  createInitialVoxPopuliState,
  resolveVoxAudienceEviction,
} from '../../../features/twists/voxPopuli'
import type { PlayerPublicProfile } from '../../../publicOpinion/types'
import type { Player } from '../../../types'
import {
  buildVoxFinalThreeAppealChoices,
  buildVoxFinalThreePleas,
  getVoxFinalThreeCast,
  getVoxFinalThreeResult,
  isVoxFinalThreeAppealRequired,
  type VoxFinalThreeViewerRole,
} from '../voxFinalThreeData'

function fixture(role: VoxFinalThreeViewerRole = 'nominee') {
  const game = createInitialGameState({ seed: 111 })
  const holder: Player = {
    id: role === 'immune' ? 'human' : 'dex',
    name: role === 'immune' ? 'You' : 'Dex',
    avatar: '',
    status: 'loh',
    isUser: role === 'immune',
  }
  const first: Player = {
    id: role === 'nominee' ? 'human' : 'ash',
    name: role === 'nominee' ? 'You' : 'Ash',
    avatar: '',
    status: 'nominated',
    isUser: role === 'nominee',
    stats: { lohWins: 2, posWins: 1, timesNominated: 4 },
  }
  const second: Player = { id: 'aria', name: 'Aria', avatar: '', status: 'nominated' }
  game.players = [second, holder, first]
  if (role === 'spectator') {
    game.players.push({ id: 'human', name: 'You', avatar: '', status: 'jury', isUser: true })
  }
  game.phase = 'final3_decision'
  game.week = 15
  game.lohId = holder.id
  game.nomineeIds = [first.id, second.id]
  game.voxPopuli = {
    ...createInitialVoxPopuliState(game.season),
    status: 'active',
    immunityWinnerId: holder.id,
    awaitingPublicVote: true,
    publicVoteContext: 'final3',
  }
  return game
}

function resolvedGame() {
  return gameReducer(
    fixture(),
    commitVoxAudienceVote({
      context: 'final3',
      percentages: { human: 41.7, aria: 58.3 },
      rankedIds: ['aria', 'human'],
    })
  )
}

describe('Vox Final Three presentation data', () => {
  it.each<VoxFinalThreeViewerRole>(['immune', 'nominee', 'spectator'])(
    'uses the real cast and preserves ballot order for the %s viewer',
    (role) => {
      const game = fixture(role)
      const cast = getVoxFinalThreeCast(game)!
      expect(cast.viewerRole).toBe(role)
      expect(cast.viewerId).toBe('human')
      expect(cast.holder.id).toBe(game.voxPopuli!.immunityWinnerId)
      expect(cast.nominees.map((player) => player.id)).toEqual(game.nomineeIds)
      expect(cast.nominees.some((player) => player.id === cast.holder.id)).toBe(false)
      expect(isVoxFinalThreeAppealRequired(game, cast)).toBe(role === 'nominee')
    }
  )

  it('supports a legacy Final Three holder without borrowing a different contestant', () => {
    const game = fixture()
    game.voxPopuli!.immunityWinnerId = null
    expect(getVoxFinalThreeCast(game)?.holder.id).toBe('dex')
    game.lohId = 'unknown'
    expect(getVoxFinalThreeCast(game)).toBeNull()
  })

  it('does not mount an incomplete, duplicated, terminal or wrong-phase cast', () => {
    const variations = [
      (game: ReturnType<typeof fixture>) => {
        game.nomineeIds = ['human', 'human']
      },
      (game: ReturnType<typeof fixture>) => {
        game.nomineeIds = ['human', 'dex']
      },
      (game: ReturnType<typeof fixture>) => {
        game.nomineeIds = ['human', 'unknown']
      },
      (game: ReturnType<typeof fixture>) => {
        game.players.find((p) => p.id === 'human')!.status = 'evicted'
      },
      (game: ReturnType<typeof fixture>) => {
        game.players.push({ id: 'extra', name: 'Extra', avatar: '', status: 'active' })
      },
      (game: ReturnType<typeof fixture>) => {
        game.phase = 'week_end'
      },
      (game: ReturnType<typeof fixture>) => {
        game.voxPopuli!.status = 'inactive'
      },
    ]
    for (const mutate of variations) {
      const game = fixture()
      mutate(game)
      expect(getVoxFinalThreeCast(game)).toBeNull()
    }
  })

  it('requires the real human appeal only while the Final Three ballot is open', () => {
    const game = fixture()
    const cast = getVoxFinalThreeCast(game)!
    expect(isVoxFinalThreeAppealRequired(game, cast)).toBe(true)
    game.voxPopuli!.finalThreeAppealUsed = true
    expect(isVoxFinalThreeAppealRequired(game, cast)).toBe(false)
    game.voxPopuli!.finalThreeAppealUsed = false
    game.voxPopuli!.awaitingPublicVote = false
    expect(isVoxFinalThreeAppealRequired(game, cast)).toBe(false)
    game.voxPopuli!.awaitingPublicVote = true
    game.voxPopuli!.publicVoteContext = 'eviction'
    expect(isVoxFinalThreeAppealRequired(game, cast)).toBe(false)
  })

  it('keeps the existing appeal meanings and uses actual season counts in complete speeches', () => {
    const game = fixture()
    const cast = getVoxFinalThreeCast(game)!
    const options = buildVoxFinalThreeAppealChoices(cast.nominees[0])
    expect(options.map(({ id, title }) => [id, title])).toEqual([
      ['underdog', 'The fight'],
      ['loyalty', 'The people'],
      ['resume', 'The game'],
    ])
    expect(options[0].speech).toContain('the block 4 times')
    expect(options[2].speech).toContain('3 competition wins')
    game.voxPopuli!.finalThreeAppeal = 'underdog'
    expect(buildVoxFinalThreePleas(game, cast).human).toBe(options[0].speech)
    expect(buildVoxFinalThreePleas(game, cast, 'resume').human).toBe(options[2].speech)
  })

  it('uses singular counts and does not fabricate achievements for missing records', () => {
    const game = fixture()
    const cast = getVoxFinalThreeCast(game)!
    const human = cast.nominees[0]
    human.stats = { lohWins: 1, posWins: 0, timesNominated: 1 }
    let options = buildVoxFinalThreeAppealChoices(human)
    expect(options[0].speech).toContain('the block 1 time.')
    expect(options[2].speech).toContain('1 competition win.')
    human.stats = undefined
    options = buildVoxFinalThreeAppealChoices(human)
    expect(options.every(({ speech }) => !/\d/.test(speech))).toBe(true)
    expect(buildVoxFinalThreePleas(game, cast).aria).not.toMatch(/\bwin|\bnominated|\bloyal/i)
  })

  it('grounds AI appeals in nominations or recorded bonds', () => {
    const game = fixture('spectator')
    const cast = getVoxFinalThreeCast(game)!
    cast.nominees[0].stats = { lohWins: 0, posWins: 0, timesNominated: 3 }
    game.strategicRelationships = { aria: { ash: { affinity: 55, tags: [] } } }
    const pleas = buildVoxFinalThreePleas(game, cast)
    expect(pleas.ash).toContain('the block 3 times')
    expect(pleas.aria).toContain('those bonds')
    expect(Object.keys(pleas)).toEqual(['ash', 'aria'])
  })

  it('reads the committed result without mutating or re-ranking it', () => {
    const game = resolvedGame()
    const result = getVoxFinalThreeResult(game, game.nomineeIds)!
    expect(result).toEqual({ evicteeId: 'aria', percentages: { human: 41.7, aria: 58.3 } })
    result.percentages.human = 100
    expect(game.voteResults!.human).toBe(41.7)
    expect(game.voxPopuli!.publicVotePercentages!.human).toBe(41.7)
  })

  it('reads the retained committed percentages after the result card has been dismissed', () => {
    const game = { ...resolvedGame(), voteResults: null }
    expect(getVoxFinalThreeResult(game, game.nomineeIds)?.evicteeId).toBe('aria')
  })

  it('preserves a genuinely rounded 50/50 canonical verdict from the existing resolver', () => {
    const game = fixture()
    const profiles = Object.fromEntries(
      game.nomineeIds.map((id) => [
        id,
        {
          playerId: id,
          approval: 50,
          previousApproval: 50,
          seasonApprovals: [50],
          completedDirectionCount: 0,
          cumulativePositiveDelta: 0,
        } satisfies PlayerPublicProfile,
      ])
    )
    const actual = resolveVoxAudienceEviction({
      nomineeIds: game.nomineeIds,
      profiles,
      seed: 530,
      week: 15,
    })
    expect(actual.percentages).toEqual({ human: 50, aria: 50 })
    const committed = gameReducer(game, commitVoxAudienceVote({ context: 'final3', ...actual }))
    expect(getVoxFinalThreeResult(committed, game.nomineeIds)).toEqual({
      evicteeId: 'human',
      percentages: { human: 50, aria: 50 },
    })
    expect(committed.awaitingTieBreak).not.toBe(true)
  })

  it('rejects an unresolved vote, unknown evictee, wrong mode or disagreeing result sources', () => {
    const game = resolvedGame()
    expect(getVoxFinalThreeResult(fixture(), game.nomineeIds)).toBeNull()
    expect(getVoxFinalThreeResult({ ...game, pendingEviction: null }, game.nomineeIds)).toBeNull()
    expect(
      getVoxFinalThreeResult(
        { ...game, pendingEviction: { evicteeId: 'dex', evictionMessage: '' } },
        game.nomineeIds
      )
    ).toBeNull()
    expect(
      getVoxFinalThreeResult({ ...game, voteResultsMode: 'house' }, game.nomineeIds)
    ).toBeNull()
    expect(
      getVoxFinalThreeResult({ ...game, voteResults: { human: 40, aria: 60 } }, game.nomineeIds)
    ).toBeNull()
  })

  it.each([
    { human: -1, aria: 101 },
    { human: Infinity, aria: 0 },
    { human: NaN, aria: 50 },
    { human: 0.4, aria: 0.6 },
    { human: 40, aria: 40 },
    { human: 41.7 },
    { human: 41.7, aria: 58.3, dex: 0 },
  ])('rejects malformed percentage data %j', (percentages) => {
    const game = resolvedGame()
    const invalid = {
      ...game,
      voteResults: percentages as Record<string, number>,
      voxPopuli: { ...game.voxPopuli!, publicVotePercentages: null },
    }
    expect(getVoxFinalThreeResult(invalid, game.nomineeIds)).toBeNull()
  })
})

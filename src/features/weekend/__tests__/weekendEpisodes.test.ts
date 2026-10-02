import { describe, expect, it } from 'vitest'
import { SOCIAL_INITIAL_STATE } from '../../../social/constants'
import {
  addRealityFact,
  createInitialRealityDomainState,
  upsertRealitySecret,
} from '../../../social/reality'
import type { SocialState } from '../../../social/types'
import gameReducer, {
  createInitialGameState,
  debugActivateWeekendInterlude,
} from '../../../store/gameSlice'
import { resolveWeekendPartyBeat } from '../hubParty'
import { buildSeasonSoFarFacts } from '../seasonSoFar'
import { getHubSaysVotePercentage } from '../hubSays'

describe('Weekend episode resolvers', () => {
  it('does not repeat Saturday’s strongest opinion pair or dialogue on Sunday', () => {
    const game = gameReducer(
      createInitialGameState({ seed: 2012 }),
      debugActivateWeekendInterlude(10)
    )
    const [speaker, target] = game.players.filter((player) => !player.isUser)
    const social = {
      relationships: {
        [speaker.id]: { [target.id]: { affinity: 90 } },
      } as SocialState['relationships'],
      dramaNetwork: { ...SOCIAL_INITIAL_STATE.dramaNetwork, arcs: [] },
      reality: createInitialRealityDomainState(),
    }
    const saturday = resolveWeekendPartyBeat(game, social, 1)!
    expect(saturday.speakerId).toBe(speaker.id)
    const sunday = resolveWeekendPartyBeat(
      { ...game, weekendInterlude: { ...game.weekendInterlude!, party: { beats: [saturday] } } },
      social,
      2
    )!
    expect(sunday.text).not.toBe(saturday.text)
    expect(
      sunday.speakerId === saturday.speakerId && sunday.subjectIds[0] === saturday.subjectIds[0]
    ).toBe(false)
  })

  it('formats the winning Hub Says result as a whole percentage of all votes', () => {
    expect(getHubSaysVotePercentage({ aria: 7, finn: 3 }, 'aria')).toBe(70)
    expect(getHubSaysVotePercentage({}, 'aria')).toBe(0)
  })

  it('uses a real secret that the selected party speaker knows and the human does not', () => {
    const game = createInitialGameState({ seed: 2010 })
    const human = game.players.find((player) => player.isUser)!
    const aiPlayers = game.players.filter((player) => !player.isUser).slice(0, 3)
    expect(aiPlayers).toHaveLength(3)

    const [first, second, speaker] = aiPlayers
    const reality = createInitialRealityDomainState()
    addRealityFact(reality, {
      id: 'fact:party-secret-alliance',
      propositionType: 'SECRET_ALLIANCE',
      subjectIds: [first.id, second.id],
      value: true,
      day: 8,
      phase: 'social_2',
      visibility: 'PRIVATE',
      participantIds: [first.id, second.id],
      witnessIds: [speaker.id],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'event:party-secret-alliance',
    })
    upsertRealitySecret(reality, {
      id: 'secret:party-alliance',
      kind: 'ALLIANCE',
      truthFactId: 'fact:party-secret-alliance',
      ownerIds: [first.id, second.id],
      knowerIds: [first.id, second.id, speaker.id],
      suspectedByIds: [],
      exposure: 0,
      createdAt: { day: 8, phase: 'social_2' },
      status: 'SECRET',
    })

    const social: Pick<SocialState, 'relationships' | 'dramaNetwork' | 'reality'> = {
      relationships: {},
      dramaNetwork: SOCIAL_INITIAL_STATE.dramaNetwork,
      reality,
    }

    const beat = resolveWeekendPartyBeat(game, social, 1)
    expect(beat).toMatchObject({
      kind: 'secret_spill',
      visibility: 'private',
      secretId: 'secret:party-alliance',
      factId: 'fact:party-secret-alliance',
    })
    expect(beat?.speakerId).not.toBe(human.id)
    expect(reality.secrets['secret:party-alliance'].knowerIds).toContain(beat?.speakerId)
    expect(reality.secrets['secret:party-alliance'].knowerIds).not.toContain(human.id)
    expect(beat?.subjectIds).toEqual(expect.arrayContaining([first.id, second.id]))
  })

  it('builds one Season So Far fact per active player and prioritizes a Battle Back return', () => {
    const game = createInitialGameState({ seed: 2015 })
    game.week = 15
    const first = game.players[0]
    first.stats = {
      ...(first.stats ?? { lohWins: 0, posWins: 0, timesNominated: 0 }),
      battleBackWins: 1,
    }

    const facts = buildSeasonSoFarFacts(game)
    const activePlayers = game.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury'
    )

    expect(facts).toHaveLength(activePlayers.length)
    expect(new Set(facts.map((fact) => fact.playerId)).size).toBe(activePlayers.length)
    expect(facts.find((fact) => fact.playerId === first.id)?.kind).toBe('battle_back')
  })
})

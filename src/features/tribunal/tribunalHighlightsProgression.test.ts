import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { store } from '../../store/store'
import gameReducer, {
  activateBattleBack,
  completeBattleBack,
  createInitialGameState,
  hydrateGame,
  setTribunalViewingMode,
  completeTribunalArrival,
  markTribunalSequesterGuideSeen,
  markTribunalHighlightsShortcutSeen,
} from '../../store/gameSlice'
import { setPendingChallenge } from '../../store/challengeSlice'
import { importSettings, DEFAULT_SETTINGS, setSim } from '../../store/settingsSlice'
import { createTribunalScenario } from '../../experiments/tribunalHighlights/fixtures'
import { stepTribunalHighlights } from './tribunalHighlightsProgression'
import {
  buildTribunalHighlight,
  isTribunalHighlightsEligible,
  tribunalHighlightLines,
  tribunalVoteLabel,
  tribunalRequiresLiveShow,
} from './tribunalHighlights'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  store.dispatch(importSettings(structuredClone(DEFAULT_SETTINGS)))
  store.dispatch(setSim({ enableTwists: false, publicMode: false }))
  store.dispatch(setPendingChallenge(null))
})
afterEach(() => vi.restoreAllMocks())

function stepToStop(max = 1000) {
  const id = store.getState().game.gameId
  for (let index = 0; index < max; index++) {
    const result = store.dispatch(stepTribunalHighlights(id))
    if (result !== 'advanced' && result !== 'eviction') return result
  }
  throw new Error('Tribunal progression exceeded its bound')
}

it('automatically arms the guide for an arrival and remembers guide/shortcut discovery in the season', () => {
  const initial = createTribunalScenario('arrival')
  initial.tribunalInvitationTransition = 'sequester'
  initial.tribunalSequesterGuideSeen = true
  initial.tribunalViewingMode = 'full'
  const arrival = gameReducer(initial, completeTribunalArrival())
  expect(arrival.tribunalSequesterGuideSeen).toBe(false)
  expect(arrival.tribunalViewingMode).toBe('highlights')
  const guided = gameReducer(arrival, markTribunalSequesterGuideSeen())
  const full = gameReducer(guided, setTribunalViewingMode('full'))
  const discovered = gameReducer(full, markTribunalHighlightsShortcutSeen())
  const returned = gameReducer(discovered, setTribunalViewingMode('highlights'))
  expect(returned.tribunalSequesterGuideSeen).toBe(true)
  expect(returned.tribunalHighlightsShortcutSeen).toBe(true)
  expect(returned.week).toBe(initial.week)
  expect(returned.phase).toBe(initial.phase)
  expect(returned.players).toEqual(initial.players)
  expect(createInitialGameState({ seed: 7201 }).tribunalSequesterGuideSeen).not.toBe(true)
  expect(createInitialGameState({ seed: 7201 }).tribunalHighlightsShortcutSeen).not.toBe(true)
})

describe('condensed Tribunal progression', () => {
  it.each([7101, 7102, 7103, 7104])(
    'reaches the actual Final Two through AI competitions, seed %i',
    (seed) => {
      store.dispatch(hydrateGame(createTribunalScenario('arrival', seed)))
      const beforeRuns = store.getState().challenge.history.length
      const humanId = store.getState().game.players.find((p) => p.isUser)!.id
      expect(
        stepToStop(),
        JSON.stringify({ phase: store.getState().game.phase, game: store.getState().game.gameId })
      ).toBe('vote')
      const { game, challenge } = store.getState()
      expect(game.phase).toBe('jury_announcement')
      expect(
        game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
      ).toHaveLength(2)
      expect(game.players.find((p) => p.id === humanId)?.status).toBe('jury')
      expect(challenge.history.length).toBeGreaterThan(beforeRuns)
      expect(
        challenge.history.slice(beforeRuns).every((run) => !run.participants.includes(humanId))
      ).toBe(true)
      expect(game.tribunalHighlights?.flatMap((entry) => entry.evicteeIds)).toHaveLength(4)
      expect(game.seasonFinale).toBeNull()
      expect(store.dispatch(stepTribunalHighlights(game.gameId))).toBe('vote')
    }
  )

  it('commits both double-elimination exits into one recap, without duplicated jurors', () => {
    const fixture = createTribunalScenario('double')
    store.dispatch(hydrateGame(fixture))
    expect(store.dispatch(stepTribunalHighlights(fixture.gameId))).toBe('advanced')
    expect(store.dispatch(stepTribunalHighlights(fixture.gameId))).toBe('eviction')
    const game = store.getState().game
    expect(game.tribunalHighlights).toHaveLength(1)
    expect(game.tribunalHighlights?.[0].evicteeIds).toEqual([
      fixture.pendingEviction!.evicteeId,
      fixture.doubleEviction!.pendingSecondEviction!.evicteeId,
    ])
    expect(game.pendingEviction).toBeNull()
    expect(game.doubleEviction?.weekActive).toBe(false)
  })

  it('pauses for the guaranteed human Battle Back using the real season policy', () => {
    store.dispatch(setSim({ enableTwists: true }))
    const fixture = createTribunalScenario('battle_back')
    store.dispatch(hydrateGame(fixture))
    expect(store.dispatch(stepTribunalHighlights(fixture.gameId))).toBe('battle_back')
    const game = store.getState().game
    expect(game.battleBack?.active).toBe(true)
    expect(game.battleBack?.candidates).toContain(game.players.find((p) => p.isUser)!.id)
    const seed = game.seed
    expect(store.dispatch(stepTribunalHighlights(fixture.gameId))).toBe('battle_back')
    expect(store.getState().game.seed).toBe(seed)
  })

  it('does not choose a winner for an already active return competition', () => {
    const fixture = createTribunalScenario('arrival')
    store.dispatch(hydrateGame(fixture))
    store.dispatch(
      activateBattleBack({
        candidates: fixture.players.filter((p) => p.status === 'jury').map((p) => p.id),
        week: fixture.week,
      })
    )
    const before = store.getState().game
    expect(store.dispatch(stepTribunalHighlights(fixture.gameId))).toBe('battle_back')
    expect(store.getState().game).toBe(before)
  })

  it('stops a fast-forward run when the return opportunity activates after an elimination', () => {
    store.dispatch(setSim({ enableTwists: true }))
    const fixture = createTribunalScenario('double')
    fixture.seasonDirectorHumanReturnUsed = false
    // A single exit leaves enough active contestants for the guaranteed opportunity.
    fixture.doubleEviction!.weekActive = false
    fixture.doubleEviction!.pendingSecondEviction = null
    store.dispatch(hydrateGame(fixture))
    expect(store.dispatch(stepTribunalHighlights(fixture.gameId))).toBe('battle_back')
    const snapshot = structuredClone(store.getState().game)
    expect(snapshot.battleBack?.candidates).toContain(snapshot.players.find((p) => p.isUser)!.id)
    store.dispatch(hydrateGame(snapshot))
    for (let index = 0; index < 12; index++) {
      expect(store.dispatch(stepTribunalHighlights(fixture.gameId))).toBe('battle_back')
    }
    expect(store.getState().game.battleBack?.winnerId).toBeNull()
    expect(store.getState().game.seed).toBe(snapshot.seed)
  })

  it('keeps the live show in control through the return animation and resumes human gameplay', () => {
    const fixture = createTribunalScenario('battle_back')
    store.dispatch(hydrateGame(fixture))
    const humanId = fixture.players.find((p) => p.isUser)!.id
    store.dispatch(activateBattleBack({ candidates: [humanId], week: fixture.week }))
    store.dispatch(completeBattleBack(humanId))
    expect(store.getState().game.players.find((p) => p.id === humanId)?.status).toBe('active')
    expect(isTribunalHighlightsEligible(store.getState().game)).toBe(false)
    expect(store.dispatch(stepTribunalHighlights(fixture.gameId))).toBe('inactive')
    const animationState = structuredClone(fixture)
    animationState.battleBack = {
      ...store.getState().game.battleBack!,
      active: false,
      returnAnimationPending: true,
    }
    expect(tribunalRequiresLiveShow(animationState)).toBe(true)
  })

  it('hands off unknown decisions without answering or clearing them', () => {
    const fixture = createTribunalScenario('arrival')
    fixture.awaitingHumanVote = true
    store.dispatch(hydrateGame(fixture))
    const before = store.getState().game
    expect(store.dispatch(stepTribunalHighlights(fixture.gameId))).toBe('attention')
    expect(store.getState().game).toBe(before)
    expect(store.getState().game.votes).toEqual(fixture.votes)
  })

  it('rejects stale run IDs and active / pre-Tribunal humans', () => {
    const fixture = createTribunalScenario('arrival')
    store.dispatch(hydrateGame(fixture))
    const before = store.getState().game
    expect(store.dispatch(stepTribunalHighlights('different-run'))).toBe('inactive')
    expect(store.getState().game).toBe(before)
    for (const status of ['active', 'evicted'] as const) {
      const changed = structuredClone(fixture)
      changed.players.find((p) => p.isUser)!.status = status
      expect(isTribunalHighlightsEligible(changed)).toBe(false)
    }
    const liveGame = createInitialGameState({ seed: 2 })
    expect(isTribunalHighlightsEligible(liveGame)).toBe(false)
  })

  it('preserves the viewing choice and recap through save hydration', () => {
    const fixture = createTribunalScenario('double')
    store.dispatch(hydrateGame(fixture))
    store.dispatch(stepTribunalHighlights(fixture.gameId))
    store.dispatch(stepTribunalHighlights(fixture.gameId))
    store.dispatch(setTribunalViewingMode('full'))
    const saved = structuredClone(store.getState().game)
    store.dispatch(hydrateGame(saved))
    expect(store.getState().game.tribunalViewingMode).toBe('full')
    expect(store.getState().game.tribunalHighlights).toEqual(saved.tribunalHighlights)
  })
})

describe('truthful Tribunal recaps', () => {
  it('does not turn missing data into a zero-vote margin or a fictional POS decision', () => {
    const game = createTribunalScenario('arrival')
    const highlight = buildTribunalHighlight(game, [game.players[1].id])
    expect(tribunalVoteLabel(highlight, game.players[1].id)).toBeNull()
    expect(tribunalHighlightLines(highlight, game).join(' ')).not.toMatch(
      /declined|did not use|0–0|0-0/
    )
  })

  it('labels multi-nominee vote totals without inventing a head-to-head margin', () => {
    const game = createTribunalScenario('double')
    const highlight = buildTribunalHighlight(game, [game.pendingEviction!.evicteeId])
    expect(tribunalVoteLabel(highlight, game.pendingEviction!.evicteeId)).toBe(
      '3 votes to eliminate'
    )
  })
})

import React from 'react'
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import gameReducer, {
  activateCupidArrowNow,
  claimPresentationEvent,
  commitNominees,
  consumeBroadcastEvent,
  dismissVoteResults,
  advance,
  aiReplacementRendered,
  applyMinigameWinner,
  finalizePendingEviction,
  forceHoH,
  forceNominees,
  forcePovWinner,
  hydrateGame,
  revealCupidArrowVisuals,
  submitPovSaveTarget,
} from '../src/store/gameSlice'
import settingsReducer from '../src/store/settingsSlice'
import profilesReducer from '../src/store/profilesSlice'
import challengeReducer from '../src/store/challengeSlice'
import finaleReducer from '../src/store/finaleSlice'
import socialReducer from '../src/social/socialSlice'
import TvZone from '../src/components/ui/TvZone'
import ProfileSeasonStatus from '../src/components/ProfileSeasonStatus/ProfileSeasonStatus'
import { I18nContext, type I18nContextValue } from '../src/i18n/I18nContext'
import { translate } from '../src/i18n/messages'
import { selectCurrentBroadcastEvents } from '../src/broadcasting/fauxTvPresentation'
import {
  createReplacementPresentationTracker,
  type ReplacementPresentation,
} from '../src/cinematic/ceremonies/replacementPresentation'
import { nextReplacementStep } from '../src/cinematic/ceremonies/replacementSequence'
import { makeReplacementFilm } from '../src/cinematic/ceremonies/replacement-film.js'
import { createInitialVoxPopuliState } from '../src/features/twists/voxPopuli'
import { getCupidPair, getCupidPartnerId } from '../src/features/twists/cupidArrow'
import type { GameState, Player } from '../src/types'
import type { AppDispatch, RootState } from '../src/store/store'
import { isVisibleInMainLog, isVisibleOnTv } from '../src/services/activityService'
import { buildAllianceConsultationPlan } from '../src/social/reality/humanFlow'
import { createRealityAlliance } from '../src/social/reality/relationshipForms'
import { createInitialRealityDomainState } from '../src/social/reality/state'
import {
  evaluateIncomingInteractionEnqueueDecision,
  type AutonomyContext,
} from '../src/social/incomingInteractionAutonomy'
import { resolveStrategicModeContext } from '../src/social/strategicModeContext'
import { socialMiddleware } from '../src/social/socialMiddleware'
import { useEvictionFlow } from '../src/screens/GameScreen/flows/useEvictionFlow'
import { useAppSelector } from '../src/store/hooks'
import { selectActiveConfessionalDecision } from '../src/store/confessionalDecisionSelectors'
import RequiredConfessionalDecision from '../src/screens/DiaryRoom/RequiredConfessionalDecision'
import { getRequiredConfessionalPresentation } from '../src/screens/DiaryRoom/requiredConfessionalPresentation'
import HoldTheWallComp from '../src/components/HoldTheWallComp/HoldTheWallComp'
import holdTheWallReducer, { dropFinalDuelAi } from '../src/features/holdTheWall/holdTheWallSlice'

const i18n: I18nContextValue = {
  preference: 'en-US',
  language: 'en-US',
  systemLanguage: 'en-US',
  t: (key, params) => translate('en-US', key, params),
  formatNumber: String,
  formatDate: String,
}
const players = (): Player[] =>
  Array.from({ length: 16 }, (_, index) => ({
    id: index === 0 ? 'user' : 'p' + index,
    name: index === 0 ? 'You' : 'Player ' + index,
    avatar: '',
    status: 'active',
    isUser: index === 0,
    sex: index % 2 ? 'Female' : 'Male',
  }))
const step = gameReducer
const base = (seed: number): GameState => ({
  ...step(undefined, { type: '@@audit' }),
  seed,
  season: 3,
  week: 3,
  status: 'active',
  mode: 'classic',
  phase: 'week_start',
  players: players(),
  tvFeed: [],
  broadcastQueue: [],
  activeBroadcastEventId: null,
  lastPlainBroadcastEventId: null,
  presentationEventClaims: [],
  broadcastOverrides: {},
  customBroadcasts: [],
  publicModeEnabled: false,
  voxPopuli: createInitialVoxPopuliState(null),
  cupidArrow: {
    scheduledSeason: 3,
    status: 'scheduled',
    activatedSeason: null,
    activatedWeek: null,
    pairs: [],
    eliminatedPairCount: 0,
    pendingPartnerEvictionId: null,
  },
})
const cupid = (seed: number) =>
  step(step(base(seed), activateCupidArrowNow()), revealCupidArrowVisuals())
function vox(seed: number, count = 6, winnerId = 'user', selectedLast?: string) {
  const game = base(seed)
  game.cupidArrow!.status = 'inactive'
  game.voxPopuli!.status = 'active'
  game.players = game.players.slice(0, count)
  game.phase = 'loh_comp'
  game.publicModeEnabled = true
  const ids = game.players.map((p) => p.id)
  const last = selectedLast ?? ids.at(-1)
  return step(
    game,
    applyMinigameWinner({
      winnerId,
      participants: ids,
      scores: Object.fromEntries(
        ids.map((id, index) => [id, id === winnerId ? 200 : id === last ? 10 : 100 - index])
      ),
      lastPlaceId: last,
      lastPlaceType: 'scored',
    })
  )
}
function storeFor(game: GameState, withSocial = false) {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      finale: finaleReducer,
      social: socialReducer,
      holdTheWall: holdTheWallReducer,
    },
    preloadedState: { game },
    middleware: (getDefault) => (withSocial ? getDefault().concat(socialMiddleware) : getDefault()),
  })
}
function renderGame(game: GameState, child: React.ReactNode, store = storeFor(game)) {
  return render(
    <I18nContext.Provider value={i18n}>
      <Provider store={store}>
        <MemoryRouter>{child}</MemoryRouter>
      </Provider>
    </I18nContext.Provider>
  )
}
function currentQueue(game: GameState) {
  return selectCurrentBroadcastEvents(
    game.broadcastQueue,
    game.tvFeed,
    game.phase,
    game.week,
    game.activeBroadcastEventId,
    isVisibleOnTv
  )
}
function filmSlots(game: GameState, outcome: ReplacementPresentation) {
  const pose = { width: 420, height: 630, feetY: 0.94762 }
  const cast = Object.fromEntries(
    game.players.map((p) => [p.id, { id: p.id, name: p.name, poses: { front: pose } }])
  )
  const pictures = Object.fromEntries(
    [
      'replacementSet',
      'replacementPlatform',
      'replacementMist',
      'replacementShield',
      ...game.players.flatMap((p) => [
        'replacement-body-' + p.id,
        'replacement-authority-' + p.id,
        'replacement-holder-' + p.id,
      ]),
    ].map((key) => [key, document.createElement('img')])
  )
  const film = makeReplacementFilm(pictures, cast, outcome)
  return Array.from(film.querySelectorAll<HTMLElement>('.replacement-slot'), (slot) => ({
    slot: slot.dataset.slotIndex,
    pair: slot.dataset.pairId,
    opening: Array.from(
      slot.querySelectorAll<HTMLElement>('[data-role="opening"]'),
      (el) => el.dataset.actorId!
    ),
    incoming: Array.from(
      slot.querySelectorAll<HTMLElement>('[data-role="incoming"]'),
      (el) => el.dataset.actorId!
    ),
  }))
}
function seededBackup(seed: number, saveIndex: number, pairCount: number) {
  let game = cupid(seed)
  const humanPair = getCupidPair(game, 'user')!
  const other = game.cupidArrow!.pairs.filter((pair) => pair.id !== humanPair.id)
  const targetPairs = other.slice(1, 1 + pairCount)
  game = step(game, forceHoH(other[0].memberIds[0]))
  game = step(game, forceNominees(targetPairs.map((pair) => pair.memberIds[0])))
  // Load the Safety decision checkpoint with an eligible housemate as the holder.
  game = step(game, forcePovWinner(other[1 + pairCount].memberIds[0]))
  game = {
    ...game,
    phase: 'pos_ceremony_results',
    awaitingPovSaveTarget: true,
    tvFeed: [],
    broadcastQueue: [],
  }
  const tracker = createReplacementPresentationTracker()
  tracker.observe(game)
  game = step(game, submitPovSaveTarget(targetPairs[saveIndex].memberIds[0]))
  tracker.observe(game)
  game = step(game, advance())
  tracker.observe(game)
  game = step(game, aiReplacementRendered())
  tracker.observe(game)
  game = step(game, advance())
  const closed = tracker.observe(game)
  const progress = tracker.progress(game)!
  const save = nextReplacementStep(progress, 0)!
  const replacement = nextReplacementStep(progress, save.end)!
  expect(closed?.replacementIds).toHaveLength(2)
  expect(replacement.outcome.replacementIds).toHaveLength(2)
  const slots = filmSlots(game, replacement.outcome)
  const bad =
    slots.some((item) => item.opening.length > 0 && item.incoming.length > 0) ||
    replacement.outcome.replacementIds.some(
      (id) => slots.filter((slot) => slot.incoming.includes(id)).length !== 1
    ) ||
    !slots.some((slot) =>
      replacement.outcome.replacementIds.every((id) => slot.incoming.includes(id))
    ) ||
    replacement.outcome.continuingNomineeIds.some(
      (id) => !slots.some((slot) => slot.opening.includes(id))
    )
  return { game, replacementIds: replacement.outcome.replacementIds, bad }
}
function beforeFourthPair(seed: number, humanLeaves = false) {
  let game = cupid(seed)
  const humanPair = getCupidPair(game, 'user')!
  const other = game.cupidArrow!.pairs.filter((pair) => pair.id !== humanPair.id)
  const fourth = humanLeaves ? humanPair : other[3]
  const firstThree = new Set(other.slice(0, 3).flatMap((pair) => pair.memberIds))
  game = {
    ...game,
    week: 4,
    phase: 'eviction_results',
    tvFeed: [],
    broadcastQueue: [],
    voteResults: null,
    showVoteResults: false,
    players: game.players.map((p) => (firstThree.has(p.id) ? { ...p, status: 'evicted' } : p)),
    cupidArrow: { ...game.cupidArrow!, eliminatedPairCount: 3 },
  }
  game = step(game, forceHoH(other[4].memberIds[0]))
  game = step(game, forceNominees([fourth.memberIds[0], other[5].memberIds[0]]))
  game = {
    ...game,
    phase: 'live_vote',
    awaitingHumanVote: false,
    votes: Object.fromEntries(other[6].memberIds.map((id) => [id, fourth.memberIds[0]])),
    tvFeed: [],
    broadcastQueue: [],
  }
  game = step(game, advance())
  expect(game.pendingEviction?.evicteeId).toBe(fourth.memberIds[0])
  game = step(game, finalizePendingEviction(game.pendingEviction!.evicteeId))
  expect(game.pendingEviction?.evicteeId).toBe(fourth.memberIds[1])
  return game
}
function socialFixture(game: GameState, memberIds = ['user', 'p1', 'p2']) {
  const reality = createInitialRealityDomainState()
  const alliance = createRealityAlliance(reality, {
    id: 'audit-alliance',
    kind: 'GROUP',
    founderIds: memberIds,
    memberIds: [],
    purpose: 'Mutual protection',
    at: { day: game.week, phase: 'social_1' },
  })
  alliance.status = 'ACTIVE'
  const social = { ...socialReducer(undefined, { type: '@@audit' }), reality }
  return { state: { game, social } as unknown as RootState, social, alliance }
}
function autonomyContext(
  game: GameState,
  social: ReturnType<typeof socialFixture>['social']
): AutonomyContext {
  return {
    week: game.week,
    phase: game.phase,
    players: game.players,
    relationships: social.relationships,
    incomingInteractions: [],
    socialMemory: social.socialMemory,
    scheduledIncomingInteractions: [],
    phaseSeed: game.seed,
    dramaMode: true,
    gameState: game,
    reality: social.reality,
    lohId: game.lohId,
    posWinnerId: game.posWinnerId,
    nomineeIds: game.nomineeIds,
    voxPopuliActive: game.voxPopuli?.status === 'active',
  } as AutonomyContext
}
afterEach(cleanup)

describe('Cupid and Vox season rules', () => {
  it('renders each backup couple together and names both nominees on TV', () => {
    let containsHumanBackup = false
    for (let seed = 1; seed <= 12; seed++) {
      for (const pairCount of [2, 3]) {
        for (let saveIndex = 0; saveIndex < pairCount; saveIndex++) {
          const { bad, game, replacementIds } = seededBackup(seed, saveIndex, pairCount)
          expect(bad, 'seed ' + seed + ', saved position ' + saveIndex).toBe(false)
          if (replacementIds.includes('user')) containsHumanBackup = true
          const announcement = game.tvFeed.find(
            (event) => event.meta?.broadcastTemplateId === 'cupid.backup-nomination'
          )
          expect(announcement && currentQueue(game).includes(announcement)).toBe(true)
          for (const id of replacementIds) {
            expect(announcement?.text).toContain(
              game.players.find((player) => player.id === id)?.name
            )
          }
        }
      }
    }
    expect(containsHumanBackup).toBe(true)
  })

  it.each([false, true])(
    'recovers the unread Cupid break during Day End (human leaves: %s)',
    (humanLeaves) => {
      const before = beforeFourthPair(730, humanLeaves)
      const broken = step(before, finalizePendingEviction(before.pendingEviction!.evicteeId))
      // Old builds could save at Day End with the event still tagged for evictions.
      const reloaded = step(broken, hydrateGame({ ...broken, phase: 'week_end' }))
      const breaks = currentQueue(reloaded).filter(
        (event) => event.meta?.broadcastTemplateId === 'cupid.spell-broken'
      )
      expect(breaks).toHaveLength(1)
      expect(reloaded.cupidArrow?.visualsRevealed).toBe(true)
      expect(step(reloaded, advance()).phase).toBe('week_end')
      const acknowledged = step(reloaded, consumeBroadcastEvent(breaks[0].id))
      expect(acknowledged.cupidArrow?.visualsRevealed).toBe(false)
      expect(currentQueue(acknowledged)).not.toContain(breaks[0])
    }
  )

  it.each([6, 4])('labels the Vox profile chip correctly after a win at %s alive', (count) => {
    const game = vox(17, count)
    const rules = resolveStrategicModeContext(game)
    expect(game.lohId).toBe('user')
    expect(rules.powers.lohIds).toEqual([])
    expect(game.voxPopuli?.immunityWinnerId).toBe(count === 4 ? null : 'user')
    renderGame(game, <ProfileSeasonStatus />)
    expect(screen.queryByRole('button', { name: /Hub power/i })).toBeNull()
    expect(Boolean(screen.queryByRole('button', { name: /Immunity: Protected/i }))).toBe(
      count !== 4
    )
  })

  it('keeps individual ballots private when a Vox immunity winner consults', () => {
    const game = vox(17)
    const { state, alliance } = socialFixture(game)
    const plan = buildAllianceConsultationPlan(state, alliance, 'user')
    expect(resolveStrategicModeContext(game).authority.nominations).toBe('house_secret_ballots')
    expect(game.nomineeIds).toEqual([])
    expect(plan?.agenda).toBe('secret_ballot')
    expect(plan?.targetIds).toEqual([])
    expect(plan?.summary).toMatch(/secret ballot/i)
  })

  it('lets Vox alliance members advise on the save without making a replacement decision', () => {
    const game = {
      ...vox(30, 8),
      phase: 'pos_results' as const,
      posWinnerId: 'p1',
      nomineeIds: ['p3', 'p4', 'p7'],
      voxPopuli: {
        ...vox(30, 8).voxPopuli!,
        autoNomineeId: 'p7',
        nominationVoteCounts: { p7: 0, p3: 3, p4: 3, p5: 2, p6: 1 },
      },
    }
    const { state, alliance } = socialFixture(game)
    const plan = buildAllianceConsultationPlan(state, alliance, 'user')
    expect(resolveStrategicModeContext(game).authority.replacement).toBe('house_secret_ballots')
    expect(plan?.agenda).toBe('safety')
    expect(plan?.summary).toMatch(/remaining nominees face the audience/i)
    expect(plan?.fallbackTargetIds).toEqual([])
    expect(plan?.planIds).toContain('save:p3')
    const resolved = step(
      { ...game, phase: 'pos_ceremony_results', awaitingPovSaveTarget: true },
      submitPovSaveTarget('p3')
    )
    expect(resolved.voxPopuli?.lastReplacementNomineeIds).toEqual([])
    expect(resolved.nomineeIds).toHaveLength(2)
  })

  it('avoids a Classic nomination huddle on a Vox Double Elimination day', () => {
    const game = {
      ...vox(42, 9, 'p1'),
      phase: 'social_1' as const,
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
    }
    const { social } = socialFixture(game)
    const ordinary = { ...game, doubleEviction: { ...game.doubleEviction, weekActive: false } }
    const actual = evaluateIncomingInteractionEnqueueDecision(
      'p1',
      'user',
      autonomyContext(game, social),
      []
    )
    const control = evaluateIncomingInteractionEnqueueDecision(
      'p1',
      'user',
      autonomyContext(ordinary, social),
      []
    )
    expect(actual.plan?.scenarioKey).not.toBe('alliance_power_nomination_huddle')
    expect(control.plan?.scenarioKey).not.toBe('alliance_power_nomination_huddle')
  })

  it.each([false, true])(
    'Cupid Confessional accepts a deciding vote from their Cupid partner (Public Mode %s)',
    (publicModeEnabled) => {
      let game = cupid(541)
      const humanPair = getCupidPair(game, 'user')!
      const other = game.cupidArrow!.pairs.filter((pair) => pair.id !== humanPair.id)
      game = step(game, forceHoH(humanPair.memberIds.find((id) => id !== 'user')!))
      game = step(game, forceNominees(other.slice(0, 2).map((pair) => pair.memberIds[0])))
      const chosenPair = other[6]
      const votes = Object.fromEntries(
        other
          .slice(2, 6)
          .flatMap((voter, index) =>
            voter.memberIds.map((id) => [id, other[index % 2].memberIds[0]])
          )
      )
      game = {
        ...game,
        phase: 'live_vote',
        publicModeEnabled,
        awaitingHumanVote: false,
        votes,
        players: game.players.map((p) =>
          chosenPair.memberIds.includes(p.id) ? { ...p, status: 'evicted' } : p
        ),
        tvFeed: [],
        broadcastQueue: [],
      }
      const tied = step(game, advance())
      expect(tied.awaitingTieBreak).toBe(true)
      expect(tied.voteResults?.[tied.tiedNomineeIds![0]]).toBe(4)
      expect(tied.voteResults?.[tied.tiedNomineeIds![1]]).toBe(4)
      const store = storeFor(tied)
      const decision = selectActiveConfessionalDecision(store.getState() as RootState)!
      const committed: string[] = []
      render(
        <Provider store={store}>
          <RequiredConfessionalDecision
            decision={decision}
            presentation={getRequiredConfessionalPresentation(decision, tied)}
            onDecisionCommitted={(text) => committed.push(text)}
          />
        </Provider>
      )
      const pairChoices = screen.getAllByRole('button', { name: /Pair \d+/i })
      expect(pairChoices).toHaveLength(2)
      fireEvent.click(pairChoices[0])
      fireEvent.click(screen.getByRole('button', { name: /seal deciding vote/i }))
      expect(committed).toHaveLength(1)
      const resolved = store.getState().game
      expect(resolved.awaitingTieBreak).toBe(false)
      expect(resolved.pendingEviction?.evictionMessage).toMatch(/eliminated together/)
      const first = resolved.pendingEviction!.evicteeId
      const next = step(resolved, finalizePendingEviction(first))
      expect(next.pendingEviction?.evicteeId).toBe(getCupidPartnerId(resolved, first))
    }
  )
})
function runEvictionUi(start: GameState, withSocial = false) {
  const store = storeFor(start, withSocial)
  if (withSocial) store.dispatch(hydrateGame(start))
  store.dispatch(dismissVoteResults())
  const hook = renderHook(
    () => {
      const game = useAppSelector((state) => state.game)
      return useEvictionFlow({
        game,
        humanPlayerEliminated: game.players.some(
          (p) => p.isUser && ['evicted', 'jury'].includes(p.status)
        ),
        humanIsHoH: game.lohId === 'user' || getCupidPartnerId(game, game.lohId) === 'user',
        final4Stage: 'done',
        setFinal4Stage: () => {},
        publicOpinionProfiles: {},
        isMountedRef: { current: true },
        setAdPending: () => {},
        dispatch: store.dispatch as AppDispatch,
      })
    },
    {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <MemoryRouter>{children}</MemoryRouter>
        </Provider>
      ),
    }
  )
  return { ...hook, store }
}
describe('Additional mode cross-checks', () => {
  it('replays an interrupted Cupid cinematic and clears its visuals on completion', async () => {
    const before = beforeFourthPair(731)
    const broken = step(before, finalizePendingEviction(before.pendingEviction!.evicteeId))
    const next = step(broken, advance())
    const [linkedExit, farewell] = currentQueue(next)
    expect(farewell.meta?.broadcastTemplateId).toBe('cupid.spell-broken')
    const waiting = step(next, consumeBroadcastEvent(linkedExit.id))
    const interrupted = step(
      waiting,
      claimPresentationEvent({
        gameId: next.gameId,
        runId: `shock-intro:${next.week}`,
        eventId: 'shock:cupid_arrow_broken',
      })
    )
    const resumed = step(interrupted, hydrateGame(interrupted))
    const store = storeFor(resumed)
    vi.useFakeTimers()
    try {
      renderGame(resumed, <TvZone />, store)
      expect(screen.getByTestId('shock-intro-overlay')).toHaveAttribute(
        'data-cupid-mode',
        'breaking'
      )
      await act(async () => vi.advanceTimersByTimeAsync(8000))
      expect(store.getState().game.cupidArrow?.visualsRevealed).toBe(false)
      expect(currentQueue(store.getState().game).map((event) => event.id)).not.toContain(
        farewell.id
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('queues the linked exit and the spell break at Day End and releases forced bonds immediately', () => {
    const start = beforeFourthPair(731)
    const humanPartner = getCupidPartnerId(start, 'user')!
    const { result, store, unmount } = runEvictionUi(start, true)
    expect(store.getState().social.relationships.user[humanPartner].tags).toContain(
      'cupid_forced_bond'
    )
    expect(result.current.showEvictionSplash).toBe(true)
    act(() => result.current.handleEvictionSplashDone())
    const { game, social } = store.getState()
    expect(game.phase).toBe('week_end')
    expect(game.cupidArrow?.status).toBe('broken')
    expect(game.cupidArrow?.visualsRevealed).toBe(true)
    expect(social.relationships.user[humanPartner].tags).not.toContain('cupid_forced_bond')
    expect(social.relationships.user[humanPartner].tags).not.toContain('protection')
    expect(
      currentQueue(game)
        .slice(0, 2)
        .map((event) => event.meta?.broadcastTemplateId)
    ).toEqual(['cupid.partner-eviction', 'cupid.spell-broken'])
    unmount()
  })

  it('shows the Vox eviction reaction first at Day End and through reload', () => {
    const v = vox(734, 8)
    const game = {
      ...v,
      phase: 'eviction_results' as const,
      strategicRelationships: { p1: { p7: { affinity: 85, tags: ['alliance'] } } },
      nomineeIds: ['p6', 'p7'],
      tvFeed: [],
      broadcastQueue: [],
      pendingEviction: {
        evicteeId: 'p7',
        evictionMessage: 'Player 7 leaves after the public vote.',
      },
    }
    const { result, store, unmount } = runEvictionUi(game)
    act(() => result.current.handleEvictionSplashDone())
    const next = store.getState().game
    const story = next.tvFeed.find((event) => event.meta?.voxPostEvictionReaction === true)!
    expect(story).toBeDefined()
    expect(isVisibleInMainLog(story)).toBe(true)
    expect(currentQueue(next)[0]?.id).toBe(story.id)
    expect(next.phase).toBe('week_end')
    unmount()
    const restored = step(next, hydrateGame(JSON.parse(JSON.stringify(next))))
    expect(currentQueue(restored)[0]?.id).toBe(story.id)
    renderGame(restored, <TvZone />)
    expect(document.querySelector('.tv-zone__now')?.textContent).toContain(story.text)
  })

  it.each([false, true])(
    'Vox Final 4 counts only the three eligible contestants (human last %s)',
    (humanLast) => {
      const competition = humanLast ? vox(44, 4, 'p1', 'user') : vox(44, 4)
      const opportunities = { ...competition, phase: 'nominations' as const }
      const voting = step(opportunities, advance())
      expect(voting.awaitingNominations).toBe(!humanLast)
      const committed = humanLast ? voting : step(voting, commitNominees(['p2']))
      expect(Object.keys(committed.voxPopuli!.nominationBallots)).toHaveLength(3)
      expect(
        committed.voxPopuli!.nominationBallots[committed.voxPopuli!.autoNomineeId!]
      ).toBeUndefined()
      expect(committed.nomineeIds).toContain(committed.voxPopuli!.autoNomineeId)
    }
  )

  it('renders the actual Hold the Wall competition award with Vox game state', () => {
    const game = { ...vox(80, 6), phase: 'loh_comp' as const }
    const store = storeFor(game)
    const contenders = game.players.slice(0, 2)
    render(
      <Provider store={store}>
        <HoldTheWallComp
          participantIds={contenders.map((p) => p.id)}
          participants={contenders.map((p) => ({
            id: p.id,
            name: p.name,
            isHuman: Boolean(p.isUser),
          }))}
          prizeType="LOH"
          seed={80}
        />
      </Provider>
    )
    expect(screen.queryByTestId('htw-final-two-deal')).toBeNull()
    act(() => store.dispatch(dropFinalDuelAi(contenders[1].id)))
    expect(screen.getByTestId('htw-complete')).toHaveTextContent(/Immunity decided!/i)
  })
})

describe('Vox and Cupid chips and strategy', () => {
  it('routes a Safety plea to either member of the winning Cupid pair', () => {
    const raw = cupid(42)
    const other = raw.cupidArrow!.pairs.filter((pair) => !pair.memberIds.includes('user'))
    const scenario = step(
      step(raw, forceHoH(other[2].memberIds[0])),
      forceNominees(other.slice(0, 2).map((p) => p.memberIds[0]))
    )
    const actorId = other[0].memberIds[0]
    const partnerId = getCupidPartnerId(scenario, 'user')!
    const withRole = (winnerId: string) => ({
      ...step(scenario, forcePovWinner(winnerId)),
      phase: 'pos_results' as const,
    })
    const { social } = socialFixture(scenario, [
      other[3].memberIds[0],
      other[4].memberIds[0],
      other[5].memberIds[0],
    ])
    const partnerWins = withRole(partnerId)
    const playerWins = withRole('user')
    const actual = evaluateIncomingInteractionEnqueueDecision(
      actorId,
      'user',
      autonomyContext(partnerWins, social),
      []
    )
    const control = evaluateIncomingInteractionEnqueueDecision(
      actorId,
      'user',
      autonomyContext(playerWins, social),
      []
    )
    expect(resolveStrategicModeContext(partnerWins).powers.safetyCoholderIds).toContain('user')
    expect(control.plan?.scenarioKey).toBe('nominee_veto_pitch')
    expect(actual.plan?.scenarioKey).toBe('nominee_veto_pitch')
  })

  it('shows shared Cupid power in the profile', () => {
    const raw = cupid(42)
    const partner = getCupidPartnerId(raw, 'user')!
    const game = {
      ...step(step(raw, forceHoH(partner)), forcePovWinner(partner)),
      phase: 'pos_results' as const,
    }
    renderGame(game, <ProfileSeasonStatus />)
    expect(resolveStrategicModeContext(game).powers.lohIds).toContain('user')
    expect(resolveStrategicModeContext(game).powers.safetyCoholderIds).toContain('user')
    expect(screen.getByRole('button', { name: /hub power/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /safety power/i })).toBeInTheDocument()
  })
})

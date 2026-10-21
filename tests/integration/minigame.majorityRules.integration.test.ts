import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import majorityRulesReducer, {
  advanceIntro,
  advanceReveal,
  initMajorityRules,
  markMajorityRulesOutcomeResolved,
  rollThreeWayDuel,
  setThreeWayDuelPick,
  skipLegacyRevote,
  useHint,
  type MajorityRulesState,
} from '../../src/features/majorityRules/majorityRulesSlice';
import { resolveMajorityRulesOutcome } from '../../src/features/majorityRules/thunks';
import {
  MAJORITY_RULES_QUESTIONS,
  resolveMajorityRulesBallot,
} from '../../src/features/majorityRules/helpers';
import { getGame } from '../../src/minigames/registry';

function makeStore(initialMajorityRules?: Partial<MajorityRulesState>) {
  const gameReducer = (
    state = {
      phase: 'loh_comp',
      lohId: null as string | null,
      applyCount: 0,
    },
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === 'game/applyMinigameWinner') {
      const payload = action.payload as { winnerId: string };
      return {
        ...state,
        lohId: payload.winnerId,
        phase: 'loh_results',
        applyCount: state.applyCount + 1,
      };
    }
    return state;
  };

  return configureStore({
    reducer: {
      majorityRules: majorityRulesReducer,
      game: gameReducer,
    },
    preloadedState: initialMajorityRules
      ? {
          majorityRules: {
            phase: 'complete',
            competitionType: 'LOH',
            seed: 7,
            participantIds: ['p1', 'p2', 'p3'],
            activeIds: ['p2'],
            eliminatedIds: ['p3', 'p1'],
            humanPlayerId: 'p1',
            roundNumber: 3,
            revoteNumber: 0,
            currentQuestion: null,
            usedQuestionIds: [],
            draftAnswers: {},
            previousDistribution: null,
            blockedAnswers: {},
            doubleEliminationArmed: false,
            hintInventories: {},
            roundHintUsedBy: null,
            roundHintType: null,
            roundHintTargetId: null,
            roundHintPollEstimate: null,
            roundHintPeekedAnswers: null,
            revealState: null,
            threeWayDuel: null,
            finalDuel: null,
            winnerId: 'p2',
            outcomeResolved: false,
            ...initialMajorityRules,
          },
        }
      : undefined,
  });
}

describe('majorityRules registry entry', () => {
  it('exists and is configured as an authoritative react game', () => {
    const entry = getGame('majorityRules');
    expect(entry).toBeDefined();
    expect(entry?.implementation).toBe('react');
    expect(entry?.reactComponentKey).toBe('MajorityRules');
    expect(entry?.authoritative).toBe(true);
    expect(entry?.scoringAdapter).toBe('authoritative');
    expect(entry?.resultMode).toBe('placement');
  });

  it('documents the updated hint and no-revote minority rules in the instructions', () => {
    const entry = getGame('majorityRules');
    expect(entry?.instructions).toContain(
      'You get 3 hints for the whole game, and each hint can only be used once.',
    );
    expect(entry?.instructions).toContain(
      'If no distinct, small minority is found (including ties), nobody is eliminated and a new question begins.',
    );
  });
});

describe('resolveMajorityRulesOutcome', () => {
  it('dispatches applyMinigameWinner only once', async () => {
    const store = makeStore({});

    await store.dispatch(resolveMajorityRulesOutcome());
    expect(store.getState().game.lohId).toBe('p2');
    expect(store.getState().game.applyCount).toBe(1);

    await store.dispatch(resolveMajorityRulesOutcome());
    expect(store.getState().game.applyCount).toBe(1);
  });

  it('respects the explicit outcomeResolved guard', async () => {
    const store = makeStore({});
    store.dispatch(markMajorityRulesOutcomeResolved());
    await store.dispatch(resolveMajorityRulesOutcome());
    expect(store.getState().game.applyCount).toBe(0);
  });
});

describe('majorityRules initialization flow', () => {
  it('skips straight into the final duel flow when only two participants start', () => {
    const store = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
    });

    store.dispatch(
      initMajorityRules({
        participantIds: ['p1', 'p2'],
        competitionType: 'LOH',
        seed: 11,
        humanPlayerId: 'p1',
      }),
    );

    expect(store.getState().majorityRules.phase).toBe('intro');
    expect(store.getState().majorityRules.currentQuestion).toBeNull();

    store.dispatch(advanceIntro());

    const majorityRules = store.getState().majorityRules;
    expect(majorityRules.phase).toBe('final_duel_pick');
    expect(majorityRules.finalDuel?.finalists).toEqual(['p1', 'p2']);
    expect(majorityRules.finalDuel?.chosenNumbers.p2).toBeTypeOf('number');
  });

  it('does not arm double elimination after a unanimous reveal', () => {
    const question = MAJORITY_RULES_QUESTIONS[0];
    const store = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
      preloadedState: {
        majorityRules: {
          phase: 'reveal',
          competitionType: 'LOH',
          seed: 11,
          participantIds: ['p1', 'p2', 'p3', 'p4'],
          activeIds: ['p1', 'p2', 'p3', 'p4'],
          eliminatedIds: [],
          humanPlayerId: 'p1',
          roundNumber: 1,
          revoteNumber: 0,
          currentQuestion: question,
          usedQuestionIds: [question.id],
          draftAnswers: {},
          previousDistribution: null,
          blockedAnswers: {},
          doubleEliminationArmed: true,
          hintInventories: {},
          roundHintUsedBy: null,
          roundHintType: null,
          roundHintTargetId: null,
          roundHintPollEstimate: null,
          roundHintPeekedAnswers: null,
          revealState: {
            result: {
              kind: 'unanimous',
              distribution: { a: 4, b: 0, c: 0 },
              answers: { p1: 'a', p2: 'a', p3: 'a', p4: 'a' },
              eliminatedIds: [],
              minorityOptionId: 'a',
              tiedOptionIds: [],
              eliminationCount: 1,
            },
            revoteNumber: 0,
          },
          threeWayDuel: null,
          finalDuel: null,
          winnerId: null,
          outcomeResolved: false,
        },
      },
    });

    store.dispatch(advanceReveal());

    const majorityRules = store.getState().majorityRules;
    expect(majorityRules.phase).toBe('question');
    expect(majorityRules.doubleEliminationArmed).toBe(false);
  });

  it('spends the poll hint once for the whole game', () => {
    const store = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
    });

    store.dispatch(
      initMajorityRules({
        participantIds: ['p1', 'p2', 'p3', 'p4'],
        competitionType: 'LOH',
        seed: 17,
        humanPlayerId: 'p1',
      }),
    );
    store.dispatch(advanceIntro());
    store.dispatch(useHint({ playerId: 'p1', hintType: 'pollHint' }));

    const spentState = store.getState().majorityRules;
    expect(spentState.hintInventories.p1.pollHintUsed).toBe(true);
    expect(spentState.roundHintType).toBe('pollHint');

    const retryStore = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
      preloadedState: {
        majorityRules: {
          ...spentState,
          roundHintUsedBy: null,
          roundHintType: null,
          roundHintPollEstimate: null,
          roundHintPeekedAnswers: null,
        },
      },
    });

    retryStore.dispatch(useHint({ playerId: 'p1', hintType: 'pollHint' }));

    const retriedState = retryStore.getState().majorityRules;
    expect(retriedState.roundHintUsedBy).toBeNull();
    expect(retriedState.roundHintType).toBeNull();
    expect(retriedState.roundHintPollEstimate).toBeNull();
  });

  it('advances a 6–6–0 tied ballot without evicting anyone or spending hints twice', () => {
    const question = MAJORITY_RULES_QUESTIONS[0];
    const activeIds = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
    const answers = Object.fromEntries(
      activeIds.map((id, i) => [id, i < 6 ? question.options[0].id : question.options[1].id]),
    );
    const result = resolveMajorityRulesBallot({
      activeIds, answers, question, eliminationCount: 1,
    });
    expect(result.kind).toBe('split');

    const store = makeStore({
      phase: 'reveal',
      participantIds: activeIds,
      activeIds,
      eliminatedIds: [],
      humanPlayerId: 'p1',
      roundNumber: 3,
      revoteNumber: 0,
      currentQuestion: question,
      usedQuestionIds: [question.id],
      winnerId: null,
      blockedAnswers: {},
      hintInventories: {
        p1: { pollHintUsed: true, peekTwoUsed: false, followPlayerUsed: false },
      },
      roundHintUsedBy: 'p1',
      roundHintType: 'pollHint',
      roundHintPollEstimate: { a: 50, b: 50, c: 0 },
      revealState: { result, revoteNumber: 0 },
    });

    store.dispatch(advanceReveal());

    const next = store.getState().majorityRules;
    expect(next.phase).toBe('question');
    expect(next.roundNumber).toBe(4);
    expect(next.revoteNumber).toBe(0);
    expect(next.activeIds).toEqual(activeIds);
    expect(next.eliminatedIds).toEqual([]);
    expect(next.currentQuestion?.id).not.toBe(question.id);
    expect(next.revealState).toBeNull();
    expect(next.blockedAnswers).toEqual({});
    expect(next.roundHintType).toBeNull();
    expect(next.hintInventories.p1.pollHintUsed).toBe(true);
  });

  it('discards a saved mid-revote question without using up another hint', () => {
    const question = MAJORITY_RULES_QUESTIONS[0];
    const store = makeStore({
      phase: 'question',
      roundNumber: 3,
      revoteNumber: 1,
      currentQuestion: question,
      usedQuestionIds: [question.id],
      activeIds: ['p1', 'p2', 'p3'],
      eliminatedIds: [],
      blockedAnswers: { p1: question.options[0].id },
      hintInventories: {
        p1: { pollHintUsed: true, peekTwoUsed: false, followPlayerUsed: false },
      },
      roundHintType: 'pollHint',
      roundHintUsedBy: 'p1',
      roundHintPollEstimate: { a: 33, b: 33, c: 34 },
    });

    store.dispatch(skipLegacyRevote());

    const next = store.getState().majorityRules;
    expect(next.phase).toBe('question');
    expect(next.revoteNumber).toBe(0);
    expect(next.roundNumber).toBe(4);
    expect(next.blockedAnswers).toEqual({});
    expect(next.currentQuestion?.id).not.toBe(question.id);
    expect(next.roundHintType).toBeNull();
    expect(next.hintInventories.p1.pollHintUsed).toBe(true);
  });

  it('moves legacy saved revote results to the next question without reopening voting', () => {
    const question = MAJORITY_RULES_QUESTIONS[0];
    const store = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
      preloadedState: {
        majorityRules: {
          phase: 'reveal',
          competitionType: 'LOH',
          seed: 23,
          participantIds: ['p1', 'p2', 'p3'],
          activeIds: ['p1', 'p2', 'p3'],
          eliminatedIds: [],
          humanPlayerId: 'p1',
          roundNumber: 4,
          revoteNumber: 1,
          currentQuestion: question,
          usedQuestionIds: [question.id],
          draftAnswers: {},
          previousDistribution: null,
          blockedAnswers: { p1: 'a', p2: 'b', p3: 'c' },
          doubleEliminationArmed: false,
          hintInventories: {
            p1: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
            p2: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
            p3: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
          },
          roundHintUsedBy: null,
          roundHintType: null,
          roundHintTargetId: null,
          roundHintPollEstimate: null,
          roundHintPeekedAnswers: null,
          revealState: {
            result: {
              kind: 'revote',
              distribution: { a: 1, b: 1, c: 1 },
              answers: { p1: 'a', p2: 'b', p3: 'c' },
              eliminatedIds: [],
              minorityOptionId: null,
              tiedOptionIds: ['a', 'b', 'c'],
              eliminationCount: 1,
            },
            revoteNumber: 1,
          },
          threeWayDuel: null,
          finalDuel: null,
          winnerId: null,
          outcomeResolved: false,
        },
      },
    });

    store.dispatch(advanceReveal());

    const majorityRules = store.getState().majorityRules;
    expect(majorityRules.phase).toBe('question');
    expect(majorityRules.roundNumber).toBe(5);
    expect(majorityRules.revoteNumber).toBe(0);
    expect(majorityRules.currentQuestion?.id).not.toBe(question.id);
    expect(majorityRules.blockedAnswers).toEqual({});
  });

  it('eliminates the third player after a 3-way dice tie and advances to the final duel', () => {
    // Known-good seed for this exact 3-way duel setup:
    // p1 rolls 6, p2 rolls 3, p3 rolls 2 -> p2 is eliminated and p1/p3 advance.
    const seed = 11;
    const store = configureStore({
      reducer: {
        majorityRules: majorityRulesReducer,
      },
      preloadedState: {
        majorityRules: {
          phase: 'three_way_duel_pick',
          competitionType: 'LOH',
          seed: seed!,
          participantIds: ['p1', 'p2', 'p3'],
          activeIds: ['p1', 'p2', 'p3'],
          eliminatedIds: [],
          humanPlayerId: 'p1',
          roundNumber: 4,
          revoteNumber: 0,
          currentQuestion: null,
          usedQuestionIds: [],
          draftAnswers: {},
          previousDistribution: null,
          blockedAnswers: {},
          doubleEliminationArmed: false,
          hintInventories: {
            p1: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
            p2: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
            p3: { pollHintUsed: false, peekTwoUsed: false, followPlayerUsed: false },
          },
          roundHintUsedBy: null,
          roundHintType: null,
          roundHintTargetId: null,
          roundHintPollEstimate: null,
          roundHintPeekedAnswers: null,
          revealState: null,
          threeWayDuel: {
            finalists: ['p1', 'p2', 'p3'],
            chosenNumbers: { p1: null, p2: 1, p3: 2 },
            currentRoundRolls: { p1: null, p2: null, p3: null },
            currentRollerId: 'p1',
            roundCount: 0,
            turnCount: 0,
            lastRoll: null,
            lastRoundResult: null,
          },
          finalDuel: null,
          winnerId: null,
          outcomeResolved: false,
        },
      },
    });

    store.dispatch(setThreeWayDuelPick({ playerId: 'p1', value: 6 }));
    expect(store.getState().majorityRules.phase).toBe('three_way_duel_roll');

    store.dispatch(rollThreeWayDuel());
    store.dispatch(rollThreeWayDuel());
    store.dispatch(rollThreeWayDuel());

    const majorityRules = store.getState().majorityRules;
    expect(majorityRules.phase).toBe('final_duel_pick');
    expect(majorityRules.eliminatedIds).toEqual(['p2']);
    expect(majorityRules.activeIds).toEqual(['p1', 'p3']);
    expect(majorityRules.finalDuel?.finalists).toEqual(['p1', 'p3']);
  });
});

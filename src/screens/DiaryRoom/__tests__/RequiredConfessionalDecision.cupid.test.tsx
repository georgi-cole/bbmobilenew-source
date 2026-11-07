import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import gameReducer, {
  activateCupidArrowNow,
  activateVoxPopuliNow,
  forceHoH,
  forceNominees,
  getEligibleReplacementNominees,
  hydrateGame,
} from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import socialReducer from '../../../social/socialSlice'
import RequiredConfessionalDecision from '../RequiredConfessionalDecision'
import { getRequiredConfessionalPresentation } from '../requiredConfessionalPresentation'

describe('RequiredConfessionalDecision during Cupid', () => {
  it.each([true, false])(
    'confirms the human co-LOH choice only when accepted (eligible=%s)',
    (eligible) => {
      const store = configureStore({
        reducer: { game: gameReducer, settings: settingsReducer, social: socialReducer },
      })
      store.dispatch(activateCupidArrowNow())
      const initial = store.getState().game
      const humanPair = initial.cupidArrow!.pairs.find((pair) =>
        pair.memberIds.some((id) => initial.players.find((player) => player.id === id)?.isUser)
      )!
      const human = initial.players.find((player) => player.isUser)!
      const partnerId = humanPair.memberIds.find((id) => id !== human.id)!
      const otherPairs = initial.cupidArrow!.pairs.filter((pair) => pair.id !== humanPair.id)
      const targetPairs = otherPairs.slice(0, 2)
      store.dispatch(forceHoH(eligible ? partnerId : otherPairs[2].memberIds[0]))
      store.dispatch(forceNominees(targetPairs.map((pair) => pair.memberIds[0])))
      const current = store.getState().game
      store.dispatch(
        hydrateGame({
          ...current,
          phase: 'eviction_results',
          awaitingTieBreak: true,
          tiedNomineeIds: targetPairs.map((pair) => pair.memberIds[0]),
          pendingEviction: null,
        })
      )
      const game = store.getState().game
      const decision = {
        type: 'tie_break' as const,
        week: game.week,
        phase: 'eviction_results' as const,
      }
      const onDecisionCommitted = vi.fn(() => {
        expect(store.getState().game.awaitingTieBreak).toBe(false)
        expect(store.getState().game.pendingEviction).not.toBeNull()
      })
      render(
        <Provider store={store}>
          <RequiredConfessionalDecision
            decision={decision}
            presentation={getRequiredConfessionalPresentation(decision, game)}
            onDecisionCommitted={onDecisionCommitted}
          />
        </Provider>
      )
      fireEvent.click(screen.getAllByRole('button', { name: /Pair \d+/i })[0])
      fireEvent.click(screen.getByRole('button', { name: 'Seal deciding vote' }))
      expect(onDecisionCommitted).toHaveBeenCalledTimes(eligible ? 1 : 0)
      expect(store.getState().game.awaitingTieBreak).toBe(!eligible)
      if (!eligible)
        expect(screen.getByRole('button', { name: 'Seal deciding vote' })).toBeEnabled()
    }
  )

  it('renders two combined pair ballots instead of four individual nominees', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        settings: settingsReducer,
        social: socialReducer,
      },
    })

    store.dispatch(activateCupidArrowNow())
    const pairs = store.getState().game.cupidArrow!.pairs.slice(0, 2)
    store.dispatch(forceNominees(pairs.map((pair) => pair.memberIds[0])))

    const game = store.getState().game
    const decision = {
      type: 'eviction_vote' as const,
      week: game.week,
      phase: 'live_vote' as const,
    }

    render(
      <Provider store={store}>
        <RequiredConfessionalDecision
          decision={decision}
          presentation={getRequiredConfessionalPresentation(decision, game)}
          onDecisionCommitted={vi.fn()}
        />
      </Provider>
    )

    const pairChoices = screen.getAllByRole('button', { name: /Pair \d+/i })
    expect(pairChoices).toHaveLength(2)
    for (const pair of pairs) {
      const names = pair.memberIds.map(
        (id) => game.players.find((player) => player.id === id)!.name
      )
      expect(screen.getByRole('button', { name: new RegExp(names.join('.*')) })).toBeInTheDocument()
    }
  })

  it('keeps nomination names accessible when narrow cards ellipsize their display', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        settings: settingsReducer,
        social: socialReducer,
      },
    })
    const game = store.getState().game
    const player = game.players.find((candidate) => !candidate.isUser)!
    const decision = {
      type: 'nominations' as const,
      week: game.week,
      phase: game.phase,
    }

    render(
      <Provider store={store}>
        <RequiredConfessionalDecision
          decision={decision}
          presentation={getRequiredConfessionalPresentation(decision, game)}
          onDecisionCommitted={vi.fn()}
        />
      </Provider>
    )

    const choice = screen.getByRole('button', { name: player.name })
    expect(choice).toHaveAttribute('aria-label', player.name)
    expect(choice.querySelector('strong')).toHaveAttribute('title', player.name)
  })
})

describe('RequiredConfessionalDecision Vox ballot', () => {
  it('asks for and commits three nominations when the Vox Extra Vote is armed', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        settings: settingsReducer,
        social: socialReducer,
      },
    })
    store.dispatch(activateVoxPopuliNow())
    const current = store.getState().game
    const human = current.players.find((player) => player.isUser)!
    const excludedIds = current.players
      .filter((player) => player.id !== human.id)
      .slice(0, 3)
      .map((player) => player.id)
    const immunityWinnerId = excludedIds[0]!
    const autoNomineeId = excludedIds[1]!
    store.dispatch(
      hydrateGame({
        ...current,
        phase: 'nomination_results',
        awaitingNominations: true,
        lohId: excludedIds[2]!,
        storeVoxExtraNominationChoiceActive: true,
        voxPopuli: {
          ...current.voxPopuli!,
          status: 'active',
          immunityWinnerId,
          autoNomineeId,
          nominationBallots: {},
          nominationVoteCounts: {},
        },
      })
    )

    const game = store.getState().game
    const decision = {
      type: 'nominations' as const,
      week: game.week,
      phase: 'nomination_results' as const,
    }
    const onDecisionCommitted = vi.fn()
    render(
      <Provider store={store}>
        <RequiredConfessionalDecision
          decision={decision}
          presentation={getRequiredConfessionalPresentation(decision, game)}
          onDecisionCommitted={onDecisionCommitted}
        />
      </Provider>
    )

    expect(screen.getByText(/choose 3 more/i)).toBeInTheDocument()
    const choices = game.players
      .filter(
        (player) =>
          player.status !== 'evicted' &&
          player.status !== 'jury' &&
          player.id !== human.id &&
          player.id !== immunityWinnerId &&
          player.id !== autoNomineeId
      )
      .slice(0, 3)
    for (const player of choices) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(player.name, 'i') }))
    }
    fireEvent.click(screen.getByRole('button', { name: /seal secret ballot/i }))

    expect(store.getState().game.voxPopuli?.nominationBallots[human.id]).toHaveLength(3)
    expect(store.getState().game.awaitingNominations).toBe(false)
    expect(onDecisionCommitted).toHaveBeenCalledOnce()
  })
})

describe('RequiredConfessionalDecision replacement choices', () => {
  it('does not offer a Store-protected target during a Detox replacement pick', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        settings: settingsReducer,
        social: socialReducer,
      },
    })
    const initial = store.getState().game
    const human = initial.players.find((player) => player.isUser)!
    const [loh, nomineeOne, nomineeTwo] = initial.players.filter((player) => !player.isUser)
    if (!human || !loh || !nomineeOne || !nomineeTwo) throw new Error('Expected a full roster')

    const replacementState = {
      ...initial,
      phase: 'pos_ceremony_results' as const,
      lohId: loh.id,
      posWinnerId: human.id,
      nomineeIds: [nomineeOne.id, nomineeTwo.id],
      specialVeto: {
        ...initial.specialVeto!,
        activeType: 'coup' as const,
        awaitingHolderReplacement: false,
        awaitingCoupReplacement1: true,
        awaitingCoupReplacement2: false,
        coupReplacement1Id: null,
        awaitingVipSecondUseDecision: false,
        awaitingVipSecondSaveTarget: false,
      },
    }
    const firstEligible = getEligibleReplacementNominees(replacementState, human.id, {
      allowLoh: true,
      neededCount: 2,
    })[0]
    if (!firstEligible) throw new Error('Expected an eligible replacement nominee')

    store.dispatch(
      hydrateGame({
        ...replacementState,
        storeNominationProtections: [
          { productKey: 'protection', targetId: firstEligible.id, week: initial.week },
        ],
      })
    )
    const game = store.getState().game
    const stillEligible = getEligibleReplacementNominees(game, human.id, {
      allowLoh: true,
      neededCount: 2,
    })[0]
    if (!stillEligible) throw new Error('Expected another eligible replacement nominee')

    const decision = {
      type: 'replacement_nominee' as const,
      week: game.week,
      phase: game.phase,
    }
    const { rerender } = render(
      <Provider store={store}>
        <RequiredConfessionalDecision
          decision={decision}
          presentation={getRequiredConfessionalPresentation(decision, game)}
          onDecisionCommitted={vi.fn()}
        />
      </Provider>
    )

    const group = screen.getByRole('group', { name: 'Name the First Replacement' })
    expect(
      within(group).queryByRole('button', { name: firstEligible.name })
    ).not.toBeInTheDocument()
    fireEvent.click(within(group).getByRole('button', { name: stillEligible.name }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm replacement' }))

    expect(store.getState().game.specialVeto?.awaitingCoupReplacement1).toBe(false)
    expect(store.getState().game.specialVeto?.awaitingCoupReplacement2).toBe(true)
    expect(store.getState().game.specialVeto?.coupReplacement1Id).toBe(stillEligible.id)

    const secondStepGame = store.getState().game
    const secondStepDecision = {
      type: 'replacement_nominee' as const,
      week: secondStepGame.week,
      phase: secondStepGame.phase,
    }
    rerender(
      <Provider store={store}>
        <RequiredConfessionalDecision
          decision={secondStepDecision}
          presentation={getRequiredConfessionalPresentation(secondStepDecision, secondStepGame)}
          onDecisionCommitted={vi.fn()}
        />
      </Provider>
    )
    const secondGroup = screen.getByRole('group', { name: 'Name the Second Replacement' })
    const secondEligible = getEligibleReplacementNominees(secondStepGame, human.id, {
      allowLoh: true,
      neededCount: 1,
    }).find((player) => player.id !== stillEligible.id)
    if (!secondEligible) throw new Error('Expected another eligible replacement nominee')
    fireEvent.click(within(secondGroup).getByRole('button', { name: secondEligible.name }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm replacement' }))

    expect(store.getState().game.specialVeto?.awaitingCoupReplacement2).toBe(false)
    expect(store.getState().game.specialVeto?.coupReplacement1Id).toBeNull()
    expect(store.getState().game.nomineeIds).toContain(stillEligible.id)
    expect(store.getState().game.nomineeIds).toContain(secondEligible.id)
  })
})

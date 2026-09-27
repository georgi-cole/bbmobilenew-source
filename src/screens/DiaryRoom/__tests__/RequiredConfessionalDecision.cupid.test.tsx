import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import gameReducer, {
  activateCupidArrowNow,
  activateVoxPopuliNow,
  forceNominees,
  hydrateGame,
} from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import socialReducer from '../../../social/socialSlice'
import RequiredConfessionalDecision from '../RequiredConfessionalDecision'
import { getRequiredConfessionalPresentation } from '../requiredConfessionalPresentation'

describe('RequiredConfessionalDecision during Cupid', () => {
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

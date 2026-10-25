import { act, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MajorityRulesComp from '../../../src/components/MajorityRulesComp/MajorityRulesComp'
import reducer, {
  initMajorityRules,
  type MajorityRulesState,
} from '../../../src/features/majorityRules/majorityRulesSlice'
import {
  initializeDiceDuel,
  initializeThreeWayDice,
} from '../../../src/features/majorityRules/helpers'

const ids = ['user', 'finn', 'mimi', 'rae']
const participants = ids.map((id) => ({
  id,
  name: id,
  isHuman: id === 'user',
  precomputedScore: 0,
  previousPR: null,
}))

function revealState(eliminateHuman = false): MajorityRulesState {
  const initial = reducer(
    undefined,
    initMajorityRules({
      participantIds: ids,
      competitionType: 'LOH',
      seed: 42,
      humanPlayerId: 'user',
      vipExperience: true,
    })
  )
  const eliminatedId = eliminateHuman ? 'user' : 'rae'
  const question = initial.currentQuestion!
  const [a, b, c] = question.options
  return {
    ...initial,
    phase: 'reveal',
    eliminatedIds: [eliminatedId],
    currentQuestion: {
      ...question,
      options: [
        {
          ...a,
          text: 'Accidentally sending a screenshot of the entire conversation to the person being discussed',
        },
        b,
        c,
      ],
    },
    revealState: {
      revoteNumber: 0,
      result: {
        kind: 'elimination',
        distribution: { [a.id]: 1, [b.id]: 2, [c.id]: 1 },
        answers: {},
        eliminatedIds: [eliminatedId],
        minorityOptionId: a.id,
        tiedOptionIds: [],
        eliminationCount: 1,
      },
    },
  }
}

function mount(state: MajorityRulesState) {
  const store = configureStore({
    reducer: {
      majorityRules: (current = state, action: { type: string }) =>
        action.type === initMajorityRules.type ? current : reducer(current, action),
      game: () => ({
        players: ids.map((id) => ({
          id,
          name: id,
          avatar: '🙂',
          status: 'active',
          isUser: id === 'user',
        })),
      }),
    },
  })
  const view = render(
    <Provider store={store}>
      <MajorityRulesComp
        participantIds={ids}
        participants={participants}
        prizeType="LOH"
        premiumPresentation
        seed={42}
      />
    </Provider>
  )
  return { ...view, store }
}

describe('Majority Rules VIP presentation', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.classList.remove('no-animations')
  })

  it('keeps full answer copy, the round record and Continue available with motion disabled', async () => {
    document.body.classList.add('no-animations')
    const state = revealState()
    const { container, store } = mount(state)
    await act(async () => {})
    expect(screen.getByText(`A. ${state.currentQuestion!.options[0].text}`)).toBeInTheDocument()
    expect(screen.getByText('1 out · 3 still in')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Eliminated players' })).toHaveAttribute(
      'data-animated',
      'false'
    )
    expect(screen.getByText('rae')).toBeInTheDocument()
    const action = screen.getByRole('button', { name: 'Continue', exact: true })
    expect(container.querySelector('.majority-rules-phase-content')?.contains(action)).toBe(false)
    fireEvent.click(action)
    expect(store.getState().majorityRules.phase).not.toBe('reveal')
  })

  it('lets the human trap-door animation finish before showing the spectator prompt', async () => {
    vi.useFakeTimers()
    mount(revealState(true))
    await act(async () => {})
    expect(screen.getByRole('region', { name: 'Eliminated players' })).toHaveAttribute(
      'data-animated',
      'true'
    )
    act(() => {
      vi.advanceTimersByTime(2199)
    })
    expect(screen.queryByRole('button', { name: 'Continue watching' })).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('button', { name: 'Continue watching' })).toBeInTheDocument()
  })

  it('combines each finalist identity and number into one tile and keeps the roll control separate', async () => {
    document.body.classList.add('no-animations')
    const initial = revealState()
    mount({
      ...initial,
      phase: 'final_duel_roll',
      activeIds: ['user', 'rae'],
      eliminatedIds: ['finn', 'mimi'],
      finalDuel: {
        ...initializeDiceDuel(['user', 'rae']),
        chosenNumbers: { user: 2, rae: 5 },
        currentRollerId: 'user',
      },
    })
    await act(async () => {})
    expect(screen.getAllByText('rae')).toHaveLength(1)
    expect(screen.getByLabelText('Chosen number: 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Chosen number: 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll die', exact: true })).toBeEnabled()
  })

  it('sends a VIP three-way number choice to the tiebreak without changing final-duel state', async () => {
    document.body.classList.add('no-animations')
    const { store } = mount({
      ...revealState(),
      phase: 'three_way_duel_pick',
      activeIds: ['user', 'finn', 'mimi'],
      eliminatedIds: ['rae'],
      threeWayDuel: {
        ...initializeThreeWayDice(['user', 'finn', 'mimi']),
        chosenNumbers: { user: null, finn: 4, mimi: 6 },
      },
    })
    await act(async () => {})
    expect(screen.getByRole('button', { name: '4', exact: true })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '2', exact: true }))
    expect(store.getState().majorityRules.threeWayDuel?.chosenNumbers.user).toBe(2)
    expect(store.getState().majorityRules.phase).toBe('three_way_duel_roll')
    expect(store.getState().majorityRules.finalDuel).toBeNull()
  })
})

import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import reducer, {
  hitCurrentPlayer,
  standCurrentPlayer,
  type BlackjackTournamentState,
} from '../../../src/features/blackjackTournament/blackjackTournamentSlice'
import BlackjackTournamentComp from '../../../src/components/BlackjackTournamentComp/BlackjackTournamentComp'

const harness = vi.hoisted(() => ({
  dispatch: vi.fn(),
  state: {} as BlackjackTournamentState,
}))

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => harness.dispatch,
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({ blackjackTournament: harness.state }),
}))

vi.mock('../../../src/ai/competition/SeasonAiContext', () => ({
  useSeasonAiCapability: () => 1,
}))

afterEach(() => {
  vi.useRealTimers()
  harness.dispatch.mockReset()
})

describe('Blackjack live AI visible opponent decisions', () => {
  it.each([
    { opponentTotal: 20, expected: hitCurrentPlayer },
    { opponentTotal: 16, expected: standCurrentPlayer },
  ])(
    'responds to a stood $opponentTotal instead of blindly standing on 17',
    ({ opponentTotal, expected }) => {
      vi.useFakeTimers()
      harness.state = {
        ...reducer(undefined, { type: 'test/init' }),
        phase: 'duel',
        stage: 'final',
        seed: 42,
        allPlayerIds: ['rival', 'human'],
        remainingPlayerIds: ['rival', 'human'],
        humanPlayerId: 'human',
        playerScores: { rival: 3, human: 3 },
        currentDuel: {
          fighterAId: 'rival',
          fighterBId: 'human',
          fighterACards: [10, 7],
          fighterBCards: [10, opponentTotal - 10],
          fighterAStood: false,
          fighterBStood: true,
          fighterABust: false,
          fighterBBust: false,
          duelTurn: 'fighterA',
          rngCallCount: 4,
        },
      }

      render(
        <BlackjackTournamentComp
          participantIds={['rival', 'human']}
          participants={[
            { id: 'rival', name: 'Rival', isHuman: false },
            { id: 'human', name: 'You', isHuman: true },
          ]}
          prizeType="LOH"
          seed={42}
        />
      )
      act(() => vi.advanceTimersByTime(1_000))

      expect(harness.dispatch).toHaveBeenCalledWith(expected())
      const opposite = expected === hitCurrentPlayer ? standCurrentPlayer : hitCurrentPlayer
      expect(harness.dispatch).not.toHaveBeenCalledWith(opposite())
    }
  )
})

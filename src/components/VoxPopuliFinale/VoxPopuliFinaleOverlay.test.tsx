import { cleanup, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../../store/gameSlice'
import { store as baseline, type RootState } from '../../store/store'
import { createInitialVoxPopuliState } from '../../features/twists/voxPopuli'
import type { ProfileBio } from '../../store/profilesSlice'
import type { VoxFinalistCase } from './VoxFinalistShowcase'
import VoxPopuliFinaleOverlay from './VoxPopuliFinaleOverlay'

vi.mock('../PublicFavoriteOverlay/PublicFavoriteOverlay', () => ({ default: () => null }))
vi.mock('../SeasonRecapCinematic/SeasonRecapCinematic', () => ({ default: () => null }))
vi.mock('./VoxFinalistShowcase', () => ({
  default: ({ finalists }: { finalists: VoxFinalistCase[] }) => (
    <div>{finalists[0]?.introduction}</div>
  ),
}))

afterEach(cleanup)

function showFinalist(contestantBio?: ProfileBio) {
  const game = createInitialGameState({ seed: 9001 })
  const human = game.players.find((player) => player.isUser)!
  game.seasonContestant = contestantBio
    ? { version: 1, name: human.name, avatar: human.avatar, bio: contestantBio }
    : undefined
  game.voxPopuli = {
    ...createInitialVoxPopuliState(game.season),
    status: 'active',
    finaleStage: 'showcase',
    finalistIds: [human.id],
  }
  const initial: RootState = {
    ...structuredClone(baseline.getState()),
    game,
    profiles: {
      activeProfileId: 'account',
      isGuest: false,
      profiles: [
        {
          id: 'account',
          name: 'Account owner',
          avatar: '🙂',
          createdAt: '2026-10-31T00:00:00Z',
          bio: {
            age: '28',
            profession: 'teacher',
            location: 'Paris',
            story: 'The account owner teaches in Paris.',
          },
        },
      ],
    },
  }
  const store = configureStore({ reducer: (state = initial) => state })
  render(
    <Provider store={store}>
      <VoxPopuliFinaleOverlay />
    </Provider>
  )
  return human
}

describe('Vox finalist contestant identity', () => {
  it('introduces the contestant using the biography saved with this season', () => {
    showFinalist({ age: '38', story: 'This contestant is a surgeon from Sofia.' })

    expect(screen.getByText('This contestant is a surgeon from Sofia.')).toBeInTheDocument()
    expect(screen.queryByText('The account owner teaches in Paris.')).not.toBeInTheDocument()
  })

  it('builds a missing story from the contestant identity without borrowing the account story', () => {
    showFinalist({ age: '38', profession: 'surgeon', location: 'Sofia' })

    expect(screen.getByText(/as a surgeon from Sofia at 38/)).toBeInTheDocument()
    expect(screen.queryByText(/teacher|Paris|at 28/)).not.toBeInTheDocument()
  })

  it('uses a neutral introduction for saves without a contestant snapshot', () => {
    const human = showFinalist()

    expect(
      screen.getByText(
        `${human.name} entered without a borrowed storyline. Every risk, bond, and survival became the story the audience knows now.`
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('The account owner teaches in Paris.')).not.toBeInTheDocument()
  })
})

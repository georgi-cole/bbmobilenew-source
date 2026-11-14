import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialRealityDomainState } from '../../../social/reality/state'
import { createRealityAlliance } from '../../../social/reality/relationshipForms'
import { executeHumanRealityAction } from '../../../social/reality/humanFlow'
import ConfessionalAllianceConsultation from '../ConfessionalAllianceConsultation'
import AllianceVoteCampaign from '../../../components/SocialPanelV2/AllianceVoteCampaign'

vi.mock('../../../social/reality/humanFlow', () => ({
  executeHumanRealityAction: vi.fn(() => () => ({
    success: true,
    summary: 'Consider Outside as the backup nominee.',
  })),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function setup(replacementPending: boolean) {
  const reality = createInitialRealityDomainState()
  const alliance = createRealityAlliance(reality, {
    id: 'team',
    name: 'Our Team',
    kind: 'GROUP',
    founderIds: ['human', 'voter', 'nominee'],
    memberIds: [],
    purpose: 'Protection',
    at: { day: 3, phase: 'social_1' },
  })
  alliance.status = 'ACTIVE'
  const state = {
    game: {
      week: 3,
      mode: 'classic',
      dramaSocialMode: true,
      phase: replacementPending ? 'pos_ceremony_results' : 'social_2',
      lohId: 'human',
      replacementNeeded: replacementPending,
      nomineeIds: ['nominee', 'outside'],
      players: ['human', 'voter', 'nominee', 'outside'].map((id) => ({
        id,
        name: id === 'outside' ? 'Outside' : id,
        isUser: id === 'human',
        status: id === 'human' ? 'loh' : id === 'nominee' ? 'nominated' : 'active',
      })),
    },
    settings: { gameUX: { dramaMode: true } },
    social: { reality, energyBank: { human: 10 }, influenceBank: { human: 100 }, infoBank: {} },
  }
  const store = configureStore({ reducer: () => state })
  return { store, alliance }
}

describe('alliance access during required decisions', () => {
  it('opens a real alliance consultation without committing the pending backup nominee', () => {
    const { store } = setup(true)
    render(
      <Provider store={store}>
        <ConfessionalAllianceConsultation />
      </Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Consult Our Team/ }))
    expect(executeHumanRealityAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'consult_alliance',
        actorId: 'human',
        consultationAllianceId: 'team',
      })
    )
    expect(screen.getByRole('status')).toHaveTextContent('backup nominee')
    expect(store.getState().game.replacementNeeded).toBe(true)
  })

  it('lets the LOH approach an eligible alliance voter, excluding the nominated ally', () => {
    const { store, alliance } = setup(false)
    render(
      <Provider store={store}>
        <AllianceVoteCampaign alliance={alliance} />
      </Provider>
    )
    expect(screen.queryByRole('button', { name: /Ask nominee/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ask voter to vote out Outside/ }))
    expect(executeHumanRealityAction).toHaveBeenCalledWith({
      actionId: 'rally_votes_against',
      actorId: 'human',
      targetId: 'voter',
      subjectId: 'outside',
    })
  })
})

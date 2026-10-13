import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDirectedRelationship,
  createInitialRealityDomainState,
} from '../../../social/reality'
import type { Player } from '../../../types'
import ConfessionalDecisionBriefing from '../ConfessionalDecisionBriefing'

const players = [
  { id: 'human', name: 'You', isUser: true, status: 'active' },
  { id: 'nova', name: 'Nova', status: 'active' },
  { id: 'jax', name: 'Jax', status: 'active' },
] as Player[]

beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement
  ) {
    this.setAttribute('open', '')
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement
  ) {
    this.removeAttribute('open')
  })
})

afterEach(() => vi.restoreAllMocks())

function setup(realityMode = true, withAdvice = false) {
  const reality = createInitialRealityDomainState()
  reality.relationships.human = {
    nova: createDirectedRelationship('human', 'nova', 35, []),
    jax: createDirectedRelationship('human', 'jax', -30, []),
  }
  // The opposite direction is hidden and must never become the player's read.
  reality.relationships.nova = {
    human: createDirectedRelationship('nova', 'human', -90, ['betrayal']),
  }
  reality.promises.nova = {
    id: 'nova',
    kind: 'protect_from_nomination',
    promisorId: 'human',
    beneficiaryIds: ['nova'],
    witnessIds: [],
    createdAt: { day: 2, phase: 'social_1' },
    stakes: 0.5,
    scope: {},
    status: 'ACTIVE',
  }
  const store = configureStore({
    reducer: {
      game: () => ({ players, week: 2, dramaSocialMode: realityMode }),
      settings: () => ({ gameUX: { dramaMode: realityMode } }),
      social: () => ({
        reality,
        commitments: [],
        relationships: {
          human: { nova: { affinity: 35, tags: [] }, jax: { affinity: -30, tags: [] } },
          nova: { human: { affinity: -90, tags: ['betrayal'] } },
        },
      }),
    },
  })
  const onUseAdvice = vi.fn()
  render(
    <Provider store={store}>
      <ConfessionalDecisionBriefing
        playerIds={['human', 'nova', 'jax']}
        selectedPlayerIds={['nova']}
        allianceAdvice={
          withAdvice
            ? [
                {
                  advisorId: 'friend',
                  advisorName: 'Ivy',
                  nomineeId: 'jax',
                  nomineeName: 'Jax',
                  reason: 'Keep Nova safe.',
                },
              ]
            : []
        }
        onUseAdvice={onUseAdvice}
      />
    </Provider>
  )
  return { store, onUseAdvice }
}

describe('Confessional private read', () => {
  it('lets the player compare candidates without changing or submitting a decision', () => {
    const { store, onUseAdvice } = setup()
    const originalState = store.getState()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Your read' }))
    const dialog = screen.getByRole('dialog', { name: 'Your read' })
    expect(within(dialog).getByRole('heading', { name: 'Nova' })).toBeInTheDocument()
    expect(within(dialog).getByText('Friendly')).toBeInTheDocument()
    expect(within(dialog).queryByText('Betrayed')).toBeNull()
    expect(within(dialog).getByText('Protect From Nomination')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Jax' }))
    expect(within(dialog).getByRole('heading', { name: 'Jax' })).toBeInTheDocument()
    expect(within(dialog).queryByText('Protect From Nomination')).toBeNull()
    expect(onUseAdvice).not.toHaveBeenCalled()
    expect(store.getState()).toBe(originalState)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close your read' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
    expect(screen.getByRole('button', { name: 'Your read' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Your read' }))
    expect(screen.getByRole('heading', { name: 'Nova' })).toBeInTheDocument()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps alliance advice available and requires an explicit action to follow it', () => {
    const { onUseAdvice } = setup(true, true)
    fireEvent.click(screen.getByRole('button', { name: 'Your read' }))
    expect(screen.getByRole('button', { name: /Alliance advice/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Jax' }))
    expect(onUseAdvice).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Select Jax' }))
    expect(onUseAdvice).toHaveBeenCalledExactlyOnceWith('jax')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('preserves the basic relationship guide without exposing Reality Mode details', () => {
    setup(false)
    fireEvent.click(screen.getByRole('button', { name: 'Your read' }))
    expect(screen.getByRole('heading', { name: 'Nova' })).toBeInTheDocument()
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.queryByText('Promises & favors')).toBeNull()
    expect(screen.queryByText('Protect From Nomination')).toBeNull()
  })
})

import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatOverlay from '../ChatOverlay'

describe('ChatOverlay inline completion content', () => {
  afterEach(() => vi.useRealTimers())

  it('shows an inline decision after the chat finishes instead of a continue popup', async () => {
    vi.useFakeTimers()
    render(
      <ChatOverlay
        lines={[{ id: 'prompt', role: 'host', text: 'The Hub is watching. Make your choice.' }]}
        skippable={false}
        completionContent={<button type="button">Cast public vote</button>}
      />
    )

    expect(screen.queryByRole('button', { name: 'Cast public vote' })).toBeNull()

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(screen.getByRole('button', { name: 'Cast public vote' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull()
  })

  it('skips the remaining chat in place and reveals the decision without completing the overlay', () => {
    const onComplete = vi.fn()
    render(
      <ChatOverlay
        lines={[
          { id: 'first', role: 'host', text: 'Hear the first plea.' },
          { id: 'second', role: 'host', text: 'Hear the second plea.' },
        ]}
        skipToCompletion
        skipLabel="Skip to decision"
        completionContent={<button type="button">Cast public vote</button>}
        onComplete={onComplete}
      />
    )

    act(() => screen.getByRole('button', { name: 'Skip to decision' }).click())

    expect(screen.getByText('Hear the first plea.')).toBeInTheDocument()
    expect(screen.getByText('Hear the second plea.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cast public vote' })).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('applies the shared-house backdrop only when requested', () => {
    const { container } = render(
      <ChatOverlay
        lines={[{ id: 'announcement', role: 'host', text: 'The decision has been made.' }]}
        autoPlay={false}
        backdropVariant="finale-elimination"
      />
    )

    expect(container.querySelector('.chat-overlay--finale-elimination')).toBeInTheDocument()
  })
})

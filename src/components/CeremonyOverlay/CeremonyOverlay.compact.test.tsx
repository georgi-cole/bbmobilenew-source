import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CeremonyOverlay from './CeremonyOverlay'

describe('compact VIP badge effects', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('extracts a public-save badge upward in one second instead of turning it into a landing', async () => {
    const onDone = vi.fn()
    render(
      <CeremonyOverlay
        tiles={[{ rect: new DOMRect(50, 100, 60, 80), badge: '❓', badgeMotion: 'extract' }]}
        caption="Public save"
        onDone={onDone}
        badgeOnly
        showDim={false}
        showCaption={false}
      />
    )

    await act(async () => vi.advanceTimersByTime(10))
    const badge = document.querySelector<HTMLElement>('.ceremony-overlay__badge')
    expect(badge).not.toBeNull()
    expect(badge?.dataset.badgeMotion).toBe('extract')
    expect(badge?.classList.contains('ceremony-overlay__badge--appearing')).toBe(true)
    const firstTop = Number.parseFloat(badge?.style.top ?? '')

    await act(async () => vi.advanceTimersByTime(330))
    expect(badge?.classList.contains('ceremony-overlay__badge--flying')).toBe(true)
    expect(Number.parseFloat(badge?.style.top ?? '')).toBeLessThan(firstTop)
    expect(onDone).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTime(670))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('keeps the unshortened public-save extraction when compact mode is off', async () => {
    const onDone = vi.fn()
    render(
      <CeremonyOverlay
        tiles={[{ rect: new DOMRect(50, 100, 60, 80), badge: '❓', badgeMotion: 'extract' }]}
        caption="Public save"
        onDone={onDone}
      />
    )

    await act(async () => vi.advanceTimersByTime(1100))
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(2100))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SeasonTutorialTour from '../SeasonTutorialTour'

describe('season tutorial targeting', () => {
  afterEach(() => vi.restoreAllMocks())

  it('centers the final spotlight on the Play face instead of its larger tap target', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.dataset.onboardingTarget === 'play') {
        return DOMRect.fromRect({ x: 170, y: 720, width: 52, height: 52 })
      }
      return DOMRect.fromRect({ x: 150, y: 700, width: 92, height: 60 })
    })
    render(
      <>
        <button aria-label="Advance to next phase" />
        <span data-onboarding-target="play" />
        <SeasonTutorialTour showPublicStep={false} onComplete={vi.fn()} onSkip={vi.fn()} />
      </>
    )

    for (let step = 0; step < 8; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByRole('dialog', { name: 'Play' })).toBeInTheDocument()
    expect(document.querySelector('.season-tutorial__spotlight')).toHaveStyle({
      left: '167px',
      top: '717px',
      width: '58px',
      height: '58px',
    })
  })

  it('targets the visible Log launcher and follows a layout move without a resize event', () => {
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
    let logLeft = 290
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const left = this.dataset.testid === 'visible-log' ? logLeft : 20
      return DOMRect.fromRect({ x: left, y: 200, width: 80, height: 30 })
    })
    render(
      <>
        <div className="tv-zone__viewport" />
        <button aria-label="Open game log, 10 events" className="tv-log__launcher--hidden">
          Hidden legacy launcher
        </button>
        <div aria-hidden="true">
          <button data-onboarding-target="game-log">Hidden ancestor</button>
        </div>
        <section data-houseguest-roster="true">
          <button
            aria-label="Open game log"
            data-testid="visible-log"
            data-onboarding-target="game-log"
          >
            Log
          </button>
        </section>
        <SeasonTutorialTour showPublicStep onComplete={vi.fn()} onSkip={vi.fn()} />
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'Game Log' })).toBeDefined()
    const spotlight = document.querySelector('.season-tutorial__spotlight')
    expect(spotlight).toHaveStyle({ left: '285px', width: '90px' })
    logLeft = 180
    act(() => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(16))
    })
    expect(spotlight).toHaveStyle({ left: '175px' })
  })
})

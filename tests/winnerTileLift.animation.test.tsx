import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WinnerTileLiftAnimation from '../src/components/WinnerTileLiftAnimation/WinnerTileLiftAnimation'
import rosterStyles from '../src/components/HouseguestGrid/HouseguestGrid.module.css'

describe('WinnerTileLiftAnimation', () => {
  let animationFrames: FrameRequestCallback[]
  let originalVisualViewport: VisualViewport | null

  beforeEach(() => {
    originalVisualViewport = window.visualViewport
    vi.useFakeTimers()
    animationFrames = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'hidden')
    document.body.replaceChildren()
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
  })

  function flushAnimationFrame() {
    const callbacks = animationFrames.splice(0)
    act(() => callbacks.forEach((callback) => callback(performance.now())))
  }

  function renderedRect(tile: HTMLElement) {
    const transform = tile.style.transform.match(
      /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) scale\(([\d.]+), ([\d.]+)\)$/
    )
    expect(transform).not.toBeNull()
    return new DOMRect(
      Number.parseFloat(tile.style.left) + Number(transform![1]),
      Number.parseFloat(tile.style.top) + Number(transform![2]),
      Number.parseFloat(tile.style.width) * Number(transform![3]),
      Number.parseFloat(tile.style.height) * Number(transform![4])
    )
  }

  it('pauses a backgrounded award without recapturing the tile or replaying its landing phase', () => {
    const source = document.createElement('div')
    source.textContent = 'Alice'
    document.body.append(source)
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(22, 48, 72, 72))
    const clone = vi.spyOn(source, 'cloneNode')
    const onDone = vi.fn()
    render(
      <WinnerTileLiftAnimation
        targetIds={['alice']}
        tiles={[{ rect: null, badge: '👑' }]}
        caption="Alice wins"
        resolveTarget={() => source}
        onDone={onDone}
      />
    )
    flushAnimationFrame()
    flushAnimationFrame()
    flushAnimationFrame()
    act(() => vi.advanceTimersByTime(1000))
    expect(document.querySelector('[data-winner-tile-lift-phase="awarded"]')).not.toBeNull()
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(source.style.visibility).toBe('')
    expect(
      document.querySelector('.winner-tile-lift')?.getAttribute('data-presentation-suspended')
    ).toBe('true')
    act(() => vi.advanceTimersByTime(20_000))
    expect(onDone).not.toHaveBeenCalled()
    expect(document.querySelector('[data-winner-tile-lift-phase="awarded"]')).not.toBeNull()
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(source.style.visibility).toBe('hidden')
    expect(clone).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(1800))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(source.style.visibility).toBe('')
    Reflect.deleteProperty(document, 'hidden')
  })

  it('lifts a frozen copy, attaches the badge, remeasures the return, and restores the source', () => {
    const source = document.createElement('div')
    source.dataset.ceremonyTile = 'true'
    source.style.background = 'rgb(10, 20, 30)'
    source.style.opacity = '0.72'
    source.innerHTML = '<span>Alice</span>'
    document.body.append(source)

    let rect = new DOMRect(22, 48, 72, 72)
    vi.spyOn(source, 'getBoundingClientRect').mockImplementation(() =>
      source.style.getPropertyValue('content-visibility') === 'hidden'
        ? new DOMRect(rect.x, rect.y, rect.width, 2)
        : rect
    )
    const onDone = vi.fn()

    render(
      <WinnerTileLiftAnimation
        targetIds={['alice']}
        tiles={[{ rect: null, badge: '👑', badgeLabel: 'Alice wins LOH' }]}
        caption="Alice wins Leader of the House!"
        resolveTarget={() => source}
        onDone={onDone}
      />
    )

    flushAnimationFrame()

    expect(source.style.visibility).toBe('hidden')
    expect(source.style.getPropertyPriority('visibility')).toBe('important')
    expect(source.style.opacity).toBe('0')
    expect(source.style.getPropertyPriority('opacity')).toBe('important')
    expect(source.style.getPropertyValue('content-visibility')).toBe('hidden')
    expect(source.style.getPropertyValue('clip-path')).toBe('inset(50%)')
    expect(window.getComputedStyle(source.querySelector('span')!).visibility).toBe('hidden')
    expect(source.dataset.ceremonyTileLifted).toBe('true')
    expect(document.querySelector('.winner-tile-lift__snapshot')?.textContent).toContain('Alice')
    expect(document.querySelector('.ceremony-overlay__dim')).toBeNull()

    flushAnimationFrame()
    flushAnimationFrame()
    expect(document.querySelector('[data-winner-tile-lift-phase="lifted"]')).not.toBeNull()

    act(() => vi.advanceTimersByTime(520))
    expect(document.querySelector('[data-winner-tile-lift-phase="awarded"]')).not.toBeNull()
    const animatedBadge = document.querySelector<HTMLElement>('.winner-tile-lift__badge')
    const animatedBadgeStack = document.querySelector<HTMLElement>('.winner-tile-lift__badge-stack')
    expect(animatedBadge?.textContent).toBe('👑')
    expect(animatedBadgeStack?.classList.contains(rosterStyles.badgeStack)).toBe(true)
    expect(animatedBadge?.classList.contains(rosterStyles.statusBadge)).toBe(true)

    rect = new DOMRect(108, 226, 64, 64)
    act(() => vi.advanceTimersByTime(1720))
    const liftedTile = document.querySelector<HTMLElement>('.winner-tile-lift__tile')
    expect(document.querySelector('[data-winner-tile-lift-phase="returning"]')).not.toBeNull()
    expect(liftedTile).not.toBeNull()
    expect(liftedTile?.dataset.winnerTargetLeft).toBe('108')
    expect(liftedTile?.dataset.winnerTargetTop).toBe('226')
    const returned = renderedRect(liftedTile!)
    expect(returned.x).toBeCloseTo(108)
    expect(returned.y).toBeCloseTo(226)
    expect(returned.width).toBeCloseTo(64)
    expect(returned.height).toBeCloseTo(64)

    act(() => vi.advanceTimersByTime(560))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(source.style.visibility).toBe('')
    expect(source.style.opacity).toBe('0.72')
    expect(source.style.getPropertyPriority('opacity')).toBe('')
    expect(source.style.getPropertyValue('content-visibility')).toBe('')
    expect(source.style.getPropertyValue('clip-path')).toBe('')
    expect(source.dataset.ceremonyTileLifted).toBeUndefined()
  })

  it('renders the same compact safety badge asset used by the permanent roster tile', () => {
    const sourceContainer = document.createElement('div')
    sourceContainer.className = rosterStyles.compact
    const source = document.createElement('div')
    source.textContent = 'Alice'
    source.getBoundingClientRect = vi.fn(() => new DOMRect(22, 48, 72, 72))
    sourceContainer.append(source)
    document.body.append(sourceContainer)

    render(
      <WinnerTileLiftAnimation
        targetIds={['alice']}
        tiles={[
          {
            rect: null,
            badge: '🛡️',
            badgeCode: 'pos',
            badgeImageSrc: '/assets/avatar_badges/safety_badge.svg',
          },
        ]}
        caption="Alice wins Power of Safety!"
        resolveTarget={() => source}
        onDone={vi.fn()}
      />
    )

    flushAnimationFrame()

    const badgeImage = document.querySelector<HTMLImageElement>('.winner-tile-lift__badge img')
    const badgeStack = document.querySelector<HTMLElement>('.winner-tile-lift__badge-stack')
    expect(badgeImage?.src).toContain('/assets/avatar_badges/safety_badge.svg')
    expect(badgeImage?.classList.contains(rosterStyles.statusBadgeImage)).toBe(true)
    expect(badgeStack?.classList.contains(rosterStyles.compact)).toBe(true)
  })

  it('finishes safely when the roster tile never becomes measurable', () => {
    const onDone = vi.fn()
    render(
      <WinnerTileLiftAnimation
        targetIds={['missing']}
        tiles={[{ rect: null, badge: '🛡️' }]}
        caption="Winner"
        resolveTarget={() => null}
        onDone={onDone}
      />
    )

    for (let frame = 0; frame < 24; frame += 1) flushAnimationFrame()

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.winner-tile-lift')).toBeNull()
  })

  it('waits for a rebuilding portrait instead of stretching its border into the award', () => {
    const source = document.createElement('div')
    source.textContent = 'Alice'
    document.body.append(source)
    let rect = new DOMRect(12, 90, 72, 2)
    vi.spyOn(source, 'getBoundingClientRect').mockImplementation(() => rect)
    const clone = vi.spyOn(source, 'cloneNode')
    const onDone = vi.fn()
    render(
      <WinnerTileLiftAnimation
        targetIds={['alice']}
        tiles={[{ rect: null, badge: '👑' }]}
        caption="Alice wins"
        resolveTarget={() => source}
        onDone={onDone}
      />
    )
    flushAnimationFrame()
    expect(clone).not.toHaveBeenCalled()
    expect(source.style.visibility).toBe('')
    rect = new DOMRect(12, 90, 72, 72)
    flushAnimationFrame()
    expect(clone).toHaveBeenCalledTimes(1)
    expect(source.style.visibility).toBe('hidden')
    expect(onDone).not.toHaveBeenCalled()
    flushAnimationFrame()
    flushAnimationFrame()
    rect = new DOMRect(12, 90, 72, 2)
    act(() => vi.advanceTimersByTime(2240))
    expect(
      document.querySelector<HTMLElement>('.winner-tile-lift__tile')?.dataset.winnerTargetHeight
    ).toBe('72')
    act(() => vi.advanceTimersByTime(560))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(source.style.visibility).toBe('')
  })

  it('fits paired winners and recenters them when the visual viewport changes', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        width: 320,
        height: 640,
        offsetLeft: 7,
        offsetTop: 11,
      },
    })
    const sources = ['Alice', 'Bob'].map((name, index) => {
      const source = document.createElement('div')
      source.textContent = name
      source.getBoundingClientRect = vi.fn(() => new DOMRect(12 + index * 70, 90, 62, 62))
      document.body.append(source)
      return source
    })

    render(
      <WinnerTileLiftAnimation
        targetIds={['alice', 'bob']}
        tiles={[
          { rect: null, badge: '👑' },
          { rect: null, badge: '👑' },
        ]}
        caption="Alice & Bob win!"
        resolveTarget={(id) => sources[id === 'alice' ? 0 : 1]}
        onDone={vi.fn()}
      />
    )

    flushAnimationFrame()
    flushAnimationFrame()
    flushAnimationFrame()

    const liftedTiles = [...document.querySelectorAll<HTMLElement>('.winner-tile-lift__tile')]
    expect(liftedTiles).toHaveLength(2)
    const bounds = liftedTiles.map(renderedRect)
    expect(bounds.every((rect) => rect.width >= 62 && rect.width <= 144)).toBe(true)
    expect(bounds[0].left).toBeGreaterThanOrEqual(7)
    expect(bounds[1].right).toBeLessThanOrEqual(327)
    expect(Number.parseFloat(liftedTiles[0].dataset.winnerTargetLeft ?? '')).toBeGreaterThanOrEqual(
      7
    )
    expect(
      Number.parseFloat(liftedTiles[1].dataset.winnerTargetLeft ?? '') +
        Number.parseFloat(liftedTiles[1].dataset.winnerTargetWidth ?? '')
    ).toBeLessThanOrEqual(327)
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { width: 640, height: 320, offsetLeft: 7, offsetTop: 11 },
    })
    act(() => window.dispatchEvent(new Event('resize')))
    flushAnimationFrame()
    const recentered = liftedTiles.map(renderedRect)
    expect((recentered[0].left + recentered[1].right) / 2).toBeCloseTo(327)
    expect(recentered.every((rect) => rect.top >= 11 && rect.bottom <= 331)).toBe(true)
  })

  it('restores the real tile if the animation is interrupted', () => {
    const addListener = vi.spyOn(window, 'addEventListener')
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const source = document.createElement('div')
    source.getBoundingClientRect = vi.fn(() => new DOMRect(20, 40, 70, 70))
    document.body.append(source)
    const onDone = vi.fn()
    const view = render(
      <WinnerTileLiftAnimation
        targetIds={['alice']}
        tiles={[{ rect: null, badge: '👑' }]}
        caption="Alice wins"
        resolveTarget={() => source}
        onDone={onDone}
      />
    )

    flushAnimationFrame()
    expect(source.style.visibility).toBe('hidden')
    const resizeHandler = addListener.mock.calls.find(([type]) => type === 'resize')?.[1]
    expect(resizeHandler).toBeDefined()

    view.unmount()

    expect(source.style.visibility).toBe('')
    expect(source.dataset.ceremonyTileLifted).toBeUndefined()
    expect(onDone).not.toHaveBeenCalled()
    expect(removeListener).toHaveBeenCalledWith('resize', resizeHandler)
  })
})

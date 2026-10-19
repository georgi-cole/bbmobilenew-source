import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('public/minigames/twin-remastered/part2/index.html', 'utf8')
const part1Source = readFileSync('public/minigames/twin-remastered/part1/index.html', 'utf8')

describe('Find Your Twin 2 remastered mobile shell', () => {
  it.each([
    ['part 1', part1Source],
    ['part 2', source],
  ])('preserves the game aspect ratio in fullscreen landscape on touch for %s', (_part, html) => {
    const landscapeRule = html.split(
      '@media (orientation: landscape) and (pointer: coarse) and (max-height: 700px)'
    )[1]
    expect(landscapeRule).toContain('aspect-ratio: 16/9;')
    expect(landscapeRule).toContain('height: auto;')
    expect(landscapeRule).not.toContain('aspect-ratio: auto;')
  })

  it('keeps the game centered in the dynamic viewport instead of pinning it to the top', () => {
    expect(source).toContain('min-height: 100svh')
    expect(source).toContain('place-content: center')
    expect(source).not.toContain('place-content: start')
    expect(source).toContain('max-height: calc(100svh - 76px)')
  })

  it('releases every touch control when a pointer is interrupted', () => {
    expect(source).toContain("'pointercancel'")
    expect(source).toContain("'lostpointercapture'")
    expect(source).toContain('resetInputState')
    expect(source).toContain("window.addEventListener('blur', resetInputState)")
    expect(source).toContain("window.addEventListener('orientationchange', () => {")
    expect(source).toContain('updatePortraitInvitation()')
    expect(source).toContain("document.addEventListener('visibilitychange'")
    expect(source).toContain('Object.keys(keys).forEach((key) => {')
    expect(source).toContain('keys[key] = false')
  })

  it('suppresses mobile selection, long-press callouts, and context menus on gameplay controls', () => {
    expect(source).toContain('-webkit-touch-callout: none')
    expect(source).toContain('-webkit-tap-highlight-color: transparent')
    expect(source).toContain("button.addEventListener('contextmenu'")
    expect(source).toContain("document.addEventListener('selectstart'")
    expect(source).toContain("event.target.closest?.('canvas, .controls')")
  })
})

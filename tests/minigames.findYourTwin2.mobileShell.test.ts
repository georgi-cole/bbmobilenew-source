import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('public/minigames/twin-remastered/part2/index.html', 'utf8')

describe('Find Your Twin 2 remastered mobile shell', () => {
  it('keeps the game centered in the dynamic viewport instead of pinning it to the top', () => {
    expect(source).toContain('min-height: 100dvh')
    expect(source).toContain('place-content: center')
    expect(source).not.toContain('place-content: start')
    expect(source).toContain('max-height: calc(100dvh - 76px)')
  })

  it('releases every touch control when a pointer is interrupted', () => {
    expect(source).toContain("'pointercancel'")
    expect(source).toContain("'lostpointercapture'")
    expect(source).toContain('resetInputState')
    expect(source).toContain("window.addEventListener('blur', resetInputState)")
    expect(source).toContain("window.addEventListener('orientationchange', resetInputState)")
    expect(source).toContain("document.addEventListener('visibilitychange'")
    expect(source).toContain('keys.jump = false')
    expect(source).toContain('keys.enter = false')
  })

  it('suppresses mobile selection, long-press callouts, and context menus on gameplay controls', () => {
    expect(source).toContain('-webkit-touch-callout: none')
    expect(source).toContain('-webkit-tap-highlight-color: transparent')
    expect(source).toContain("button.addEventListener('contextmenu'")
    expect(source).toContain("surface?.addEventListener('selectstart'")
  })
})

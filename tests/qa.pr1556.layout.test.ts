import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('PR1556 mobile layout regressions', () => {
  it('keeps Blackjack action buttons clear of the score rail on phone portraits', () => {
    const css = read('src/components/BlackjackTournamentComp/BlackjackTournamentComp.css')
    const mobile = css.slice(css.indexOf('/* ─── Mobile duel viewport hardening'))

    expect(mobile).toContain('.bjt-container.bjt-duel')
    expect(mobile).toContain('height: 100dvh;')
    expect(mobile).toContain('grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);')
    expect(mobile).toContain('.bjt-duel .bjt-roster-wrap')
    expect(mobile).toContain('position: static;')
    expect(mobile).toContain('margin-top: auto;')
  })

  it('keeps Weekend Social resources compact beside the title on phones', () => {
    const css = read('src/components/SocialPanelV2/SocialPanelV2.css')
    const mobile = css.slice(css.indexOf('/* Keep weekend resources compact beside the title'))

    expect(mobile).toContain('@media (max-width: 699px)')
    expect(mobile).toContain('display: flex;')
    expect(mobile).toContain('align-items: center;')
    expect(mobile).toContain('.sp2-modal--weekend .sp2-header__resources')
    expect(mobile).toContain('width: auto;')
    expect(mobile).toContain('overflow: visible;')
    expect(mobile).toContain('justify-content: flex-end;')
  })

  it('lets an expanded relationship read grow inside the Social scroll area', () => {
    const css = read('src/components/SocialPanelV2/SocialPanelV2.css')
    const mobile = css.slice(css.indexOf('/* Keep move categories and Execute visible'))

    expect(mobile).toContain('.sp2-body')
    expect(mobile).toContain('overflow-y: auto;')
    expect(mobile).toContain('.sp2-body > .sp2-focus')
    expect(mobile).toContain('flex: 0 0 auto;')
    expect(mobile).toContain('overflow: visible;')
    expect(css).toContain('.sp2-focus__full-read {')
  })

  it('keeps VIP Risk Wheel controls and scores inside normal phone heights', () => {
    const css = read('src/components/RiskWheelComp/RiskWheelComp.css')
    const mobile = css.slice(css.indexOf('/* ─── VIP phone viewport fit hardening'))

    expect(mobile).toContain('(max-height: 920px)')
    expect(mobile).toContain('min(74vw, 36dvh)')
    expect(mobile).toContain('.rw-root--vip .rw-mini-scores')
    expect(mobile).toContain('flex-wrap: nowrap;')
    expect(mobile).toContain('overflow-x: auto;')
    expect(mobile).toContain('min-height: 37px;')
  })
})

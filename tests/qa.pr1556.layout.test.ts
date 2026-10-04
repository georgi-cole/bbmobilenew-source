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

  it('gives Weekend Social resources their own unclipped mobile row', () => {
    const css = read('src/components/SocialPanelV2/SocialPanelV2.css')
    const mobile = css.slice(css.indexOf('/* ─── Weekend resource header fit hardening'))

    expect(mobile).toContain("'resources resources'")
    expect(mobile).toContain('.sp2-modal--weekend .sp2-header__resources')
    expect(mobile).toContain('width: 100%;')
    expect(mobile).toContain('overflow: visible;')
    expect(mobile).toContain('flex: 1 1 0;')
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

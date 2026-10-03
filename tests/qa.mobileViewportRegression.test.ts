import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('QA mobile viewport regressions', () => {
  it('keeps the Blackjack duel roster in layout instead of over the Hit / Stand controls', () => {
    const css = source('src/components/BlackjackTournamentComp/BlackjackTournamentComp.css')
    const mobileDuel = css.slice(css.lastIndexOf('@media (max-width: 600px)'))

    expect(mobileDuel).toContain('.bjt-container.bjt-duel')
    expect(mobileDuel).toContain('height: 100dvh')
    expect(mobileDuel).toContain('grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)')
    expect(mobileDuel).toMatch(
      /\.bjt-duel \.bjt-roster-wrap\s*\{[^}]*position:\s*static;[^}]*margin-top:\s*auto;/s
    )
  })

  it('gives Weekend Social resources a full-width row so three-digit values do not clip', () => {
    const css = source('src/components/SocialPanelV2/SocialPanelV2.css')
    const weekendMobile = css.slice(
      css.lastIndexOf('/* ─── Weekend resource header fit hardening')
    )

    expect(weekendMobile).toContain("'resources resources'")
    expect(weekendMobile).toMatch(
      /\.sp2-modal--weekend \.sp2-header__resources\s*\{[^}]*width:\s*100%;[^}]*overflow:\s*visible;/s
    )
    expect(weekendMobile).toMatch(
      /\.sp2-modal--weekend \.sp2-resource-chip\s*\{[^}]*flex:\s*1 1 0;/s
    )
  })

  it('keeps VIP Risk Wheel actions visible and prevents the score rail from wrapping downward', () => {
    const css = source('src/components/RiskWheelComp/RiskWheelComp.css')
    const vipMobile = css.slice(css.lastIndexOf('/* ─── VIP phone viewport fit hardening'))

    expect(vipMobile).toContain('(max-height: 920px)')
    expect(vipMobile).toContain('min(74vw, 36dvh)')
    expect(vipMobile).toMatch(
      /\.rw-root--vip \.rw-mini-scores\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/s
    )
    expect(vipMobile).toMatch(/\.rw-root--vip \.rw-btn--spin[\s\S]*min-height:\s*37px;/)
  })
})

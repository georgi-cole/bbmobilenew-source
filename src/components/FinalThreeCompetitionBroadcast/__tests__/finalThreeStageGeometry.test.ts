import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('../FinalThreeCompetitionBroadcast.css', import.meta.url), 'utf8')

function cssRules() {
  return [...styles.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, declarations]) => ({
    selector: selector.trim(),
    declarations,
  }))
}

describe('Final Three broadcast stage geometry', () => {
  it('never changes the cast height or floor position when the live monitor grows', () => {
    const rules = cssRules()
    const base = rules.find((rule) => rule.selector === '.f3-broadcast__cast')
    expect(base?.declarations).toMatch(/height:\s*42%/)
    expect(base?.declarations).toMatch(/bottom:\s*10\.5%/)

    const stageOverrides = rules.filter(
      (rule) =>
        rule.selector.includes('.f3-broadcast__cast') &&
        /data-stage='(establish|lineup|live|lock|verdict|handoff)'/.test(rule.selector)
    )
    expect(stageOverrides.length).toBeGreaterThan(0)
    for (const rule of stageOverrides) {
      expect(rule.declarations, rule.selector).not.toMatch(/(?:^|;)\s*(height|bottom)\s*:/)
    }
  })

  it('keeps the on-set Eye centered, front-facing and free of continuous rotation', () => {
    const eye = cssRules().find((rule) => rule.selector === '.f3-broadcast__eye')
    expect(eye?.declarations).toMatch(/left:\s*50%/)
    expect(eye?.declarations).toMatch(/transform:\s*translateX\(-50%\)/)
    expect(styles).not.toContain('animation: f3-broadcast-eye')
    expect(styles).not.toContain('@keyframes f3-broadcast-eye')
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Final Faceoff vote portrait styles', () => {
  it('keeps the ballot beside the juror and allows long names to wrap', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/TribunalMemberStage/TribunalMemberStage.css'),
      'utf8'
    ).replace(/\s+/g, ' ')

    expect(css).toMatch(/\.tms-nameplate \{[^}]*right: 5%;[^}]*width: 43%;/)
    expect(css).toMatch(/\.tms-ballot-call > strong \{[^}]*overflow-wrap: anywhere;/)
    expect(css).toMatch(/\.tms-portrait__carousel-cutout \{[^}]*height: 100%;/)
  })
})

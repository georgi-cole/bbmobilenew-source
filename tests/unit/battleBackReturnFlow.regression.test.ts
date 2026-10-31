import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('Back 2 the Game return-flow regressions', () => {
  it('uses the existing eviction cinematic in reverse instead of the roster-only CSS flash', () => {
    const grid = sourceText('src/components/HouseguestGrid/HouseguestGrid.tsx')

    expect(grid).toContain('<SpotlightEvictionOverlay')
    expect(grid).toContain('variant="return"')
    expect(grid).toContain('layoutId={`avatar-tile-${returningPlayer.id}`}')
    expect(grid).not.toContain('isReturning={returningPlayerId === String(hg.id)}')
    expect(grid).not.toContain('setTimeout(onReturnAnimationDone')
  })
})

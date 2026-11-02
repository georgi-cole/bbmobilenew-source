import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function ceremonySources() {
  return [
    'src/screens/GameScreen/GameScreen.tsx',
    'src/screens/GameScreen/flows/useCompetitionFlow.ts',
    'src/screens/GameScreen/flows/useLohFlow.ts',
    'src/screens/GameScreen/flows/useSafetyFlow.ts',
    'src/components/WinnerTileLiftAnimation/WinnerTileLiftAnimation.tsx',
  ]
    .map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))
    .join('\n')
}

describe('GameScreen ceremony animation contracts', () => {
  it('keeps live target resolvers for LOH/POS winners, nominations, replacements, and saves', () => {
    const source = ceremonySources()

    expect(source).toContain('resolveTarget={getCeremonyTileElement}')
    // Return measurements are exercised by winnerTileLift.animation.test.tsx.
    expect(source).toContain('layoutSignal={responsiveGameLayout.revision}')
    expect(source).toContain('resolveTiles={pendingReplacementCeremony.resolveTiles}')
    expect(source).toContain('resolveTiles={pendingSaveCeremony.resolveTiles}')
    expect(source).toContain("badgeMotion: 'extract' as const")
    expect(source).toContain(
      'const nomCeremonyTileIds = showNomAnim ? nomAnimPlayers.map((p) => p.id) : []'
    )
    expect(source).toContain('resolveTiles={() => {')
  })

  it('keeps eviction/spotlight animation tied to stable avatar tile layout ids', () => {
    const source = ceremonySources()

    expect(source).toContain('layoutId: `avatar-tile-${p.id}`')
    expect(source).toContain('(showEvictionSplash && pendingEvictionPlayer?.id === p.id)')
    expect(source).toContain('game.evictionOverlayPlayerId === p.id')
    expect(source).toContain('layoutId={`avatar-tile-${pendingEvictionPlayer.id}`}')
  })
})

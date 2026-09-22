import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import finaleReducer, {
  finalizeFinale,
  PUBLIC_JUROR_ID,
  startFinale,
} from '../../src/store/finaleSlice'
import { tallyVotes } from '../../src/utils/juryUtils'
import { defaultTribunalSizeForCast, preTribunalExitCount } from '../../src/rules/tribunalPolicy'
import {
  getOutcomeVisibleEvicteeIds,
  hasUnresolvedTopVoteTie,
} from '../../src/screens/GameScreen/evictionTieVisuals'
import { splitFinalePlayers } from '../../src/components/FinalFaceoff/finaleEligibility'
import { resolveExtraordinaryRemovalPlayerId } from '../../src/store/tribunalEligibilityMiddleware'
import { resolvePublicMeterDestination } from '../../src/components/FloatingActionBar/publicMeterNavigation'
import type { Player } from '../../src/types'
import type { PlayerPublicProfile } from '../../src/publicOpinion/types'

function profile(playerId: string, approval: number): PlayerPublicProfile {
  return {
    playerId,
    approval,
    previousApproval: approval,
    seasonApprovals: [approval],
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
  }
}

function sourceText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('gameplay polish regressions', () => {
  it('centers Minesweeps and centers wrapped Silent Saboteur game-over labels', () => {
    const minesweepsCss = sourceText('src/components/Minesweeps/Minesweeps.css')
    const saboteurCss = sourceText('src/components/SilentSaboteurComp/SilentSaboteurComp.css')

    expect(minesweepsCss).toContain('place-items: center')
    expect(minesweepsCss).toContain('env(safe-area-inset-top)')
    expect(saboteurCss).toContain('Issue #1232')
    expect(saboteurCss).toContain('text-align: center')
    expect(saboteurCss).toContain('white-space: normal')
  })

  it('routes a disabled Public Mode button directly to the Store', () => {
    expect(resolvePublicMeterDestination(false, 0)).toBe('/store')
    expect(resolvePublicMeterDestination(true, 0)).toBe('/public-meter')
    expect(resolvePublicMeterDestination(true, 2)).toBe('/public-meter?tab=requests')
  })

  it('renders Ali-enters with an outgoing eviction treatment', () => {
    const css = sourceText('src/components/TwinShockRevealOverlay/TwinShockRevealOverlay.css')

    expect(css).toContain('Issue #1241')
    expect(css).toContain('twin-shock-reveal--ali_enters')
    expect(css).toContain('grayscale(1)')
    expect(css).toContain('linear-gradient')
  })

  it('keeps a tied eviction visually neutral even when a reducer preselected Nico', () => {
    const votes = { ash: 4, nico: 4 }

    expect(hasUnresolvedTopVoteTie(votes)).toBe(true)
    expect(
      getOutcomeVisibleEvicteeIds({
        voteResults: votes,
        pendingEvictionId: 'nico',
      })
    ).toEqual([])
  })

  it('restores the live-vote sweep and adds an LOH-style radiating red glow', () => {
    const rosterCss = sourceText('src/components/HouseguestGrid/HouseguestGrid.module.css')
    const glowKeyframes = rosterCss.match(
      /@keyframes liveEvictionNomineeGlow\s*\{([\s\S]*?)\n\}/
    )?.[1]

    expect(rosterCss).toContain('animation: liveEvictionNomineeGlow 2.4s ease-in-out infinite')
    expect(rosterCss).toContain('animation: liveEvictionNomineeSweep 2.2s linear infinite')
    expect(glowKeyframes).toContain('box-shadow:')
    expect(glowKeyframes).toContain('0 0 22px rgba(239, 68, 68, 0.46)')
  })

  it('uses only a roster-tile reverse eviction after Back 2 the Game', () => {
    const gameScreen = sourceText('src/screens/GameScreen/GameScreen.tsx')
    const rosterCss = sourceText('src/components/HouseguestGrid/HouseguestGrid.module.css')

    expect(gameScreen).toContain('returningPlayerId={battleBackReturnId}')
    expect(gameScreen).not.toContain('variant="return"')
    expect(rosterCss).toContain('battleBackReturnPortrait')
    expect(rosterCss).toContain('battleBackReturnStrike')
  })

  it('uses a nine-member Tribunal after five exits in the standard 16-player season', () => {
    const tribunalSize = defaultTribunalSizeForCast(16)
    expect(tribunalSize).toBe(9)
    expect(preTribunalExitCount(16, tribunalSize)).toBe(5)
  })

  it('keeps the public finalist ballot equal to one Tribunal vote', () => {
    expect(tallyVotes({ j1: 'a', [PUBLIC_JUROR_ID]: 'b' })).toEqual({
      a: 1,
      b: 1,
    })
  })

  it('excludes extraordinary removals from Tribunal and pre-Tribunal promotion pools', () => {
    const players: Player[] = [
      { id: 'finalist-a', name: 'A', avatar: 'A', status: 'active' },
      { id: 'finalist-b', name: 'B', avatar: 'B', status: 'active' },
      { id: 'normal-juror', name: 'J', avatar: 'J', status: 'jury' },
      {
        id: 'shock-removal',
        name: 'Shock',
        avatar: 'S',
        status: 'jury',
        tribunalEligible: false,
      },
      { id: 'normal-pre', name: 'P', avatar: 'P', status: 'evicted' },
      {
        id: 'self-evicted',
        name: 'Self',
        avatar: 'X',
        status: 'evicted',
        tribunalEligible: false,
      },
    ]

    const split = splitFinalePlayers(players)
    expect(split.jurors.map((player) => player.id)).toEqual(['normal-juror'])
    expect(split.preJury.map((player) => player.id)).toEqual(['normal-pre'])
  })

  it('persists ineligibility for self-eviction and shock replacement actions', () => {
    const human = {
      id: 'human',
      name: 'Human',
      avatar: 'H',
      status: 'active',
      isUser: true,
    } as Player
    const other = { id: 'other', name: 'Other', avatar: 'O', status: 'active' } as Player

    expect(
      resolveExtraordinaryRemovalPlayerId(
        { type: 'game/selfEvict' },
        { game: { players: [human, other] } }
      )
    ).toBe('human')
    expect(
      resolveExtraordinaryRemovalPlayerId(
        { type: 'game/confirmDayStartShock' },
        { game: { players: [human, other], dayStartShock: { targetId: 'other' } } }
      )
    ).toBe('other')
    expect(
      resolveExtraordinaryRemovalPlayerId(
        { type: 'game/completeTwinShockRevealAnimation' },
        {
          game: {
            players: [human, other],
            twinShock: {
              pendingRevealAnimation: {
                type: 'ali_enters',
                replacedPlayerId: 'other',
              },
            },
          },
        }
      )
    ).toBe('other')
  })

  it('never promotes pre-Tribunal exits and lets the Tribunal majority break a public-created tie', () => {
    let state = finaleReducer(undefined, { type: '@@init' })
    state = finaleReducer(
      state,
      startFinale({
        finalistIds: ['a', 'b'],
        jurorIds: ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'],
        preJuryIds: ['pre1'],
        humanPlayerIds: [],
        seed: 42,
        cfg: {
          publicFinalVoteEnabled: true,
          enableJuryReturn: true,
        },
        publicApprovalProfiles: {
          a: profile('a', 10),
          b: profile('b', 95),
        },
      })
    )

    expect(state.jurorIds).toHaveLength(7)
    expect(state.jurorIds).not.toContain('pre1')
    expect(state.returnedJurorId).toBeNull()
    expect(state.publicJurorEnabled).toBe(true)
    expect(state.publicVoteWeight).toBe(1)
    expect(state.revealOrder.at(-1)).toBe(PUBLIC_JUROR_ID)

    state = {
      ...state,
      votes: {
        j1: 'a',
        j2: 'a',
        j3: 'a',
        j4: 'a',
        j5: 'b',
        j6: 'b',
        j7: 'b',
        [PUBLIC_JUROR_ID]: 'b',
      },
    }
    state = finaleReducer(state, finalizeFinale({ seed: 42 }))

    expect(state.winnerId).toBe('a')
    expect(state.tieBreakUsed).toBe(true)
    expect(state.tieBreakReason).toBe('tribunal_majority')
    expect(state.isComplete).toBe(true)
  })
})

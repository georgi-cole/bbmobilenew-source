import { describe, expect, it } from 'vitest'
import gameReducer, {
  continueSurvivorAfterAd,
  continueSurvivorAfterPaidRecovery,
} from '../store/gameSlice'
import type { GameState } from '../types'
import { createSurvivorRun } from './survivorRun'
import {
  getSurvivalAdRecoveriesRemaining,
  getSurvivalRecoveryKey,
  SURVIVAL_AD_RECOVERY_LIMIT,
} from './survivalRecovery'

function eliminateHuman(game = createSurvivorRun()): GameState {
  return {
    ...game,
    status: 'failed',
    phase: 'eviction_results',
    players: game.players.map((player) =>
      player.isUser ? { ...player, status: 'evicted' } : player
    ),
  }
}

describe('Survival recovery allowance and identity', () => {
  it('allows seven earned ad recoveries, then refuses an eighth', () => {
    let game = createSurvivorRun()
    for (let recovery = 1; recovery <= SURVIVAL_AD_RECOVERY_LIMIT; recovery += 1) {
      game = eliminateHuman(game)
      const recoveryKey = getSurvivalRecoveryKey(game)!
      game = gameReducer(game, continueSurvivorAfterAd({ recoveryKey }))
      expect(game.status).toBe('active')
      expect(game.phase).toBe('week_start')
      expect(game.players.find((player) => player.isUser)?.status).toBe('active')
      expect(game.modeSpecific).toMatchObject({ adContinueCount: recovery, paidContinueCount: 0 })
    }

    game = eliminateHuman(game)
    expect(getSurvivalAdRecoveriesRemaining(game)).toBe(0)
    expect(
      gameReducer(game, continueSurvivorAfterAd({ recoveryKey: getSurvivalRecoveryKey(game)! }))
    ).toBe(game)
  })

  it('allows paid recoveries before and after ad exhaustion without consuming or resetting ads', () => {
    for (const adContinueCount of [0, 3, 7]) {
      let game = eliminateHuman()
      if (game.modeSpecific?.kind !== 'survival') throw new Error('Missing survival state')
      game.modeSpecific = { ...game.modeSpecific, adContinueCount }
      for (let paid = 1; paid <= 12; paid += 1) {
        game = eliminateHuman(game)
        game = gameReducer(
          game,
          continueSurvivorAfterPaidRecovery({ recoveryKey: getSurvivalRecoveryKey(game)! })
        )
        expect(game.status).toBe('active')
        expect(game.modeSpecific).toMatchObject({ adContinueCount, paidContinueCount: paid })
      }
    }
  })

  it('rejects stale rewarded and paid results from another run or an earlier elimination', () => {
    const failed = eliminateHuman()
    const oldKey = getSurvivalRecoveryKey(failed)!
    const otherRun = eliminateHuman()
    expect(gameReducer(otherRun, continueSurvivorAfterAd({ recoveryKey: oldKey }))).toMatchObject(
      otherRun
    )
    expect(
      gameReducer(otherRun, continueSurvivorAfterPaidRecovery({ recoveryKey: oldKey }))
    ).toMatchObject(otherRun)

    const revived = gameReducer(failed, continueSurvivorAfterAd({ recoveryKey: oldKey }))
    const failedAgain = eliminateHuman(revived)
    expect(getSurvivalRecoveryKey(failedAgain)).not.toBe(oldKey)
    expect(gameReducer(failedAgain, continueSurvivorAfterAd({ recoveryKey: oldKey }))).toBe(
      failedAgain
    )
    expect(
      gameReducer(failedAgain, continueSurvivorAfterPaidRecovery({ recoveryKey: oldKey }))
    ).toBe(failedAgain)
  })

  it('does not recover a living human, a completed run, or a different mode', () => {
    const failed = eliminateHuman()
    for (const game of [
      createSurvivorRun(),
      { ...failed, status: 'completed' as const },
      { ...failed, mode: 'classic' as const },
      { ...failed, players: failed.players.filter((player) => !player.isUser) },
    ]) {
      expect(getSurvivalRecoveryKey(game)).toBeNull()
      expect(gameReducer(game, continueSurvivorAfterAd())).toMatchObject(game)
      expect(
        gameReducer(game, continueSurvivorAfterPaidRecovery({ recoveryKey: 'stale' }))
      ).toMatchObject(game)
    }
  })

  it('migrates old saves with only an ad counter and clears the eliminated avatar presentation', () => {
    const game = eliminateHuman()
    if (game.modeSpecific?.kind !== 'survival') throw new Error('Missing survival state')
    game.modeSpecific = { ...game.modeSpecific, adContinueCount: 3, paidContinueCount: undefined }
    game.evictionSplashId = 'user'
    game.evictionOverlayPlayerId = 'user'
    const revived = gameReducer(
      game,
      continueSurvivorAfterAd({ recoveryKey: getSurvivalRecoveryKey(game)! })
    )
    expect(revived.modeSpecific).toMatchObject({ adContinueCount: 4, paidContinueCount: 0 })
    expect(getSurvivalAdRecoveriesRemaining(revived)).toBe(3)
    expect(revived.evictionSplashId).toBeNull()
    expect(revived.evictionOverlayPlayerId).toBeNull()
  })
})

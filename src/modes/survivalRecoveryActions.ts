import gameReducer, { continueSurvivorAfterPaidRecovery } from '../store/gameSlice'
import type { AppDispatch, RootState } from '../store/store'
import {
  clearSavedRun,
  createSavedSeasonSnapshot,
  flushSavePersistence,
  getSavedRun,
  retrySavePersistenceWrites,
  saveRunSnapshot,
  type SavedSeasonSnapshot,
} from '../store/saveStatePersistence'
import {
  finalizeSurvivalRunCredit,
  releaseSurvivalRunCredit,
  reserveSurvivalRunCredit,
} from '../vip/survivalRunPurchaseService'
import { getSurvivalRecoveryKey } from './survivalRecovery'

const pendingRecoveries = new Map<string, Promise<boolean>>()

function sameRun(left: RootState['game'], right: RootState['game']): boolean {
  return (left.runId ?? left.gameId) === (right.runId ?? right.gameId)
}

/**
 * A paid recovery belongs to one elimination and one profile. Prepare its saved
 * run in the same durable batch as the credit reservation, then revive the live
 * game. A crash after that batch can resume the delivered run without another
 * charge. Guest runs keep their existing intentionally unsaved behavior.
 */
export const recoverSurvivalRunWithCredit =
  (recoveryKey: string) =>
  (dispatch: AppDispatch, getState: () => RootState): Promise<boolean> => {
    const initial = getState()
    if (getSurvivalRecoveryKey(initial.game) !== recoveryKey) return Promise.resolve(false)

    const profileId = initial.profiles.isGuest ? null : initial.profiles.activeProfileId
    const operationKey = `${profileId ?? 'guest'}:${recoveryKey}`
    const pending = pendingRecoveries.get(operationKey)
    if (pending) return pending

    const isCurrentElimination = () => {
      const current = getState()
      return (
        current.profiles.isGuest === initial.profiles.isGuest &&
        current.profiles.activeProfileId === initial.profiles.activeProfileId &&
        getSurvivalRecoveryKey(current.game) === recoveryKey
      )
    }

    const operation = (async () => {
      const action = continueSurvivorAfterPaidRecovery({ recoveryKey })
      let stagedSnapshot: SavedSeasonSnapshot | null = null
      let delivered = false

      const removeUndeliveredSnapshot = async () => {
        if (!profileId || !stagedSnapshot) return
        const saved = getSavedRun(profileId, 'survival')
        // A later save/new run always wins over this operation's cleanup.
        if (
          saved &&
          saved.savedAt === stagedSnapshot.savedAt &&
          sameRun(saved.game, stagedSnapshot.game)
        ) {
          clearSavedRun(profileId, 'survival')
          if (!(await flushSavePersistence())) {
            throw new Error('Your recovery is safe, but storage is unavailable. Please try again.')
          }
        }
      }

      try {
        const reserved = await reserveSurvivalRunCredit(recoveryKey, () => {
          if (!isCurrentElimination()) return false
          const current = getState()
          const resumedGame = gameReducer(current.game, action)
          if (resumedGame === current.game || resumedGame.status !== 'active') return false

          if (profileId) {
            // This is an explicit player retry, like the manual Save action.
            retrySavePersistenceWrites()
            stagedSnapshot = createSavedSeasonSnapshot(profileId, {
              ...current,
              game: resumedGame,
            })
            if (!saveRunSnapshot(profileId, stagedSnapshot)) {
              throw new Error('The run could not be saved. Your recovery has not been used.')
            }
          }
          return true
        })

        if (!reserved || !isCurrentElimination()) {
          await removeUndeliveredSnapshot()
          if (reserved) await releaseSurvivalRunCredit(recoveryKey)
          return false
        }

        dispatch(action)
        const resumed = getState().game
        delivered =
          sameRun(resumed, initial.game) &&
          resumed.status === 'active' &&
          resumed.players.some((player) => player.isUser && player.status === 'active')
        if (!delivered) {
          await removeUndeliveredSnapshot()
          await releaseSurvivalRunCredit(recoveryKey)
          return false
        }

        // The reservation already debited exactly once and, for a profile,
        // committed its resumed save. A failed bookkeeping write must not undo
        // an already delivered recovery or charge the player a second time.
        await finalizeSurvivalRunCredit(recoveryKey).catch(() => undefined)
        return true
      } catch (error) {
        if (!delivered) {
          await removeUndeliveredSnapshot()
          await releaseSurvivalRunCredit(recoveryKey)
        }
        throw error
      }
    })().finally(() => {
      pendingRecoveries.delete(operationKey)
    })

    pendingRecoveries.set(operationKey, operation)
    return operation
  }

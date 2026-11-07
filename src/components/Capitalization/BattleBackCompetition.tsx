import { useCallback, useEffect, useRef, useState } from 'react'
import Capitalization from './Capitalization'
import { getCapitalizationRules } from './capitalizationRules'
import MinigameRules from '../MinigameRules/MinigameRules'
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper'
import { CompetitionResultContext } from '../../minigames/competitionResultContext'
import { getGame } from '../../minigames/registry'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import type { CompetitionResult } from '../../minigames/competitionResult'
import { createAbandonedChallengeResult } from '../../store/challengeResults'
import { beginBattleBackAttempt, checkpointBattleBackResult } from '../../store/gameSlice'
import { persistCompetitionCheckpoint, store } from '../../store/store'

/** Back 2 the Game uses its own winner/reward flow, outside LOH/POS challenges. */
export default function BattleBackCompetition(
  props: GenericMinigameProps & { attemptIndex: number }
) {
  const { attemptIndex, participants = [], participantIds = [], seed = 0, onFinish } = props
  const [gameId] = useState(() => store.getState().game.gameId)
  const [initial] = useState(() => store.getState().game.battleBack?.attemptCheckpoint)
  const [result, setResult] = useState<CompetitionResult | null>(() => {
    if (!initial || initial.number !== attemptIndex || initial.status === 'ready') return null
    if ('result' in initial) return initial.result
    return createAbandonedChallengeResult(
      {
        id: `${gameId}:battle-back:${attemptIndex}`,
        game: getGame('capitalization')!,
        participants: participantIds,
        seed,
        phase: 'rules',
        aiScores: Object.fromEntries(
          participants
            .filter((player) => !player.isHuman)
            .map((player) => [player.id, player.precomputedScore])
        ),
      },
      participants.find((player) => player.isHuman)?.id
    )
  })
  const [playing, setPlaying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const active = useRef(true)
  const submitted = useRef(false)
  const work = useRef<Promise<boolean> | null>(null)
  const retry = useRef<(() => void) | null>(null)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const isCurrent = useCallback(() => {
    const state = store.getState().game
    return (
      state.gameId === gameId &&
      state.battleBack?.active &&
      (state.battleBack.attemptIndex ?? 0) === attemptIndex
    )
  }, [attemptIndex, gameId])

  const checkpoint = useCallback(
    (outcome: CompetitionResult): Promise<boolean> => {
      if (!active.current || !isCurrent()) return Promise.resolve(false)
      if (work.current) return work.current
      store.dispatch(checkpointBattleBackResult({ number: attemptIndex, result: outcome }))
      const saved = store.getState().game.battleBack?.attemptCheckpoint
      const finalResult = saved && 'result' in saved ? saved.result : outcome
      setResult(finalResult)
      const persist = async () => {
        setSaving(true)
        setFailed(false)
        const ok = await persistCompetitionCheckpoint()
        if (active.current) {
          setSaving(false)
          setFailed(!ok)
          retry.current = ok
            ? null
            : () => {
                work.current = persist()
              }
        }
        return ok
      }
      work.current = persist()
      return work.current
    },
    [attemptIndex, isCurrent]
  )

  useEffect(() => {
    if (initial?.number === attemptIndex && initial.status === 'playing' && result) {
      // Recovery already renders its result. Start its save after this commit;
      // checkpoint also rejects the callback if this adapter has unmounted.
      queueMicrotask(() => void checkpoint(result))
    }
  }, [attemptIndex, checkpoint, initial, result])

  const start = () => {
    if (saving || !isCurrent()) return
    const persist = async () => {
      setSaving(true)
      setFailed(false)
      store.dispatch(beginBattleBackAttempt(attemptIndex))
      const ok = await persistCompetitionCheckpoint()
      if (!active.current || !isCurrent()) return
      setSaving(false)
      setFailed(!ok)
      retry.current = ok ? null : () => void persist()
      if (ok) setPlaying(true)
    }
    void persist()
  }

  const finish: NonNullable<GenericMinigameProps['onFinish']> = (
    value,
    tiebreakerMs,
    completion
  ) => {
    if (submitted.current) return
    submitted.current = true
    const outcome: CompetitionResult = result ?? {
      rawValue: value,
      partial: false,
      completion: { ...completion, ...(tiebreakerMs != null ? { tiebreakerMs } : {}) },
    }
    void checkpoint(outcome).then((saved) => {
      if (!saved || !isCurrent() || !active.current) {
        submitted.current = false
        return
      }
      onFinish?.(outcome.rawValue, outcome.completion?.tiebreakerMs, outcome.completion)
    })
  }

  return (
    <div className="minigame-host" aria-label="Back 2 the Game competition">
      {playing ? (
        <CompetitionResultContext.Provider value={checkpoint}>
          <Capitalization {...props} context="battleBack" autoStart onFinish={finish} />
        </CompetitionResultContext.Provider>
      ) : result ? (
        <MinigameCompleteWrapper
          onContinue={() =>
            finish(result.rawValue, result.completion?.tiebreakerMs, result.completion)
          }
          placementsNode={
            <ol>
              {(result.completion?.authoritativeRankedIds ?? participantIds).map((id) => (
                <li key={id}>{participants.find((player) => player.id === id)?.name ?? id}</li>
              ))}
            </ol>
          }
        >
          <h2>{result.partial ? 'Competition ended after leaving' : 'Competition result saved'}</h2>
        </MinigameCompleteWrapper>
      ) : (
        <MinigameRules
          game={getCapitalizationRules('battleBack')}
          onConfirm={start}
          attemptNotice="Once play starts, closing the app counts as leaving this competition. Finished results are saved before Continue."
        />
      )}
      {(saving || failed) && (
        <div className="minigame-checkpoint-overlay" role={failed ? 'alert' : 'status'}>
          <div className="minigame-host-demo__card">
            <p>
              {failed
                ? 'We couldn’t save this competition. Try saving again to continue.'
                : 'Saving competition…'}
            </p>
            {failed && (
              <button type="button" onClick={() => retry.current?.()}>
                Try saving again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

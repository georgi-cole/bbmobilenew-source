import { createDraft, finishDraft } from 'immer'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { setDramaSocialMode, setPhase } from '../../store/gameSlice'
import { setGameUX } from '../../store/settingsSlice'
import { commitRealityDomainUpdate, setEnergyBankEntry } from '../../social/socialSlice'
import { appendRealityEvent } from '../../social/reality/events'
import { createRealityAlliance } from '../../social/reality/relationshipForms'
import { createRealityNemesisObjective } from '../../social/reality/relationshipAutonomy'

/**
 * Development / E2E only. Seeds a genuine Redux Nemesis scenario and lets the
 * real phase middleware, real Faux TV and real Social panel render it. It does
 * not replace or mock the player's UI.
 */
export default function NemesisPreviewDebugControls({ onLoaded }: { onLoaded: () => void }) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const reality = useAppSelector((state) => state.social.reality)
  const human = game.players.find((player) => player.isUser)
  const ai = game.players.find(
    (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
  )
  const third = game.players.find(
    (player) =>
      player.id !== human?.id &&
      player.id !== ai?.id &&
      player.status !== 'evicted' &&
      player.status !== 'jury'
  )

  function load(stage: 'clue' | 'reveal') {
    if (!human || !ai || !third || !reality) return

    dispatch(setGameUX({ dramaMode: true, dramaModeAdminOverride: true }))
    dispatch(setDramaSocialMode(true))
    dispatch(setEnergyBankEntry({ playerId: human.id, value: 10 }))

    const draft = createDraft(reality)
    const at = { day: game.week, phase: 'social_1' }
    const pact = createRealityAlliance(draft, {
      id: `qa-nemesis-pact:${human.id}:${ai.id}`,
      kind: 'PACT',
      founderIds: [human.id, ai.id],
      memberIds: [],
      purpose: 'Mutual protection',
      at,
    })
    pact.status = 'ACTIVE'
    const group = createRealityAlliance(draft, {
      id: `qa-nemesis-group:${human.id}:${ai.id}:${third.id}`,
      kind: 'GROUP',
      founderIds: [human.id, ai.id, third.id],
      memberIds: [],
      purpose: 'Protect the group',
      at,
    })
    group.status = 'ACTIVE'

    const conflict =
      stage === 'reveal'
        ? appendRealityEvent(draft, {
            ...at,
            type: 'PROVOCATEUR_CONFLICT_STARTED',
            actorId: ai.id,
            targetIds: [human.id],
            participantIds: [ai.id, human.id],
            witnessIds: [],
            visibility: 'PAIR_ONLY',
            outcome: 'SYSTEM',
            reason: 'season_provocateur_personality_clash',
            tags: ['CONFLICT', 'PROVOCATEUR'],
            relatedFactIds: [],
            relatedPromiseIds: [],
            relatedThreadIds: [],
            publicEligible: false,
            juryEligible: false,
          })
        : null

    createRealityNemesisObjective(draft, {
      ownerId: ai.id,
      targetId: human.id,
      sourceEventId: conflict?.id ?? `qa-nemesis-private:${game.week}:${ai.id}`,
      reason: 'PERSONAL_FRICTION',
      at,
    })

    dispatch(
      commitRealityDomainUpdate({ domain: finishDraft(draft), projectAllRelationships: true })
    )
    // Entering Social triggers the *real* Nemesis story middleware and broadcast.
    dispatch(setPhase('social_2'))
    onLoaded()
  }

  return (
    <div className="dbg-row dbg-row--col" aria-label="Nemesis real UI QA scenarios">
      <h3 className="dbg-section__title">Nemesis UI preview (actual game)</h3>
      <p className="dbg-help">
        Load the game's real Nemesis event, pact, and alliance logic in a temporary campaign. Use
        the live Faux TV and Social screens to inspect the result.
      </p>
      <button
        className="dbg-btn dbg-btn--wide"
        type="button"
        disabled={!human || !ai || !third}
        onClick={() => load('clue')}
      >
        Load Nemesis warning preview
      </button>
      <button
        className="dbg-btn dbg-btn--wide"
        type="button"
        disabled={!human || !ai || !third}
        onClick={() => load('reveal')}
      >
        Load Nemesis reveal preview
      </button>
    </div>
  )
}

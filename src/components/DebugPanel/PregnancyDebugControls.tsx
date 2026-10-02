import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  resetPregnancyStoryForDebug,
  revealPregnancyTest,
  startPregnancyAttempt,
} from '../../store/gameSlice'
import {
  createInitialPregnancyStoryState,
  getPregnancyEligibility,
  startPregnancyAttempt as createPregnancyAttempt,
  type PregnancyAttemptStartInput,
} from '../../social/reality/pregnancy'

function reproductiveRole(sex?: string): 'male' | 'female' | null {
  const normalized = (sex ?? '').trim().toLowerCase()
  if (normalized === 'female' || normalized === 'woman' || normalized.includes('female')) {
    return 'female'
  }
  if (normalized === 'male' || normalized === 'man' || normalized.includes('male')) return 'male'
  return null
}

export default function PregnancyDebugControls() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((state) => state.game)
  const story = game.pregnancyStory ?? createInitialPregnancyStoryState()
  const activePlayers = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury' && (player.age ?? 0) >= 18
  )
  const malePlayers = activePlayers.filter(
    (player) => reproductiveRole(player.sex) === 'male' && !player.isUser
  )
  const femalePlayers = activePlayers.filter(
    (player) => reproductiveRole(player.sex) === 'female' && !player.isUser
  )
  const availableMales = malePlayers.length
    ? malePlayers
    : activePlayers.filter((p) => reproductiveRole(p.sex) === 'male')
  const availableFemales = femalePlayers.length
    ? femalePlayers
    : activePlayers.filter((p) => reproductiveRole(p.sex) === 'female')
  const [maleId, setMaleId] = useState('')
  const [femaleId, setFemaleId] = useState('')
  const [feedback, setFeedback] = useState('')
  const male = availableMales.find((player) => player.id === maleId) ?? availableMales[0]
  const female = availableFemales.find((player) => player.id === femaleId) ?? availableFemales[0]
  const eligibility =
    male && female
      ? getPregnancyEligibility({
          actor: male,
          target: female,
          currentDay: game.week,
          story,
          romanceActive: true,
        })
      : null

  function seedScenario(positive: boolean) {
    if (!male || !female) return

    const attemptNumber = story.attempts.length + 1
    const attemptId = `qa-pregnancy-${game.gameId}-${male.id}-${female.id}-${attemptNumber}`
    let selectedInput: PregnancyAttemptStartInput | null = null
    let selectedAttempt: ReturnType<typeof createPregnancyAttempt>['attempt'] = null

    for (let seed = 1; seed <= 10000; seed += 1) {
      const input: PregnancyAttemptStartInput = {
        actor: male,
        target: female,
        currentDay: game.week,
        story,
        romanceActive: true,
        relationshipScore: 100,
        seed,
        accepted: true,
        attemptId,
        // Debug scenarios remain testable late in a season, while preserving
        // the normal five-day result window from the pregnancy lifecycle.
        finalThreeDay: null,
      }
      const candidate = createPregnancyAttempt(story, input)
      if (candidate.attempt && candidate.attempt.pregnant === positive) {
        selectedInput = input
        selectedAttempt = candidate.attempt
        break
      }
    }

    if (!selectedInput || !selectedAttempt) {
      setFeedback('Could not create this scenario for the selected pair. Try another pair.')
      return
    }

    dispatch(startPregnancyAttempt(selectedInput))
    const resultDay = selectedAttempt.resultAvailableDay ?? game.week
    dispatch(revealPregnancyTest({ attemptId, currentDay: resultDay }))
    setFeedback(
      `${female.name}'s ${positive ? 'positive' : 'negative'} pregnancy test is ready on Day ${resultDay}.`
    )
  }

  function clearScenarios() {
    if (!window.confirm('Clear all pregnancy test scenarios for this season?')) return
    dispatch(resetPregnancyStoryForDebug())
    setFeedback('Pregnancy test scenarios cleared.')
  }

  return (
    <section className="dbg-section" aria-labelledby="dbg-pregnancy-title">
      <h3 className="dbg-section__title" id="dbg-pregnancy-title">
        Pregnancy testing
      </h3>
      <p className="dbg-help">
        Seed a guaranteed test result for an adult pair. QA forces consent and an active romance;
        the normal test-day timing is retained.
      </p>
      <label className="dbg-row dbg-row--col">
        <span className="dbg-label">Other parent</span>
        <select
          className="dbg-select"
          aria-label="Pregnancy scenario other parent"
          value={male?.id ?? ''}
          onChange={(event) => setMaleId(event.target.value)}
          disabled={!availableMales.length}
        >
          {availableMales.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </label>
      <label className="dbg-row dbg-row--col">
        <span className="dbg-label">Pregnancy carrier</span>
        <select
          className="dbg-select"
          aria-label="Pregnancy scenario carrier"
          value={female?.id ?? ''}
          onChange={(event) => setFemaleId(event.target.value)}
          disabled={!availableFemales.length}
        >
          {availableFemales.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </label>
      {eligibility && !eligibility.eligible && <p className="dbg-help">{eligibility.reason}</p>}
      {!male || !female ? (
        <p className="dbg-help">No eligible adult male/female pair is available in the House.</p>
      ) : (
        <div className="dbg-row">
          <button
            className="dbg-btn dbg-btn--wide"
            type="button"
            disabled={!eligibility?.eligible}
            onClick={() => seedScenario(true)}
          >
            Seed positive result
          </button>
          <button
            className="dbg-btn dbg-btn--wide"
            type="button"
            disabled={!eligibility?.eligible}
            onClick={() => seedScenario(false)}
          >
            Seed negative result
          </button>
        </div>
      )}
      {story.attempts.length > 0 && (
        <>
          <ul className="dbg-pregnancy-list" aria-label="Recent pregnancy scenarios">
            {story.attempts
              .slice(-5)
              .reverse()
              .map((attempt) => {
                const carrier = game.players.find((player) => player.id === attempt.carrierId)
                const otherParent = game.players.find(
                  (player) => player.id === attempt.biologicalFatherId
                )
                return (
                  <li key={attempt.attemptId}>
                    <strong>{attempt.status}</strong>
                    <span>
                      {carrier?.name ?? attempt.carrierId} +{' '}
                      {otherParent?.name ?? attempt.biologicalFatherId}
                    </span>
                    <small>
                      Attempt Day {attempt.attemptDay}
                      {attempt.resultRevealedDay != null &&
                        ` · Result Day ${attempt.resultRevealedDay}`}
                    </small>
                  </li>
                )
              })}
          </ul>
          <button className="dbg-btn dbg-btn--danger" type="button" onClick={clearScenarios}>
            Clear pregnancy scenarios
          </button>
        </>
      )}
      {feedback && (
        <p className="dbg-help" role="status">
          {feedback}
        </p>
      )}
    </section>
  )
}

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCreditsContent } from '../../../src/cinematic/credits/creditsContent'
import cwgoReducer, {
  getCwgoQuestion,
  startCwgoCompetition,
  setGuesses,
  revealMassResults,
} from '../../../src/features/cwgo/cwgoCompetitionSlice'
import { CWGO_QUESTIONS, parseCwgoQuestions } from '../../../src/features/cwgo/cwgoQuestions'
import { sanitiseRemoteConfig } from '../../../src/remoteConfig/remoteConfigService'
import { validateAftermathConfig } from '../../../src/screens/GameOver/aftermath'
import { sanitiseWeatherBank, sanitiseWeatherConfig } from '../../../src/weather/weatherRuntime'

const load = (filename: string): unknown => JSON.parse(readFileSync(filename, 'utf8'))

describe('publishable game content', () => {
  it('loads every published document through the actual game parser', () => {
    const live = load('public/config/live-config.json')
    const allowed = sanitiseRemoteConfig(live)
    expect(allowed).not.toBeNull()
    expect(Object.keys(allowed ?? {}).sort()).toEqual(Object.keys(live as object).sort())
    expect(sanitiseWeatherConfig(load('public/config/weather-config.json'))).not.toBeNull()
    expect(sanitiseWeatherBank(load('public/config/weather-bank.json'))).not.toBeNull()
    expect(parseCreditsContent(load('public/config/credits.json'))).not.toBeNull()
    expect(validateAftermathConfig(load('public/config/afterTheEyeOutcomes.json')).errors).toEqual(
      []
    )
    expect(parseCwgoQuestions(load('content/cwgo.json'))).toEqual(CWGO_QUESTIONS)
  })

  it('rejects banks with duplicate questions or an invalid answer range', () => {
    const [first, ...remaining] = CWGO_QUESTIONS
    expect(
      parseCwgoQuestions({ schemaVersion: 1, questions: [first, first, ...remaining] })
    ).toBeNull()
    expect(
      parseCwgoQuestions({
        schemaVersion: 1,
        questions: [{ ...first, min: first.answer + 1 }, ...remaining],
      })
    ).toBeNull()
  })

  it('pins the questions across play and the serializable competition state', () => {
    const questions = CWGO_QUESTIONS.map((question) => ({
      ...question,
      prompt: 'Published question',
      answer: 10,
    }))
    const args = { seed: 24, prizeType: 'LOH' as const, participantIds: ['a', 'b', 'c'] }
    const started = cwgoReducer(
      undefined,
      startCwgoCompetition({ ...args, questionBank: { revision: 'a'.repeat(64), questions } })
    )
    let restored = JSON.parse(JSON.stringify(started)) as typeof started
    expect(getCwgoQuestion(restored)?.prompt).toBe('Published question')
    restored = cwgoReducer(restored, setGuesses({ a: 10, b: 9, c: 16 }))
    restored = cwgoReducer(restored, revealMassResults())
    expect(restored.revealResults[0].playerId).toBe('a')
    expect(restored.questionBank?.revision).toBe('a'.repeat(64))
    expect(getCwgoQuestion(cwgoReducer(undefined, startCwgoCompetition(args)))?.prompt).not.toBe(
      'Published question'
    )
  })
})

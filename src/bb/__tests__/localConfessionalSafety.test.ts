import { describe, expect, it } from 'vitest'
import {
  assessLocalConfessionalInput,
  getConfessionalMisconductResponse,
  isConfessionalMisconductCode,
} from '../localConfessionalSafety'

describe('local Confessional safety', () => {
  it.each([
    'fuck you',
    'FUCK YOU',
    'f.u.c.k you',
    'f u c k you',
    'sh1t',
    'you are a fucking asshole',
  ])('catches profanity without relying on the conversation response: %s', (diaryText) => {
    expect(assessLocalConfessionalInput({ diaryText })?.code).toBe('profanity')
  })

  it('does not flag ordinary words that contain profanity-like letter sequences', () => {
    expect(assessLocalConfessionalInput({ diaryText: 'The class was excellent.' })).toBeNull()
    expect(assessLocalConfessionalInput({ diaryText: 'I am frustrated by this.' })).toBeNull()
    expect(assessLocalConfessionalInput({ diaryText: 'Scunthorpe is a town.' })).toBeNull()
  })

  it('routes threats to the supportive safety response without adding a moderation strike', () => {
    const safety = assessLocalConfessionalInput({ diaryText: 'I will hurt you, damn it.' })
    expect(safety?.code).toBe('threat')
    expect(isConfessionalMisconductCode(safety!.code)).toBe(false)
  })

  it('catches repeated-message spam, keyboard mashing, and prolonged gibberish', () => {
    expect(assessLocalConfessionalInput({ diaryText: 'hello hello hello' })).toBeNull()
    expect(assessLocalConfessionalInput({ diaryText: 'hello hello hello hello hello' })?.code).toBe(
      'flood'
    )
    expect(assessLocalConfessionalInput({ diaryText: 'no no no no no!' })).toBeNull()
    expect(assessLocalConfessionalInput({ diaryText: 'asdfqwerzxcvasdfqwerzxcv' })?.code).toBe(
      'gibberish'
    )
    expect(
      assessLocalConfessionalInput({ diaryText: 'bcdfghjklmnpqrstvwxyzbcdfghjklmnpqrstvwxyz' })
        ?.code
    ).toBe('gibberish')
  })

  it('catches a burst of distinct messages without flagging a slower exchange', () => {
    const now = 50_000
    const history = Array.from({ length: 5 }, (_, index) => ({
      role: 'user' as const,
      text: 'Thought ' + index + ' about the vote.',
      timestamp: now - index * 1500,
    }))

    expect(
      assessLocalConfessionalInput({ diaryText: 'One more thought.', history, now })?.code
    ).toBe('flood')
    expect(
      assessLocalConfessionalInput({
        diaryText: 'A new thought.',
        history: history.slice(0, 4),
        now,
      })
    ).toBeNull()
  })

  it('limits strikes to abuse, spam, flooding, and gibberish', () => {
    expect(isConfessionalMisconductCode('profanity')).toBe(true)
    expect(isConfessionalMisconductCode('too_long')).toBe(true)
    expect(isConfessionalMisconductCode('duplicate')).toBe(true)
    expect(isConfessionalMisconductCode('threat')).toBe(false)
    expect(isConfessionalMisconductCode('prompt_injection')).toBe(false)
  })

  it('escalates through a respectful request, final warning, and removal notice', () => {
    expect(getConfessionalMisconductResponse(1)).toMatch(/keep this room respectful/i)
    expect(getConfessionalMisconductResponse(2)).toMatch(/final warning/i)
    expect(getConfessionalMisconductResponse(3)).toMatch(/cannot return this season/i)
  })
})

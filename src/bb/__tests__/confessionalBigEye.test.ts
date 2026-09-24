import { afterEach, describe, expect, it } from 'vitest'
import {
  createInitialBigEyeState,
  detectIntent,
  getResponse,
  normalizeInput,
  resolveBigEyeTurn,
} from '../confessionalBigEye'
import { setRemoteConfessionalConfig } from '../confessionalRuntimeConfig'

afterEach(() => {
  setRemoteConfessionalConfig(null)
})

describe('confessionalBigEye', () => {
  it('normalizes free text consistently', () => {
    expect(normalizeInput('  Hello, THERE!!!  ')).toBe('hello there')
  })

  it('maps yes/no variations to global intents', () => {
    expect(detectIntent('why not')).toBe('yes')
    expect(detectIntent('not really')).toBe('no')
    expect(detectIntent("I don't think so")).toBe('no')
  })

  it('matches phrase variants to the same intent', () => {
    expect(detectIntent("I'm bored")).toBe('boredom')
    expect(detectIntent('This is boring')).toBe('boredom')
    expect(detectIntent('I wanna leave')).toBe('self_eviction')
  })

  it('supports the hidden easter egg phrases', () => {
    expect(detectIntent('are you real')).toBe('realness')
    expect(detectIntent('who will win')).toBe('winner_prediction')
    expect(detectIntent('help me')).toBe('help_request')
    expect(detectIntent('I love you')).toBe('love_confession')
    expect(detectIntent('Who is going to win?')).toBe('winner_prediction')
    expect(detectIntent('Who do you think will win?')).toBe('winner_prediction')
  })

  it('recognizes ordinary conversation and emotional language', () => {
    expect(detectIntent('How are you?')).toBe('wellbeing_question')
    expect(detectIntent('I just asked how you were...')).toBe('wellbeing_question')
    expect(detectIntent('I feel overwhelmed...')).toBe('overwhelmed')
    expect(detectIntent('You keep repeating the same answer')).toBe('repetition_complaint')
    expect(detectIntent('ummm okk...')).toBe('hesitation')
    expect(detectIntent('What do you think about my game?')).toBe('curiosity')
    expect(detectIntent('I feel lonely in here')).toBe('sadness')
    expect(detectIntent('I am really excited')).toBe('positive_emotion')
    expect(detectIntent('I am really worried')).toBe('fear')
    expect(detectIntent('Can you help me')).toBe('help_request')
    expect(detectIntent('Who are you?')).toBe('realness')
    expect(detectIntent('Any hints?')).toBe('advice_request')
    expect(detectIntent('Advice please')).toBe('advice_request')
  })

  it('handles repeated greeting spam as a special case', () => {
    const reply = resolveBigEyeTurn(
      'hello hello hello',
      { random: () => 0.4 },
      createInitialBigEyeState()
    )
    expect(reply.intent).toBe('greeting_repeat')
    expect(reply.text).toBe('I heard you the first time.')
  })

  it('falls back to mystical responses for unknown intent', () => {
    const reply = resolveBigEyeTurn(
      'the moon tastes purple',
      { random: () => 0.4 },
      createInitialBigEyeState()
    )
    expect(reply.intent).toBe('unknown')
    expect(reply.text.length).toBeGreaterThan(0)
  })

  it('stores offer_game state after boredom and launches tic tac toe on yes', () => {
    const first = resolveBigEyeTurn('I am bored', { random: () => 0.4 }, createInitialBigEyeState())
    expect(first.nextState.lastQuestion).toBe('offer_game')

    const second = getResponse('yes', { random: () => 0.4 }, first.nextState)
    expect(second.action).toBe('launch_tic_tac_toe')
    expect(second.nextState.lastQuestion).toBeNull()
  })

  it('returns the specific boredom rejection line when the player says no', () => {
    const first = resolveBigEyeTurn(
      'nothing to do',
      { random: () => 0.4 },
      createInitialBigEyeState()
    )
    const second = getResponse('no', { random: () => 0.1 }, first.nextState)

    expect(second.text).toBe('Then sit with it. Discomfort reveals truth.')
    expect(second.nextState.lastQuestion).toBeNull()
  })

  it('uses the normalized user input when seeding deterministic replies', () => {
    const state = createInitialBigEyeState()
    const first = resolveBigEyeTurn('I am bored', { seed: 7 }, state)
    const second = resolveBigEyeTurn('This is boring', { seed: 7 }, state)

    expect({ text: first.text, delayMs: first.delayMs }).not.toEqual({
      text: second.text,
      delayMs: second.delayMs,
    })
  })

  it('uses remotely published authored response pools when present', () => {
    setRemoteConfessionalConfig({
      responses: { intents: { greeting: ['Remote hello.'] } },
    })

    const reply = resolveBigEyeTurn('hello', { random: () => 0.4 }, createInitialBigEyeState())

    expect(reply.text).toBe('Remote hello.')
  })

  it('does not let a cold moment leak indefinitely into unrelated turns', () => {
    const cold = resolveBigEyeTurn(
      'you are stupid',
      { random: () => 0.4 },
      createInitialBigEyeState()
    )
    expect(cold.nextState.mood).toBe('cold')

    const reset = resolveBigEyeTurn('thank you', { random: () => 0.4 }, cold.nextState)
    expect(reset.nextState.mood).toBe('neutral')
  })

  it('does not confuse ordinary eviction language with self-eviction', () => {
    expect(detectIntent('Who got evicted today?')).not.toBe('self_eviction')
    expect(detectIntent('Who do you think is going to leave?')).not.toBe('self_eviction')
    expect(detectIntent('I want Nico evicted')).not.toBe('self_eviction')
    expect(detectIntent('Why did Maya leave?')).not.toBe('self_eviction')
  })

  it('requires explicit first-person language for self-eviction', () => {
    expect(detectIntent('I want to leave')).toBe('self_eviction')
    expect(detectIntent('I quit the game')).toBe('self_eviction')
    expect(detectIntent('I want out')).toBe('self_eviction')
  })

  it('does not flatten elaborated disagreement into a bare no', () => {
    expect(detectIntent('No, they are out to get me')).not.toBe('no')
    expect(detectIntent('Yeah, you are right')).not.toBe('yes')
  })

  it('accepts an incomplete negation only when a formal authored question is pending', () => {
    const state = createInitialBigEyeState()
    state.lastQuestion = 'confirm_self_eviction'

    const reply = resolveBigEyeTurn("I don't", { random: () => 0.4 }, state)
    expect(reply.intent).toBe('no')
    expect(reply.nextState.lastQuestion).toBeNull()
  })
})

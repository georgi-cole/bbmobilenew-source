import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFixtureInitialGameState } from './fixture-state.mjs'

test('sets the roster draw and simulation seed, then restores randomness before gameplay', () => {
  const original = Math.random
  const state = createFixtureInitialGameState(({ seed }) => ({
    seed,
    rosterSeed: Math.floor(Math.random() * 0x1_0000_0000),
  }))
  assert.deepEqual(state, { seed: 730, rosterSeed: 730 })
  assert.equal(Math.random, original)
})

test('restores randomness when constructor preparation fails', () => {
  const original = Math.random
  assert.throws(
    () =>
      createFixtureInitialGameState(() => {
        throw new Error('fixture failure')
      }),
    /fixture failure/
  )
  assert.equal(Math.random, original)
})

test('rejects invalid fixture seeds before invoking the constructor', () => {
  const original = Math.random
  for (const seed of [-1, NaN, 0x1_0000_0000]) {
    assert.throws(
      () =>
        createFixtureInitialGameState(() => {
          assert.fail('invalid constructor call')
        }, seed),
      /unsigned 32-bit/
    )
    assert.equal(Math.random, original)
  }
})

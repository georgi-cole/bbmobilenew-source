/** Fix only the synchronous constructor's roster draw; restore normal randomness before gameplay. */
export function createFixtureInitialGameState(createState, seed = 730) {
  if (!Number.isInteger(seed) || seed < 0 || seed >= 0x1_0000_0000) {
    throw new Error('The fixture roster seed must be an unsigned 32-bit integer')
  }
  const originalRandom = Math.random
  try {
    Math.random = () => seed / 0x1_0000_0000
    return createState({ seed })
  } finally {
    Math.random = originalRandom
  }
}

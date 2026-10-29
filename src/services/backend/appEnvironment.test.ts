import { describe, expect, it } from 'vitest'
import { resolveAppEnvironment } from './appEnvironment'

describe('resolveAppEnvironment', () => {
  it.each([
    ['qa', false, undefined, 'qa'],
    ['production', false, undefined, 'production'],
    [undefined, true, undefined, 'development'],
    [undefined, false, 'admin', 'qa'],
    [undefined, false, undefined, 'production'],
  ])('labels %s / dev=%s / target=%s as %s', (configured, isDev, target, expected) => {
    expect(resolveAppEnvironment(configured, isDev, target)).toBe(expected)
  })
})

import { describe, expect, it } from 'vitest'
import { DECISION_IDS, getDecisionTiming, type DepartureScene } from './approved/decision-exit.js'
import { sceneResources } from './renderer.js'
import catalog from './cast.json'

const [a, b, c] = catalog.characters.map((actor) => ({ ...actor, playerId: actor.id }))

describe('shared departure closing ident', () => {
  it.each<DepartureScene | 'cupidExit'>([...DECISION_IDS, 'cupidExit'])(
    'prepares and budgets one Eye close for %s',
    (scene) => {
      const base = scene === 'cupidExit' ? 'exit' : scene
      const standard = getDecisionTiming(base)
      const branded = getDecisionTiming(base, { closingBrand: true })
      expect(branded.closingBrand).toBe(true)
      expect(branded.handoffAt - standard.handoffAt).toBe(3400)
      const resources = sceneResources(scene, { a, b, c }, 'generic', { closingBrand: true })
      expect(resources.cinema_closingEye.src).toContain('final-decision/token.webp')
      expect(sceneResources(scene, { a, b, c })).not.toHaveProperty('cinema_closingEye')
    }
  )
})

import { describe, expect, it } from 'vitest'
import type { TvEvent } from '../../../types'
import { findConfessionalSourceBroadcast } from '../confessionalBroadcastReceipt'

function event(id: string, text: string, timestamp: number, meta: TvEvent['meta'] = {}): TvEvent {
  return { id, text, type: 'game', timestamp, meta }
}

describe('findConfessionalSourceBroadcast', () => {
  it('prefers the exact Halo template over unrelated Safety copy', () => {
    const source = findConfessionalSourceBroadcast(
      [
        event('unrelated', 'Will you use the Power of Safety?', 20, { week: 4 }),
        event('halo', 'Localized copy can change', 10, {
          week: 4,
          broadcastTemplateId: 'safety.halo-prompt',
        }),
      ],
      'pos_decision',
      4
    )

    expect(source?.id).toBe('halo')
  })

  it('does not consume a Halo prompt for mission immunity just because both return to Safety', () => {
    const source = findConfessionalSourceBroadcast(
      [
        event('halo', 'You, will you use Halo Exchange?', 10, {
          week: 4,
          broadcastTemplateId: 'safety.halo-prompt',
        }),
      ],
      'mission_immunity_offer',
      4
    )

    expect(source).toBeNull()
  })

  it('supports legacy unstructured Halo prompts without using copy over structured metadata', () => {
    const source = findConfessionalSourceBroadcast(
      [
        event('legacy', 'You, will you use Halo Exchange? 😇', 12, { week: 4 }),
        event('wrong-week', 'You, will you use Halo Exchange? 😇', 30, { week: 3 }),
      ],
      'pos_decision',
      4
    )

    expect(source?.id).toBe('legacy')
  })
})

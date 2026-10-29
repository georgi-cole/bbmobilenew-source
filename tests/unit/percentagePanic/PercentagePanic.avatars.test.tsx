import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PercentagePanic from '../../../src/components/PercentagePanic/PercentagePanic'

describe('Percentage Panic contestant portraits', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves season portraits for AI placeholders while preserving a human emoji avatar', async () => {
    const backdropImages: Array<{ onload: (() => void) | null }> = []
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        complete = false
        naturalWidth = 0
        set src(_value: string) {
          backdropImages.push(this)
        }
      }
    )

    const view = render(
      <PercentagePanic
        participantIds={['user', 'finn']}
        participants={[
          { id: 'user', name: 'You', isHuman: true, avatar: '🙋' },
          { id: 'finn', name: 'Finn', isHuman: false, avatar: '🧑' },
        ]}
        seed={42}
      />
    )

    expect(backdropImages).toHaveLength(2)
    await act(async () => {
      backdropImages.forEach((image) => image.onload?.())
    })

    const portraits = view.container.querySelectorAll('.pp-avatar')
    expect(portraits).toHaveLength(2)
    expect(portraits[0]).toHaveTextContent('🙋')
    expect(portraits[0].querySelector('img')).toBeNull()
    expect(portraits[1].querySelector('img')?.getAttribute('src')).toContain(
      'assets/skins/backup-grey-lux/Finn_avatar.webp'
    )
    expect(portraits[1].querySelector('img')?.getAttribute('src')).not.toContain('api.dicebear.com')
  })
})

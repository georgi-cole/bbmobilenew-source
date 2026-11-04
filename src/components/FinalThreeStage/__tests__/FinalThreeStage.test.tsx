import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { createInitialGameState } from '../../../store/gameSlice'
import FinalThreeStage from '../FinalThreeStage'
import { FINAL_THREE_SET_ASSETS } from '../finalThreeSetAssets'
import FinalPowerBattleIntro from '../../FinalPowerBattle/FinalPowerBattleIntro'
import FinalThreeBlockReveal from '../../FinalPowerBattle/FinalThreeBlockReveal'
import FinalPowerHolderReveal from '../../FinalPowerBattle/FinalPowerHolderReveal'

afterEach(cleanup)

const cast = createInitialGameState({ seed: 400 }).players.slice(0, 3)

describe('unified Final Three garden', () => {
  it('uses the existing marble podium raster in every finale handoff', () => {
    const { container } = render(
      <>
        <FinalPowerBattleIntro finalists={cast} mode="classic" />
        <FinalThreeBlockReveal blockPlayer={cast[0]} competitors={cast.slice(1)} mode="classic" />
        <FinalPowerHolderReveal player={cast[0]} mode="classic" continueCopy="Press Play." />
      </>
    )
    const podiums = container.querySelectorAll(
      '.fpb-intro__podium, .fpb-block__podium, .fp-holder-reveal__podium'
    )
    expect(podiums).toHaveLength(6)
    podiums.forEach((podium) => {
      expect(podium.tagName).toBe('IMG')
      expect(podium).toHaveAttribute('src', FINAL_THREE_SET_ASSETS.podium)
    })
  })
  it.each(['opening', 'block', 'holder', 'final-two', 'champion'] as const)(
    'uses the exact shared architecture and live monitor for %s',
    (scene) => {
      const { container } = render(
        <FinalThreeStage scene={scene}>
          <h2>Scene-specific broadcast</h2>
        </FinalThreeStage>
      )
      const venue = container.querySelector('[data-finale-set="garden"]')
      expect(venue).toHaveAttribute('data-scene', scene)
      expect(venue?.querySelector('.f3-venue__background')?.getAttribute('style')).toContain(
        FINAL_THREE_SET_ASSETS.background
      )
      expect(venue?.querySelector<HTMLImageElement>('.f3-venue__eye img')?.src).toContain(
        'final-decision/token.webp'
      )
      expect(venue?.querySelector<HTMLImageElement>('.f3-venue__monitor-frame')?.src).toContain(
        'final-decision/monitor.webp'
      )
      expect(venue?.querySelector('.f3-venue__mist')?.getAttribute('style')).toContain(
        'natural-mist-v2.webp'
      )
      expect(
        venue
          ?.querySelector('.f3-venue__screen')
          ?.contains(screen.getByRole('heading', { name: 'Scene-specific broadcast' }))
      ).toBe(true)
      expect(venue?.querySelectorAll('.f3-venue__eye')).toHaveLength(1)
    }
  )

  it('carries the same decoration between opening, block and holder without new game controls', () => {
    const intro = render(<FinalPowerBattleIntro finalists={cast} mode="classic" />)
    expect(intro.container.querySelectorAll('.f3-venue__eye')).toHaveLength(1)
    expect(intro.container.querySelectorAll('.fpb-intro__podium')).toHaveLength(3)
    expect(intro.container.querySelector('.f3-venue__screen')?.textContent).toContain('final power')
    intro.unmount()

    const block = render(
      <FinalThreeBlockReveal blockPlayer={cast[0]} competitors={cast.slice(1)} mode="classic" />
    )
    expect(block.container.querySelectorAll('.fpb-block__podium')).toHaveLength(2)
    expect(block.container.querySelector('.f3-venue__screen')?.textContent).toContain(cast[0].name)
    expect(block.container.querySelectorAll('.f3-venue__eye')).toHaveLength(1)
    block.unmount()

    const holder = render(
      <FinalPowerHolderReveal player={cast[0]} mode="classic" continueCopy="Press Play." />
    )
    expect(holder.container.querySelectorAll('.fp-holder-reveal__podium')).toHaveLength(1)
    expect(holder.container.querySelector('.f3-venue__screen')?.textContent).toContain(cast[0].name)
    expect(holder.container.querySelectorAll('.f3-venue__eye')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /begin ceremony/i })).toBeNull()
  })

  it('retains Classic final power versus Vox immunity semantics on the same stage', () => {
    const classic = render(
      <FinalPowerHolderReveal player={cast[0]} mode="classic" continueCopy="Press Play." />
    )
    expect(screen.getByText('FINAL POWER HOLDER')).toBeTruthy()
    expect(screen.getByText(/power to decide the Final Two/i)).toBeTruthy()
    classic.unmount()
    render(<FinalPowerHolderReveal player={cast[0]} mode="vox_populi" continueCopy="Press Play." />)
    expect(screen.getByText('FINAL IMMUNITY')).toBeTruthy()
    expect(screen.getByText(/audience will now decide/i)).toBeTruthy()
  })
})

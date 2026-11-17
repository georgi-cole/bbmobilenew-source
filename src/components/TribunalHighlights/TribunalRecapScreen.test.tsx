import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { useEffect } from 'react'
import { store } from '../../store/store'
import { createTribunalScenario } from '../../experiments/tribunalHighlights/fixtures'
import { buildTribunalHighlight } from '../../features/tribunal/tribunalHighlights'
import { buildTribunalRecapShots } from '../../features/tribunal/tribunalRecapShots'
import TribunalRecapScreen from './TribunalRecapScreen'

vi.mock('./TribunalCeremonyExcerpt', () => ({
  TRIBUNAL_EXCERPT_MS: 3000,
  TRIBUNAL_POWERS_MS: 4000,
  default: function Excerpt({ onReady }: { onReady: (available: boolean) => void }) {
    useEffect(() => onReady(true), [onReady])
    return null
  },
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('Tribunal recap broadcast', () => {
  it.each(['Sol', 'Bea'])(
    'uses the visible %s cutout instead of the silhouette formal asset',
    (name) => {
      const game = createTribunalScenario('finalists')
      const finalist =
        game.players.find((player) => player.status === 'active' && player.name === name) ??
        game.players.find((player) => player.status === 'active')!
      Object.assign(finalist, {
        id: name.toLowerCase(),
        name,
        avatar: `assets/skins/${name}_avatar.webp`,
      })
      render(
        <Provider store={store}>
          <TribunalRecapScreen game={game} voteReady />
        </Provider>
      )
      expect(screen.getByRole('img', { name })).toHaveAttribute(
        'src',
        expect.stringContaining(`${name}_informal`)
      )
    }
  )
  it('cycles one compact finalist record at a time without replacing the stage', () => {
    vi.useFakeTimers()
    const game = createTribunalScenario('finalists')
    const { container } = render(
      <Provider store={store}>
        <TribunalRecapScreen game={game} voteReady />
      </Provider>
    )
    const frame = screen.getByTestId('tribunal-broadcast-frame')
    expect(container.querySelector('.tribunal-recap__record-moment')).toHaveTextContent('LOH win')
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(
      [...container.querySelectorAll('.tribunal-recap__record-moment')].some((entry) =>
        entry.textContent?.includes('Safety win')
      )
    ).toBe(true)
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(
      [...container.querySelectorAll('.tribunal-recap__record-moment')].some((entry) =>
        entry.textContent?.includes('nomination')
      )
    ).toBe(true)
    expect(screen.getByTestId('tribunal-broadcast-frame')).toBe(frame)
  })
  it('shows each finalist’s actual records as broadcast graphics rather than a table', () => {
    const game = createTribunalScenario('finalists')
    render(
      <Provider store={store}>
        <TribunalRecapScreen game={game} voteReady />
      </Provider>
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    for (const player of game.players.filter((entry) => entry.status === 'active')) {
      const record = screen.getByRole('group', { name: `${player.name}'s season record` })
      expect(
        within(record).getByLabelText(`${player.stats?.lohWins ?? 0} loh wins`)
      ).toBeInTheDocument()
      expect(
        within(record).getByLabelText(`${player.stats?.posWins ?? 0} pos wins`)
      ).toBeInTheDocument()
      expect(
        within(record).getByLabelText(`${player.stats?.timesNominated ?? 0} nominations`)
      ).toBeInTheDocument()
    }
  })
  it('keeps the same screen frame when arrivals become elimination results and then finalists', () => {
    const game = createTribunalScenario('double')
    const highlight = buildTribunalHighlight(game, [game.pendingEviction!.evicteeId])
    const view = (voteReady: boolean, showResult: boolean) => (
      <Provider store={store}>
        <TribunalRecapScreen
          game={game}
          highlight={showResult ? highlight : undefined}
          voteReady={voteReady}
        />
      </Provider>
    )
    const { rerender } = render(view(false, false))
    const frame = screen.getByTestId('tribunal-broadcast-frame')
    rerender(view(false, true))
    expect(screen.getByTestId('tribunal-broadcast-frame')).toBe(frame)
    expect(screen.getByLabelText('Eliminated')).toBeInTheDocument()
    expect(screen.getAllByTestId('tribunal-eliminated-avatar')).toHaveLength(
      highlight.evicteeIds.length
    )
    expect(frame.querySelector('.tribunal-highlights__cutout')).toBeNull()
    rerender(view(true, true))
    expect(screen.getByTestId('tribunal-broadcast-frame')).toBe(frame)
  })

  it('builds the collage only from recorded powers, nominees, and departures', () => {
    const game = createTribunalScenario('double')
    const highlight = buildTribunalHighlight(game, [game.pendingEviction!.evicteeId])
    const shots = buildTribunalRecapShots(highlight)
    expect(shots.map((shot) => shot.kind)).toEqual(['powers', 'block', 'exit'])
    expect(shots[0].playerIds).toEqual([highlight.lohId, highlight.posWinnerId])
    expect(shots.at(-1)?.playerIds).toEqual(highlight.evicteeIds)
    highlight.posWinnerId = highlight.lohId
    expect(buildTribunalRecapShots(highlight)[0].playerIds).toEqual([highlight.lohId])
    highlight.kind = 'shock'
    expect(buildTribunalRecapShots(highlight).map((shot) => shot.kind)).toEqual(['exit'])
  })

  it('uses the existing elimination artwork and never substitutes the boxed text stamp', () => {
    const game = createTribunalScenario('double')
    const highlight = buildTribunalHighlight(game, [game.pendingEviction!.evicteeId])
    render(
      <Provider store={store}>
        <TribunalRecapScreen game={game} highlight={highlight} voteReady={false} />
      </Provider>
    )
    const stamp = screen.getByLabelText('Eliminated')
    const artwork = stamp.querySelector('img')!
    expect(artwork).toHaveAttribute('src', expect.stringContaining('assets/eliminated_stamp.png'))
    expect(stamp.querySelector('span')).toBeNull()
    fireEvent.error(artwork)
    expect(screen.queryByLabelText('Eliminated')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('tribunal-eliminated-avatar')).not.toHaveLength(0)
  })

  it('plays the short cinematic to its actual result and allows replay', () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', '/?recapStyle=cinematic')
    const game = createTribunalScenario('double')
    const highlight = buildTribunalHighlight(game, [game.pendingEviction!.evicteeId])
    const before = store.getState().game
    render(
      <Provider store={store}>
        <TribunalRecapScreen game={game} highlight={highlight} voteReady={false} />
      </Provider>
    )
    expect(screen.getByTestId('tribunal-power-holders')).toBeInTheDocument()
    expect(screen.getByText('LOH')).toBeInTheDocument()
    expect(screen.getByText('POWER OF SAFETY')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByLabelText('Recap moment 2 of 3')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByRole('button', { name: 'Replay recap' })).toBeInTheDocument()
    expect(screen.getByLabelText('Eliminated')).toBeInTheDocument()
    expect(store.getState().game).toBe(before)
  })
})

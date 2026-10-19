/**
 * Tests for the RecentActivity component.
 *
 * Covers:
 *  1. Shows "No recent actions." when sessionLogs is empty.
 *  2. Shows "No recent actions." after clearing when logs exist.
 *  3. Renders an entry with action title for a known action id.
 *  4. Renders an entry with the target player's name when players prop is provided.
 *  5. Renders ✓ icon for positive delta.
 *  6. Renders ✗ icon for negative delta.
 *  7. Renders – icon for zero delta.
 *  8. Renders delta value when non-zero.
 *  9. Does not render delta when delta is 0.
 * 10. "Clear" button is absent when there are no visible entries.
 * 11. "Clear" button is present when there are visible entries.
 * 12. Clicking "Clear" hides existing entries.
 * 13. maxEntries limits the displayed entries.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import socialReducer, { recordSocialAction } from '../../../social/socialSlice'
import gameReducer from '../../../store/gameSlice'
import RecentActivity from '../RecentActivity'
import type { SocialActionLogEntry } from '../../../social/types'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(entries: SocialActionLogEntry[] = []) {
  const store = configureStore({ reducer: { game: gameReducer, social: socialReducer } })
  for (const entry of entries) {
    store.dispatch(recordSocialAction({ entry }))
  }
  return store
}

function renderActivity(
  store: ReturnType<typeof makeStore>,
  props: Partial<React.ComponentProps<typeof RecentActivity>> = {}
) {
  return render(
    <Provider store={store}>
      <RecentActivity {...props} />
    </Provider>
  )
}

function makeEntry(overrides: Partial<SocialActionLogEntry> = {}): SocialActionLogEntry {
  return {
    actionId: 'compliment',
    actorId: 'p0',
    targetId: 'p1',
    cost: 1,
    delta: 2,
    outcome: 'success',
    newEnergy: 4,
    timestamp: Date.now(),
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RecentActivity – empty state', () => {
  it('shows empty message when no logs exist', () => {
    const store = makeStore()
    renderActivity(store)
    expect(screen.getByText('No recent actions.')).toBeDefined()
  })

  it('does not show Clear button when no entries are visible', () => {
    const store = makeStore()
    renderActivity(store)
    expect(screen.queryByRole('button', { name: 'Clear recent activity' })).toBeNull()
  })
})

describe('RecentActivity – entry rendering', () => {
  it('renders a vague LOH receipt using the phase and disclosure saved with that conversation', () => {
    const store = makeStore([
      makeEntry({
        actionId: 'ask_loh_target',
        phase: 'nominations',
        context: { lohDisclosureOutcome: 'vague' },
        subjectId: 'secret-target',
      }),
    ])
    renderActivity(store, { players: [{ id: 'p1', name: 'Dex', avatar: '😀', status: 'active' }] })
    expect(screen.getByText('Dex kept the opening nomination plan vague.')).toBeDefined()
    expect(screen.queryByText(/secret-target/)).toBeNull()
    expect(screen.queryByText(/replacement/)).toBeNull()
  })
  it('renders known action title for a recognised action id', () => {
    const store = makeStore([makeEntry({ actionId: 'compliment' })])
    renderActivity(store)
    // 'Compliment' appears within the narrative text
    expect(screen.getByText(/Compliment/)).toBeDefined()
  })

  it('renders target player name when players prop is provided', () => {
    const store = makeStore([makeEntry({ targetId: 'p1' })])
    const players = [{ id: 'p1', name: 'Alice', avatar: '😀', status: 'active' as const }]
    renderActivity(store, { players })
    expect(screen.getByText(/Alice/)).toBeDefined()
  })

  it('falls back to target id when player not found', () => {
    const store = makeStore([makeEntry({ targetId: 'unknown-id' })])
    renderActivity(store)
    expect(screen.getByText(/unknown-id/)).toBeDefined()
  })

  it('shows alliance admission decisions recorded as system updates', () => {
    const store = makeStore([
      makeEntry({
        actionId: 'alliance_admit_result',
        source: 'system',
        delta: 0,
        narrative: 'The Shield approved inviting Lia. The invitation is now with Lia.',
      }),
    ])
    renderActivity(store)
    expect(
      screen.getByText('The Shield approved inviting Lia. The invitation is now with Lia.')
    ).toBeDefined()
  })

  it('renders ✓ icon for positive delta', () => {
    const store = makeStore([makeEntry({ delta: 2 })])
    renderActivity(store)
    expect(screen.getByText('✓')).toBeDefined()
  })

  it('keeps a success icon when a successful action damages the relationship', () => {
    const store = makeStore([makeEntry({ delta: -1 })])
    renderActivity(store)
    expect(screen.getByText('✓')).toBeDefined()
    expect(screen.queryByText('Relationship change -1')).toBeNull()
  })

  it('keeps a success icon when a successful action has a neutral relationship result', () => {
    const store = makeStore([makeEntry({ delta: 0 })])
    renderActivity(store)
    expect(screen.getByText('✓')).toBeDefined()
  })

  it('keeps relationship and resource mechanics out of player-facing receipts', () => {
    const store = makeStore([
      makeEntry({
        delta: 3,
        costs: { energy: 1, influence: 2, info: 3 },
        yieldsApplied: { influence: 4, info: 5 },
      }),
    ])
    renderActivity(store)
    expect(screen.queryByText(/Relationship change/)).toBeNull()
    expect(screen.queryByText(/spent|Influence|Intel/)).toBeNull()
  })

  it('does not render a delta element when delta is 0', () => {
    const store = makeStore([makeEntry({ delta: 0 })])
    renderActivity(store)
    expect(screen.queryByText(/^\+0$/)).toBeNull()
  })
})

describe('RecentActivity – Clear button', () => {
  it('shows Clear button when entries are visible', () => {
    const store = makeStore([makeEntry()])
    renderActivity(store)
    expect(screen.getByRole('button', { name: 'Clear recent activity' })).toBeDefined()
  })

  it('clicking Clear hides existing entries', () => {
    const store = makeStore([makeEntry({ actionId: 'compliment' })])
    renderActivity(store)
    expect(screen.getByText(/Compliment/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Clear recent activity' }))
    expect(screen.getByText('No recent actions.')).toBeDefined()
  })
})

describe('RecentActivity – maxEntries', () => {
  it('limits displayed entries to maxEntries', () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ actionId: 'compliment', timestamp: Date.now() + i })
    )
    const store = makeStore(entries)
    renderActivity(store, { maxEntries: 3 })
    // Should show exactly 3 list items
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
  })
})

describe('RecentActivity – unified receipts', () => {
  it('groups a batch into one receipt with its full price and each recipient’s change', () => {
    const receipt = {
      groupId: 'one-move',
      summary: 'Reached 2 hubmates.',
      outcomeLabel: 'Completed',
      tone: 'positive' as const,
    }
    renderActivity(
      makeStore([
        makeEntry({ id: 'first', targetId: 'p1', cost: 2, delta: 2, receipt }),
        makeEntry({ id: 'second', targetId: 'p2', cost: 0, delta: -1, receipt }),
      ]),
      {
        compact: true,
        players: [
          { id: 'p1', name: 'Dex', avatar: '', status: 'active' },
          { id: 'p2', name: 'Lux', avatar: '', status: 'active' },
        ],
      }
    )
    expect(screen.getAllByText('Reached 2 hubmates.')).toHaveLength(1)
    expect(screen.queryByText('⚡2 spent')).toBeNull()
    expect(screen.queryByText(/Relationship changes:/)).toBeNull()
  })
  it('shows the full final response and actual spending instead of the shorter log narrative', () => {
    const summary =
      'The block is locked. Dex is my main target; Sol is on the block as the replacement.'
    renderActivity(
      makeStore([
        makeEntry({
          narrative: 'Rune told you Dex is the current target.',
          receipt: { summary, outcomeLabel: 'Completed', tone: 'positive' },
          costs: { energy: 1, influence: 0, info: 0 },
        }),
      ]),
      { compact: true }
    )
    expect(screen.getByText(summary)).toBeVisible()
    expect(screen.queryByText('Rune told you Dex is the current target.')).toBeNull()
    expect(screen.queryByText('⚡1 spent')).toBeNull()
    expect(screen.queryByRole('button', { name: /full response/i })).toBeNull()
  })

  it('labels a declined paid proposal as declined even though submission succeeded', () => {
    renderActivity(
      makeStore([
        makeEntry({
          outcome: 'success',
          receipt: {
            summary: 'I do not see enough protection in this pact to commit.',
            outcomeLabel: 'Declined',
            tone: 'negative',
          },
          costs: { energy: 2, influence: 0, info: 0 },
        }),
      ]),
      { compact: true }
    )
    expect(screen.getByLabelText('Declined')).toHaveTextContent('✗')
    expect(screen.queryByText('✓')).toBeNull()
    expect(screen.queryByText('⚡2 spent')).toBeNull()
  })

  it('keeps earlier LOH answers and full effects available in History', () => {
    const now = Date.now()
    renderActivity(
      makeStore([
        makeEntry({
          actionId: 'ask_loh_target',
          timestamp: now - 1000,
          narrative: 'Rune kept the opening nomination plan vague.',
        }),
        makeEntry({
          actionId: 'ask_loh_target',
          timestamp: now,
          narrative: 'Dex is my target, with Sol as the replacement.',
          delta: 3,
          yieldsApplied: { info: 2 },
        }),
      ]),
      { compact: true }
    )
    expect(screen.queryByText('Rune kept the opening nomination plan vague.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'History · 2' }))
    expect(screen.getByText('Rune kept the opening nomination plan vague.')).toBeVisible()
    expect(screen.getByText('Dex is my target, with Sol as the replacement.')).toBeVisible()
    expect(screen.queryByText('Relationship change +3')).toBeNull()
    expect(screen.queryByText('Intel +2')).toBeNull()
    expect(screen.getByLabelText('Recent Activity')).toHaveClass('ra-container--expanded')
  })

  it('uses the authored action story when the final receipt is generic', () => {
    const store = makeStore([
      makeEntry({
        id: 'compliment-receipt',
        outcome: 'success',
        receipt: {
          summary: 'Compliment landed exactly as intended. Relationship +2.',
          outcomeLabel: 'Completed',
          tone: 'positive',
        },
      }),
    ])
    renderActivity(store, {
      compact: true,
      players: [{ id: 'p1', name: 'Lia', avatar: '', status: 'active' }],
    })
    expect(screen.getByText(/^You .+Lia/)).toBeVisible()
    expect(screen.queryByText(/landed exactly as intended|Relationship \+2/)).toBeNull()
  })

  it('places Execute below the receipt instead of beside the Hub wire heading', () => {
    const store = makeStore([makeEntry({ narrative: 'The conversation warmed.' })])
    renderActivity(store, {
      compact: true,
      actionControl: <button type="button">Execute</button>,
    })
    const execute = screen.getByRole('button', { name: 'Execute' })
    expect(execute.closest('.ra-header')).toBeNull()
    expect(execute.closest('.ra-action-control')).not.toBeNull()
  })

  it('shows unlogged feedback in the same panel and preserves the previous result in History', () => {
    renderActivity(makeStore([makeEntry({ narrative: 'Your pact is live.' })]), {
      compact: true,
      feedback: 'That move was interrupted. Nothing was spent.',
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'That move was interrupted. Nothing was spent.'
    )
    expect(screen.queryByText('Your pact is live.')).toBeNull()
    // A single stored result still needs a route back when feedback overlays it.
    expect(
      within(screen.getByLabelText('Recent Activity')).getByRole('button', { name: 'History · 1' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'History · 1' }))
    expect(screen.getByText('Your pact is live.')).toBeVisible()
  })
})

describe('RecentActivity – auto-scroll', () => {
  it('the activity list element exists and is the scrollable container', () => {
    const store = makeStore([makeEntry()])
    renderActivity(store)
    // The list should be present and be the element that receives scroll
    const list = screen.getByRole('list', { name: 'Recent actions' })
    expect(list).toBeDefined()
  })

  it('uses the content wrapper as the scrollable container', () => {
    const store = makeStore([makeEntry()])
    renderActivity(store)
    const list = screen.getByRole('list', { name: 'Recent actions' })
    expect(list.parentElement).toHaveClass('ra-content')
  })
})

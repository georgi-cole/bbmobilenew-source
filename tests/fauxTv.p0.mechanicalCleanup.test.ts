import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  addTvEvent,
  replaceBroadcastConfig,
  setBroadcastOverride,
} from '../src/store/gameSlice'
import { isVisibleInMainLog, isVisibleOnTv } from '../src/services/activityService'
import type { BroadcastOverride } from '../src/types'

const CASES = [
  [
    'loh.competition-start',
    'loh_comp',
    'The Leader of the House competition has begun! 🏆 Who will win power today?',
  ],
  ['pos.competition-start', 'pos_comp', 'The Power of Safety competition is underway! 🎭'],
  ['nominations.preparing', 'nominations', 'Alex is preparing the nomination ceremony. 🎯'],
  ['safety.holder', 'pos_ceremony', 'Alex is holding the Safety Ceremony. ⚡'],
  ['safety.replacement-selecting', 'pos_ceremony_results', 'Alex is selecting a backup nominee...'],
] as const

describe('Faux TV P0 mechanical cleanup', () => {
  for (const [templateId, phase, text] of CASES) {
    it(`${templateId} remains in history but is not foreground TV by default`, () => {
      let state = gameReducer(undefined, { type: 'init' })
      state = { ...state, phase, tvFeed: [], broadcastQueue: [] }
      state = gameReducer(
        state,
        addTvEvent({ text, type: 'game', meta: { phase, broadcastTemplateId: templateId } })
      )

      const emitted = state.tvFeed.find(
        (candidate) => candidate.meta?.broadcastTemplateId === templateId
      )
      expect(emitted).toBeDefined()
      expect(emitted?.meta?.forceOnTv).toBeUndefined()
      expect(emitted?.meta?.editorial).toMatchObject({
        importance: 'required',
        presentationMode: 'log_only',
      })
      expect(state.broadcastQueue).not.toContain(emitted?.id)
      expect(isVisibleOnTv(emitted!)).toBe(false)
      expect(isVisibleInMainLog(emitted!)).toBe(true)
    })
  }

  it('keeps the bundled LOH competition-start receipt in the log, not on Faux TV', () => {
    const liveConfig = JSON.parse(readFileSync('public/config/live-config.json', 'utf8')) as {
      broadcastManager?: {
        enabled?: boolean
        overrides?: Record<string, BroadcastOverride>
      }
    }
    const manager = liveConfig.broadcastManager
    expect(manager?.enabled).toBe(true)
    expect(manager?.overrides?.['loh.competition-start']).toMatchObject({
      level: 'minor',
      major: null,
      forceOnTv: false,
    })

    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, phase: 'loh_comp', week: 4, tvFeed: [], broadcastQueue: [] }
    state = gameReducer(
      state,
      replaceBroadcastConfig({ overrides: manager?.overrides ?? {}, customMessages: [] })
    )
    state = gameReducer(
      state,
      addTvEvent({
        text: 'The Leader of the Hub competition has begun! 🏆 Who will win power today?',
        type: 'game',
        meta: {
          phase: 'loh_comp',
          week: 4,
          broadcastTemplateId: 'loh.competition-start',
        },
      })
    )

    const events = state.tvFeed.filter(
      (event) => event.meta?.broadcastTemplateId === 'loh.competition-start'
    )
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(event.meta?.forceOnTv).not.toBe(true)
      expect(event.meta?.editorial?.presentationMode).toBe('log_only')
      expect(isVisibleOnTv(event)).toBe(false)
      expect(isVisibleInMainLog(event)).toBe(true)
      expect(state.broadcastQueue).not.toContain(event.id)
    }
  })

  it('explicit producer Force-to-TV promotes a freshly emitted log-only source', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, phase: 'loh_comp', tvFeed: [], broadcastQueue: [] }
    state = gameReducer(
      state,
      addTvEvent({
        text: 'The Leader of the House competition has begun! 🏆 Who will win power today?',
        type: 'game',
        meta: {
          phase: 'loh_comp',
          broadcastTemplateId: 'loh.competition-start',
          forceOnTv: true,
        },
      })
    )

    const emitted = state.tvFeed.find(
      (candidate) => candidate.meta?.broadcastTemplateId === 'loh.competition-start'
    )
    expect(emitted).toBeDefined()
    expect(emitted?.meta?.editorial).toMatchObject({
      importance: 'required',
      presentationMode: 'log_only',
    })
    expect(emitted?.meta?.forceOnTv).toBe(true)
    expect(state.broadcastQueue).toContain(emitted?.id)
    expect(isVisibleOnTv(emitted!)).toBe(true)
    expect(isVisibleInMainLog(emitted!)).toBe(true)
  })

  it('explicit Broadcast Manager Force-to-TV promotes a freshly emitted log-only source', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, phase: 'loh_comp', tvFeed: [], broadcastQueue: [] }
    state = gameReducer(
      state,
      setBroadcastOverride({ id: 'loh.competition-start', changes: { forceOnTv: true } })
    )
    state = gameReducer(
      state,
      addTvEvent({
        text: 'The Leader of the House competition has begun! 🏆 Who will win power today?',
        type: 'game',
        meta: { phase: 'loh_comp', broadcastTemplateId: 'loh.competition-start' },
      })
    )

    const emitted = state.tvFeed.find(
      (candidate) => candidate.meta?.broadcastTemplateId === 'loh.competition-start'
    )
    expect(emitted).toBeDefined()
    expect(emitted?.meta?.editorial).toMatchObject({
      importance: 'required',
      presentationMode: 'log_only',
    })
    expect(emitted?.meta?.forceOnTv).toBe(true)
    expect(state.broadcastQueue).toContain(emitted?.id)
    expect(isVisibleOnTv(emitted!)).toBe(true)
    expect(isVisibleInMainLog(emitted!)).toBe(true)
  })

  it('explicit producer editorial metadata overrides the template editorial default', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, phase: 'loh_comp', tvFeed: [], broadcastQueue: [] }
    state = gameReducer(
      state,
      addTvEvent({
        text: 'The Leader of the House competition has begun! 🏆 Who will win power today?',
        type: 'game',
        meta: {
          phase: 'loh_comp',
          broadcastTemplateId: 'loh.competition-start',
          editorial: {
            importance: 'critical',
            presentationMode: 'interrupt',
            category: 'producer-override',
          },
        },
      })
    )

    const emitted = state.tvFeed.find(
      (candidate) => candidate.meta?.broadcastTemplateId === 'loh.competition-start'
    )
    expect(emitted).toBeDefined()
    expect(emitted?.meta?.editorial).toEqual({
      importance: 'critical',
      presentationMode: 'interrupt',
      category: 'producer-override',
    })
  })

  it('keeps a template without editorial metadata on the legacy foreground path', () => {
    let state = gameReducer(undefined, { type: 'init' })
    state = { ...state, phase: 'loh_results', tvFeed: [], broadcastQueue: [] }
    state = gameReducer(
      state,
      addTvEvent({
        text: 'Alex has won Leader of the House! 👑',
        type: 'game',
        meta: { phase: 'loh_results', broadcastTemplateId: 'loh.winner' },
      })
    )

    const emitted = state.tvFeed.find(
      (candidate) => candidate.meta?.broadcastTemplateId === 'loh.winner'
    )
    expect(emitted).toBeDefined()
    expect(emitted?.meta?.editorial).toBeUndefined()
    expect(emitted?.meta?.forceOnTv).toBe(true)
    expect(state.broadcastQueue).toContain(emitted?.id)
    expect(isVisibleOnTv(emitted!)).toBe(true)
    expect(isVisibleInMainLog(emitted!)).toBe(true)
  })
})

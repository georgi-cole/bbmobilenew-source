import { fireEvent, within } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mountFinalDecision,
  type FinalDecisionController,
  type FinalDecisionSceneConfig,
  type FinalDecisionSceneStage,
} from '../finalDecisionScene.mjs'

const mounted: Array<{ root: HTMLElement; controller: FinalDecisionController }> = []
type Options = {
  evicteeId?: string
  viewerId?: string
  name?: string
  plea?: string
  initiallyPaused?: boolean
  automaticDecision?: { evicteeId: string; reason?: string }
}

function mount(options: Options = {}) {
  const root = document.createElement('div')
  root.id = 'final-decision-scene'
  document.body.appendChild(root)
  const onDecision = vi.fn()
  const onComplete = vi.fn()
  const checkpoints: Array<{ stage: FinalDecisionSceneStage; time: number }> = []
  const config: FinalDecisionSceneConfig = {
    sceneId: 'automatic-final-decision',
    preview: false,
    reducedMotion: false,
    initiallyPaused: options.initiallyPaused,
    automaticDecision: options.automaticDecision ?? {
      evicteeId: options.evicteeId ?? 'human',
      reason: 'the Tribunal may already see you as the stronger finalist',
    },
    viewerId: options.viewerId ?? 'human',
    fixture: {
      holder: { id: 'dex', name: 'Dex' },
      nominees: [
        {
          id: 'human',
          name: options.name ?? 'You',
          assetKey: 'nominee-a',
          plea: options.plea ?? 'Give me one last chance to finish this beside you.',
        },
        {
          id: 'aria',
          name: 'Aria',
          assetKey: 'nominee-b',
          plea: 'I kept showing up. Let my story continue.',
        },
      ],
    },
    assets: {},
    monitor: {
      aspectRatio: 1923 / 818,
      screen: { x: 0.071, y: 0.165, width: 0.858, height: 0.642 },
    },
    onDecision,
    onComplete,
    onCheckpoint: (checkpoint) => checkpoints.push({ stage: checkpoint.stage, time: Date.now() }),
  }
  let controller: FinalDecisionController
  try {
    controller = mountFinalDecision(root, config)
  } catch (error) {
    root.remove()
    throw error
  }
  mounted.push({ root, controller })
  return { root, controller, config, onDecision, onComplete, checkpoints, view: within(root) }
}

function reach(controller: FinalDecisionController, stage: FinalDecisionSceneStage) {
  for (let index = 0; index < 12 && controller.getState().stage !== stage; index += 1) {
    vi.advanceTimersToNextTimer()
  }
  expect(controller.getState().stage).toBe(stage)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  mounted.splice(0).forEach(({ root, controller }) => {
    controller.dispose()
    root.remove()
  })
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('automatic Final Power decision', () => {
  it.each([
    { evicteeId: 'aria', viewerId: 'human', name: 'You', role: 'nominee' },
    { evicteeId: 'human', viewerId: 'human', name: 'You', role: 'nominee' },
    { evicteeId: 'aria', viewerId: 'jury-viewer', name: 'Mira', role: 'spectator' },
  ])('presents the authoritative result for $role / $evicteeId', (options) => {
    const { root, controller, onDecision, onComplete, checkpoints, view } = mount(options)
    expect(controller.getState()).toMatchObject({
      decisionMode: 'automatic',
      viewerRole: options.role,
      selectedId: null,
      confirmedId: null,
    })
    expect(root.querySelector('.fd-monitor-content')?.textContent).toContain('Dex')
    expect(root.querySelector('.fd-monitor-content')?.textContent?.includes('Your place')).toBe(
      options.role === 'nominee'
    )
    expect(view.queryByRole('button')).toBeNull()

    reach(controller, 'deliberate')
    expect(root.querySelector('.scene')?.getAttribute('data-shot')).toBe('holder')
    expect(root.querySelector('.fd-broadcast-speaker')?.textContent).toBe('Dex')
    expect(root.querySelector('.fd-monitor-content')?.textContent).toContain("I've heard you both.")
    expect(root.querySelector('[data-result="leave"]')).toBeNull()
    expect(root.querySelector('[aria-live]')?.textContent).not.toMatch(
      /eliminate|stronger finalist/
    )
    expect(controller.getState().confirmedId).toBeNull()
    expect(onDecision).not.toHaveBeenCalled()
    expect(view.queryByRole('button')).toBeNull()

    reach(controller, 'seal')
    expect(onDecision).toHaveBeenCalledExactlyOnceWith({
      sceneId: 'automatic-final-decision',
      holderId: 'dex',
      evicteeId: options.evicteeId,
      keptId: options.evicteeId === 'human' ? 'aria' : 'human',
    })
    expect(root.querySelector('[data-result="leave"]')?.getAttribute('data-player-id')).toBe(
      options.evicteeId
    )
    expect(root.querySelector('.fd-broadcast-caption')?.textContent).toContain(
      'the Tribunal may already see you as the stronger finalist'
    )
    expect(root.querySelector('.fd-broadcast-caption')?.textContent).not.toContain('You,')
    expect(onComplete).not.toHaveBeenCalled()

    reach(controller, 'complete')
    vi.advanceTimersByTime(100_000)
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(onDecision.mock.calls[0][0])
    expect(checkpoints.map((checkpoint) => checkpoint.stage)).toEqual([
      'establish',
      'plea-a',
      'plea-b',
      'deliberate',
      'seal',
      'announcement',
      'complete',
    ])
    if (options.evicteeId === options.viewerId) {
      expect(root.querySelector('[aria-live]')?.textContent).toBe('You finish in third place.')
    }
    expect(view.queryByRole('button')).toBeNull()
  })

  it.each(['unknown', 'dex', ''])('rejects an invalid supplied evictee: %s', (evicteeId) => {
    expect(() => mount({ automaticDecision: { evicteeId } })).toThrow(
      'The automatic final decision must name one of the two nominees.'
    )
  })

  it('preserves its supplied decision across repeated Skip and later caller mutation', () => {
    const decision = { evicteeId: 'aria', reason: 'this is the move I can live with' }
    const { controller, onDecision, onComplete } = mount({ automaticDecision: decision })
    decision.evicteeId = 'human'
    controller.skip()
    expect(controller.getState()).toMatchObject({ stage: 'seal', confirmedId: 'aria' })
    controller.skip()
    controller.skip()
    controller.skip()
    vi.advanceTimersByTime(100_000)
    expect(onDecision).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(onDecision.mock.calls[0][0])
    expect(onDecision.mock.calls[0][0].evicteeId).toBe('aria')
  })

  it('gives a longer full speech more reading time without paging it', () => {
    const short = mount({ plea: 'Please let me stay.' })
    reach(short.controller, 'plea-b')
    const shortStart = short.checkpoints.find((item) => item.stage === 'plea-a')!.time
    const shortEnd = short.checkpoints.find((item) => item.stage === 'plea-b')!.time
    short.controller.dispose()

    const plea =
      "I know there's no perfect argument for this choice. I kept showing up for this game, and I want one last chance to prove I belong beside you."
    const long = mount({ plea })
    reach(long.controller, 'plea-a')
    expect(long.root.querySelector('.fd-broadcast-caption')?.textContent).toBe(plea)
    expect(long.view.queryByRole('button', { name: /Next part|^Next$/ })).toBeNull()
    reach(long.controller, 'plea-b')
    const longStart = long.checkpoints.find((item) => item.stage === 'plea-a')!.time
    const longEnd = long.checkpoints.find((item) => item.stage === 'plea-b')!.time
    expect(longEnd - longStart).toBeGreaterThan((shortEnd - shortStart) * 1.5)
  })

  it('holds the decision while any pause reason remains and resumes the remaining beat', () => {
    const { controller, onDecision } = mount()
    reach(controller, 'deliberate')
    vi.advanceTimersByTime(1000)
    controller.pause('presentation')
    controller.pause('visibility')
    controller.resume('presentation')
    controller.skip()
    vi.advanceTimersByTime(30_000)
    expect(onDecision).not.toHaveBeenCalled()
    expect(controller.getState().stage).toBe('deliberate')
    controller.resume('visibility')
    vi.advanceTimersByTime(2599)
    expect(onDecision).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDecision).toHaveBeenCalledTimes(1)
  })

  it('waits for initial ownership and does not reveal or complete after disposal', () => {
    const { controller, onDecision, onComplete } = mount({ initiallyPaused: true })
    controller.skip()
    vi.advanceTimersByTime(100_000)
    expect(controller.getState().stage).toBe('establish')
    expect(onDecision).not.toHaveBeenCalled()
    controller.resume('presentation')
    reach(controller, 'deliberate')
    controller.dispose()
    vi.advanceTimersByTime(100_000)
    expect(onDecision).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('lets an overflowing full transcript finish reading after a resize', () => {
    const resizeCallbacks: ResizeObserverCallback[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallbacks.push(callback)
        }
        observe() {}
        disconnect() {}
      }
    )
    const { root, controller, onDecision, view } = mount()
    reach(controller, 'plea-a')
    const content = root.querySelector<HTMLElement>('.fd-monitor-content')!
    const screen = root.querySelector<HTMLElement>('.fd-monitor-screen')!
    const caption = root.querySelector<HTMLElement>('.fd-broadcast-caption')!
    const speaker = root.querySelector<HTMLElement>('.fd-broadcast-speaker')!
    content.style.padding = '2px 8px'
    content.style.gap = '3px'
    caption.style.fontSize = '12px'
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 80 })
    Object.defineProperty(screen, 'clientWidth', { configurable: true, value: 200 })
    vi.spyOn(caption, 'getBoundingClientRect').mockReturnValue({ height: 200 } as DOMRect)
    vi.spyOn(speaker, 'getBoundingClientRect').mockReturnValue({ height: 11 } as DOMRect)
    resizeCallbacks[0]([], {} as ResizeObserver)

    expect(caption.tabIndex).toBe(0)
    expect(caption.getAttribute('role')).toBe('region')
    vi.advanceTimersByTime(100_000)
    expect(controller.getState().stage).toBe('plea-a')
    expect(onDecision).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: 'Continue after the full plea' }))
    expect(controller.getState().stage).toBe('plea-b')
  })
})

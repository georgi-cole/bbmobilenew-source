import { fireEvent, within } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mountFinalDecision,
  type FinalAudienceVoteResult,
  type FinalDecisionController,
  type FinalDecisionSceneConfig,
  type FinalDecisionSceneStage,
} from '../finalDecisionScene.mjs'

const mounted: Array<{ root: HTMLElement; controller: FinalDecisionController }> = []
const choices = [
  {
    id: 'underdog',
    title: 'The fight',
    copy: 'Remember what it took to survive.',
    speech: 'I fought for every day here. Give me one more chance to finish this story.',
  },
  {
    id: 'loyalty',
    title: 'The people',
    copy: 'Remember the bonds that carried you.',
    speech: 'The people in this house made my season. I want to carry those bonds into the final.',
  },
  {
    id: 'resume',
    title: 'The game',
    copy: 'Remember the moves and wins.',
    speech: 'I played with courage and earned my place. Let my game speak for itself tonight.',
  },
] satisfies NonNullable<NonNullable<FinalDecisionSceneConfig['audienceVote']>['appeal']>['choices']

function result(evicteeId = 'aria'): FinalAudienceVoteResult {
  return { evicteeId, percentages: { human: 38.4, aria: 61.6 } }
}

interface Options {
  viewerId?: string
  result?: FinalAudienceVoteResult | null
  appeal?: boolean
  humanSecond?: boolean
  initiallyPaused?: boolean
  resolveOnRequest?: boolean
  reducedMotion?: boolean
}

function mount(options: Options = {}) {
  const root = document.createElement('div')
  root.id = 'final-decision-scene'
  document.body.appendChild(root)
  const onDecision = vi.fn()
  const onComplete = vi.fn()
  const onAppeal = vi.fn()
  const checkpoints: FinalDecisionSceneStage[] = []
  let controller: FinalDecisionController
  const onVoteRequested = vi.fn(() => {
    if (options.resolveOnRequest) controller.setAudienceVote(result())
  })
  const nominees = [
    {
      id: 'human',
      name: 'You',
      assetKey: 'nominee-a',
      plea: 'I kept fighting for this place, and I am asking for one last chance.',
    },
    {
      id: 'aria',
      name: 'Aria',
      assetKey: 'nominee-b',
      plea: 'This house became my home. I want to see this season through.',
    },
  ]
  if (options.humanSecond) nominees.reverse()
  const config: FinalDecisionSceneConfig = {
    sceneId: 'vox-final-three',
    preview: false,
    viewerId: options.viewerId ?? 'human',
    initiallyPaused: options.initiallyPaused,
    reducedMotion: options.reducedMotion ?? false,
    audienceVote: {
      result: options.result === null ? undefined : (options.result ?? result()),
      appeal: options.appeal ? { playerId: 'human', choices } : undefined,
    },
    fixture: { holder: { id: 'dex', name: 'Dex' }, nominees },
    assets: {},
    monitor: {
      aspectRatio: 1923 / 818,
      screen: { x: 0.071, y: 0.165, width: 0.858, height: 0.642 },
    },
    onDecision,
    onComplete,
    onAppeal,
    onVoteRequested,
    onCheckpoint: (checkpoint) => checkpoints.push(checkpoint.stage),
  }
  try {
    controller = mountFinalDecision(root, config)
  } catch (error) {
    root.remove()
    throw error
  }
  mounted.push({ root, controller })
  return {
    root,
    controller,
    config,
    onDecision,
    onComplete,
    onAppeal,
    onVoteRequested,
    checkpoints,
    view: within(root),
  }
}

function reach(controller: FinalDecisionController, stage: FinalDecisionSceneStage) {
  for (let index = 0; index < 18 && controller.getState().stage !== stage; index += 1)
    vi.advanceTimersToNextTimer()
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

describe('Vox Final Three audience broadcast', () => {
  it.each([
    { viewerId: 'dex', evicteeId: 'aria', role: 'immune' },
    { viewerId: 'human', evicteeId: 'aria', role: 'nominee' },
    { viewerId: 'human', evicteeId: 'human', role: 'nominee' },
    { viewerId: 'jury-viewer', evicteeId: 'aria', role: 'spectator' },
  ])(
    'shows the actual audience verdict for $role / $evicteeId',
    ({ viewerId, evicteeId, role }) => {
      const { root, controller, onDecision, onComplete, onVoteRequested, checkpoints } = mount({
        viewerId,
        result: result(evicteeId),
      })
      expect(controller.getState()).toMatchObject({
        decisionMode: 'audience',
        viewerRole: role,
        confirmedId: null,
      })
      expect(root.querySelector('.fd-monitor-content')).toHaveTextContent(/immune/i)
      expect(root.querySelector('.fd-monitor-content')?.textContent).not.toMatch(
        /38\.4|61\.6|0\.0%/
      )
      reach(controller, 'vote-closed')
      expect(onVoteRequested).toHaveBeenCalledTimes(1)
      expect(onDecision).not.toHaveBeenCalled()
      expect(root.querySelector('[data-result="leave"]')).toBeNull()
      reach(controller, 'vote-results')
      expect(root.querySelector('.fd-vote-heading')).toHaveTextContent('Vote to eliminate')
      expect([...root.querySelectorAll('.fd-vote-value')].map((el) => el.textContent)).toEqual([
        '38.4%',
        '61.6%',
      ])
      expect(
        [...root.querySelectorAll('.fd-vote-tally')].map((el) => el.getAttribute('data-player-id'))
      ).toEqual(['human', 'aria'])
      expect(root.querySelector('[data-result="leave"]')).toBeNull()
      expect(controller.getState().confirmedId).toBeNull()
      expect(onDecision).not.toHaveBeenCalled()
      reach(controller, 'seal')
      expect(onDecision).toHaveBeenCalledExactlyOnceWith({
        sceneId: 'vox-final-three',
        holderId: 'dex',
        evicteeId,
        keptId: evicteeId === 'aria' ? 'human' : 'aria',
      })
      expect(root.querySelector('.fd-monitor-content')).toHaveTextContent(
        'The audience has decided.'
      )
      expect(root.querySelector('[data-result="leave"]')?.getAttribute('data-player-id')).toBe(
        evicteeId
      )
      reach(controller, 'complete')
      expect(onComplete).toHaveBeenCalledExactlyOnceWith(onDecision.mock.calls[0][0])
      expect(checkpoints).toEqual([
        'establish',
        'plea-a',
        'plea-b',
        'vote-closed',
        'vote-results',
        'seal',
        'announcement',
        'complete',
      ])
    }
  )

  it.each([false, true])(
    'requires the real human appeal and reads its complete speech (second: %s)',
    (humanSecond) => {
      const { root, controller, view, onAppeal, onVoteRequested, onDecision } = mount({
        appeal: true,
        humanSecond,
        result: null,
        resolveOnRequest: true,
      })
      reach(controller, 'appeal')
      expect(controller.getState().canSkip).toBe(false)
      controller.skip()
      vi.advanceTimersByTime(100_000)
      expect(controller.getState().stage).toBe('appeal')
      expect(onAppeal).not.toHaveBeenCalled()
      expect(onVoteRequested).not.toHaveBeenCalled()
      const choice = view.getByRole('button', { name: /^The people\./ })
      fireEvent.click(choice)
      fireEvent.click(choice)
      expect(onAppeal).toHaveBeenCalledExactlyOnceWith('loyalty')
      expect(root.querySelector('.fd-broadcast-caption')?.textContent).toBe(choices[1].speech)
      expect(controller.getState()).toMatchObject({
        stage: humanSecond ? 'plea-b' : 'plea-a',
        appealId: 'loyalty',
      })
      expect(onVoteRequested).not.toHaveBeenCalled()
      reach(controller, 'vote-closed')
      expect(onVoteRequested).toHaveBeenCalledTimes(1)
      expect(onDecision).not.toHaveBeenCalled()
      vi.advanceTimersByTime(2599)
      expect(controller.getState().stage).toBe('vote-closed')
      vi.advanceTimersByTime(1)
      expect(controller.getState().stage).toBe('vote-results')
    }
  )

  it('routes early Skip to the required appeal and never fabricates a missing result', () => {
    const { controller, view, onAppeal, onVoteRequested, onDecision, onComplete } = mount({
      appeal: true,
      result: null,
    })
    controller.skip()
    expect(controller.getState().stage).toBe('appeal')
    controller.skip()
    expect(onAppeal).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: /^The fight\./ }))
    controller.skip()
    expect(controller.getState()).toMatchObject({
      stage: 'vote-closed',
      awaitingVote: true,
      canSkip: false,
    })
    vi.advanceTimersByTime(100_000)
    controller.skip()
    expect(onVoteRequested).toHaveBeenCalledTimes(1)
    expect(onDecision).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
    expect(controller.setAudienceVote(result())).toBe(true)
    expect(controller.getState()).toMatchObject({ stage: 'vote-results', awaitingVote: false })
    for (let index = 0; index < 8; index += 1) controller.skip()
    vi.advanceTimersByTime(100_000)
    expect(onDecision).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(onDecision.mock.calls[0][0])
    expect(onVoteRequested).toHaveBeenCalledTimes(1)
  })

  it('latches one immutable result and does not infer an outcome from tied display percentages', () => {
    const supplied = { evicteeId: 'aria', percentages: { human: 50, aria: 50 } }
    const { root, controller, onDecision } = mount({ result: null })
    controller.skip()
    expect(controller.setAudienceVote(supplied)).toBe(true)
    supplied.evicteeId = 'human'
    supplied.percentages.aria = 99
    expect(controller.setAudienceVote(result('human'))).toBe(false)
    reach(controller, 'vote-results')
    expect([...root.querySelectorAll('.fd-vote-value')].map((el) => el.textContent)).toEqual([
      '50.0%',
      '50.0%',
    ])
    controller.skip()
    expect(controller.getState().stage).toBe('seal')
    expect(onDecision.mock.calls[0][0].evicteeId).toBe('aria')
    expect(root.textContent).not.toContain('Approval tiebreak')
  })

  it('uses a separate approval frame only when an actual tiebreak was supplied', () => {
    const supplied = {
      evicteeId: 'aria',
      percentages: { human: 50, aria: 50 },
      approvalTiebreak: { scores: { human: 64.2, aria: 52.7 } },
    }
    const { root, controller, onDecision } = mount({ result: supplied })
    supplied.approvalTiebreak.scores.aria = 99
    reach(controller, 'vote-results')
    expect(root.querySelector('.fd-vote-heading')).toHaveTextContent('Vote to eliminate')
    controller.skip()
    expect(controller.getState().stage).toBe('approval-tiebreak')
    expect(root.querySelector('.fd-vote-heading')).toHaveTextContent('Approval tiebreak')
    expect([...root.querySelectorAll('.fd-vote-value')].map((el) => el.textContent)).toEqual([
      '64.2',
      '52.7',
    ])
    expect(root.querySelector('[aria-live]')).toHaveTextContent('52.7 approval')
    expect(onDecision).not.toHaveBeenCalled()
    controller.skip()
    expect(onDecision.mock.calls[0][0].evicteeId).toBe('aria')
  })

  it('retains a result arriving in the background until the final pause reason clears', () => {
    const { controller, onDecision } = mount({ result: null })
    controller.skip()
    vi.advanceTimersByTime(3000)
    controller.pause('presentation')
    controller.pause('visibility')
    controller.setAudienceVote(result())
    controller.resume('presentation')
    vi.advanceTimersByTime(100_000)
    expect(controller.getState().stage).toBe('vote-closed')
    expect(onDecision).not.toHaveBeenCalled()
    controller.resume('visibility')
    expect(controller.getState().stage).toBe('vote-results')
    reach(controller, 'complete')
    expect(onDecision).toHaveBeenCalledTimes(1)
  })

  it.each([
    { ...result(), evicteeId: 'dex' },
    { ...result(), evicteeId: 'unknown' },
    { ...result(), percentages: { human: 50 } },
    { ...result(), percentages: { human: Number.NaN, aria: 50 } },
    { ...result(), percentages: { human: -1, aria: 101 } },
    { ...result(), approvalTiebreak: { scores: { human: 50, aria: Infinity } } },
  ])('rejects malformed result data without revealing an outcome: %j', (invalid) => {
    const { controller, onDecision } = mount({ result: null })
    expect(() => controller.setAudienceVote(invalid)).toThrow('actual vote percentages')
    expect(controller.getState().confirmedId).toBeNull()
    expect(onDecision).not.toHaveBeenCalled()
    expect(controller.setAudienceVote(result())).toBe(true)
  })

  it('does not accept late results or invoke completion after disposal', () => {
    const { controller, onDecision, onComplete } = mount({ result: null })
    controller.skip()
    controller.dispose()
    expect(controller.setAudienceVote(result())).toBe(false)
    vi.advanceTimersByTime(100_000)
    expect(onDecision).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('does not request the vote before foreground ownership is granted', () => {
    const { controller, onVoteRequested, onDecision } = mount({ initiallyPaused: true })
    controller.skip()
    vi.advanceTimersByTime(100_000)
    expect(controller.getState().stage).toBe('establish')
    expect(onVoteRequested).not.toHaveBeenCalled()
    controller.resume('presentation')
    reach(controller, 'vote-closed')
    expect(onVoteRequested).toHaveBeenCalledTimes(1)
    expect(onDecision).not.toHaveBeenCalled()
  })

  it('keeps one safe Eye anchor while the camera transitions between speeches and results', () => {
    const callbacks: ResizeObserverCallback[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback)
        }
        observe() {}
        disconnect() {}
      }
    )
    const { root, controller } = mount()
    const scene = root.querySelector<HTMLElement>('.scene')!
    const monitor = root.querySelector<HTMLElement>('.fd-monitor')!
    const token = root.querySelector<HTMLElement>('.fd-token')!
    const world = root.querySelector<HTMLElement>('.fd-world')!
    Object.defineProperty(scene, 'clientWidth', { configurable: true, value: 390 })
    Object.defineProperty(scene, 'clientHeight', { configurable: true, value: 844 })
    vi.spyOn(monitor, 'getBoundingClientRect').mockReturnValue({ bottom: 205 } as DOMRect)
    callbacks[1]([], {} as ResizeObserver)
    const anchor = { top: token.style.top, width: token.style.width }
    const openingCamera = world.style.transform
    expect(parseFloat(anchor.top)).toBeGreaterThan(205)
    reach(controller, 'plea-a')
    expect(world.style.transform).not.toBe(openingCamera)
    expect({ top: token.style.top, width: token.style.width }).toEqual(anchor)
    reach(controller, 'plea-b')
    expect({ top: token.style.top, width: token.style.width }).toEqual(anchor)
    reach(controller, 'vote-closed')
    expect({ top: token.style.top, width: token.style.width }).toEqual(anchor)
    reach(controller, 'vote-results')
    expect({ top: token.style.top, width: token.style.width }).toEqual(anchor)
  })

  it('keeps the entire audience ceremony, including result bars, still with reduced motion', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
    const animate = vi.fn()
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
    try {
      const { controller, onDecision, onComplete } = mount({ reducedMotion: true })
      reach(controller, 'complete')
      expect(animate).not.toHaveBeenCalled()
      expect(onDecision).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledTimes(1)
    } finally {
      if (descriptor) Object.defineProperty(Element.prototype, 'animate', descriptor)
      else Reflect.deleteProperty(Element.prototype, 'animate')
    }
  })

  it('holds an overflowing selected appeal as a full keyboard-readable transcript', () => {
    const callbacks: ResizeObserverCallback[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback)
        }
        observe() {}
        disconnect() {}
      }
    )
    const { root, controller, view, onVoteRequested } = mount({ appeal: true, result: null })
    controller.skip()
    fireEvent.click(view.getByRole('button', { name: /^The game\./ }))
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
    callbacks[0]([], {} as ResizeObserver)
    expect(caption.tabIndex).toBe(0)
    expect(caption.getAttribute('role')).toBe('region')
    vi.advanceTimersByTime(100_000)
    expect(controller.getState().stage).toBe('plea-a')
    expect(onVoteRequested).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: 'Continue after the full plea' }))
    expect(controller.getState().stage).toBe('plea-b')
  })
})

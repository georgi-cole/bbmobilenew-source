import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('embedded remaster result bridge', () => {
  it('publishes the completed score when results open, before the Continue click', async () => {
    document.body.innerHTML =
      '<div id="intro"><span class="eyebrow"></span><button id="start"></button></div><canvas></canvas><section id="result" hidden><span id="finalScore">4321 PTS</span><button>Retry</button></section>'
    const send = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined)
    const bridge = readFileSync(
      path.join(process.cwd(), 'public/minigames/twin-remastered/bridge.js'),
      'utf8'
    )
    runInNewContext(bridge, {
      location,
      document,
      parent: window.parent,
      MutationObserver,
      Image,
      URLSearchParams,
      window,
    })
    const result = document.querySelector<HTMLElement>('#result')!
    result.hidden = false
    await Promise.resolve()
    expect(send).toHaveBeenCalledWith({ type: 'twin:result', score: 4321 }, location.origin)
    expect(send.mock.calls.some(([data]) => data.type === 'twin:complete')).toBe(false)
    result.querySelector<HTMLButtonElement>('button')!.click()
    expect(send).toHaveBeenCalledWith({ type: 'twin:complete', score: 4321 }, location.origin)
  })
})

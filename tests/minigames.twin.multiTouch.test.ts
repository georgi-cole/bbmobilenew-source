import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('Find Your Twin remaster touch controls', () => {
  it.each([1, 2])('keeps a held direction while tapping jump in part %s', (part) => {
    const html = readFileSync(`public/minigames/twin-remastered/part${part}/index.html`, 'utf8')
    const controls = html.slice(
      html.indexOf('const inputSources ='),
      html.indexOf('</script>', html.indexOf('const inputSources ='))
    )
    const doc = document.implementation.createHTMLDocument('Twin controls')
    doc.body.innerHTML =
      '<div class="controls"><button data-key="right">Right</button><button data-key="jump">Jump</button></div>'
    const keys = { left: false, right: false, jump: false, enter: false }
    const queuedActions = { jump: 0, enter: 0 }
    const surface = new EventTarget()
    runInNewContext(controls, {
      document: doc,
      window: surface,
      keys,
      queuedActions,
      queueAction: (key: keyof typeof queuedActions) => {
        if (key in queuedActions) queuedActions[key] += 1
      },
      updatePortraitInvitation: () => {},
    })
    const press = (target: EventTarget, type: string, pointerId: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(event, { pointerId, pointerType: 'touch' })
      target.dispatchEvent(event)
    }
    const [right, jump] = [...doc.querySelectorAll('button')]
    press(right, 'pointerdown', 1)
    press(jump, 'pointerdown', 2)
    press(jump, 'pointerup', 2)
    expect(keys.right).toBe(true)
    expect(keys.jump).toBe(false)
    expect(queuedActions.jump).toBe(1)
    press(jump, 'pointerdown', 3)
    press(surface, 'pointercancel', 3)
    expect(keys.right).toBe(true)
    expect(queuedActions.jump).toBe(2)
    surface.dispatchEvent(new Event('blur'))
    expect(keys.right).toBe(false)
    expect(queuedActions.jump).toBe(0)
  })
})

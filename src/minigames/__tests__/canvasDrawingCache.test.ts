import { describe, expect, it, vi } from 'vitest'
import { createCanvasDrawingCache } from '../canvasDrawingCache'

describe('canvas drawing cache', () => {
  it('reuses values during stable frames and rebuilds them after resizing or camera movement', () => {
    let transform = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }
    const canvas = { width: 780, height: 1400 }
    const context = {
      canvas,
      getTransform: () => ({ ...transform }),
    } as unknown as CanvasRenderingContext2D
    const layout = { width: 390, height: 700 }
    const create = vi.fn(() => ({}))
    const read = createCanvasDrawingCache(create)
    const initial = read(context, layout)
    expect(read(context, layout)).toBe(initial)
    canvas.width = 800
    expect(read(context, layout)).not.toBe(initial)
    const resized = read(context, layout)
    transform = { ...transform, e: 4 }
    expect(read(context, layout)).not.toBe(resized)
    expect(create).toHaveBeenCalledTimes(3)
  })
})

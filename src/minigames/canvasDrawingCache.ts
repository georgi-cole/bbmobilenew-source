/** Cache reusable drawing values until layout, backing resolution or the drawing transform changes. */
export function createCanvasDrawingCache<L extends object, V>(
  create: (context: CanvasRenderingContext2D, layout: L) => V
): (context: CanvasRenderingContext2D, layout: L) => V {
  const cache = new WeakMap<
    CanvasRenderingContext2D,
    {
      layout: L
      width: number
      height: number
      transform: DOMMatrix | undefined
      value: V
    }
  >()
  return (context, layout) => {
    const transform = context.getTransform?.()
    const width = context.canvas?.width ?? 0
    const height = context.canvas?.height ?? 0
    const previous = cache.get(context)
    if (
      previous &&
      previous.layout === layout &&
      previous.width === width &&
      previous.height === height &&
      previous.transform?.a === transform?.a &&
      previous.transform?.b === transform?.b &&
      previous.transform?.c === transform?.c &&
      previous.transform?.d === transform?.d &&
      previous.transform?.e === transform?.e &&
      previous.transform?.f === transform?.f
    ) {
      return previous.value
    }
    const value = create(context, layout)
    cache.set(context, { layout, width, height, transform, value })
    return value
  }
}

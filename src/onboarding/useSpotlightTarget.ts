import { useLayoutEffect, useState, type RefObject } from 'react'

export type SpotlightRect = {
  left: number
  top: number
  width: number
  height: number
  right: number
  bottom: number
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.hidden || ancestor.inert || ancestor.getAttribute('aria-hidden') === 'true')
      return false
    const style = window.getComputedStyle(ancestor)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0'
    )
      return false
  }
  return true
}

export function findSpotlightTarget(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible) ?? null
}

/** Follow position changes too: a target can move without resizing or a DOM mutation. */
export default function useSpotlightTarget(
  target: string | RefObject<HTMLElement | null>,
  padding = 0
): SpotlightRect | null {
  const [measurement, setMeasurement] = useState<{
    target: typeof target
    rect: SpotlightRect | null
  } | null>(null)

  useLayoutEffect(() => {
    let frame = 0
    let previousElement: HTMLElement | null = null
    function measure() {
      const element = typeof target === 'string' ? findSpotlightTarget(target) : target.current
      let rect: SpotlightRect | null = null
      if (element && isVisible(element)) {
        const bounds = element.getBoundingClientRect()
        if (
          element !== previousElement &&
          (bounds.bottom < 10 ||
            bounds.top > (window.visualViewport?.height ?? window.innerHeight) - 10)
        ) {
          element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
        }
        const left = bounds.left + (window.visualViewport?.offsetLeft ?? 0) - padding
        const top = bounds.top + (window.visualViewport?.offsetTop ?? 0) - padding
        const width = bounds.width + padding * 2
        const height = bounds.height + padding * 2
        rect = { left, top, width, height, right: left + width, bottom: top + height }
      }
      previousElement = element
      const next = rect
      setMeasurement((previous) =>
        previous?.target === target &&
        previous.rect?.left === next?.left &&
        previous.rect?.top === next?.top &&
        previous.rect?.width === next?.width &&
        previous.rect?.height === next?.height
          ? previous
          : { target, rect: next }
      )
      frame = window.requestAnimationFrame(measure)
    }
    measure()
    return () => window.cancelAnimationFrame(frame)
  }, [target, padding])

  return measurement?.target === target ? measurement.rect : null
}

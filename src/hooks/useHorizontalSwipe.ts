import { useRef, type PointerEvent, type MouseEvent } from 'react'

export function horizontalSwipe(dx: number, dy: number): -1 | 0 | 1 {
  return Math.abs(dx) >= 40 && Math.abs(dx) > 1.2 * Math.abs(dy) ? (dx < 0 ? 1 : -1) : 0
}

/** Recognition only: callers own clamping, wrapping, and selection policy. */
export function useHorizontalSwipe(onSwipe: (direction: -1 | 1) => void) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.isPrimary === false || event.button !== 0) return
      suppressClick.current = false
      start.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const origin = start.current
      if (!origin || origin.id !== event.pointerId) return
      if (horizontalSwipe(event.clientX - origin.x, event.clientY - origin.y)) {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const origin = start.current
      if (!origin || origin.id !== event.pointerId) return
      start.current = null
      const direction = horizontalSwipe(event.clientX - origin.x, event.clientY - origin.y)
      if (direction) {
        suppressClick.current = true
        onSwipe(direction)
      }
    },
    onPointerCancel() {
      start.current = null
      suppressClick.current = false
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (suppressClick.current) {
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }
    },
  }
}

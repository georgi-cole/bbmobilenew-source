import {
  startTransition,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from 'react'
import { clampDockAnchor, dockBounds } from './dockPosition'

const POSITION_KEY = 'bigeye:minigame-dock-anchor:v1'

export function useDockPosition(closeMenu: () => void) {
  const [anchor, setAnchor] = useState(() => {
    try {
      return clampDockAnchor(Number(localStorage.getItem(POSITION_KEY) ?? 0))
    } catch {
      return 0
    }
  })
  const [bounds, setBounds] = useState(() => dockBounds(window.innerHeight))
  const gesture = useRef<{
    id: number
    x: number
    y: number
    top: number
    dragging: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const top = bounds.min + anchor * (bounds.max - bounds.min)
  const move = (position: number) => {
    const next = clampDockAnchor((position - bounds.min) / Math.max(1, bounds.max - bounds.min))
    setAnchor(next)
    try {
      localStorage.setItem(POSITION_KEY, String(next))
    } catch {
      /* Optional UI preference. */
    }
  }
  useLayoutEffect(() => {
    const measure = () => {
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:fixed;visibility:hidden;pointer-events:none;padding-top:var(--app-safe-area-top,var(--safe-top,env(safe-area-inset-top,0px)));padding-bottom:var(--safe-bottom,env(safe-area-inset-bottom,0px))'
      document.body.append(probe)
      const style = getComputedStyle(probe)
      const next = dockBounds(
        window.visualViewport?.height ?? window.innerHeight,
        parseFloat(style.paddingTop) || 0,
        parseFloat(style.paddingBottom) || 0,
        window.visualViewport?.offsetTop ?? 0
      )
      probe.remove()
      startTransition(() => setBounds(next))
    }
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [])
  return {
    top,
    menuAbove: anchor > 0.5,
    menuMaxHeight: bounds.max - bounds.min + 44,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.isPrimary === false || event.button !== 0) return
        event.stopPropagation()
        suppressClick.current = false
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          top,
          dragging: false,
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const start = gesture.current
        if (!start || start.id !== event.pointerId) return
        event.stopPropagation()
        if (!start.dragging && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 6) {
          start.dragging = true
          closeMenu()
        }
        if (start.dragging) {
          event.preventDefault()
          move(start.top + event.clientY - start.y)
        }
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        const start = gesture.current
        if (!start || start.id !== event.pointerId) return
        event.stopPropagation()
        suppressClick.current = start.dragging
        gesture.current = null
        if (event.currentTarget.hasPointerCapture?.(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId)
      },
      onPointerCancel() {
        suppressClick.current = gesture.current?.dragging ?? false
        gesture.current = null
      },
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        const positions: Partial<Record<string, number>> = {
          ArrowUp: top - 24,
          ArrowDown: top + 24,
          Home: bounds.min,
          End: bounds.max,
        }
        const position = positions[event.key]
        if (position === undefined) return
        event.preventDefault()
        event.stopPropagation()
        closeMenu()
        move(position)
      },
    },
    consumeDragClick() {
      const suppressed = suppressClick.current
      suppressClick.current = false
      return suppressed
    },
  }
}

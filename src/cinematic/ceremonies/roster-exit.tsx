import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from 'react-redux'
import { motion } from 'framer-motion'
import CinematicSkipButton from '../../components/CinematicSkipButton/CinematicSkipButton'
import type { RootState } from '../../store/store'
import type { Player } from '../../types'
import {
  channelFor,
  scopeFor,
  hasCoveredRosterExit,
  clearRosterExit,
  type Preview,
} from './roster-exit-state'
import {
  usePresentationOwner,
  usePresentationForeground,
  PRESENTATION_PRIORITY,
} from '../../services/presentation/presentationOwnership'
import { usePresentationTimeline } from '../../services/presentation/usePresentationTimeline'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'

/** Uses the roster's existing colour treatment and strike; no separate portrait. */
export default function RosterExit({
  evictee,
  rosterIds,
  onDone,
}: {
  evictee: Player
  rosterIds?: string[]
  onDone: () => void
}) {
  const store = useStore<RootState>()
  const channel = channelFor(store)
  const scope = scopeFor(store.getState())
  const [initial] = useState<Preview>(() =>
    hasCoveredRosterExit(store, store.getState().game, evictee.id)
      ? channel.get()
      : { scope, ids: rosterIds ?? [evictee.id], marked: false }
  )
  const completed = useRef(false)
  const callback = useRef(onDone)
  useLayoutEffect(() => {
    callback.current = onDone
  }, [onDone])
  const reduced = usePresentationReducedMotion()
  const foreground = usePresentationForeground()
  const { isOwner } = usePresentationOwner(
    'eviction-roster',
    PRESENTATION_PRIORITY.evictionSpotlight
  )
  const mark = useCallback(() => {
    if (!completed.current) channel.set({ ...initial, marked: true })
  }, [channel, initial])
  const finish = useCallback(() => {
    if (completed.current) return
    mark()
    completed.current = true
    callback.current()
    // A shared Cupid film covers both partners. Keep the same cosmetic receipt
    // until the queued partner commits, so their mark cannot replay.
    const game = store.getState().game
    if (
      initial.ids.every((id) => {
        const player = game.players.find((p) => p.id === id)
        return !player || ['evicted', 'jury'].includes(player.status)
      })
    )
      clearRosterExit(store)
  }, [initial, mark, store])
  useLayoutEffect(() => {
    const tile = Array.from(document.querySelectorAll<HTMLElement>('[data-player-id]')).find(
      (node) => node.dataset.playerId === evictee.id && node.querySelector('[data-ceremony-tile]')
    )
    if (!initial.marked)
      tile?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'instant' })
    channel.set(initial)
    return () => {
      if (!completed.current) clearRosterExit(store)
    }
  }, [channel, evictee.id, initial, store])
  const cues = useMemo(
    () =>
      initial.marked
        ? [{ atMs: 0, run: finish }]
        : [
            { atMs: 220, run: mark },
            { atMs: 920, run: finish },
          ],
    [finish, initial.marked, mark]
  )
  useEffect(() => {
    if (reduced && isOwner && foreground) finish()
  }, [reduced, isOwner, foreground, finish])
  usePresentationTimeline(isOwner && foreground && !reduced, cues, `${scope}:${evictee.id}`)
  return createPortal(
    <motion.div
      data-premium-roster-exit="true"
      role="dialog"
      aria-modal="true"
      aria-label={`${evictee.name} leaves the roster`}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.08 }}
      style={{ position: 'fixed', inset: 0, zIndex: 10001 }}
    >
      <CinematicSkipButton ariaLabel="Skip roster elimination" onClick={finish} />
    </motion.div>,
    document.body
  )
}

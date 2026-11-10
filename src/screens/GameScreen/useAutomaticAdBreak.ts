import { useCallback, useEffect, useRef, useState } from 'react'
import type { Announcement } from '../../components/ui/TvAnnouncementOverlay/TvAnnouncementOverlay'
import type { AppDispatch, RootState } from '../../store/store'
import type { GameState } from '../../types'
import { recordAutomaticBreakHandled } from '../../store/adsSlice'
import { getAutomaticAdBreak, type AutomaticAdBreak } from '../../services/ads/adPolicy'
import { canShowAd, showInterstitial } from '../../services/ads/adsService'
import { invalidateAdMobRequests } from '../../services/ads/admobBridge'

interface BreakContext {
  gameId: string
  week: number
  phase: string
}

interface PendingBreak extends BreakContext {
  decision: AutomaticAdBreak
}

function contextFor(game: GameState): BreakContext {
  return {
    gameId: game.gameId ?? `season-${game.season}-${game.seed}`,
    week: game.week,
    phase: game.phase,
  }
}

function matches(context: BreakContext, game: GameState): boolean {
  const current = contextFor(game)
  return (
    context.gameId === current.gameId &&
    context.week === current.week &&
    context.phase === current.phase
  )
}

function hasLivingSurvivalPlayer(game: GameState): boolean {
  return (
    game.status === 'active' &&
    game.players.some(
      (player) => player.isUser && player.status !== 'evicted' && player.status !== 'jury'
    )
  )
}

export function useAutomaticAdBreak({
  game,
  dispatch,
  getState,
  presentationBlocked = false,
}: {
  game: GameState
  dispatch: AppDispatch
  getState: () => RootState
  presentationBlocked?: boolean
}) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [presenting, setPresenting] = useState(false)
  const mounted = useRef(true)
  const observed = useRef<BreakContext | null>(null)
  const pending = useRef<PendingBreak | null>(null)
  const announced = useRef<PendingBreak | null>(null)
  const requestKey = useRef<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (requestKey.current) invalidateAdMobRequests()
    }
  }, [])

  // Phase changes and completion of eviction presentations jointly own the break.
  // Retain a blocked decision until its presentation is finished, without marking
  // it handled or losing it merely because the phase no longer changes.
  /* eslint-disable react-hooks/set-state-in-effect -- Synchronize phase-owned announcements with the game presentation boundary. */
  useEffect(() => {
    if (announced.current && !matches(announced.current, game)) {
      if (requestKey.current) invalidateAdMobRequests()
      announced.current = null
      requestKey.current = null
      setAnnouncement(null)
      setPresenting(false)
    }

    const previous = observed.current
    if (!previous || !matches(previous, game)) {
      const context = contextFor(game)
      observed.current = context
      const decision = getAutomaticAdBreak({
        ...context,
        previousPhase: previous?.gameId === context.gameId ? previous.phase : '',
        currentPhase: context.phase,
        mode: game.mode ?? 'classic',
        voxPopuliActive: game.voxPopuli?.status === 'active',
        survivalRunActive: hasLivingSurvivalPlayer(game),
        posHolderName: game.players.find((player) => player.id === game.posWinnerId)?.name,
      })
      pending.current = decision ? { ...context, decision } : null
    }

    const next = pending.current
    if (!next || !matches(next, game) || presentationBlocked || announced.current) return
    if (next.decision.placement === 'survival_elimination_auto' && !hasLivingSurvivalPlayer(game)) {
      pending.current = null
      return
    }
    const state = getState()
    if (
      state.ads?.automaticBreaks?.[next.decision.breakKey] ||
      !canShowAd(next.decision.placement, state) ||
      !window.GameAds?.showInterstitial
    ) {
      pending.current = null
      return
    }

    pending.current = null
    announced.current = next
    dispatch(recordAutomaticBreakHandled(next.decision.breakKey))
    setAnnouncement({
      key: `ad_break_${next.decision.placement}`,
      title: 'SHORT BREAK',
      subtitle: next.decision.subtitle,
      isLive: true,
      autoDismissMs: 3200,
    })
  }, [game, getState, dispatch, presentationBlocked])
  /* eslint-enable react-hooks/set-state-in-effect */

  const dismissAnnouncement = useCallback(() => {
    const current = announced.current
    if (!current || requestKey.current) return
    setAnnouncement(null)
    const state = getState()
    if (
      !matches(current, state.game) ||
      (current.decision.placement === 'survival_elimination_auto' &&
        !hasLivingSurvivalPlayer(state.game))
    ) {
      announced.current = null
      return
    }

    const key = current.decision.breakKey
    requestKey.current = key
    setPresenting(true)
    const complete = () => {
      if (!mounted.current || requestKey.current !== key) return
      requestKey.current = null
      announced.current = null
      setPresenting(false)
    }
    const requested = showInterstitial(current.decision.placement, state, dispatch, {
      onDismissed: complete,
    })
    if (!requested) complete()
  }, [dispatch, getState])

  return { announcement, dismissAnnouncement, active: announcement !== null || presenting }
}

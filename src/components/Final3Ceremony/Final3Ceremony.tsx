/**
 * Final3Ceremony — the post-Part-3 ceremony overlay.
 *
 * Triggered when `game.awaitingFinal3Plea` is true and the Final Power holder has been
 * crowned (`game.lohId` is set, phase is 'final3_decision').
 *
 * Sequence:
 *   1. Shared full-screen Final Power holder reveal (skipped if Part 3 spectator already showed it).
 *   2. Nominee pleas — the role-aware cinematic session or native ChatOverlay.
 *   3. LOH decision:
 *      - Human LOH: explicit evictee selection and confirmation in either presentation.
 *      - AI LOH: deterministic choice from the actual season record.
 *   4. Confirmed decision announcement, before any elimination is committed.
 *   5. Eviction cinematic — SpotlightEvictionOverlay plays for the evictee.
 *   6. Final Two reveal waits for Play.
 *   7. Play dispatches `finalizeFinal3Decision` and `advance()` exactly once.
 *
 * Dev log tag: [Final3Ceremony]
 */

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  advance,
  finalizeFinal3Decision,
  setEvictionOverlay,
  clearEvictionOverlay,
} from '../../store/gameSlice'
import ChatOverlay from '../ChatOverlay/ChatOverlay'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import TvDecisionModal from '../TvDecisionModal/TvDecisionModal'
import SpotlightEvictionOverlay from '../../cinematic/ceremonies/exit.jsx'
import FinalPowerHolderReveal from '../FinalPowerBattle/FinalPowerHolderReveal'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import FinalDecisionPresentation from './FinalDecisionPresentation'
import type { FinalDecisionAudioController } from './finalDecisionAudio'
import { usePresentationForeground } from '../../services/presentation/presentationOwnership'
import type { ChatLine } from '../ChatOverlay/ChatOverlay'
import type { Player } from '../../types'
import {
  chooseFinalThreeEvictee,
  readFinalThreeDecision,
  type FinalThreeDecisionRead,
} from '../../social/finalThreeDecision'
import { buildFinalThreePleaExchanges } from './finalThreePleaScript'
import './Final3Ceremony.css'
import FinalThreeStage from '../FinalThreeStage/FinalThreeStage'
import FinalThreePodium from '../FinalThreeStage/FinalThreePodium'
import FinaleContinueButton from '../FinalThreeStage/FinaleContinueButton'

// ── Types ─────────────────────────────────────────────────────────────────────

type CeremonyStage =
  | 'coronation'
  | 'pleas'
  | 'decision'
  | 'announcement'
  | 'eviction_splash'
  | 'final_two_reveal'
  | 'done'

// ── Constants ────────────────────────────────────────────────────────────────

const DEV_SKIP = import.meta.env.DEV || import.meta.env.CI === 'true'

function thirdPlaceExitLine(player: Player, read: FinalThreeDecisionRead): string {
  const wins = (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0)
  const timesNominated = player.stats?.timesNominated ?? 0
  if (read.affinity >= 35)
    return `${player.name} leaves after a season built on a real bond with the Final Power holder.`
  if (wins >= 2) return `${player.name} leaves as one of the season's fiercest competition players.`
  if (timesNominated >= 2)
    return `${player.name} leaves after surviving the block ${timesNominated} times.`
  return `${player.name}'s story ends one step before the Final 2.`
}

function thirdPlaceReaction(holder: Player | null, read: FinalThreeDecisionRead): string {
  const holderName = holder?.name ?? 'you'
  const expectedBetrayal =
    read.tags.includes('betrayal') ||
    read.tags.includes('target') ||
    read.tags.includes('rivalry') ||
    (read.expectedFinalTwo && read.inwardAffinity < 0)

  if (expectedBetrayal) {
    return read.expectedFinalTwo
      ? `I thought our bond meant I had a place beside you, ${holderName}. I won't forget this, and I won't protect your story in the Tribunal.`
      : `I know where we stand now, ${holderName}. The Tribunal will hear exactly how this ended.`
  }

  if (read.expectedFinalTwo) {
    return `I thought our history would carry me beside you, ${holderName}. I'm hurt, but I know you had to make your call.`
  }

  return `${holderName}, I understand the move. I gave this season everything I had, and I'm leaving with my head up.`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onPlayAvailabilityChange?: (available: boolean) => void
}

export default function Final3Ceremony({ onPlayAvailabilityChange }: Props) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)
  const audioPreferences = useAppSelector((s) => s.settings.audio)
  const foreground = usePresentationForeground()
  const decisionSoundtrack = useRef<FinalDecisionAudioController | null>(null)

  const lohId = game.lohId
  const lohPlayer = game.players.find((p) => p.id === lohId) ?? null
  const nominees = useMemo(
    () => game.players.filter((p) => game.nomineeIds.includes(p.id)),
    [game.nomineeIds, game.players]
  )
  const humanPlayer = game.players.find((p) => p.isUser) ?? null
  const humanIsLoh = !!humanPlayer && humanPlayer.id === lohId
  // A presentation can yield to native UI at any beat. Freeze the game's
  // deliberate choice once so both routes reveal the same nominee and reason.
  const [automaticDecision] = useState(() => {
    if (humanIsLoh) return undefined
    const pick = chooseFinalThreeEvictee({
      holderId: lohId,
      holder: lohPlayer ?? undefined,
      nominees,
      relationships: game.strategicRelationships,
      alliances: game.strategicAlliances,
      threatReads: game.strategicThreatReadsByActorId,
    })
    return pick ? { evicteeId: pick.player.id, reason: pick.reason } : undefined
  })
  const decisionSceneId = `${game.gameId ?? `${game.seed}:${game.season}`}:final-decision:${lohId}`
  const soundtrackContinuation = useMemo(
    () => ({
      presentationGroupId: `final-three-decision:${decisionSceneId}`,
      setActive: (active: boolean) => decisionSoundtrack.current?.setActive(active),
      finish: () => decisionSoundtrack.current?.finish(),
    }),
    [decisionSceneId]
  )
  useEffect(() => {
    decisionSoundtrack.current?.setPreferences(audioPreferences)
  }, [audioPreferences])
  useEffect(() => {
    if (!foreground) decisionSoundtrack.current?.setActive(false)
  }, [foreground])
  useEffect(
    () => () => {
      decisionSoundtrack.current?.dispose()
      decisionSoundtrack.current = null
    },
    []
  )
  const decisionReads = useMemo(
    () =>
      Object.fromEntries(
        nominees.map((nominee) => [
          nominee.id,
          readFinalThreeDecision(
            {
              holderId: lohId,
              relationships: game.strategicRelationships,
              alliances: game.strategicAlliances,
              threatReads: game.strategicThreatReadsByActorId,
            },
            nominee
          ),
        ])
      ),
    [
      game.strategicAlliances,
      game.strategicRelationships,
      game.strategicThreatReadsByActorId,
      lohId,
      nominees,
    ]
  )
  const optionDescriptions = useMemo(
    () =>
      Object.fromEntries(
        nominees
          .map((nominee) => [nominee.id, decisionReads[nominee.id]?.comparison] as const)
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
      ),
    [decisionReads, nominees]
  )
  const pleaExchanges = useMemo(
    () => buildFinalThreePleaExchanges(nominees, decisionReads),
    [nominees, decisionReads]
  )
  const pleaTexts = useMemo(
    () =>
      Object.fromEntries(Object.entries(pleaExchanges).map(([id, script]) => [id, script.plea])),
    [pleaExchanges]
  )
  const pleaDialogueLines = useMemo<ChatLine[]>(() => {
    if (!lohPlayer) return []
    const lines: ChatLine[] = [
      {
        id: 'f3c-plea-opening',
        role: 'loh',
        player: lohPlayer,
        text: `Before I decide who joins me in the Final Two, I want to hear from both of you. Tell me what I should remember when I make this call.`,
      },
    ]
    nominees.forEach((nominee) => {
      lines.push(
        {
          id: `f3c-plea-${nominee.id}`,
          role: 'nominee',
          player: nominee,
          text: pleaExchanges[nominee.id].plea,
        },
        {
          id: `f3c-plea-response-${nominee.id}`,
          role: 'loh',
          player: lohPlayer,
          text: pleaExchanges[nominee.id].response,
        }
      )
    })
    lines.push({
      id: 'f3c-plea-close',
      role: 'loh',
      player: lohPlayer,
      text: `I've heard you both. Give me a moment to make the call.`,
    })
    return lines
  }, [lohPlayer, nominees, pleaExchanges])

  const spectatorAlreadyRevealedPower = game.finalThree?.spectatorFinalPowerRevealSeen === true
  const [stage, setStage] = useState<CeremonyStage>(() =>
    spectatorAlreadyRevealedPower
      ? pleaDialogueLines.length > 0
        ? 'pleas'
        : 'decision'
      : 'coronation'
  )
  const [pleaLines, setPleaLines] = useState<ChatLine[]>(pleaDialogueLines)
  const [announceLines, setAnnounceLines] = useState<ChatLine[]>([])
  const [evicteeId, setEvicteeId] = useState<string | null>(null)
  const evicteeIdRef = useRef<string | null>(null)
  const announcementCompletedRef = useRef(false)
  const decisionAlreadyPresentedRef = useRef(false)
  const handledPlayStageRef = useRef<CeremonyStage | null>(null)

  const evicteePlayer = evicteeId ? (game.players.find((p) => p.id === evicteeId) ?? null) : null
  const finalTwo = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury' && player.id !== evicteeId
  )

  useEffect(() => {
    evicteeIdRef.current = evicteeId
  }, [evicteeId])

  useEffect(() => {
    if (stage === 'pleas') setPleaLines(pleaDialogueLines)
  }, [pleaDialogueLines, stage])

  useLayoutEffect(() => {
    const playAvailable = stage === 'coronation'
    onPlayAvailabilityChange?.(playAvailable)
    return () => onPlayAvailabilityChange?.(false)
  }, [onPlayAvailabilityChange, stage])

  const continueCeremony = useCallback(() => {
    if (stage !== 'coronation' && stage !== 'final_two_reveal') return
    if (handledPlayStageRef.current === stage) return
    handledPlayStageRef.current = stage
    if (stage === 'coronation') {
      setStage(pleaDialogueLines.length > 0 ? 'pleas' : 'decision')
      return
    }
    if (stage === 'final_two_reveal' && lohId && evicteeId) {
      dispatch(finalizeFinal3Decision({ hohWinnerId: lohId, evicteeId }))
      dispatch(advance())
      setStage('done')
    }
  }, [dispatch, evicteeId, lohId, pleaDialogueLines.length, stage])

  useEffect(() => {
    const handlePlay = (event: Event) => {
      if (stage !== 'coronation' && stage !== 'final_two_reveal') return
      event.preventDefault()
      event.stopImmediatePropagation()
      continueCeremony()
    }
    window.addEventListener('ui:playPressed', handlePlay)
    return () => window.removeEventListener('ui:playPressed', handlePlay)
  }, [continueCeremony, stage])

  // ── Build eviction announcement lines ────────────────────────────────────

  const buildAnnounceLines = useCallback(
    (evictee: Player, reason: string) => {
      const read = decisionReads[evictee.id]
      const lines: ChatLine[] = [
        {
          id: 'f3c-evict-decision',
          role: 'loh',
          player: lohPlayer ?? undefined,
          text: `I've made my decision. ${evictee.name}, I can't take you to the Final 2 — ${reason}.`,
        },
        {
          id: 'f3c-evict-host',
          role: 'host',
          text: `${evictee.name}, you finish in 3rd place and will take the bronze exit. ${thirdPlaceExitLine(evictee, read)}`,
        },
        {
          id: 'f3c-evict-reaction',
          role: 'evicted',
          player: evictee,
          text: thirdPlaceReaction(lohPlayer, read),
        },
      ]
      setAnnounceLines(lines)
    },
    [decisionReads, lohPlayer]
  )

  // ── Plea overlay complete ─────────────────────────────────────────────────

  const handlePleaComplete = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] pleas complete → decision (humanIsLoh:', humanIsLoh, ')')
    }
    setStage((current) => (current === 'pleas' ? 'decision' : current))
  }, [humanIsLoh])

  // ── Accept the explicit human choice or the latched AI verdict ─────────────

  const handleDecision = useCallback(
    (chosenEvicteeId: string) => {
      if (!humanIsLoh && chosenEvicteeId !== automaticDecision?.evicteeId) return
      const evictee = nominees.find((p) => p.id === chosenEvicteeId)
      if (!evictee || evicteeIdRef.current) return
      // Skip can accept and complete the verdict in the same event. Its handoff
      // must see the result before React's next effect copies local state.
      evicteeIdRef.current = chosenEvicteeId
      setEvicteeId(chosenEvicteeId)
      buildAnnounceLines(
        evictee,
        (!humanIsLoh ? automaticDecision?.reason : decisionReads[chosenEvicteeId]?.reason) ??
          'this is the move I can live with'
      )
      setStage('announcement')
    },
    [automaticDecision, buildAnnounceLines, decisionReads, humanIsLoh, nominees]
  )

  // Native AI presentation and cinematic fallback consume the same game pick.
  // The cinematic keeps ownership of its own visible deliberation and reveal.
  useEffect(() => {
    if (stage !== 'decision' || humanIsLoh || !automaticDecision) return
    handleDecision(automaticDecision.evicteeId)
  }, [automaticDecision, handleDecision, humanIsLoh, stage])

  // ── Announcement complete → eviction cinematic ───────────────────────────

  const handleAnnounceComplete = useCallback(() => {
    const chosenEvicteeId = evicteeIdRef.current
    if (!chosenEvicteeId || announcementCompletedRef.current) return
    announcementCompletedRef.current = true
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] announcement complete → eviction_splash', {
        evicteeId: chosenEvicteeId,
      })
    }
    // Mark the overlay player so AvatarTile hides itself (isEvicting) and the
    // match-cut doesn't show a duplicate fullscreen tile before the overlay.
    dispatch(setEvictionOverlay(chosenEvicteeId))
    setStage('eviction_splash')
  }, [dispatch])

  const handlePremiumDecisionComplete = useCallback(
    (soundtrack: FinalDecisionAudioController) => {
      if (!evicteeIdRef.current || announcementCompletedRef.current) {
        soundtrack.dispose()
        return
      }
      // Retain the playing element while the doorway film acquires the same
      // presentation group. The music ends after its departure handoff.
      decisionSoundtrack.current = soundtrack
      decisionAlreadyPresentedRef.current = true
      handleAnnounceComplete()
    },
    [handleAnnounceComplete]
  )

  // ── Eviction cinematic complete → Final Two reveal ────────────────────────

  const handleEvictionSplashDone = useCallback(() => {
    if (!lohId || !evicteeId) return
    decisionSoundtrack.current?.finish()
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] elimination splash done → final two reveal', {
        lohId,
        evicteeId,
      })
    }
    // Clear the overlay flag before the Final Two stage card takes over.
    dispatch(setEvictionOverlay(null))
    setStage('final_two_reveal')
  }, [dispatch, lohId, evicteeId])

  // ── Cleanup: clear the overlay flag on unmount (safety net) ───────────────

  useEffect(() => {
    // Clear the currently active eviction flag if this ceremony unmounts during
    // its splash. clearEvictionOverlay remains safe when another overlay has
    // already taken ownership of the store flag.
    return () => {
      dispatch(clearEvictionOverlay(evicteeIdRef.current ?? ''))
    }
    // dispatch is stable; the ref always holds the latest evictee.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  const nativeDecisionPresentation = (
    <>
      {/* Plea ChatOverlay */}
      {stage === 'pleas' && pleaLines.length > 0 && (
        <ChatOverlay
          lines={pleaLines}
          skippable
          backdropVariant="finale-elimination"
          header={{
            title: 'Final Power Decision',
            subtitle: 'One last conversation before the Final Two is set.',
          }}
          avatarRenderer={(player) => (
            <PlayerAvatar player={player} size="sm" showEvictedStyle={false} />
          )}
          onComplete={handlePleaComplete}
          ariaLabel="The Finale plea chat"
        />
      )}

      {/* Human LOH decision modal */}
      {stage === 'decision' && humanIsLoh && (
        <TvDecisionModal
          title="Final Power Decision"
          subtitle="Choose who you are eliminating. The other finalist stays and faces you in the Final Two."
          options={nominees}
          optionDescriptions={optionDescriptions}
          onSelect={handleDecision}
          danger
          selectionConsequence={(selectedPlayer, options) => {
            const keptPlayer = options.find((player) => player.id !== selectedPlayer.id)
            return keptPlayer
              ? `You will eliminate ${selectedPlayer.name}. ${keptPlayer.name} will join you in the Final Two.`
              : `You will eliminate ${selectedPlayer.name}.`
          }}
          confirmSelectionLabel={(selectedPlayer, options) => {
            const keptPlayer = options.find((player) => player.id !== selectedPlayer.id)
            return keptPlayer
              ? `Eliminate ${selectedPlayer.name} · Keep ${keptPlayer.name}`
              : `Eliminate ${selectedPlayer.name}`
          }}
          stingerMessage="ELIMINATION RECORDED"
        />
      )}

      {/* Eviction announcement ChatOverlay */}
      {stage === 'announcement' && announceLines.length > 0 && (
        <ChatOverlay
          lines={announceLines}
          skippable
          backdropVariant="finale-elimination"
          header={{
            title: 'The Finale · Bronze Exit',
            subtitle: 'The Final Power holder has made the decision.',
          }}
          avatarRenderer={(player) => (
            <PlayerAvatar player={player} size="sm" showEvictedStyle={false} />
          )}
          onComplete={handleAnnounceComplete}
          ariaLabel="The Finale elimination announcement"
        />
      )}
    </>
  )

  if (stage === 'done') return null

  return (
    <>
      {/* Coronation animation */}
      {stage === 'coronation' && lohPlayer && (
        <FinalPowerHolderReveal
          player={lohPlayer}
          mode="classic"
          continueCopy={
            humanIsLoh
              ? 'Press Play when you are ready to make the Final Two decision.'
              : 'Press Play to hear the final pleas.'
          }
        />
      )}

      {lohPlayer && (stage === 'pleas' || stage === 'decision' || stage === 'announcement') ? (
        <FinalDecisionPresentation
          sceneId={decisionSceneId}
          phase={stage}
          holder={lohPlayer}
          nominees={nominees}
          comparisons={optionDescriptions}
          automaticDecision={humanIsLoh ? undefined : automaticDecision}
          viewerId={humanPlayer?.id}
          pleas={pleaTexts}
          onChoiceReady={handlePleaComplete}
          onDecision={handleDecision}
          onComplete={handlePremiumDecisionComplete}
          fallback={nativeDecisionPresentation}
        />
      ) : (
        nativeDecisionPresentation
      )}

      {/* Eviction cinematic */}
      <AnimatePresence>
        {stage === 'eviction_splash' && evicteePlayer && (
          <SpotlightEvictionOverlay
            key={evicteePlayer.id}
            evictee={evicteePlayer}
            contextLabel="FINAL THREE · BRONZE EXIT"
            layoutId={`avatar-tile-${evicteePlayer.id}`}
            onDone={handleEvictionSplashDone}
            devSkip={DEV_SKIP}
            decisionAlreadyPresented={decisionAlreadyPresentedRef.current}
            soundtrackContinuation={decisionSoundtrack.current ? soundtrackContinuation : undefined}
          />
        )}
      </AnimatePresence>

      {stage === 'final_two_reveal' && (
        <div className="f3c-final-two" role="dialog" aria-modal="true" aria-label="The Final Two">
          <FinalThreeStage scene="final-two">
            <div className="f3c-final-two__monitor-copy">
              <p className="f3c-final-two__eyebrow">THE FINAL TWO</p>
              <p className="f3c-final-two__copy">The Tribunal chooses the winner.</p>
            </div>
          </FinalThreeStage>
          <div className="f3c-final-two__players">
            {finalTwo.map((player) => (
              <div key={player.id} className="f3c-final-two__player">
                <FinalThreePodium className="f3c-final-two__podium" />
                <div className="f3c-final-two__figure">
                  <FullSizeCutoutImage
                    player={player}
                    attire="informal"
                    grounded
                    className="f3c-final-two__cutout"
                    alt={player.name}
                    draggable={false}
                  />
                </div>
                <span className="f3c-final-two__name">{player.name}</span>
              </div>
            ))}
          </div>
          <FinaleContinueButton onContinue={continueCeremony} />
        </div>
      )}
    </>
  )
}

import { SoundManager } from '../../services/sound/SoundManager'
import { replacementBeats } from './replacement-timing.js'
import type { ReplacementPresentation } from './replacementPresentation'

// Stable names and paths: replace these files to upgrade the sound without retiming films.
export const CEREMONY_CUES = {
  transition: { file: 'transition.wav', durationMs: 520, volume: 0.22 },
  suspense: { file: 'suspense.wav', durationMs: 1600, volume: 0.18 },
  reveal: { file: 'reveal.wav', durationMs: 720, volume: 0.28 },
  shield: { file: 'shield.wav', durationMs: 950, volume: 0.25 },
  save: { file: 'save.wav', durationMs: 850, volume: 0.24 },
  impact: { file: 'impact.wav', durationMs: 800, volume: 0.28 },
  door: { file: 'door.wav', durationMs: 650, volume: 0.22 },
} as const
type Cue = keyof typeof CEREMONY_CUES
export type CeremonyCueEvent = { at: number; cue: Cue }

export function ceremonyCuePlan(
  scene: string,
  duration: number,
  outcome?: ReplacementPresentation | null,
  decision?: { exitAt: number; zoomAt: number } | null,
  leadIn = 0
): CeremonyCueEvent[] {
  const events: CeremonyCueEvent[] = [{ at: 0, cue: scene === 'shock' ? 'impact' : 'transition' }]
  if (outcome) {
    if (outcome.decisionOnly) events.push({ at: 350, cue: 'suspense' })
    else
      for (const beat of replacementBeats(outcome)) {
        if (beat.showAuthority) events.push({ at: beat.shotStart + 300, cue: 'suspense' })
        for (const reveal of beat.reveals)
          events.push({
            at: reveal.at,
            cue: beat.kind === 'save' ? 'save' : beat.kind === 'decline' ? 'transition' : 'reveal',
          })
      }
  } else if (decision) {
    if (decision.exitAt || leadIn) events.push({ at: 350, cue: 'suspense' })
    events.push(
      { at: decision.exitAt + leadIn + 3900, cue: 'door' },
      { at: decision.zoomAt + leadIn, cue: 'transition' }
    )
  } else if (scene === 'allPower' || scene === 'cupidPower') {
    events.push({ at: 350, cue: 'suspense' }, { at: 1700, cue: 'shield' })
  } else if (scene === 'safety' || scene === 'cupidSafety') events.push({ at: 1680, cue: 'shield' })
  else if (scene === 'save' || scene === 'cupidSave') events.push({ at: 1570, cue: 'save' })
  else if (scene === 'loh' || scene === 'cupidLoh') events.push({ at: 1060, cue: 'shield' })
  else if (scene === 'voxResults')
    events.push({ at: 350, cue: 'suspense' }, { at: 6400, cue: 'impact' })
  else if (scene === 'voxImmunity')
    events.push({ at: 1450, cue: 'shield' }, { at: 4350, cue: 'reveal' })
  else if (scene === 'voxFinal4') events.push({ at: 2450, cue: 'reveal' })
  else if (scene === 'shock') events.push({ at: duration - 2200, cue: 'reveal' })
  else if (scene === 'ambush')
    events.push({ at: 350, cue: 'suspense' }, { at: 2400, cue: 'impact' })
  return events
    .filter(
      (event, index, list) =>
        event.at >= 0 &&
        event.at < duration - 220 &&
        list.findIndex((other) => other.at === event.at && other.cue === event.cue) === index
    )
    .sort((a, b) => a.at - b.at)
}

export function createCeremonyAudio() {
  const active: { cue: Cue; start: number; offset: number; controller: AbortController }[] = []
  let paused = false
  let stopped = false
  const start = (entry: (typeof active)[number]) => {
    const config = CEREMONY_CUES[entry.cue]
    const key = `tv:ceremony_${entry.cue}`
    entry.start = performance.now()
    entry.controller = new AbortController()
    void SoundManager.play(key, {
      signal: entry.controller.signal,
      startAtSec: entry.offset / 1000,
      durationMs: config.durationMs - entry.offset,
      fadeOutMs: 45,
    }).catch(() => {})
  }
  return {
    play(cue: Cue) {
      if (stopped || paused) return
      for (let i = active.length - 1; i >= 0; i--) {
        const entry = active[i]
        if (entry.offset + performance.now() - entry.start >= CEREMONY_CUES[entry.cue].durationMs) {
          entry.controller.abort()
          active.splice(i, 1)
        }
      }
      const entry = { cue, start: 0, offset: 0, controller: new AbortController() }
      active.push(entry)
      start(entry)
    },
    pause() {
      if (paused || stopped) return
      paused = true
      for (const entry of active) {
        entry.offset += performance.now() - entry.start
        entry.controller.abort()
      }
    },
    resume() {
      if (!paused || stopped) return
      paused = false
      for (const entry of active)
        if (entry.offset < CEREMONY_CUES[entry.cue].durationMs) start(entry)
    },
    stop() {
      stopped = true
      active.forEach((entry) => entry.controller.abort())
      active.length = 0
    },
  }
}

import type { BoxedOutState } from '../../features/boxedOut/rules'

export const SHOW_BEATS = [
  'idle',
  'sealing',
  'crowd-a',
  'crowd-b',
  'crowd-c',
  'danger',
  'impact',
  'consequence',
  'elimination',
  'settled',
] as const
export type ShowBeat = (typeof SHOW_BEATS)[number]

export function reached(beat: ShowBeat, target: ShowBeat): boolean {
  return SHOW_BEATS.indexOf(beat) >= SHOW_BEATS.indexOf(target)
}

/** One clock owns the art, sound, life counters, scores, and availability of Continue. */
export function roundTimeline(
  collapse: boolean,
  eliminated: boolean,
  reducedMotion = false
): Array<{ at: number; beat: ShowBeat }> {
  if (reducedMotion) return [{ at: 0, beat: 'settled' as ShowBeat }]
  const timeline: Array<{ at: number; beat: ShowBeat }> = [
    { at: 0, beat: 'sealing' },
    { at: 700, beat: 'crowd-a' },
    { at: 1220, beat: 'crowd-b' },
    { at: 1740, beat: 'crowd-c' },
  ]
  if (!collapse)
    return [
      ...timeline,
      { at: 2450, beat: 'consequence' as const },
      { at: 4250, beat: 'settled' as const },
    ]
  return [
    ...timeline,
    { at: 2400, beat: 'danger' },
    { at: 3350, beat: 'impact' },
    { at: 4350, beat: 'consequence' },
    ...(eliminated ? [{ at: 5800, beat: 'elimination' as const }] : []),
    { at: eliminated ? 7600 : 6250, beat: 'settled' },
  ]
}

export function crowdVisible(beat: ShowBeat, box: number): boolean {
  return reached(beat, (['crowd-a', 'crowd-b', 'crowd-c'] as const)[box])
}

export function displayedRound(state: BoxedOutState, beat: ShowBeat) {
  const scores = { ...state.scores }
  const lives = { ...state.lives }
  const latest = state.reveals.at(-1)
  if (state.phase === 'reveal' && latest && !reached(beat, 'consequence')) {
    for (const id of latest.participants) {
      const picked = latest.picks[id]
      if (picked === latest.exploded) lives[id] += 1
      else scores[id] -= latest.rewards[picked]
    }
  }
  return { scores, lives }
}

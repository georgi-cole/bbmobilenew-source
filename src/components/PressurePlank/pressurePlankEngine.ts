import { mulberry32 } from '../../store/rng'
import {
  PRESSURE_PLANK_ROUND_SECONDS,
  PRESSURE_PLANK_STABILITY_MAX,
  getPressurePlankSafeZoneHalfWidth,
  getPressurePlankStabilityDamagePerSecond,
} from './pressurePlankLogic'

export const PRESSURE_PLANK_STEP_MS = 10
export const PRESSURE_PLANK_MAX_BALANCE = 100
export const PRESSURE_PLANK_FALL_THRESHOLD = 92
export const PRESSURE_PLANK_TAP_IMPULSE = 16
export const PRESSURE_PLANK_SURGES = [
  { direction: 1, strength: 14, startsAt: 8, duration: 1.8, label: '💨 GUST!' },
  { direction: -1, strength: 16, startsAt: 18, duration: 2, label: '🌊 WAVE!' },
  { direction: 1, strength: 20, startsAt: 30, duration: 1.5, label: '⚡ SURGE!' },
  { direction: -1, strength: 18, startsAt: 42, duration: 2.2, label: '💨 GUST!' },
  { direction: 1, strength: 24, startsAt: 55, duration: 1.6, label: '🌊 WAVE!' },
  { direction: -1, strength: 28, startsAt: 68, duration: 1.8, label: '⚡ SURGE!' },
  { direction: 1, strength: 32, startsAt: 80, duration: 2, label: '⛈ STORM!' },
  { direction: -1, strength: 36, startsAt: 95, duration: 2, label: '⛈ STORM!' },
  { direction: 1, strength: 40, startsAt: 108, duration: 2.4, label: '🌪 TORNADO!' },
] as const

export type PlankDirection = -1 | 1
export interface PlankAction {
  atMs: number
  direction: PlankDirection
}
export interface PlankSnapshot {
  elapsedMs: number
  balance: number
  velocity: number
  stability: number
  safeZone: number
  outsideMs: number
  taps: number
  status: 'active' | 'fell' | 'complete'
}

/** The live screen and every opponent advance this same fixed-step world.
 * Randomness depends on simulation ticks, never rendering FPS or input count.
 */
export class PressurePlankEngine {
  private random: () => number
  private bias: number
  private requestedMs = 0
  private state: PlankSnapshot = {
    elapsedMs: 0,
    balance: 0,
    velocity: 0,
    stability: PRESSURE_PLANK_STABILITY_MAX,
    safeZone: getPressurePlankSafeZoneHalfWidth(0),
    outsideMs: 0,
    taps: 0,
    status: 'active',
  }

  constructor(seed: number) {
    this.random = mulberry32((seed ^ 0x706c616e) >>> 0)
    this.bias = (this.random() < 0.5 ? -1 : 1) * (4 + this.random() * 4)
  }

  snapshot(): PlankSnapshot {
    return { ...this.state }
  }

  advance(atMs: number): PlankSnapshot {
    if (!Number.isFinite(atMs) || atMs < this.requestedMs) return this.snapshot()
    this.requestedMs = Math.min(PRESSURE_PLANK_ROUND_SECONDS * 1000, Math.max(0, atMs))
    const s = this.state
    while (s.status === 'active' && s.elapsedMs + PRESSURE_PLANK_STEP_MS <= this.requestedMs) {
      const dt = PRESSURE_PLANK_STEP_MS / 1000
      s.elapsedMs += PRESSURE_PLANK_STEP_MS
      const seconds = s.elapsedMs / 1000
      const difficulty = 1 + seconds / 45
      if (this.random() < 0.7 * dt) {
        this.bias = Math.max(-14, Math.min(14, this.bias + (this.random() - 0.5) * 8))
        if (Math.abs(this.bias) < 2.5) this.bias = (this.random() < 0.5 ? -1 : 1) * 3
      }
      const surge = PRESSURE_PLANK_SURGES.find(
        (e) => seconds >= e.startsAt && seconds < e.startsAt + e.duration
      )
      const acceleration =
        -s.balance * 0.16 -
        s.velocity * 0.95 +
        (surge ? surge.direction * surge.strength : 0) +
        (this.random() - 0.5) * 8 * difficulty * 2 +
        this.bias +
        Math.sign(s.balance) *
          (Math.abs(s.balance) / PRESSURE_PLANK_MAX_BALANCE) ** 2 *
          18 *
          difficulty
      s.velocity += acceleration * dt
      s.balance = Math.max(
        -PRESSURE_PLANK_MAX_BALANCE,
        Math.min(PRESSURE_PLANK_MAX_BALANCE, s.balance + s.velocity * dt)
      )
      s.safeZone = getPressurePlankSafeZoneHalfWidth(seconds)
      const damage = getPressurePlankStabilityDamagePerSecond(
        s.balance,
        s.safeZone,
        PRESSURE_PLANK_FALL_THRESHOLD
      )
      if (damage > 0) {
        s.outsideMs += PRESSURE_PLANK_STEP_MS
        s.stability = Math.max(0, s.stability - damage * dt)
      }
      if (Math.abs(s.balance) >= PRESSURE_PLANK_FALL_THRESHOLD || s.stability <= 0)
        s.status = 'fell'
      else if (seconds >= PRESSURE_PLANK_ROUND_SECONDS) s.status = 'complete'
    }
    return this.snapshot()
  }

  tap(direction: PlankDirection, atMs: number): PlankSnapshot {
    if (!Number.isFinite(atMs) || atMs < this.requestedMs || (direction !== -1 && direction !== 1))
      return this.snapshot()
    this.advance(atMs)
    if (this.state.status === 'active') {
      this.state.velocity += direction * PRESSURE_PLANK_TAP_IMPULSE
      this.state.taps++
    }
    return this.snapshot()
  }
}

export function replayPressurePlankActions(
  seed: number,
  actions: readonly PlankAction[],
  untilMs = 120_000
): PlankSnapshot {
  const engine = new PressurePlankEngine(seed)
  for (const action of actions) {
    if (action.atMs > untilMs) break
    engine.tap(action.direction, action.atMs)
  }
  return engine.advance(untilMs)
}

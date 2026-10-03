/**
 * useQuickTapRaceAudio — returns one-shot SFX callbacks for the Quick Tap Race
 * minigame. Background music is resolved centrally at the app root.
 */

import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

const QTR_BOOSTER_KEY = 'minigame:quicktap_booster';
const QTR_HALF_TAP_KEY = 'minigame:quicktap_half_tap';

export interface UseQuickTapRaceAudioReturn {
  /** Intentionally silent: high-frequency tap audio caused mobile frame drops. */
  playTap: () => void;
  /** Play the booster stinger (beneficial multiplier activated). */
  playBooster: () => void;
  /** Play the half-tap stinger (½× fumble multiplier activated). */
  playHalfTap: () => void;
}

export function useQuickTapRaceAudio(_isPlaying: boolean): UseQuickTapRaceAudioReturn {
  // Do not enqueue audio for every tap. On mobile, the first user-gesture/booster
  // can unlock the audio context and turn this hot path into dozens of sound
  // requests per second, which competes with canvas rendering. Keep the callback
  // as a stable no-op so both Quick Tap Race and Lane Racers avoid that cost
  // without changing their engine contracts.
  const playTap = useCallback(() => {}, []);

  const playBooster = useCallback(() => {
    void SoundManager.play(QTR_BOOSTER_KEY);
  }, []);

  const playHalfTap = useCallback(() => {
    void SoundManager.play(QTR_HALF_TAP_KEY);
  }, []);

  return { playTap, playBooster, playHalfTap };
}

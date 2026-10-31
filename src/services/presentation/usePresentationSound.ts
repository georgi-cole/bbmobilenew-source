import { useCallback, useLayoutEffect, useRef } from 'react'
import { SoundManager, type PlayOptions } from '../sound/SoundManager'

type PresentationSoundPlayer = (key: string, options?: PlayOptions) => void
const defaultPlayer: PresentationSoundPlayer = (key, options) => {
  void SoundManager.play(key, options)
}

/** Abort only this scene's one-shot sounds before gameplay or a newer owner starts. */
export function usePresentationSound(
  active: boolean,
  sequenceKey: string | number = 'default',
  player: PresentationSoundPlayer = defaultPlayer
): { play: PresentationSoundPlayer; cancel: () => void } {
  const controllerRef = useRef<AbortController | null>(null)
  const playerRef = useRef(player)
  useLayoutEffect(() => {
    playerRef.current = player
  }, [player])
  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])
  useLayoutEffect(() => {
    if (!active) return undefined
    const controller = new AbortController()
    controllerRef.current = controller
    return () => {
      controller.abort()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [active, sequenceKey])
  const play = useCallback<PresentationSoundPlayer>((key, options) => {
    const controller = controllerRef.current
    if (!controller || controller.signal.aborted) return
    playerRef.current(key, { ...options, signal: controller.signal })
  }, [])
  return { play, cancel }
}

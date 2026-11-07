import { forwardRef, useCallback, useEffect, useRef, type VideoHTMLAttributes } from 'react'
import {
  releaseCinematicVideoElement,
  resolveCinematicMediaUrl,
  type CinematicVideoAsset,
} from './cinematicMedia'

const videoLifecycleGeneration = new WeakMap<HTMLVideoElement, number>()

type CinematicVideoProps = Omit<
  VideoHTMLAttributes<HTMLVideoElement>,
  'src' | 'poster' | 'preload' | 'muted' | 'playsInline' | 'disablePictureInPicture'
> & {
  asset: CinematicVideoAsset
  prepare: boolean
}

/** Native, muted playback with no source attached until a presentation owns it. */
export const CinematicVideo = forwardRef<HTMLVideoElement, CinematicVideoProps>(
  function CinematicVideo({ asset, prepare, autoPlay = false, ...videoProps }, forwardedRef) {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const setVideoRef = useCallback(
      (video: HTMLVideoElement | null) => {
        videoRef.current = video
        if (typeof forwardedRef === 'function') forwardedRef(video)
        else if (forwardedRef) forwardedRef.current = video
      },
      [forwardedRef]
    )

    useEffect(() => {
      if (prepare) return
      releaseCinematicVideoElement(videoRef.current)
    }, [prepare])

    useEffect(() => {
      const video = videoRef.current
      if (!video) return undefined
      const generation = (videoLifecycleGeneration.get(video) ?? 0) + 1
      videoLifecycleGeneration.set(video, generation)
      return () => {
        void Promise.resolve().then(() => {
          if (videoLifecycleGeneration.get(video) === generation) {
            releaseCinematicVideoElement(video)
          }
        })
      }
    }, [])

    return (
      <video
        {...videoProps}
        ref={setVideoRef}
        src={prepare ? resolveCinematicMediaUrl(asset.runtimePath) : undefined}
        poster={prepare ? resolveCinematicMediaUrl(asset.posterPath) : undefined}
        preload={prepare ? 'auto' : 'none'}
        data-cinematic-preparing={prepare ? 'true' : undefined}
        autoPlay={autoPlay && prepare}
        muted
        playsInline
        disablePictureInPicture
      />
    )
  }
)

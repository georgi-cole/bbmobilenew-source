import type { ReactNode } from 'react'
import { FINAL_THREE_SET_ASSETS } from './finalThreeSetAssets'
import './FinalThreeStage.css'

type FinaleScene = 'opening' | 'block' | 'holder' | 'final-two' | 'champion'

interface Props {
  scene: FinaleScene
  children: ReactNode
}

/**
 * Shared modular garden set; only the cast, camera emphasis and monitor content
 * vary by beat. Decorative artwork never contains season text or game outcomes.
 */
export default function FinalThreeStage({ scene, children }: Props) {
  return (
    <div className={`f3-venue f3-venue--${scene}`} data-finale-set="garden" data-scene={scene}>
      <div className="f3-venue__frame">
        <div
          className="f3-venue__background"
          style={{ backgroundImage: `url("${FINAL_THREE_SET_ASSETS.background}")` }}
          aria-hidden="true"
        />
        <div className="f3-venue__night" aria-hidden="true" />
        <div className="f3-venue__beams" aria-hidden="true" />
        <div className="f3-venue__dust" aria-hidden="true" />
        <div className="f3-venue__eye" aria-hidden="true">
          <span className="f3-venue__eye-halo" />
          <img src={FINAL_THREE_SET_ASSETS.eye} alt="" draggable={false} />
        </div>
        <div className="f3-venue__monitor">
          <img
            className="f3-venue__monitor-frame"
            src={FINAL_THREE_SET_ASSETS.monitor}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <div className="f3-venue__screen">{children}</div>
          <span className="f3-venue__glass" aria-hidden="true" />
        </div>
        <div className="f3-venue__floor" aria-hidden="true" />
        <div
          className="f3-venue__mist"
          style={{ backgroundImage: `url("${FINAL_THREE_SET_ASSETS.mist}")` }}
          aria-hidden="true"
        />
        <div className="f3-venue__vignette" aria-hidden="true" />
        <div className="f3-venue__network" aria-hidden="true">
          <span />
          THE BIG EYE
          <span>FINALE NIGHT</span>
        </div>
      </div>
    </div>
  )
}

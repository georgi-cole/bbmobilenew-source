import type { CSSProperties } from 'react'
import { joinPublicAssetPath } from '../../utils/avatar'

/** One small transparent texture, four finite bursts, no particle clock. */
export default function ChampionFireworks() {
  return (
    <div className="champion-fireworks" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <img
          key={index}
          className="champion-fireworks__burst"
          style={{ '--burst': index } as CSSProperties}
          src={joinPublicAssetPath('assets/ceremonies/shared/winner-firework.webp')}
          width={320}
          height={320}
          alt=""
          draggable={false}
        />
      ))}
    </div>
  )
}

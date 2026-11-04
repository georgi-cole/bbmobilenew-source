import { FINAL_THREE_SET_ASSETS } from './finalThreeSetAssets'

/** Reuse the generated marble platform, with no player or outcome baked into it. */
export default function FinalThreePodium({ className }: { className: string }) {
  return (
    <img
      className={className}
      src={FINAL_THREE_SET_ASSETS.podium}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={1600}
      height={600}
    />
  )
}
